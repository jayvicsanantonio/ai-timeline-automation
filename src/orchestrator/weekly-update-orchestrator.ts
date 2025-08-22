/**
 * WeeklyUpdateOrchestrator - Coordinates the weekly workflow
 */

import { AnalyzedEvent, RawEvent } from '../types';
import { EventAnalyzer } from '../analyzers';
import { GitHubManager } from '../github';
import { DeduplicationService } from '../lib/deduplication';
import { 
  CircuitBreakerFactory, 
  RetryPolicy, 
  RetryPolicies, 
  AggregateError 
} from '../utils';

export interface OrchestratorConfig {
  timelineRepo: string; // format: owner/repo
  maxEventsPerWeek?: number; // default 3
  significanceThreshold?: number; // default 7.0
  newsSources?: string[]; // names of enabled sources
  githubToken?: string;
}

export interface NewsCollector {
  name: string;
  fetchEvents(): Promise<RawEvent[]>;
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
  private readonly errors: Error[] = [];

  constructor(
    private readonly config: OrchestratorConfig,
    analyzer?: EventAnalyzer,
    github?: GitHubManager,
    deduplication?: DeduplicationService
  ) {
    const [owner, repo] = config.timelineRepo.split('/');
    
    if (!owner || !repo) {
      throw new Error(`Invalid timeline repo format: ${config.timelineRepo}. Expected format: owner/repo`);
    }

    this.analyzer = analyzer || new EventAnalyzer({
      significanceThreshold: config.significanceThreshold || 7.0,
      maxEventsToSelect: config.maxEventsPerWeek || 3
    });

    this.github = github || new GitHubManager({
      owner,
      repo,
      token: config.githubToken || process.env.GITHUB_TOKEN,
    });
    
    this.deduplication = deduplication || new DeduplicationService();

    this.maxEventsPerWeek = config.maxEventsPerWeek || 3;
    this.significanceThreshold = config.significanceThreshold || 7.0;

    // Configure retry policies for different services
    RetryPolicy.register('collector', RetryPolicies.standard);
    RetryPolicy.register('analyzer', {
      ...RetryPolicies.standard,
      maxAttempts: 2,
      onRetry: (attempt, error, delay) => {
        console.log(`[Analyzer] Retry attempt ${attempt}, waiting ${delay}ms:`, error.message);
      }
    });
    RetryPolicy.register('github', {
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
    collectors.forEach(c => this.registerCollector(c));
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
    console.log(`   - Collectors: ${Array.from(this.collectors.keys()).join(', ')}`);
    console.log('====================================================\n');

    try {
      // Step 1: Collect events from all sources
      console.log('📊 Step 1: Collecting events from news sources...');
      const collected = await this.collectAllEvents();
      metrics.totalCollected = collected.length;
      console.log(`   ✓ Collected ${collected.length} raw events\n`);

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
        console.log('📝 Step 5: Creating GitHub pull request...');
        try {
          const pr = await this.createPullRequest(finalSelected);
          prUrl = pr.url;
          console.log(`   ✓ Pull request created: ${prUrl}\n`);
        } catch (error) {
          console.error('   ✗ Failed to create pull request:', error);
          this.errors.push(error as Error);
        }
      } else {
        console.log('⏭️  Step 5: Skipping PR creation (no events selected)\n');
      }

      // Calculate duration and print summary
      metrics.duration = Math.round((Date.now() - start) / 1000);
      this.printSummary(metrics, prUrl);

      return {
        success: finalSelected.length > 0 && !!prUrl,
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
        const events = await breaker.execute(() =>
          RetryPolicy.execute('collector', () => collector.fetchEvents())
        );
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
    const flatResults = results.flat();
    
    // Log summary
    const successCount = results.filter(r => r.length > 0).length;
    console.log(`   📊 Collection summary: ${successCount}/${this.collectors.size} sources succeeded`);
    
    if (collectorErrors.length === this.collectors.size) {
      throw new AggregateError('All collectors failed', collectorErrors);
    }
    
    return flatResults;
  }
  
  /**
   * Analyze events with error handling
   */
  private async analyzeEvents(events: RawEvent[]): Promise<AnalyzedEvent[]> {
    const breaker = CircuitBreakerFactory.getBreaker('Analyzer');
    
    try {
      return await breaker.execute(() =>
        RetryPolicy.execute('analyzer', () => 
          this.analyzer.analyzeEvents(events)
        )
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
      RetryPolicy.execute('github', () =>
        this.github.createTimelineUpdatePR(events)
      )
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

