/**
 * Deduplication service for identifying and merging duplicate events from different sources
 * Uses multiple strategies including title similarity, URL matching, and content hashing
 */

import * as crypto from 'node:crypto';
import type { RawEvent } from '../types';

/**
 * Configuration for deduplication
 */
export interface DeduplicationConfig {
  /** Minimum similarity score to consider events as duplicates (0-1) */
  similarityThreshold?: number;
  /** Whether to use fuzzy matching for titles */
  useFuzzyMatching?: boolean;
  /** Time window in milliseconds for considering events as potential duplicates */
  timeWindowMs?: number;
}

/**
 * Represents a group of duplicate events
 */
export interface DuplicateGroup {
  /** Primary event (usually from highest reliability source) */
  primary: RawEvent;
  /** All duplicate events including the primary */
  duplicates: RawEvent[];
  /** Similarity scores between events */
  similarityScores: Map<string, number>;
}

/**
 * Deduplication service
 */
export class DeduplicationService {
  private readonly similarityThreshold: number;
  private readonly useFuzzyMatching: boolean;
  private readonly timeWindowMs: number;

  constructor(config?: DeduplicationConfig) {
    this.similarityThreshold = config?.similarityThreshold ?? 0.6;
    this.useFuzzyMatching = config?.useFuzzyMatching ?? true;
    this.timeWindowMs = config?.timeWindowMs ?? 48 * 60 * 60 * 1000; // 48 hours
  }

  /**
   * Deduplicate a list of events
   * @returns Unique events with merged information from duplicates
   */
  public deduplicate(events: RawEvent[]): RawEvent[] {
    if (events.length === 0) {
      return [];
    }

    // Group events by potential duplicates
    const groups = this.findDuplicateGroups(events);

    // Merge each group into a single event
    const deduplicatedEvents = groups.map((group) => this.mergeEventGroup(group));

    return deduplicatedEvents;
  }

  /**
   * Find groups of duplicate events
   */
  private findDuplicateGroups(events: RawEvent[]): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < events.length; i++) {
      if (processed.has(i)) {
        continue;
      }

      const group: DuplicateGroup = {
        primary: events[i],
        duplicates: [events[i]],
        similarityScores: new Map()
      };

      processed.add(i);

      // Find all duplicates of this event
      for (let j = i + 1; j < events.length; j++) {
        if (processed.has(j)) {
          continue;
        }

        const similarity = this.calculateSimilarity(events[i], events[j]);

        if (similarity >= this.similarityThreshold) {
          group.duplicates.push(events[j]);
          group.similarityScores.set(this.getEventKey(events[j]), similarity);
          processed.add(j);

          // Update primary if this event is from a more reliable source
          if (this.isMoreReliable(events[j], group.primary)) {
            group.primary = events[j];
          }
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Calculate similarity between two events
   */
  private calculateSimilarity(event1: RawEvent, event2: RawEvent): number {
    const scores: number[] = [];

    // URL similarity (exact match)
    if (event1.url === event2.url) {
      return 1.0; // Exact URL match means same event
    }

    // Check if events are within time window
    const timeDiff = Math.abs(event1.date.getTime() - event2.date.getTime());
    if (timeDiff > this.timeWindowMs) {
      return 0; // Too far apart in time
    }

    // Title similarity
    const titleSimilarity = this.calculateTextSimilarity(event1.title, event2.title);
    scores.push(titleSimilarity * 0.5); // Title is most important

    // Content similarity (if available)
    if (event1.content && event2.content) {
      const contentSimilarity = this.calculateTextSimilarity(
        event1.content.substring(0, 500), // Compare first 500 chars
        event2.content.substring(0, 500)
      );
      scores.push(contentSimilarity * 0.3);
    }

    // Domain similarity
    const domain1 = this.extractDomain(event1.url);
    const domain2 = this.extractDomain(event2.url);
    if (domain1 === domain2) {
      scores.push(0.1); // Small boost for same domain
    }

    // Time proximity (closer events get higher score)
    const timeProximityScore = 1 - timeDiff / this.timeWindowMs;
    scores.push(timeProximityScore * 0.1);

    // Calculate weighted average
    return scores.reduce((a, b) => a + b, 0);
  }

  /**
   * Calculate text similarity using various methods
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const normalized1 = this.normalizeText(text1);
    const normalized2 = this.normalizeText(text2);

    // Exact match after normalization
    if (normalized1 === normalized2) {
      return 1.0;
    }

    // Use multiple similarity metrics
    const scores: number[] = [];

    // Jaccard similarity on word sets
    const jaccardScore = this.jaccardSimilarity(normalized1, normalized2);
    scores.push(jaccardScore);

    // Check for containment (one title contains the other)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      scores.push(0.9);
    }

    // Check for same key terms (for titles like "GPT-5 Released" vs "OpenAI Releases GPT-5")
    const keyTermsScore = this.keyTermsSimilarity(normalized1, normalized2);
    if (keyTermsScore > 0.5) {
      scores.push(keyTermsScore);
    }

    // Levenshtein distance for fuzzy matching
    if (this.useFuzzyMatching) {
      const levenshteinScore = this.levenshteinSimilarity(normalized1, normalized2);
      scores.push(levenshteinScore);
    }

    // Return the maximum score
    return Math.max(...scores);
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Calculate Jaccard similarity between two texts
   */
  private jaccardSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(' ').filter((w) => w.length > 2));
    const words2 = new Set(text2.split(' ').filter((w) => w.length > 2));

    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate similarity based on key terms (important words)
   */
  private keyTermsSimilarity(text1: string, text2: string): number {
    // Extract important words (longer words, numbers, uppercase acronyms)
    const extractKeyTerms = (text: string): Set<string> => {
      const words = text.split(' ');
      const keyTerms = new Set<string>();

      for (const word of words) {
        // Keep numbers, long words, and potential acronyms
        if (word.length > 4 || /\d/.test(word) || /^[A-Z]{2,}$/.test(word.toUpperCase())) {
          keyTerms.add(word.toLowerCase());
        }
      }

      return keyTerms;
    };

    const terms1 = extractKeyTerms(text1);
    const terms2 = extractKeyTerms(text2);

    if (terms1.size === 0 || terms2.size === 0) {
      return 0;
    }

    const intersection = new Set([...terms1].filter((x) => terms2.has(x)));
    const smaller = Math.min(terms1.size, terms2.size);

    // Use smaller set size for better detection of subset relationships
    return intersection.size / smaller;
  }

  /**
   * Calculate Levenshtein-based similarity
   */
  private levenshteinSimilarity(text1: string, text2: string): number {
    const distance = this.levenshteinDistance(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);

    if (maxLength === 0) {
      return 1;
    }

    return 1 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  /**
   * Check if event1 is from a more reliable source than event2
   */
  private isMoreReliable(event1: RawEvent, event2: RawEvent): boolean {
    // Priority order for sources
    const sourcePriority: Record<string, number> = {
      'OpenAI Blog': 10,
      Anthropic: 9,
      'Google AI': 9,
      ArXiv: 8,
      'MIT Technology Review': 7,
      'The Verge': 6,
      VentureBeat: 6,
      TechCrunch: 5,
      HackerNews: 4
    };

    const priority1 = sourcePriority[event1.source] ?? 0;
    const priority2 = sourcePriority[event2.source] ?? 0;

    return priority1 > priority2;
  }

  /**
   * Merge a group of duplicate events into a single event
   */
  private mergeEventGroup(group: DuplicateGroup): RawEvent {
    const { primary, duplicates } = group;

    // Start with the primary event
    const merged: RawEvent = { ...primary };

    // Collect all unique sources
    const sources = new Set<string>();
    const urls = new Set<string>();

    for (const event of duplicates) {
      sources.add(event.source);
      urls.add(event.url);

      // Use longer content if available
      if (event.content && event.content.length > (merged.content?.length ?? 0)) {
        merged.content = event.content;
      }

      // Merge metadata
      if (event.metadata) {
        merged.metadata = {
          ...merged.metadata,
          ...event.metadata,
          merged_from: Array.from(sources),
          all_urls: Array.from(urls)
        };
      }
    }

    // Add deduplication metadata
    merged.metadata = {
      ...merged.metadata,
      is_deduplicated: duplicates.length > 1,
      duplicate_count: duplicates.length,
      sources: Array.from(sources),
      urls: Array.from(urls)
    };

    return merged;
  }

  /**
   * Generate a unique key for an event
   */
  private getEventKey(event: RawEvent): string {
    return crypto
      .createHash('md5')
      .update(`${event.title}-${event.url}-${event.date.toISOString()}`)
      .digest('hex');
  }

  /**
   * Get statistics about deduplication
   */
  public getDeduplicationStats(
    originalEvents: RawEvent[],
    deduplicatedEvents: RawEvent[]
  ): {
    originalCount: number;
    deduplicatedCount: number;
    duplicatesRemoved: number;
    deduplicationRate: number;
  } {
    const originalCount = originalEvents.length;
    const deduplicatedCount = deduplicatedEvents.length;
    const duplicatesRemoved = originalCount - deduplicatedCount;
    const deduplicationRate = originalCount > 0 ? duplicatesRemoved / originalCount : 0;

    return {
      originalCount,
      deduplicatedCount,
      duplicatesRemoved,
      deduplicationRate
    };
  }
}
