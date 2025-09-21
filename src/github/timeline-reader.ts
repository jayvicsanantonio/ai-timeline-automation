/**
 * TimelineReader - Fetches and parses timeline events from GitHub repository
 */

import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { type TimelineEntry, TimelineEntrySchema } from '../types';

/**
 * Configuration for TimelineReader
 */
export interface TimelineReaderConfig {
  /** GitHub repository owner */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Path to timeline-events.json file */
  filePath?: string;
  /** Branch to read from */
  branch?: string;
  /** GitHub token for authentication */
  token?: string;
}

/**
 * Result from fetching timeline
 */
export interface TimelineData {
  /** Current timeline entries */
  events: TimelineEntry[];
  /** SHA of the current file */
  sha: string;
  /** Content of the file */
  content: string;
}

/**
 * Schema for timeline JSON file
 */
const TimelineFileSchema = z.object({
  lastUpdated: z.string(),
  totalEntries: z.number(),
  entries: z.array(TimelineEntrySchema)
});

type TimelineFile = z.infer<typeof TimelineFileSchema>;

/**
 * Reads timeline events from a GitHub repository
 */
export class TimelineReader {
  private octokit: Octokit;
  private config: Required<TimelineReaderConfig>;

  constructor(config: TimelineReaderConfig) {
    this.config = {
      owner: config.owner,
      repo: config.repo,
      filePath: config.filePath || 'data/timeline-events.json',
      branch: config.branch || 'main',
      token: config.token || process.env.GIT_TOKEN || ''
    };

    this.octokit = new Octokit({
      auth: this.config.token
    });
  }

  /**
   * Fetch the current timeline from the repository
   */
  async fetchTimeline(): Promise<TimelineData> {
    try {
      console.log(
        `Fetching timeline from ${this.config.owner}/${this.config.repo}/${this.config.filePath}`
      );

      // Get file content from GitHub
      const response = await this.octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.filePath,
        ref: this.config.branch
      });

      // Ensure we got a file response
      if (Array.isArray(response.data)) {
        throw new Error(`Expected a file but got a directory at ${this.config.filePath}`);
      }

      if (response.data.type !== 'file') {
        throw new Error(`Expected a file but got ${response.data.type} at ${this.config.filePath}`);
      }

      // Decode content from base64
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

      // Parse and validate JSON
      const parsedData = JSON.parse(content);
      const validatedData = this.validateTimelineData(parsedData);

      console.log(`Successfully fetched ${validatedData.entries.length} existing events`);

      return {
        events: validatedData.entries as TimelineEntry[],
        sha: response.data.sha,
        content
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        console.log('Timeline file not found, assuming empty timeline');
        return {
          events: [],
          sha: '',
          content: JSON.stringify(
            {
              lastUpdated: new Date().toISOString(),
              totalEntries: 0,
              entries: []
            },
            null,
            2
          )
        };
      }

      console.error('Error fetching timeline:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch timeline: ${errorMessage}`);
    }
  }

  /**
   * Validate the timeline data structure
   */
  private validateTimelineData(data: unknown): TimelineFile {
    try {
      return TimelineFileSchema.parse(data);
    } catch (error) {
      console.error('Timeline validation error:', error);
      throw new Error('Invalid timeline data structure');
    }
  }

  /**
   * Check if an event already exists in the timeline
   */
  eventExists(eventId: string, events: TimelineEntry[]): boolean {
    return events.some((event) => event.id === eventId);
  }

  /**
   * Filter out events that already exist in the timeline
   */
  filterNewEvents(newEvents: TimelineEntry[], existingEvents: TimelineEntry[]): TimelineEntry[] {
    const existingIds = new Set(existingEvents.map((e) => e.id));
    return newEvents.filter((event) => !existingIds.has(event.id));
  }

  /**
   * Get events from a specific date range
   */
  getEventsInRange(events: TimelineEntry[], startDate: Date, endDate: Date): TimelineEntry[] {
    return events.filter((event) => {
      const eventDate = new Date(event.date);
      return eventDate >= startDate && eventDate <= endDate;
    });
  }

  // Backward-compatible alias expected by older tests
  async readTimeline(): Promise<TimelineEntry[]> {
    const data = await this.fetchTimeline();
    return data.events;
  }

  /**
   * Get the most recent events
   */
  getRecentEvents(events: TimelineEntry[], count: number = 10): TimelineEntry[] {
    return [...events]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, count);
  }

  /**
   * Get events by category
   */
  getEventsByCategory(events: TimelineEntry[], category: string): TimelineEntry[] {
    return events.filter((event) => event.category === category);
  }

  /**
   * Calculate statistics about the timeline
   */
  getTimelineStats(events: TimelineEntry[]): {
    totalEvents: number;
    byCategory: Record<string, number>;
    averageImpactScore: number;
    dateRange: { earliest: string | null; latest: string | null };
  } {
    const stats = {
      totalEvents: events.length,
      byCategory: {} as Record<string, number>,
      averageImpactScore: 0,
      dateRange: {
        earliest: null as string | null,
        latest: null as string | null
      }
    };

    if (events.length === 0) {
      return stats;
    }

    // Count by category and sum impact scores
    let totalImpact = 0;
    events.forEach((event) => {
      stats.byCategory[event.category] = (stats.byCategory[event.category] || 0) + 1;
      totalImpact += event.impact_score;
    });

    stats.averageImpactScore = Math.round((totalImpact / events.length) * 10) / 10;

    // Find date range
    const sortedByDate = [...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    stats.dateRange.earliest = sortedByDate[0].date;
    stats.dateRange.latest = sortedByDate[sortedByDate.length - 1].date;

    return stats;
  }

  /**
   * Validate that new events can be added without conflicts
   */
  validateNewEvents(
    newEvents: TimelineEntry[],
    existingEvents: TimelineEntry[]
  ): {
    valid: boolean;
    conflicts: string[];
    warnings: string[];
  } {
    const result = {
      valid: true,
      conflicts: [] as string[],
      warnings: [] as string[]
    };

    const existingIds = new Set(existingEvents.map((e) => e.id));

    newEvents.forEach((event) => {
      // Check for ID conflicts
      if (existingIds.has(event.id)) {
        result.conflicts.push(`Event ID already exists: ${event.id}`);
        result.valid = false;
      }

      // Check for very similar events on the same date
      const sameDateEvents = existingEvents.filter(
        (e) => e.date === event.date && e.category === event.category
      );

      if (sameDateEvents.length > 0) {
        const similarEvent = sameDateEvents.find(
          (e) => this.calculateSimilarity(e.title, event.title) > 0.8
        );

        if (similarEvent) {
          result.warnings.push(
            `Potential duplicate: "${event.title}" is similar to existing "${similarEvent.title}"`
          );
        }
      }

      // Validate date is not in the future
      if (new Date(event.date) > new Date()) {
        result.warnings.push(`Event "${event.title}" has a future date: ${event.date}`);
      }
    });

    return result;
  }

  /**
   * Simple similarity calculation for titles
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1;

    // Simple word overlap calculation
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));

    // Convert sets to arrays for ES5 compatibility
    const words1Array = Array.from(words1);
    const words2Array = Array.from(words2);

    const intersection = new Set(words1Array.filter((x) => words2.has(x)));
    const union = new Set(words1Array.concat(words2Array));

    return intersection.size / union.size;
  }
}
