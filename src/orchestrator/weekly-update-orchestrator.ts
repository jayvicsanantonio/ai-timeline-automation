/**
 * WeeklyUpdateOrchestrator - Coordinates the weekly workflow
 */

import { randomUUID } from 'node:crypto';
import { EventAnalyzer } from '../analyzers';
import { loadPipelineConfig, type PipelineConfig } from '../config';
import { bootstrapConnectors, computeIngestionWindow, type RawItem } from '../connectors';
import { GitHubManager } from '../github';
import { DeduplicationService } from '../lib/deduplication';
import type { AnalyzedEvent, RawEvent } from '../types';
import {
  CircuitBreakerFactory,
  AggregateError as CustomAggregateError,
  executeWithRetryPolicy,
  RetryPolicies,
  registerRetryPolicy
} from '../utils';

export interface OrchestratorConfig {
  timelineRepo: string; // format: owner/repo
  maxEventsPerWeek?: number; // default 3
  significanceThreshold?: number; // default 7.0
  githubToken?: string;
  dryRun?: boolean;
}

export interface NewsCollector {
  name: string;
  fetchEvents(): Promise<RawEvent[]>;
}

interface ConnectorIngestionSummary {
  id: string;
  itemCount: number;
  latencyMs: number;
}

export interface OrchestratorResult {
  success: boolean;
  analyzed: AnalyzedEvent[];
  selected: AnalyzedEvent[];
  prUrl?: string;
  metrics: {
    totalCollected: number;
    afterDeduplication: number;
    analyzed: number;
    selected: number;
    duration: number;
  };
  errors: Error[];
}

export class WeeklyUpdateOrchestrator {
  private readonly analyzer: EventAnalyzer;
  private readonly github: GitHubManager;
  private readonly deduplication: DeduplicationService;
  private readonly collectors: Map<string, NewsCollector> = new Map();
  private readonly maxEventsPerWeek: number;
  private readonly significanceThreshold: number;
  private readonly dryRun: boolean;
  private readonly errors: Error[] = [];

  constructor(
    private readonly config: OrchestratorConfig,
    analyzer?: EventAnalyzer,
    github?: GitHubManager,
    deduplication?: DeduplicationService
  ) {
    const [owner, repo] = config.timelineRepo.split('/');

    if (!owner || !repo) {
      throw new Error(
        `Invalid timeline repo format: ${config.timelineRepo}. Expected format: owner/repo`
      );
    }

    this.analyzer =
      analyzer ||
      new EventAnalyzer({
        significanceThreshold: config.significanceThreshold || 7.0,
        maxEventsToSelect: config.maxEventsPerWeek || 3
      });

    this.github =
      github ||
      new GitHubManager({
        owner,
        repo,
        token: config.githubToken || process.env.GIT_TOKEN
      });

    this.deduplication = deduplication || new DeduplicationService();

    this.maxEventsPerWeek = config.maxEventsPerWeek || 3;
    this.significanceThreshold = config.significanceThreshold || 7.0;
    this.dryRun = config.dryRun ?? false;

    // Configure retry policies for different services
    registerRetryPolicy('collector', RetryPolicies.standard);
    registerRetryPolicy('analyzer', {
      ...RetryPolicies.standard,
      maxAttempts: 2,
      onRetry: (attempt, error, delay) => {
        console.log(`[Analyzer] Retry attempt ${attempt}, waiting ${delay}ms:`, error.message);
      }
    });
    registerRetryPolicy('github', {
      ...RetryPolicies.rateLimited,
      onRetry: (attempt, error, delay) => {
        console.log(`[GitHub] Retry attempt ${attempt}, waiting ${delay}ms:`, error.message);
      }
    });
  }

  /**
   * Register a news collector
   */
  registerCollector(collector: NewsCollector): void {
    if (this.collectors.has(collector.name)) {
      console.warn(`Collector ${collector.name} already registered, replacing...`);
    }
    this.collectors.set(collector.name, collector);
    console.log(`Registered collector: ${collector.name}`);
  }

  /**
   * Register multiple collectors
   */
  registerCollectors(collectors: NewsCollector[]): void {
    for (const collector of collectors) {
      this.registerCollector(collector);
    }
  }

  /**
   * Run the weekly update workflow
   */
  async run(): Promise<OrchestratorResult> {
    const start = Date.now();
    const metrics = {
      totalCollected: 0,
      afterDeduplication: 0,
      analyzed: 0,
      selected: 0,
      duration: 0
    };

    console.log('====================================================');
    console.log('🚀 WeeklyUpdateOrchestrator: Starting weekly update');
    console.log(`⚙️  Configuration:`);
    console.log(`   - Timeline repo: ${this.config.timelineRepo}`);
    console.log(`   - Max events per week: ${this.maxEventsPerWeek}`);
    console.log(`   - Significance threshold: ${this.significanceThreshold}`);
    console.log('====================================================\n');

    try {
      // Step 1: Collect events via config-driven connectors
      console.log('📊 Step 1: Collecting events from configured sources...');
      const ingestion = await this.collectFromConfigSources();

      let collected: RawEvent[];
      if (ingestion) {
        collected = ingestion.events;
        metrics.totalCollected = collected.length;
        console.log(
          `   ✓ Collected ${ingestion.totalBeforeLimit} items across ${ingestion.connectorSummaries.length} sources`
        );
        if (ingestion.totalBeforeLimit !== collected.length) {
          console.log(`   ✓ Trimmed to ${collected.length} items per pipeline limits`);
        }
        ingestion.connectorSummaries.forEach((summary) => {
          console.log(`     - ${summary.id}: ${summary.itemCount} items in ${summary.latencyMs}ms`);
        });
        console.log(
          `   ✓ Window: ${ingestion.windowStart.toISOString()} -> ${ingestion.windowEnd.toISOString()}\n`
        );
      } else {
        console.log('   ⚠️ No config-driven connectors found, falling back to legacy collectors');
        collected = await this.collectAllEvents();
        metrics.totalCollected = collected.length;
        console.log(`   ✓ Collected ${collected.length} raw events\n`);
      }

      if (collected.length === 0) {
        console.log('⚠️  No events collected. Exiting.');
        return {
          success: false,
          analyzed: [],
          selected: [],
          metrics,
          errors: this.errors
        };
      }

      // Step 2: Deduplicate events
      console.log('🔄 Step 2: Deduplicating events...');
      const deduplicated = await this.deduplication.deduplicate(collected);
      metrics.afterDeduplication = deduplicated.length;
      console.log(`   ✓ ${deduplicated.length} events after deduplication`);
      console.log(`   ✓ Removed ${collected.length - deduplicated.length} duplicates\n`);

      // Step 3: Analyze events with AI
      console.log('🤖 Step 3: Analyzing events with AI...');
      const analyzed = await this.analyzeEvents(deduplicated);
      metrics.analyzed = analyzed.length;
      console.log(`   ✓ Successfully analyzed ${analyzed.length} events\n`);

      // Step 4: Select top events
      console.log('⭐ Step 4: Selecting top events...');
      const selected = await this.analyzer.selectTopEvents(analyzed);
      const finalSelected = selected.slice(0, this.maxEventsPerWeek);
      metrics.selected = finalSelected.length;

      if (finalSelected.length > 0) {
        console.log(`   ✓ Selected ${finalSelected.length} significant events:`);
        finalSelected.forEach((event, i) => {
          console.log(`     ${i + 1}. ${event.title} (score: ${event.impactScore})`);
        });
        console.log();
      } else {
        console.log('   ⚠️ No events met significance threshold\n');
      }

      // Step 5: Create PR if we have events
      let prUrl: string | undefined;
      if (finalSelected.length > 0) {
        if (this.dryRun) {
          console.log('🛑 Step 5: Dry run mode — skipping PR creation\n');
        } else {
          console.log('📝 Step 5: Creating GitHub pull request...');
          try {
            const pr = await this.createPullRequest(finalSelected);
            prUrl = pr.html_url;
            console.log(`   ✓ Pull request created: ${prUrl}\n`);
          } catch (error) {
            console.error('   ✗ Failed to create pull request:', error);
            this.errors.push(error as Error);
          }
        }
      } else {
        console.log('⏭️  Step 5: Skipping PR creation (no events selected)\n');
      }

      // Calculate duration and print summary
      metrics.duration = Math.round((Date.now() - start) / 1000);
      this.printSummary(metrics, prUrl);

      return {
        success: finalSelected.length > 0 && (this.dryRun ? true : !!prUrl),
        analyzed,
        selected: finalSelected,
        prUrl,
        metrics,
        errors: this.errors
      };
    } catch (error) {
      console.error('\n❌ Fatal error in orchestrator:', error);
      this.errors.push(error as Error);

      metrics.duration = Math.round((Date.now() - start) / 1000);

      return {
        success: false,
        analyzed: [],
        selected: [],
        metrics,
        errors: this.errors
      };
    }
  }

  /**
   * Collect events from all registered sources
   */
  private async collectAllEvents(): Promise<RawEvent[]> {
    if (this.collectors.size === 0) {
      console.warn('   ⚠️ No collectors registered');
      return [];
    }

    const breaker = CircuitBreakerFactory.getBreaker('Collectors');
    const collectorErrors: Error[] = [];

    const promises = Array.from(this.collectors.entries()).map(async ([name, collector]) => {
      try {
        console.log(`   📡 Fetching from ${name}...`);
        const events = (await breaker.execute(() =>
          executeWithRetryPolicy('collector', () => collector.fetchEvents())
        )) as RawEvent[];
        console.log(`      ✓ ${name}: ${events.length} events`);
        return events;
      } catch (error) {
        const err = error as Error;
        console.error(`      ✗ ${name} failed: ${err.message}`);
        collectorErrors.push(err);
        this.errors.push(err);
        return [] as RawEvent[];
      }
    });

    const results = await Promise.all(promises);
    const flatResults = results.flat() as RawEvent[];

    // Log summary
    const successCount = results.filter((r: RawEvent[]) => r.length > 0).length;
    console.log(
      `   📊 Collection summary: ${successCount}/${this.collectors.size} sources succeeded`
    );

    if (collectorErrors.length === this.collectors.size) {
      throw new CustomAggregateError('All collectors failed', collectorErrors);
    }

    return flatResults;
  }

  private async collectFromConfigSources(): Promise<{
    events: RawEvent[];
    totalBeforeLimit: number;
    connectorSummaries: ConnectorIngestionSummary[];
    windowStart: Date;
    windowEnd: Date;
  } | null> {
    let pipelineConfig: PipelineConfig;
    try {
      pipelineConfig = await loadPipelineConfig();
    } catch (error) {
      console.error('Unable to load pipeline configuration:', error);
      this.errors.push(error instanceof Error ? error : new Error(String(error)));
      return null;
    }

    const { connectors, windowDays } = await bootstrapConnectors();
    if (connectors.length === 0) {
      console.warn('No connectors defined in configuration.');
      return null;
    }

    const { windowStart, windowEnd } = computeIngestionWindow(windowDays);
    const correlationId =
      typeof randomUUID === 'function'
        ? randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const maxPerSource = pipelineConfig.limits?.max_items_per_source ?? 20;

    const results = await Promise.all(
      connectors.map(async (connector) => {
        const startedAt = Date.now();
        try {
          const items = await connector.fetch({
            windowStart,
            windowEnd,
            maxItems: maxPerSource,
            correlationId
          });
          const events = items.map((item) => this.rawItemToRawEvent(item));
          return {
            id: connector.id,
            events,
            latencyMs: Date.now() - startedAt
          };
        } catch (error) {
          const latencyMs = Date.now() - startedAt;
          console.error(`Error fetching from ${connector.id}:`, error);
          this.errors.push(error instanceof Error ? error : new Error(String(error)));
          return {
            id: connector.id,
            events: [] as RawEvent[],
            latencyMs
          };
        }
      })
    );

    const allEvents = results.flatMap((result) => result.events);

    const totalBeforeLimit = allEvents.length;
    allEvents.sort((a, b) => b.date.getTime() - a.date.getTime());

    const maxPerRun = pipelineConfig.limits?.max_items_per_run;
    const limitedEvents = typeof maxPerRun === 'number' ? allEvents.slice(0, maxPerRun) : allEvents;

    const connectorSummaries: ConnectorIngestionSummary[] = results.map(
      ({ id, events, latencyMs }) => ({
        id,
        itemCount: events.length,
        latencyMs
      })
    );

    return {
      events: limitedEvents,
      totalBeforeLimit,
      connectorSummaries,
      windowStart,
      windowEnd
    };
  }

  private rawItemToRawEvent(item: RawItem): RawEvent {
    const publishedAt = item.publishedAt ? new Date(item.publishedAt) : new Date();
    const eventDate = Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt;

    const summaryContent =
      item.summary && item.summary.trim().length > 0 ? item.summary.trim() : undefined;

    const metadata: Record<string, unknown> = {
      ...item.metadata,
      raw_item_id: item.id,
      source_id: item.source
    };

    if (summaryContent) {
      metadata.summary = summaryContent;
    }

    if (item.authors && item.authors.length > 0) {
      metadata.authors = item.authors;
    }

    const content = summaryContent ?? item.title;

    return {
      title: item.title,
      date: eventDate,
      source: item.source,
      url: item.url,
      content,
      metadata
    };
  }

  /**
   * Analyze events with error handling
   */
  private async analyzeEvents(events: RawEvent[]): Promise<AnalyzedEvent[]> {
    const breaker = CircuitBreakerFactory.getBreaker('Analyzer');

    try {
      return await breaker.execute(() =>
        executeWithRetryPolicy('analyzer', () => this.analyzer.analyzeEvents(events))
      );
    } catch (error) {
      console.error('   ✗ Analysis failed:', error);
      this.errors.push(error as Error);

      // Return empty array to continue with workflow
      return [];
    }
  }

  /**
   * Create pull request with error handling
   */
  private async createPullRequest(events: AnalyzedEvent[]) {
    const breaker = CircuitBreakerFactory.getBreaker('GitHub');

    return await breaker.execute(() =>
      executeWithRetryPolicy('github', () => this.github.createTimelineUpdatePR(events))
    );
  }

  /**
   * Print execution summary
   */
  private printSummary(metrics: OrchestratorResult['metrics'], prUrl?: string): void {
    console.log('====================================================');
    console.log('📈 Execution Summary');
    console.log('====================================================');
    console.log(`Total events collected:     ${metrics.totalCollected}`);
    console.log(`After deduplication:        ${metrics.afterDeduplication}`);
    console.log(`Successfully analyzed:      ${metrics.analyzed}`);
    console.log(`Selected for timeline:      ${metrics.selected}`);
    console.log(`Execution time:             ${metrics.duration}s`);

    if (prUrl) {
      console.log(`\n✅ Pull Request:            ${prUrl}`);
    }

    if (this.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:       ${this.errors.length}`);
      this.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err.message}`);
      });
    }

    console.log('====================================================\n');
  }
}
