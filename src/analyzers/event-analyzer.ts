/**
 * Event Analyzer powered by the configurable LLM provider abstraction.
 * Produces structured assessments for raw events that feed the scoring pipeline.
 */

import { z } from 'zod';
import { loadConfig } from '../config';
import type { LLMFactoryOptions, LLMMessage, LLMProvider } from '../llm';
import { createLLMProvider } from '../llm';
import type { AnalyzedEvent, EventCategory, RawEvent, SignificanceScores } from '../types';

// Schema for structured output from AI
const AIAnalysisSchema = z.object({
  title: z.string().describe('Concise, informative title for the event (max 200 chars)'),
  description: z
    .string()
    .describe('Clear description of the event and its significance (max 1000 chars)'),
  category: z
    .enum(['research', 'product', 'regulation', 'industry'])
    .describe('Primary category of the event'),
  significance: z.object({
    technologicalBreakthrough: z
      .number()
      .min(0)
      .max(10)
      .describe('How much this advances the state of the art (0-10)'),
    industryImpact: z
      .number()
      .min(0)
      .max(10)
      .describe('Potential impact on the AI industry (0-10)'),
    adoptionScale: z.number().min(0).max(10).describe('Expected scale of adoption or usage (0-10)'),
    novelty: z
      .number()
      .min(0)
      .max(10)
      .describe('How novel or unprecedented this development is (0-10)')
  }),
  keyInsights: z.array(z.string()).describe('Key takeaways or implications'),
  relatedTopics: z.array(z.string()).describe('Related AI topics or technologies')
});

type AIAnalysisResult = z.infer<typeof AIAnalysisSchema>;

const SYSTEM_PROMPT = `You are an AI analyst supporting an automated AI timeline. Reply only with valid JSON that strictly matches this structure:
{
  "title": "Concise, informative title (max 200 characters)",
  "description": "Clear description of the event and its significance (max 1000 characters)",
  "category": "research | product | regulation | industry",
  "significance": {
    "technologicalBreakthrough": number between 0 and 10,
    "industryImpact": number between 0 and 10,
    "adoptionScale": number between 0 and 10,
    "novelty": number between 0 and 10
  },
  "keyInsights": ["short bullet insight", ...],
  "relatedTopics": ["related concept", ...]
}

Rules:
- Select the single best category from the allowed set.
- Provide 2-4 key insights and 2-4 related topics.
- Keep language crisp and objective.
- Do not add commentary before or after the JSON.`;

export interface EventAnalyzerConfig {
  model?: string;
  temperature?: number;
  maxRetries?: number;
  significanceThreshold?: number;
  maxEventsToSelect?: number;
}

export interface EventAnalyzerDependencies {
  llmProvider?: LLMProvider;
}

export class EventAnalyzer {
  private readonly requestTemperature: number;
  private readonly maxRetries: number;
  private readonly significanceThreshold: number;
  private readonly maxEventsToSelect: number;
  private readonly llmProviderPromise: Promise<LLMProvider>;

  constructor(config: EventAnalyzerConfig = {}, dependencies: EventAnalyzerDependencies = {}) {
    const appConfig = loadConfig();

    this.requestTemperature = config.temperature ?? 0.2;
    this.maxRetries = config.maxRetries || 3;
    this.significanceThreshold = config.significanceThreshold || appConfig.significanceThreshold;
    this.maxEventsToSelect = config.maxEventsToSelect || appConfig.maxEventsPerWeek;

    if (dependencies.llmProvider) {
      this.llmProviderPromise = Promise.resolve(dependencies.llmProvider);
    } else {
      const overrides: NonNullable<LLMFactoryOptions['overrides']> = {};

      if (typeof config.model === 'string') {
        overrides.model = config.model;
      }
      if (typeof config.temperature === 'number') {
        overrides.temperature = config.temperature;
      }

      const providerOptions: LLMFactoryOptions = {};
      if (Object.keys(overrides).length > 0) {
        providerOptions.overrides = overrides;
      }

      this.llmProviderPromise = createLLMProvider(providerOptions);
    }
  }

  /**
   * Analyze a batch of raw events and return analyzed events with significance scores
   */
  async analyzeEvents(events: RawEvent[]): Promise<AnalyzedEvent[]> {
    console.log(`Analyzing ${events.length} events...`);

    const BATCH_SIZE = 5;
    const analyzedEvents: AnalyzedEvent[] = [];
    const provider = await this.llmProviderPromise;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      const promises = batch.map((event) => this.analyzeEvent(event, provider));
      const results = await Promise.allSettled(promises);

      const successfullyAnalyzed: AnalyzedEvent[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          successfullyAnalyzed.push(result.value);
        } else if (result.status === 'rejected') {
          console.error('Event analysis failed with an unhandled rejection:', result.reason);
        }
      }
      analyzedEvents.push(...successfullyAnalyzed);
    }

    console.log(`Successfully analyzed ${analyzedEvents.length} events`);
    return analyzedEvents;
  }

  /**
   * Analyze a single event using AI
   */
  private async analyzeEvent(
    event: RawEvent,
    provider: LLMProvider
  ): Promise<AnalyzedEvent | null> {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const analysis = await this.performLLMAnalysis(event, provider);

        const sanitizedTitle = this.sanitizeAnalysisText(analysis.title, event.title, 200);

        const sanitizedDescription = this.sanitizeAnalysisText(
          analysis.description,
          this.buildFallbackDescription(event),
          1000
        );

        // Calculate overall impact score
        const impactScore = this.calculateImpactScore(analysis.significance);

        // Generate a unique ID for the event
        const id = this.generateEventId(event.date, event.title);

        return {
          id,
          title: sanitizedTitle,
          date: event.date.toISOString(),
          description: sanitizedDescription,
          category: analysis.category as EventCategory,
          sources: [event.url].filter(Boolean),
          url: event.url,
          impactScore,
          significance: analysis.significance,
          metadata: {
            ...event.metadata,
            keyInsights: analysis.keyInsights,
            relatedTopics: analysis.relatedTopics,
            originalTitle: event.title,
            analysisProvider: provider.id,
            analysisModel: provider.model,
            analysisDate: new Date().toISOString()
          }
        };
      } catch (error) {
        retries++;
        console.error(`Error analyzing event (attempt ${retries}/${this.maxRetries}):`, error);

        if (retries >= this.maxRetries) {
          console.error(
            `Failed to analyze event after ${this.maxRetries} attempts: ${event.title}`
          );
          return null;
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 2 ** retries * 1000));
      }
    }

    return null;
  }

  private async performLLMAnalysis(
    event: RawEvent,
    provider: LLMProvider
  ): Promise<AIAnalysisResult> {
    const messages = this.buildCompletionMessages(event);
    const response = await provider.complete({
      messages,
      temperature: this.requestTemperature
    });

    const payload = this.extractJsonPayload(response.text);

    try {
      const parsed = JSON.parse(payload);
      return AIAnalysisSchema.parse(parsed);
    } catch (error) {
      console.error('Failed to parse LLM analysis output', {
        payload,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  private buildCompletionMessages(event: RawEvent): LLMMessage[] {
    return [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: this.buildAnalysisPrompt(event)
      }
    ];
  }

  private extractJsonPayload(text: string): string {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

    if (candidate.startsWith('{')) {
      const lastBrace = candidate.lastIndexOf('}');
      if (lastBrace !== -1) {
        return candidate.slice(0, lastBrace + 1);
      }
    }

    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return candidate.slice(firstBrace, lastBrace + 1);
    }

    throw new Error('No JSON object found in LLM response');
  }

  /**
   * Build the analysis prompt for the AI
   */
  private buildAnalysisPrompt(event: RawEvent): string {
    const date = event.date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const lines: string[] = [
      'Event briefing for analysis:',
      `Title: ${event.title}`,
      `Published on: ${date}`,
      `Source: ${event.source || 'Unknown'}`,
      `URL: ${event.url || 'N/A'}`,
      '',
      'Full content:',
      event.content
    ];

    if (event.metadata?.abstract) {
      lines.push('', `Abstract: ${event.metadata.abstract}`);
    }

    if (Array.isArray(event.metadata?.authors)) {
      lines.push('', `Authors: ${event.metadata?.authors.join(', ')}`);
    }

    if (event.metadata?.additionalContext) {
      lines.push('', `Additional context: ${event.metadata.additionalContext}`);
    }

    lines.push('', 'Return the JSON object now. Do not include explanations or commentary.');

    return lines.join('\n');
  }

  /**
   * Calculate overall impact score from significance dimensions
   */
  private calculateImpactScore(significance: SignificanceScores): number {
    // Weighted average of significance dimensions
    const weights = {
      technologicalBreakthrough: 0.35,
      industryImpact: 0.3,
      adoptionScale: 0.2,
      novelty: 0.15
    };

    const score =
      significance.technologicalBreakthrough * weights.technologicalBreakthrough +
      significance.industryImpact * weights.industryImpact +
      significance.adoptionScale * weights.adoptionScale +
      significance.novelty * weights.novelty;

    // Round to 1 decimal place
    return Math.round(score * 10) / 10;
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(date: Date, title: string): string {
    const dateStr = date.toISOString().split('T')[0];
    const titleSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 30);

    return `${dateStr}-${titleSlug}`;
  }

  private sanitizeAnalysisText(value: string, fallback: string, maxLength: number): string {
    const stripped = this.stripPromptArtifacts(value);
    const hasArtifacts =
      stripped.length === 0 || PROMPT_ARTIFACT_PATTERNS.some((pattern) => pattern.test(stripped));

    let candidate = hasArtifacts ? '' : stripped;

    if (!candidate) {
      const fallbackStripped = this.stripPromptArtifacts(fallback);
      candidate = fallbackStripped || fallback;
    }

    candidate = candidate.replace(/\s+/g, ' ').trim();

    if (!candidate) {
      candidate = 'Summary unavailable.';
    }

    if (candidate.length > maxLength) {
      candidate = candidate.slice(0, maxLength).trim();
    }

    return candidate;
  }

  private stripPromptArtifacts(value: string): string {
    if (!value) {
      return '';
    }

    const normalized = value.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const cleanedLines: string[] = [];

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      if (/^return the json object now/i.test(line)) {
        continue;
      }

      if (/^event briefing for analysis:?$/i.test(line)) {
        continue;
      }

      if (/^full content:?$/i.test(line)) {
        continue;
      }

      if (/^do not include explanations or commentary.?$/i.test(line)) {
        continue;
      }

      if (/^additional context:/i.test(line)) {
        continue;
      }

      if (/^authors?:/i.test(line)) {
        continue;
      }

      if (/^abstract:/i.test(line)) {
        continue;
      }

      if (/^published on:/i.test(line)) {
        continue;
      }

      if (/^source:/i.test(line)) {
        continue;
      }

      if (/^url:/i.test(line)) {
        continue;
      }

      if (/^title:\s*(.*)$/i.test(line)) {
        line = line.replace(/^title:\s*/i, '');
      }

      line = line
        .replace(/Event briefing for analysis:?/gi, ' ')
        .replace(/Return the JSON object now\.?/gi, ' ')
        .replace(/Do not include explanations or commentary\.?/gi, ' ')
        .replace(/Full content:?/gi, ' ')
        .replace(/Title:\s*/gi, ' ')
        .trim();

      if (!line) continue;

      cleanedLines.push(line);
    }

    return cleanedLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  private buildFallbackDescription(event: RawEvent): string {
    const normalized = event.content.replace(/\r\n/g, '\n');
    const paragraphs = normalized.split(/\n{2,}/);
    const firstParagraph = paragraphs.length > 0 ? paragraphs[0] : normalized;
    return firstParagraph.replace(/\s+/g, ' ').trim();
  }

  /**
   * Rank and select the most significant events
   */
  async selectTopEvents(events: AnalyzedEvent[]): Promise<AnalyzedEvent[]> {
    console.log(
      `Selecting top ${this.maxEventsToSelect} events from ${events.length} analyzed events`
    );

    // Filter by significance threshold
    const significantEvents = events.filter(
      (event) => event.impactScore >= this.significanceThreshold
    );

    console.log(
      `${significantEvents.length} events meet significance threshold of ${this.significanceThreshold}`
    );

    // Sort by impact score (descending) and then by date (most recent first)
    const sortedEvents = significantEvents.sort((a, b) => {
      if (Math.abs(a.impactScore - b.impactScore) > 0.1) {
        return b.impactScore - a.impactScore;
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // Take top N events
    const selectedEvents = sortedEvents.slice(0, this.maxEventsToSelect);

    console.log(`Selected ${selectedEvents.length} top events`);
    selectedEvents.forEach((event) => {
      console.log(`  - ${event.title} (score: ${event.impactScore})`);
    });

    return selectedEvents;
  }

  /**
   * Generate a summary of the selected events for PR description
   */
  generateEventsSummary(events: AnalyzedEvent[]): string {
    if (events.length === 0) {
      return 'No significant events found this week.';
    }

    const lines = ['## Daily AI Timeline Update\n'];
    lines.push(
      `Selected ${events.length} significant AI development${
        events.length > 1 ? 's' : ''
      } in this run:\n`
    );

    events.forEach((event, index) => {
      const date = new Date(event.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      lines.push(`### ${index + 1}. ${event.title}`);
      lines.push(`- **Date**: ${date}`);
      lines.push(`- **Category**: ${event.category}`);
      lines.push(`- **Impact Score**: ${event.impactScore}/10`);
      lines.push(
        `- **Summary**: ${event.description.substring(0, 200)}${
          event.description.length > 200 ? '...' : ''
        }`
      );

      if (event.sources.length > 0) {
        lines.push(`- **Source**: [Link](${event.sources[0]})`);
      }

      lines.push('');
    });

    lines.push('### Significance Metrics');
    lines.push('Events were selected based on:');
    lines.push('- Technological breakthrough potential');
    lines.push('- Industry-wide impact');
    lines.push('- Expected adoption scale');
    lines.push('- Novelty of the development');

    return lines.join('\n');
  }
}

const PROMPT_ARTIFACT_PATTERNS = [
  /event briefing for analysis/i,
  /return the json object now/i,
  /full content/i,
  /do not include explanations or commentary/i,
  /published on:/i,
  /source:/i,
  /url:/i,
  /abstract:/i,
  /authors?:/i,
  /additional context:/i
];
