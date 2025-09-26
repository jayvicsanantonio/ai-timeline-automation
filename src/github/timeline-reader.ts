/**
 * TimelineReader - Fetches and parses timeline events from GitHub repository
 */

import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { generateEventId, type TimelineEntry, TimelineEntrySchema } from '../types';

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

const TimelineJsonEventSchema = z
  .object({
    year: z.number().int(),
    month: z.union([z.string(), z.number().int().min(1).max(12)]),
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    link: z.string().url()
  })
  .passthrough();

type TimelineJsonEvent = z.infer<typeof TimelineJsonEventSchema>;
type TimelineCategory = TimelineEntry['category'];

const DEFAULT_CATEGORY: TimelineCategory = 'Research Breakthroughs';

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

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

      // Parse and normalize JSON
      const parsedData = JSON.parse(content);
      const events = this.parseTimelineData(parsedData);

      console.log(`Successfully fetched ${events.length} existing events`);

      return {
        events,
        sha: response.data.sha,
        content
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        console.log('Timeline file not found, assuming empty timeline');
        return {
          events: [],
          sha: '',
          content: '[]'
        };
      }

      console.error('Error fetching timeline:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch timeline: ${errorMessage}`);
    }
  }

  /**
   * Parse timeline data in array format
   */
  private parseTimelineData(data: unknown): TimelineEntry[] {
    const timelineArray = z.array(TimelineJsonEventSchema).safeParse(data);
    if (!timelineArray.success) {
      console.error('Timeline validation error:', timelineArray.error);
      throw new Error(
        'Invalid timeline data structure. Expected an array of timeline entries like the provided sample.'
      );
    }

    const entries = timelineArray.data
      .map((entry, index) => this.normalizeTimelineEvent(entry, index))
      .filter((entry): entry is TimelineEntry => entry !== null);

    return entries;
  }

  private normalizeTimelineEvent(entry: TimelineJsonEvent, index: number): TimelineEntry | null {
    const title = entry.title.trim();
    if (!title) {
      console.warn(`Timeline entry at index ${index} is missing a title. Skipping.`);
      return null;
    }

    const eventDate = this.resolveTimelineDate(entry);
    if (!eventDate) {
      console.warn(`Timeline entry "${title}" is missing a valid date. Skipping.`);
      return null;
    }

    const sources = this.normalizeSources(entry);
    if (sources.length === 0) {
      console.warn(`Timeline entry "${title}" does not contain any valid source URLs. Skipping.`);
      return null;
    }

    const candidate: TimelineEntry = {
      id: generateEventId(eventDate, title),
      date: eventDate.toISOString(),
      title,
      description: (entry.description ?? title).trim(),
      category: this.mapCategory(entry.category),
      sources,
      impact_score: 5
    };

    try {
      return TimelineEntrySchema.parse(candidate);
    } catch (error) {
      console.warn(
        `Timeline entry "${title}" failed validation after normalization. Skipping entry.`,
        error
      );
      return null;
    }
  }

  private resolveTimelineDate(entry: TimelineJsonEvent): Date | null {
    const year = entry.year;
    let monthIndex = 0;

    if (typeof entry.month === 'number') {
      monthIndex = Math.min(11, Math.max(0, entry.month - 1));
    } else {
      const normalized = entry.month.trim().toLowerCase();
      if (normalized in MONTHS) {
        monthIndex = MONTHS[normalized];
      } else {
        console.warn(`Unknown month "${entry.month}"; defaulting to January.`);
        monthIndex = 0;
      }
    }

    return new Date(Date.UTC(year, monthIndex, 1));
  }

  private mapCategory(category?: string): TimelineCategory {
    if (!category) {
      return DEFAULT_CATEGORY;
    }

    const normalized = category.trim().toLowerCase();

    switch (normalized) {
      case 'models & architectures':
      case 'models':
      case 'architectures':
      case 'ai models':
        return 'Models & Architectures';
      case 'research breakthroughs':
      case 'research':
      case 'fundamental research':
      case 'academic research':
      case 'breakthroughs':
        return 'Research Breakthroughs';
      case 'public releases':
      case 'product':
      case 'products':
      case 'product releases':
      case 'commercial releases':
      case 'industry adoption':
        return 'Public Releases';
      case 'ethics & policy':
      case 'policy':
      case 'regulation':
      case 'policy & regulation':
      case 'regulation & policy':
      case 'ethics':
        return 'Ethics & Policy';
      case 'hardware advances':
      case 'hardware':
      case 'infrastructure':
      case 'compute':
        return 'Hardware Advances';
      default:
        console.warn(`Unknown category "${category}". Defaulting to ${DEFAULT_CATEGORY}.`);
        return DEFAULT_CATEGORY;
    }
  }

  private normalizeSources(entry: TimelineJsonEvent): string[] {
    const sources = new Set<string>();

    const addSource = (value?: string) => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!this.isValidUrl(trimmed)) return;
      sources.add(trimmed);
    };

    addSource(entry.link);

    // Allow optional extra links
    if (Array.isArray((entry as any).sources)) {
      (entry as any).sources.forEach((value: string) => {
        addSource(value);
      });
    }

    return Array.from(sources);
  }

  private isValidUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return Boolean(url.protocol && url.hostname);
    } catch {
      return false;
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
    const existingKeys = new Set(existingEvents.map((e) => this.getDuplicateKey(e)));

    return newEvents.filter((event) => {
      if (existingIds.has(event.id)) {
        return false;
      }

      const duplicateKey = this.getDuplicateKey(event);
      if (existingKeys.has(duplicateKey)) {
        console.warn(
          `Skipping duplicate event "${event.title}" with existing key ${duplicateKey}`
        );
        return false;
      }

      existingKeys.add(duplicateKey);
      return true;
    });
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
    const existingKeys = new Set(existingEvents.map((e) => this.getDuplicateKey(e)));
    const newKeys = new Set<string>();

    newEvents.forEach((event) => {
      // Check for ID conflicts
      if (existingIds.has(event.id)) {
        result.conflicts.push(`Event ID already exists: ${event.id}`);
        result.valid = false;
      }

      const duplicateKey = this.getDuplicateKey(event);
      if (existingKeys.has(duplicateKey)) {
        result.conflicts.push(
          `Event duplicates existing timeline entry: "${event.title}" (${duplicateKey})`
        );
        result.valid = false;
      }

      if (newKeys.has(duplicateKey)) {
        result.conflicts.push(
          `Duplicate event in submission: "${event.title}" (${duplicateKey})`
        );
        result.valid = false;
      }

      newKeys.add(duplicateKey);

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

  private getDuplicateKey(event: TimelineEntry): string {
    const date = new Date(event.date);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const normalizedTitle = event.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${year}-${String(month).padStart(2, '0')}-${normalizedTitle}`;
  }
}
