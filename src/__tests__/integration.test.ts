/**
 * Integration tests for the complete AI timeline automation workflow
 */

import { WeeklyUpdateOrchestrator } from '../orchestrator/weekly-update-orchestrator';
import { HackerNewsCollector } from '../collectors/hackernews';
import { ArXivCollector } from '../collectors/arxiv';
import { RSSCollector } from '../collectors/rss';
import { EventAnalyzer } from '../analyzers/event-analyzer';
import { DeduplicationService } from '../lib/deduplication';
import { GitHubManager } from '../github/github-manager';
import { TimelineReader } from '../github/timeline-reader';
import { Logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';
import { SourceReliability } from '../types';

// Mock external dependencies
jest.mock('axios');
jest.mock('@octokit/rest');
jest.mock('rss-parser');
jest.mock('openai');

describe('Integration Tests', () => {
  let orchestrator: WeeklyUpdateOrchestrator;
  let mockLogger: Logger;
  let mockMetrics: MetricsCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock logger that doesn't output
    mockLogger = new (Logger as any)('INFO', {}, () => {});
    mockMetrics = new (MetricsCollector as any)(mockLogger);
    mockMetrics.reset();

    // Mock configuration
    const mockConfig = {
      openaiApiKey: 'test-openai-key',
      githubToken: 'test-github-token',
      timelineRepo: {
        owner: 'test-owner',
        repo: 'test-repo',
        full: 'test-owner/test-repo'
      },
      maxEventsPerWeek: 3,
      significanceThreshold: 7.0,
      newsSources: ['hackernews', 'arxiv', 'rss'],
      dryRun: true,
      apiKeys: {},
      logLevel: 'info' as const,
      nodeEnv: 'test' as const,
      isDevelopment: false,
      isProduction: false,
      isTest: true
    };

    orchestrator = new WeeklyUpdateOrchestrator(mockConfig, mockLogger, mockMetrics);
  });

  describe('Full Workflow Integration', () => {
    it('should execute complete workflow successfully', async () => {
      // Mock successful data from all sources
      const mockHNData = [
        {
          id: 'hn-1',
          title: 'GPT-5 Released with Breakthrough Performance',
          url: 'https://news.ycombinator.com/item?id=123',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'OpenAI releases GPT-5 with significant improvements...',
          score: 500
        }
      ];

      const mockArXivData = [
        {
          id: 'arxiv-1',
          title: 'Attention Is All You Need 2.0',
          url: 'https://arxiv.org/abs/2023.12345',
          source: 'ArXiv',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'We present an improved attention mechanism...',
          authors: ['John Doe', 'Jane Smith'],
          categories: ['cs.AI', 'cs.LG']
        }
      ];

      const mockRSSData = [
        {
          id: 'rss-1',
          title: 'Google Unveils New AI Chip Architecture',
          url: 'https://techblog.com/google-ai-chip',
          source: 'TechBlog',
          sourceReliability: SourceReliability.MEDIUM,
          publishedAt: new Date(),
          content: 'Google announces breakthrough in AI chip design...',
          author: 'Tech Reporter'
        }
      ];

      // Mock analyzer responses
      const mockAnalyzedEvents = [
        {
          id: 'hn-1',
          title: 'GPT-5 Released with Breakthrough Performance',
          description: 'OpenAI releases GPT-5 with significant performance improvements across multiple benchmarks',
          significance: 9.2,
          category: 'breakthrough',
          impact: {
            technical: 9.0,
            commercial: 9.0,
            social: 8.5
          },
          keywords: ['GPT-5', 'OpenAI', 'language model'],
          reasoning: 'Major advancement in large language models'
        },
        {
          id: 'arxiv-1',
          title: 'Attention Is All You Need 2.0',
          description: 'Improved attention mechanism for transformer architectures',
          significance: 8.7,
          category: 'research',
          impact: {
            technical: 9.0,
            commercial: 7.5,
            social: 7.0
          },
          keywords: ['attention', 'transformer', 'architecture'],
          reasoning: 'Significant improvement to foundational AI architecture'
        },
        {
          id: 'rss-1',
          title: 'Google Unveils New AI Chip Architecture',
          description: 'Google announces breakthrough in AI chip design for training and inference',
          significance: 8.1,
          category: 'development',
          impact: {
            technical: 8.0,
            commercial: 8.5,
            social: 7.0
          },
          keywords: ['Google', 'AI chip', 'hardware'],
          reasoning: 'Important hardware advancement for AI acceleration'
        }
      ];

      // Mock GitHub operations
      const mockPRResult = {
        number: 123,
        url: 'https://github.com/test-owner/test-repo/pull/123'
      };

      // Set up mocks
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockResolvedValue(mockHNData);
      jest.spyOn(ArXivCollector.prototype, 'fetchEvents').mockResolvedValue(mockArXivData);
      jest.spyOn(RSSCollector.prototype, 'fetchEvents').mockResolvedValue(mockRSSData);
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue([
        ...mockHNData,
        ...mockArXivData,
        ...mockRSSData
      ]);
      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockResolvedValue(mockAnalyzedEvents);
      jest.spyOn(TimelineReader.prototype, 'readTimeline').mockResolvedValue([]);
      jest.spyOn(GitHubManager.prototype, 'createBranch').mockResolvedValue('weekly-update-2023-12-01');
      jest.spyOn(GitHubManager.prototype, 'updateTimelineFile').mockResolvedValue();
      jest.spyOn(GitHubManager.prototype, 'createPullRequest').mockResolvedValue(mockPRResult);

      // Execute the workflow
      const result = await orchestrator.runUpdate();

      // Verify results
      expect(result).toEqual({
        success: true,
        eventsCollected: 3,
        eventsAnalyzed: 3,
        eventsSelected: 3,
        pullRequest: mockPRResult,
        errors: []
      });

      // Verify all components were called
      expect(HackerNewsCollector.prototype.fetchEvents).toHaveBeenCalled();
      expect(ArXivCollector.prototype.fetchEvents).toHaveBeenCalled();
      expect(RSSCollector.prototype.fetchEvents).toHaveBeenCalled();
      expect(DeduplicationService.prototype.deduplicate).toHaveBeenCalled();
      expect(EventAnalyzer.prototype.analyzeEvents).toHaveBeenCalled();
      expect(GitHubManager.prototype.createBranch).toHaveBeenCalled();
      expect(GitHubManager.prototype.updateTimelineFile).toHaveBeenCalled();
      expect(GitHubManager.prototype.createPullRequest).toHaveBeenCalled();
    });

    it('should handle partial failures gracefully', async () => {
      // Mock some failures
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockRejectedValue(
        new Error('HackerNews API timeout')
      );
      jest.spyOn(ArXivCollector.prototype, 'fetchEvents').mockResolvedValue([
        {
          id: 'arxiv-1',
          title: 'Test Paper',
          url: 'https://arxiv.org/abs/test',
          source: 'ArXiv',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content',
          authors: ['Author'],
          categories: ['cs.AI']
        }
      ]);
      jest.spyOn(RSSCollector.prototype, 'fetchEvents').mockResolvedValue([]);

      // Mock successful analysis
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue([
        {
          id: 'arxiv-1',
          title: 'Test Paper',
          url: 'https://arxiv.org/abs/test',
          source: 'ArXiv',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content'
        }
      ]);

      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockResolvedValue([
        {
          id: 'arxiv-1',
          title: 'Test Paper',
          description: 'A test research paper',
          significance: 7.5,
          category: 'research',
          impact: { technical: 7.0, commercial: 6.0, social: 6.0 },
          keywords: ['test'],
          reasoning: 'Research contribution'
        }
      ]);

      // Mock GitHub operations
      jest.spyOn(TimelineReader.prototype, 'readTimeline').mockResolvedValue([]);
      jest.spyOn(GitHubManager.prototype, 'createBranch').mockResolvedValue('test-branch');
      jest.spyOn(GitHubManager.prototype, 'updateTimelineFile').mockResolvedValue();
      jest.spyOn(GitHubManager.prototype, 'createPullRequest').mockResolvedValue({
        number: 456,
        url: 'https://github.com/test/test/pull/456'
      });

      const result = await orchestrator.runUpdate();

      // Should succeed with partial data
      expect(result.success).toBe(true);
      expect(result.eventsCollected).toBe(1); // Only ArXiv succeeded
      expect(result.errors).toHaveLength(1); // HackerNews failure
      expect(result.errors[0]).toContain('HackerNews API timeout');
    });

    it('should handle complete failure gracefully', async () => {
      // Mock all collectors failing
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockRejectedValue(
        new Error('HackerNews failed')
      );
      jest.spyOn(ArXivCollector.prototype, 'fetchEvents').mockRejectedValue(
        new Error('ArXiv failed')
      );
      jest.spyOn(RSSCollector.prototype, 'fetchEvents').mockRejectedValue(
        new Error('RSS failed')
      );

      const result = await orchestrator.runUpdate();

      // Should fail gracefully
      expect(result.success).toBe(false);
      expect(result.eventsCollected).toBe(0);
      expect(result.errors).toHaveLength(3);
      expect(result.pullRequest).toBeUndefined();
    });

    it('should handle analysis failures', async () => {
      // Mock successful collection
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockResolvedValue([
        {
          id: 'hn-1',
          title: 'Test Story',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content',
          score: 200
        }
      ]);
      jest.spyOn(ArXivCollector.prototype, 'fetchEvents').mockResolvedValue([]);
      jest.spyOn(RSSCollector.prototype, 'fetchEvents').mockResolvedValue([]);

      // Mock deduplication
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue([
        {
          id: 'hn-1',
          title: 'Test Story',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content'
        }
      ]);

      // Mock analysis failure
      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockRejectedValue(
        new Error('AI analysis failed')
      );

      const result = await orchestrator.runUpdate();

      expect(result.success).toBe(false);
      expect(result.eventsCollected).toBe(1);
      expect(result.eventsAnalyzed).toBe(0);
      expect(result.errors).toContain('AI analysis failed');
    });

    it('should handle GitHub failures', async () => {
      // Mock successful collection and analysis
      const mockEvents = [{
        id: 'test-1',
        title: 'Test Event',
        url: 'https://test.com',
        source: 'Test',
        sourceReliability: SourceReliability.HIGH,
        publishedAt: new Date(),
        content: 'Test content'
      }];

      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockResolvedValue(mockEvents);
      jest.spyOn(ArXivCollector.prototype, 'fetchEvents').mockResolvedValue([]);
      jest.spyOn(RSSCollector.prototype, 'fetchEvents').mockResolvedValue([]);
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue(mockEvents);
      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockResolvedValue([
        {
          id: 'test-1',
          title: 'Test Event',
          description: 'Test description',
          significance: 8.0,
          category: 'development',
          impact: { technical: 8.0, commercial: 7.0, social: 6.0 },
          keywords: ['test'],
          reasoning: 'Test reasoning'
        }
      ]);

      // Mock GitHub failure
      jest.spyOn(TimelineReader.prototype, 'readTimeline').mockResolvedValue([]);
      jest.spyOn(GitHubManager.prototype, 'createBranch').mockRejectedValue(
        new Error('GitHub API rate limit exceeded')
      );

      const result = await orchestrator.runUpdate();

      expect(result.success).toBe(false);
      expect(result.eventsCollected).toBe(1);
      expect(result.eventsAnalyzed).toBe(1);
      expect(result.errors).toContain('GitHub API rate limit exceeded');
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve([{
          id: 'hn-retry',
          title: 'Retry Success',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Content after retry',
          score: 150
        }]);
      });

      jest.spyOn(ArXivCollector.prototype, 'fetchEvents').mockResolvedValue([]);
      jest.spyOn(RSSCollector.prototype, 'fetchEvents').mockResolvedValue([]);

      // Mock the rest of the workflow
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue([
        {
          id: 'hn-retry',
          title: 'Retry Success',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Content after retry'
        }
      ]);

      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockResolvedValue([
        {
          id: 'hn-retry',
          title: 'Retry Success',
          description: 'Successfully retried operation',
          significance: 8.0,
          category: 'development',
          impact: { technical: 8.0, commercial: 7.0, social: 6.0 },
          keywords: ['retry'],
          reasoning: 'Demonstrates retry capability'
        }
      ]);

      jest.spyOn(TimelineReader.prototype, 'readTimeline').mockResolvedValue([]);
      jest.spyOn(GitHubManager.prototype, 'createBranch').mockResolvedValue('retry-branch');
      jest.spyOn(GitHubManager.prototype, 'updateTimelineFile').mockResolvedValue();
      jest.spyOn(GitHubManager.prototype, 'createPullRequest').mockResolvedValue({
        number: 789,
        url: 'https://github.com/test/test/pull/789'
      });

      const result = await orchestrator.runUpdate();

      expect(result.success).toBe(true);
      expect(attempts).toBe(3); // Should have retried twice before succeeding
      expect(result.eventsCollected).toBe(1);
    });
  });

  describe('Metrics and Logging', () => {
    it('should collect comprehensive metrics', async () => {
      // Mock a complete successful run
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockResolvedValue([
        {
          id: 'hn-metrics',
          title: 'Metrics Test',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content',
          score: 300
        }
      ]);
      jest.spyOn(ArXivCollector.prototype, 'fetchEvents').mockResolvedValue([]);
      jest.spyOn(RSSCollector.prototype, 'fetchEvents').mockResolvedValue([]);
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue([
        {
          id: 'hn-metrics',
          title: 'Metrics Test',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content'
        }
      ]);
      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockResolvedValue([
        {
          id: 'hn-metrics',
          title: 'Metrics Test',
          description: 'Test for metrics collection',
          significance: 8.5,
          category: 'development',
          impact: { technical: 8.0, commercial: 7.5, social: 7.0 },
          keywords: ['metrics'],
          reasoning: 'Testing metrics functionality'
        }
      ]);
      jest.spyOn(TimelineReader.prototype, 'readTimeline').mockResolvedValue([]);
      jest.spyOn(GitHubManager.prototype, 'createBranch').mockResolvedValue('metrics-branch');
      jest.spyOn(GitHubManager.prototype, 'updateTimelineFile').mockResolvedValue();
      jest.spyOn(GitHubManager.prototype, 'createPullRequest').mockResolvedValue({
        number: 999,
        url: 'https://github.com/test/test/pull/999'
      });

      await orchestrator.runUpdate();

      const metrics = mockMetrics.getSummary();
      
      expect(metrics.totalEventsCollected).toBe(1);
      expect(metrics.totalEventsSelected).toBe(1);
      expect(metrics.success).toBe(true);
      expect(metrics.sources.length).toBeGreaterThan(0);
      expect(metrics.duration).toBeGreaterThan(0);
    });
  });

  describe('Configuration Scenarios', () => {
    it('should respect dry run mode', async () => {
      // Test with dry run enabled
      const dryRunConfig = {
        openaiApiKey: 'test-key',
        githubToken: 'test-token',
        timelineRepo: { owner: 'test', repo: 'test', full: 'test/test' },
        maxEventsPerWeek: 3,
        significanceThreshold: 7.0,
        newsSources: ['hackernews'],
        dryRun: true,
        apiKeys: {},
        logLevel: 'info' as const,
        nodeEnv: 'test' as const,
        isDevelopment: false,
        isProduction: false,
        isTest: true
      };

      const dryRunOrchestrator = new WeeklyUpdateOrchestrator(
        dryRunConfig,
        mockLogger,
        mockMetrics
      );

      // Mock data collection and analysis
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockResolvedValue([
        {
          id: 'dry-run-test',
          title: 'Dry Run Test',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content',
          score: 200
        }
      ]);
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue([
        {
          id: 'dry-run-test',
          title: 'Dry Run Test',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Test content'
        }
      ]);
      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockResolvedValue([
        {
          id: 'dry-run-test',
          title: 'Dry Run Test',
          description: 'Test in dry run mode',
          significance: 8.0,
          category: 'development',
          impact: { technical: 8.0, commercial: 7.0, social: 6.0 },
          keywords: ['dry-run'],
          reasoning: 'Testing dry run functionality'
        }
      ]);

      // GitHub operations should not be called in dry run
      const createBranchSpy = jest.spyOn(GitHubManager.prototype, 'createBranch');
      const updateFileSpy = jest.spyOn(GitHubManager.prototype, 'updateTimelineFile');
      const createPRSpy = jest.spyOn(GitHubManager.prototype, 'createPullRequest');

      const result = await dryRunOrchestrator.runUpdate();

      expect(result.success).toBe(true);
      expect(result.eventsCollected).toBe(1);
      expect(result.pullRequest).toBeUndefined();
      
      // Verify GitHub operations were not called
      expect(createBranchSpy).not.toHaveBeenCalled();
      expect(updateFileSpy).not.toHaveBeenCalled();
      expect(createPRSpy).not.toHaveBeenCalled();
    });

    it('should respect significance threshold', async () => {
      // Test with high significance threshold
      const highThresholdConfig = {
        openaiApiKey: 'test-key',
        githubToken: 'test-token',
        timelineRepo: { owner: 'test', repo: 'test', full: 'test/test' },
        maxEventsPerWeek: 5,
        significanceThreshold: 9.0, // Very high threshold
        newsSources: ['hackernews'],
        dryRun: true,
        apiKeys: {},
        logLevel: 'info' as const,
        nodeEnv: 'test' as const,
        isDevelopment: false,
        isProduction: false,
        isTest: true
      };

      const highThresholdOrchestrator = new WeeklyUpdateOrchestrator(
        highThresholdConfig,
        mockLogger,
        mockMetrics
      );

      // Mock events with low significance
      jest.spyOn(HackerNewsCollector.prototype, 'fetchEvents').mockResolvedValue([
        {
          id: 'low-significance',
          title: 'Minor Update',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Minor update content',
          score: 150
        }
      ]);
      jest.spyOn(DeduplicationService.prototype, 'deduplicate').mockReturnValue([
        {
          id: 'low-significance',
          title: 'Minor Update',
          url: 'https://test.com',
          source: 'HackerNews',
          sourceReliability: SourceReliability.HIGH,
          publishedAt: new Date(),
          content: 'Minor update content'
        }
      ]);
      jest.spyOn(EventAnalyzer.prototype, 'analyzeEvents').mockResolvedValue([
        {
          id: 'low-significance',
          title: 'Minor Update',
          description: 'A minor update with low significance',
          significance: 6.0, // Below threshold
          category: 'development',
          impact: { technical: 6.0, commercial: 5.0, social: 5.0 },
          keywords: ['minor'],
          reasoning: 'Small incremental update'
        }
      ]);

      const result = await highThresholdOrchestrator.runUpdate();

      expect(result.success).toBe(true);
      expect(result.eventsCollected).toBe(1);
      expect(result.eventsAnalyzed).toBe(1);
      expect(result.eventsSelected).toBe(0); // Should be filtered out by threshold
    });
  });
});
