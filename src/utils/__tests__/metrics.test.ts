/**
 * Unit tests for MetricsCollector
 */

import { MetricsCollector, getMetricsCollector } from '../metrics';
import { Logger, LogLevel } from '../logger';

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;
  let logEntries: any[];
  let mockLogger: Logger;

  beforeEach(() => {
    logEntries = [];
    mockLogger = new (Logger as any)(LogLevel.DEBUG, {}, (entry: any) => {
      logEntries.push(entry);
    });
    
    // Reset singleton
    (MetricsCollector as any).instance = undefined;
    metrics = MetricsCollector.getInstance(mockLogger);
    metrics.reset();
  });

  describe('Event Collection Tracking', () => {
    it('should track events from a single source', () => {
      metrics.trackEventCollection('HackerNews', 50, 45, 1200);
      
      const summary = metrics.getSummary();
      expect(summary.sources).toHaveLength(1);
      expect(summary.sources[0]).toMatchObject({
        source: 'HackerNews',
        collected: 50,
        filtered: 45,
        errors: 0,
        duration: 1200
      });
      expect(summary.totalEventsCollected).toBe(50);
      expect(summary.totalEventsAfterDedup).toBe(45);
    });

    it('should aggregate events from multiple calls to same source', () => {
      metrics.trackEventCollection('HackerNews', 30, 25, 800);
      metrics.trackEventCollection('HackerNews', 20, 18, 400);
      
      const summary = metrics.getSummary();
      expect(summary.sources).toHaveLength(1);
      expect(summary.sources[0]).toMatchObject({
        source: 'HackerNews',
        collected: 50,
        filtered: 43,
        duration: 1200
      });
    });

    it('should track events from multiple sources', () => {
      metrics.trackEventCollection('HackerNews', 30, 25, 800);
      metrics.trackEventCollection('ArXiv', 20, 15, 600);
      metrics.trackEventCollection('RSS', 15, 10, 400);
      
      const summary = metrics.getSummary();
      expect(summary.sources).toHaveLength(3);
      expect(summary.totalEventsCollected).toBe(65);
      expect(summary.totalEventsAfterDedup).toBe(50);
    });

    it('should track errors in event collection', () => {
      const error = new Error('API timeout');
      metrics.trackEventCollection('HackerNews', 0, 0, 5000, error);
      
      const summary = metrics.getSummary();
      expect(summary.sources[0].errors).toBe(1);
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]).toMatchObject({
        source: 'HackerNews',
        error: 'API timeout'
      });
      expect(summary.success).toBe(false);
    });
  });

  describe('API Call Tracking', () => {
    it('should track successful API calls', () => {
      metrics.trackApiCall('OpenAI', 250, true);
      metrics.trackApiCall('OpenAI', 300, true);
      metrics.trackApiCall('OpenAI', 200, true);
      
      const summary = metrics.getSummary();
      expect(summary.apiCalls).toHaveLength(1);
      expect(summary.apiCalls[0]).toMatchObject({
        service: 'OpenAI',
        calls: 3,
        failures: 0,
        totalDuration: 750,
        averageDuration: 250,
        minDuration: 200,
        maxDuration: 300
      });
    });

    it('should track failed API calls', () => {
      metrics.trackApiCall('GitHub', 500, false);
      metrics.trackApiCall('GitHub', 300, true);
      metrics.trackApiCall('GitHub', 400, false);
      
      const summary = metrics.getSummary();
      expect(summary.apiCalls[0]).toMatchObject({
        service: 'GitHub',
        calls: 3,
        failures: 2,
        totalDuration: 1200,
        averageDuration: 400
      });
    });

    it('should track multiple API services', () => {
      metrics.trackApiCall('OpenAI', 250, true);
      metrics.trackApiCall('GitHub', 150, true);
      metrics.trackApiCall('HackerNews', 100, true);
      
      const summary = metrics.getSummary();
      expect(summary.apiCalls).toHaveLength(3);
      expect(summary.apiCalls.map(a => a.service)).toEqual(['OpenAI', 'GitHub', 'HackerNews']);
    });
  });

  describe('Selection Tracking', () => {
    it('should track event selection metrics', () => {
      const scores = [8.5, 7.2, 9.1, 6.8, 7.5];
      metrics.trackSelection(10, 3, scores, 7.0);
      
      const summary = metrics.getSummary();
      expect(summary.selection).toMatchObject({
        analyzed: 10,
        selected: 3,
        averageScore: 7.82,
        maxScore: 9.1,
        minScore: 6.8,
        threshold: 7.0
      });
      expect(summary.totalEventsAnalyzed).toBe(10);
      expect(summary.totalEventsSelected).toBe(3);
    });

    it('should handle empty scores', () => {
      metrics.trackSelection(0, 0, [], 7.0);
      
      const summary = metrics.getSummary();
      expect(summary.selection).toMatchObject({
        analyzed: 0,
        selected: 0,
        averageScore: 0,
        maxScore: 0,
        minScore: 0,
        threshold: 7.0
      });
    });

    it('should filter out invalid scores', () => {
      const scores = [8.5, 0, -1, 7.2, 0];
      metrics.trackSelection(5, 2, scores, 7.0);
      
      const summary = metrics.getSummary();
      expect(summary.selection.averageScore).toBeCloseTo(7.85, 1);
    });
  });

  describe('Error Tracking', () => {
    it('should track multiple errors', () => {
      metrics.trackError('HackerNews', new Error('Rate limited'));
      metrics.trackError('OpenAI', new Error('Token limit exceeded'));
      metrics.trackError('GitHub', new Error('Authentication failed'));
      
      const summary = metrics.getSummary();
      expect(summary.errors).toHaveLength(3);
      expect(summary.success).toBe(false);
      expect(summary.errors.map(e => e.source)).toEqual(['HackerNews', 'OpenAI', 'GitHub']);
    });

    it('should include timestamps in errors', () => {
      const beforeTime = new Date().toISOString();
      metrics.trackError('TestSource', new Error('Test error'));
      const afterTime = new Date().toISOString();
      
      const summary = metrics.getSummary();
      expect(summary.errors[0].timestamp).toBeDefined();
      expect(new Date(summary.errors[0].timestamp).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
      expect(new Date(summary.errors[0].timestamp).getTime()).toBeLessThanOrEqual(new Date(afterTime).getTime());
    });
  });

  describe('Summary Generation', () => {
    it('should generate complete summary', () => {
      // Track various metrics
      metrics.trackEventCollection('HackerNews', 50, 45, 1200);
      metrics.trackEventCollection('ArXiv', 30, 25, 800);
      metrics.trackApiCall('OpenAI', 250, true);
      metrics.trackApiCall('GitHub', 150, true);
      metrics.trackSelection(70, 5, [8.5, 7.2, 9.1, 7.8, 8.0], 7.0);
      
      const summary = metrics.getSummary();
      
      expect(summary).toMatchObject({
        totalEventsCollected: 80,
        totalEventsAfterDedup: 70,
        totalEventsAnalyzed: 70,
        totalEventsSelected: 5,
        success: true
      });
      expect(summary.sources).toHaveLength(2);
      expect(summary.apiCalls).toHaveLength(2);
      expect(summary.startTime).toBeDefined();
      expect(summary.endTime).toBeDefined();
      expect(summary.duration).toBeGreaterThan(0);
    });

    it('should calculate duration correctly', (done) => {
      setTimeout(() => {
        const summary = metrics.getSummary();
        expect(summary.duration).toBeGreaterThan(0.09); // At least 90ms
        expect(summary.duration).toBeLessThan(0.2); // Less than 200ms
        done();
      }, 100);
    });
  });

  describe('Logging', () => {
    it('should log summary', () => {
      metrics.trackEventCollection('HackerNews', 50, 45, 1200);
      metrics.trackSelection(45, 3, [8.5, 7.2, 9.1], 7.0);
      
      metrics.logSummary();
      
      const infoLogs = logEntries.filter(e => e.level === 'INFO');
      expect(infoLogs.some(e => e.message.includes('Execution Summary'))).toBe(true);
      expect(infoLogs.some(e => e.message.includes('Source: HackerNews'))).toBe(true);
      expect(infoLogs.some(e => e.message.includes('Selection metrics'))).toBe(true);
      expect(infoLogs.some(e => e.message.includes('Execution completed successfully'))).toBe(true);
    });

    it('should log errors in summary', () => {
      metrics.trackError('TestSource', new Error('Test error'));
      
      metrics.logSummary();
      
      const warnLogs = logEntries.filter(e => e.level === 'WARN');
      const errorLogs = logEntries.filter(e => e.level === 'ERROR');
      
      expect(warnLogs.some(e => e.message.includes('Execution completed with 1 errors'))).toBe(true);
      expect(errorLogs.some(e => e.message.includes('Error in TestSource'))).toBe(true);
    });
  });

  describe('Export', () => {
    it('should export to JSON', () => {
      metrics.trackEventCollection('HackerNews', 50, 45, 1200);
      metrics.trackApiCall('OpenAI', 250, true);
      
      const json = metrics.exportToJson();
      const parsed = JSON.parse(json);
      
      expect(parsed.totalEventsCollected).toBe(50);
      expect(parsed.sources).toHaveLength(1);
      expect(parsed.apiCalls).toHaveLength(1);
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      metrics.trackEventCollection('HackerNews', 50, 45, 1200);
      metrics.trackApiCall('OpenAI', 250, true);
      metrics.trackError('TestSource', new Error('Test error'));
      
      metrics.reset();
      
      const summary = metrics.getSummary();
      expect(summary.totalEventsCollected).toBe(0);
      expect(summary.sources).toHaveLength(0);
      expect(summary.apiCalls).toHaveLength(0);
      expect(summary.errors).toHaveLength(0);
      expect(summary.success).toBe(true);
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const metrics1 = getMetricsCollector();
      const metrics2 = getMetricsCollector();
      
      expect(metrics1).toBe(metrics2);
    });
  });
});
