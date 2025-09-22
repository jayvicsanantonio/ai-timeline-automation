/**
 * Metrics collection for monitoring and observability
 */

import { getLogger, type Logger } from './logger';

export interface EventMetrics {
  source: string;
  collected: number;
  filtered: number;
  errors: number;
  duration: number;
}

export interface ApiMetrics {
  service: string;
  calls: number;
  failures: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
}

export interface SelectionMetrics {
  analyzed: number;
  selected: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  threshold: number;
}

export interface ExecutionMetrics {
  startTime: string;
  endTime: string;
  duration: number;
  totalEventsCollected: number;
  totalEventsAfterDedup: number;
  totalEventsAnalyzed: number;
  totalEventsSelected: number;
  sources: EventMetrics[];
  apiCalls: ApiMetrics[];
  selection: SelectionMetrics;
  errors: Array<{
    timestamp: string;
    source: string;
    error: string;
  }>;
  success: boolean;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private logger: Logger;
  private startTime: Date;
  private eventMetrics: Map<string, EventMetrics>;
  private apiMetrics: Map<string, ApiMetrics>;
  private selectionMetrics: SelectionMetrics;
  private errors: Array<{ timestamp: string; source: string; error: string }>;
  private apiCallDetails: Map<string, number[]>;

  private constructor(logger?: Logger) {
    this.logger = logger || getLogger();
    this.startTime = new Date();
    this.eventMetrics = new Map();
    this.apiMetrics = new Map();
    this.apiCallDetails = new Map();
    this.errors = [];
    this.selectionMetrics = {
      analyzed: 0,
      selected: 0,
      averageScore: 0,
      maxScore: 0,
      minScore: 10,
      threshold: 7.0
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(logger?: Logger): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector(logger);
    }
    return MetricsCollector.instance;
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.startTime = new Date();
    this.eventMetrics.clear();
    this.apiMetrics.clear();
    this.apiCallDetails.clear();
    this.errors = [];
    this.selectionMetrics = {
      analyzed: 0,
      selected: 0,
      averageScore: 0,
      maxScore: 0,
      minScore: 10,
      threshold: 7.0
    };
  }

  /**
   * Track events collected from a source
   */
  trackEventCollection(
    source: string,
    collected: number,
    filtered: number,
    duration: number,
    error?: Error
  ): void {
    const existing = this.eventMetrics.get(source) || {
      source,
      collected: 0,
      filtered: 0,
      errors: 0,
      duration: 0
    };

    this.eventMetrics.set(source, {
      source,
      collected: existing.collected + collected,
      filtered: existing.filtered + filtered,
      errors: error ? existing.errors + 1 : existing.errors,
      duration: existing.duration + duration
    });

    if (error) {
      this.trackError(source, error);
    }

    this.logger.info(`Events collected from ${source}`, {
      collected,
      filtered,
      duration,
      error: error?.message
    });
  }

  /**
   * Track API call
   */
  trackApiCall(service: string, duration: number, success: boolean = true): void {
    const existing = this.apiMetrics.get(service) || {
      service,
      calls: 0,
      failures: 0,
      totalDuration: 0,
      averageDuration: 0,
      minDuration: Infinity,
      maxDuration: 0
    };

    // Track call details for accurate averages
    const details = this.apiCallDetails.get(service) || [];
    details.push(duration);
    this.apiCallDetails.set(service, details);

    const updated: ApiMetrics = {
      service,
      calls: existing.calls + 1,
      failures: success ? existing.failures : existing.failures + 1,
      totalDuration: existing.totalDuration + duration,
      averageDuration: 0, // Will calculate below
      minDuration: Math.min(existing.minDuration, duration),
      maxDuration: Math.max(existing.maxDuration, duration)
    };

    // Calculate average
    updated.averageDuration = updated.totalDuration / updated.calls;

    this.apiMetrics.set(service, updated);

    this.logger.debug(`API call tracked: ${service}`, {
      duration,
      success,
      totalCalls: updated.calls
    });
  }

  /**
   * Track event selection
   */
  trackSelection(analyzed: number, selected: number, scores: number[], threshold: number): void {
    const validScores = scores.filter((s) => s > 0);
    const sumScores = validScores.reduce((a, b) => a + b, 0);

    const avg = validScores.length > 0 ? sumScores / validScores.length : 0;
    this.selectionMetrics = {
      analyzed,
      selected,
      averageScore: Math.round(avg * 100) / 100, // round to 2 decimals for test stability
      maxScore: validScores.length > 0 ? Math.max(...validScores) : 0,
      minScore: validScores.length > 0 ? Math.min(...validScores) : 0,
      threshold
    };

    this.logger.info('Event selection completed', this.selectionMetrics);
  }

  /**
   * Track error
   */
  trackError(source: string, error: Error): void {
    this.errors.push({
      timestamp: new Date().toISOString(),
      source,
      error: error.message
    });

    this.logger.error(`Error in ${source}`, error);
  }

  /**
   * Get total events collected
   */
  getTotalEventsCollected(): number {
    let total = 0;
    this.eventMetrics.forEach((metrics) => {
      total += metrics.collected;
    });
    return total;
  }

  /**
   * Get total events after filtering
   */
  getTotalEventsFiltered(): number {
    let total = 0;
    this.eventMetrics.forEach((metrics) => {
      total += metrics.filtered;
    });
    return total;
  }

  /**
   * Get summary metrics
   */
  getSummary(): ExecutionMetrics {
    const endTime = new Date();
    const duration = (endTime.getTime() - this.startTime.getTime()) / 1000;

    const summary: ExecutionMetrics = {
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration,
      totalEventsCollected: this.getTotalEventsCollected(),
      totalEventsAfterDedup: this.getTotalEventsFiltered(),
      totalEventsAnalyzed: this.selectionMetrics.analyzed,
      totalEventsSelected: this.selectionMetrics.selected,
      sources: Array.from(this.eventMetrics.values()),
      apiCalls: Array.from(this.apiMetrics.values()),
      selection: this.selectionMetrics,
      errors: this.errors,
      success: this.errors.length === 0
    };

    return summary;
  }

  /**
   * Log summary
   */
  logSummary(): void {
    const summary = this.getSummary();

    this.logger.info('=== Execution Summary ===', {
      duration: summary.duration,
      totalEventsCollected: summary.totalEventsCollected,
      totalEventsSelected: summary.totalEventsSelected,
      success: summary.success
    });

    // Log source metrics
    summary.sources.forEach((source) => {
      this.logger.info(`Source: ${source.source}`, {
        collected: source.collected,
        filtered: source.filtered,
        errors: source.errors,
        duration: source.duration
      });
    });

    // Log API metrics
    summary.apiCalls.forEach((api) => {
      this.logger.info(`API: ${api.service}`, {
        calls: api.calls,
        failures: api.failures,
        averageDuration: Math.round(api.averageDuration),
        minDuration: Math.round(api.minDuration),
        maxDuration: Math.round(api.maxDuration)
      });
    });

    // Log selection metrics
    this.logger.info('Selection metrics', {
      analyzed: summary.selection.analyzed,
      selected: summary.selection.selected,
      averageScore: summary.selection.averageScore.toFixed(2),
      threshold: summary.selection.threshold
    });

    // Log errors if any
    if (summary.errors.length > 0) {
      this.logger.warn(`Execution completed with ${summary.errors.length} errors`);
      summary.errors.forEach((err) => {
        this.logger.error(`Error in ${err.source}: ${err.error}`);
      });
    } else {
      this.logger.info('Execution completed successfully');
    }
  }

  /**
   * Export metrics to JSON
   */
  exportToJson(): string {
    return JSON.stringify(this.getSummary(), null, 2);
  }

  /**
   * Save metrics to file
   */
  async saveToFile(filepath: string): Promise<void> {
    const fs = await import('node:fs').then((m) => m.promises);
    const summary = this.getSummary();
    await fs.writeFile(filepath, JSON.stringify(summary, null, 2));
    this.logger.info(`Metrics saved to ${filepath}`);
  }
}

// Export convenience functions
export function getMetricsCollector(logger?: Logger): MetricsCollector {
  return MetricsCollector.getInstance(logger);
}

export function trackEventCollection(
  source: string,
  collected: number,
  filtered: number,
  duration: number,
  error?: Error
): void {
  getMetricsCollector().trackEventCollection(source, collected, filtered, duration, error);
}

export function trackApiCall(service: string, duration: number, success: boolean = true): void {
  getMetricsCollector().trackApiCall(service, duration, success);
}

export function trackSelection(
  analyzed: number,
  selected: number,
  scores: number[],
  threshold: number
): void {
  getMetricsCollector().trackSelection(analyzed, selected, scores, threshold);
}

export function trackError(source: string, error: Error): void {
  getMetricsCollector().trackError(source, error);
}

export function getMetricsSummary(): ExecutionMetrics {
  return getMetricsCollector().getSummary();
}

export function logMetricsSummary(): void {
  getMetricsCollector().logSummary();
}
