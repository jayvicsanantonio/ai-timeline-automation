/**
 * Event Analyzer using Vercel AI SDK
 * Analyzes raw events to determine significance and generate structured timeline entries
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { 
  RawEvent, 
  AnalyzedEvent, 
  EventCategory, 
  SignificanceScores 
} from '../types';
import { createOpenRouter } from '../providers/openrouter';
import { loadConfig } from '../config';

// Schema for structured output from AI
const AIAnalysisSchema = z.object({
  title: z.string().describe('Concise, informative title for the event (max 200 chars)'),
  description: z.string().describe('Clear description of the event and its significance (max 1000 chars)'),
  category: z.enum(['research', 'product', 'regulation', 'industry']).describe('Primary category of the event'),
  significance: z.object({
    technologicalBreakthrough: z.number().min(0).max(10).describe('How much this advances the state of the art (0-10)'),
    industryImpact: z.number().min(0).max(10).describe('Potential impact on the AI industry (0-10)'),
    adoptionScale: z.number().min(0).max(10).describe('Expected scale of adoption or usage (0-10)'),
    novelty: z.number().min(0).max(10).describe('How novel or unprecedented this development is (0-10)')
  }),
  keyInsights: z.array(z.string()).describe('Key takeaways or implications'),
  relatedTopics: z.array(z.string()).describe('Related AI topics or technologies')
});

type AIAnalysisResult = z.infer<typeof AIAnalysisSchema>;

export interface EventAnalyzerConfig {
  model?: string;
  temperature?: number;
  maxRetries?: number;
  significanceThreshold?: number;
  maxEventsToSelect?: number;
}

export class EventAnalyzer {
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxRetries: number;
  private readonly significanceThreshold: number;
  private readonly maxEventsToSelect: number;
  private readonly aiProvider: any;

  constructor(config: EventAnalyzerConfig = {}) {
    const appConfig = loadConfig();
    
    // Use configured model or override from config
    this.model = config.model || appConfig.aiModel;
    this.temperature = config.temperature ?? 0.3;
    this.maxRetries = config.maxRetries || 3;
    this.significanceThreshold = config.significanceThreshold || appConfig.significanceThreshold;
    this.maxEventsToSelect = config.maxEventsToSelect || appConfig.maxEventsPerWeek;
    
    // Initialize the appropriate AI provider
    if (appConfig.aiProvider === 'openrouter') {
      this.aiProvider = createOpenRouter(appConfig.aiApiKey);
      console.log(`Using OpenRouter with model: ${this.model}`);
    } else {
      this.aiProvider = openai;
      console.log(`Using OpenAI with model: ${this.model}`);
    }
  }

  /**
   * Analyze a batch of raw events and return analyzed events with significance scores
   */
  async analyzeEvents(events: RawEvent[]): Promise<AnalyzedEvent[]> {
    console.log(`Analyzing ${events.length} events...`);

    const BATCH_SIZE = 5;
    const analyzedEvents: AnalyzedEvent[] = [];

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      const promises = batch.map(event => this.analyzeEvent(event));
      const results = await Promise.allSettled(promises);

      const successfullyAnalyzed: AnalyzedEvent[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          successfullyAnalyzed.push(result.value);
        } else if (result.status === 'rejected') {
          console.error(
            'Event analysis failed with an unhandled rejection:',
            result.reason
          );
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
  private async analyzeEvent(event: RawEvent): Promise<AnalyzedEvent | null> {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        const analysis = await this.performAIAnalysis(event);
        
        if (!analysis) {
          console.warn(`Failed to analyze event: ${event.title}`);
          return null;
        }

        // Calculate overall impact score
        const impactScore = this.calculateImpactScore(analysis.significance);

        // Generate a unique ID for the event
        const id = this.generateEventId(event.date, event.title);

        return {
          id,
          title: analysis.title,
          date: event.date.toISOString(),
          description: analysis.description,
          category: analysis.category as EventCategory,
          sources: event.source ? [event.source] : [],
          url: event.url,
          impactScore,
          significance: analysis.significance,
          metadata: {
            ...event.metadata,
            keyInsights: analysis.keyInsights,
            relatedTopics: analysis.relatedTopics,
            originalTitle: event.title,
            analysisModel: this.model,
            analysisDate: new Date().toISOString()
          }
        };
      } catch (error) {
        retries++;
        console.error(`Error analyzing event (attempt ${retries}/${this.maxRetries}):`, error);
        
        if (retries >= this.maxRetries) {
          console.error(`Failed to analyze event after ${this.maxRetries} attempts: ${event.title}`);
          return null;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
    
    return null;
  }

  /**
   * Perform AI analysis using Vercel AI SDK
   */
  private async performAIAnalysis(event: RawEvent): Promise<AIAnalysisResult | null> {
    const prompt = this.buildAnalysisPrompt(event);
    
    try {
      const result = await generateObject({
        model: this.aiProvider(this.model) as any, // Type assertion to handle version compatibility
        schema: AIAnalysisSchema,
        prompt,
        temperature: this.temperature,
        maxRetries: 1, // We handle retries at a higher level
      });

      return result.object;
    } catch (error) {
      console.error('AI analysis failed:', error);
      return null;
    }
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

    return `You are an AI news analyst specializing in artificial intelligence developments. Analyze the following news event and provide a structured assessment.

Event Information:
- Title: ${event.title}
- Date: ${date}
- Source: ${event.source || 'Unknown'}
- URL: ${event.url || 'N/A'}

Content:
${event.content}

${event.metadata?.abstract ? `Abstract: ${event.metadata.abstract}` : ''}
${event.metadata?.authors ? `Authors: ${event.metadata.authors.join(', ')}` : ''}

Please analyze this event and provide:
1. A clear, concise title (max 200 characters)
2. A comprehensive description explaining its significance (max 1000 characters)
3. The most appropriate category (research, product, regulation, or industry)
4. Significance scores (0-10) for:
   - Technological breakthrough: How much this advances the state of the art
   - Industry impact: Potential effect on the AI industry
   - Adoption scale: Expected scale of adoption or usage
   - Novelty: How unprecedented this development is
5. Key insights or implications
6. Related AI topics or technologies

Focus on factual analysis and avoid speculation. Consider the event's importance in the context of AI development in ${new Date().getFullYear()}.`;
  }

  /**
   * Calculate overall impact score from significance dimensions
   */
  private calculateImpactScore(significance: SignificanceScores): number {
    // Weighted average of significance dimensions
    const weights = {
      technologicalBreakthrough: 0.35,
      industryImpact: 0.30,
      adoptionScale: 0.20,
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

  /**
   * Rank and select the most significant events
   */
  async selectTopEvents(events: AnalyzedEvent[]): Promise<AnalyzedEvent[]> {
    console.log(`Selecting top ${this.maxEventsToSelect} events from ${events.length} analyzed events`);
    
    // Filter by significance threshold
    const significantEvents = events.filter(
      event => event.impactScore >= this.significanceThreshold
    );
    
    console.log(`${significantEvents.length} events meet significance threshold of ${this.significanceThreshold}`);
    
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
    selectedEvents.forEach(event => {
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

    const lines = ['## Weekly AI Timeline Update\n'];
    lines.push(`Selected ${events.length} significant AI development${events.length > 1 ? 's' : ''} from this week:\n`);
    
    events.forEach((event, index) => {
      const date = new Date(event.date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      lines.push(`### ${index + 1}. ${event.title}`);
      lines.push(`- **Date**: ${date}`);
      lines.push(`- **Category**: ${event.category}`);
      lines.push(`- **Impact Score**: ${event.impactScore}/10`);
      lines.push(`- **Summary**: ${event.description.substring(0, 200)}${event.description.length > 200 ? '...' : ''}`);
      
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
