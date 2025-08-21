/**
 * News source type definitions and interfaces
 * Defines the contract for all news collectors
 */

import { z } from 'zod';
import { RawEvent } from './events';

// ============================================================================
// SOURCE TYPES AND ENUMS
// ============================================================================

/**
 * Types of news sources supported
 */
export type NewsSourceType = 'api' | 'rss' | 'scraper';

/**
 * Source reliability weights for ranking
 */
export enum SourceReliability {
  /** Official company blogs and announcements */
  OFFICIAL = 1.0,
  /** Academic papers and research institutions */
  ACADEMIC = 0.9,
  /** Established tech journalism outlets */
  JOURNALISM = 0.7,
  /** Community-driven sources (HackerNews, Reddit, etc.) */
  COMMUNITY = 0.6,
}

/**
 * Supported news sources
 */
export enum NewsSourceName {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE_AI = 'googleai',
  ARXIV = 'arxiv',
  HACKERNEWS = 'hackernews',
  THE_VERGE = 'verge',
  MIT_TECH = 'mittech',
}

// ============================================================================
// CONFIGURATION SCHEMAS
// ============================================================================

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  requests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Configuration for a news source
 */
export interface NewsSourceConfig {
  /** Whether this source is enabled */
  enabled: boolean;
  /** API key if required */
  apiKey?: string;
  /** Base URL for the source */
  baseUrl: string;
  /** Rate limiting configuration */
  rateLimit: RateLimitConfig;
  /** Source reliability weight */
  reliability: SourceReliability;
}

/**
 * Zod schema for NewsSourceConfig validation
 */
export const NewsSourceConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url(),
  rateLimit: z.object({
    requests: z.number().positive(),
    windowMs: z.number().positive(),
  }),
  reliability: z.nativeEnum(SourceReliability),
});

// ============================================================================
// NEWS SOURCE INTERFACE
// ============================================================================

/**
 * Options for fetching events
 */
export interface FetchOptions {
  /** Start date for filtering (inclusive) */
  startDate: Date;
  /** End date for filtering (inclusive) */
  endDate: Date;
  /** Maximum number of events to fetch */
  maxEvents?: number;
}

/**
 * Abstract base class for all news sources
 */
export abstract class NewsSource {
  /** Unique name identifier for this source */
  abstract readonly name: NewsSourceName | string;
  
  /** Type of news source */
  abstract readonly type: NewsSourceType;
  
  /** Priority for processing (higher = processed first) */
  abstract readonly priority: number;
  
  /** Configuration for this source */
  protected config: NewsSourceConfig;
  
  /** Rate limit tracking */
  private requestTimes: number[] = [];
  
  constructor(config: NewsSourceConfig) {
    this.config = config;
  }
  
  /**
   * Fetch events from this news source
   * Must be implemented by each concrete source
   */
  abstract fetchEvents(options?: FetchOptions): Promise<RawEvent[]>;
  
  /**
   * Check if this source is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  /**
   * Get the reliability weight for this source
   */
  getReliability(): number {
    return this.config.reliability;
  }
  
  /**
   * Check if we can make a request (rate limiting)
   */
  protected canMakeRequest(): boolean {
    const now = Date.now();
    const { requests, windowMs } = this.config.rateLimit;
    
    // Remove old request times outside the window
    this.requestTimes = this.requestTimes.filter(
      time => now - time < windowMs
    );
    
    // Check if we're under the limit
    return this.requestTimes.length < requests;
  }
  
  /**
   * Record a request for rate limiting
   */
  protected recordRequest(): void {
    this.requestTimes.push(Date.now());
  }
  
  /**
   * Wait until we can make a request
   */
  protected async waitForRateLimit(): Promise<void> {
    while (!this.canMakeRequest()) {
      // Wait for 100ms and check again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  /**
   * Filter events by date range
   */
  protected filterByDateRange(
    events: RawEvent[],
    startDate: Date,
    endDate: Date
  ): RawEvent[] {
    return events.filter(event => {
      const eventDate = event.date.getTime();
      return eventDate >= startDate.getTime() && eventDate <= endDate.getTime();
    });
  }
}

// ============================================================================
// SOURCE COLLECTION INTERFACE
// ============================================================================

/**
 * Interface for managing multiple news sources
 */
export interface NewsSourceCollection {
  /** Add a news source to the collection */
  addSource(source: NewsSource): void;
  
  /** Remove a news source by name */
  removeSource(name: string): void;
  
  /** Get all enabled sources */
  getEnabledSources(): NewsSource[];
  
  /** Get a source by name */
  getSource(name: string): NewsSource | undefined;
  
  /** Fetch events from all enabled sources */
  fetchAllEvents(options?: FetchOptions): Promise<RawEvent[]>;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Default rate limit configuration (conservative)
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requests: 10,
  windowMs: 60000, // 1 minute
};

/**
 * Default configurations for known sources
 */
export const DEFAULT_SOURCE_CONFIGS: Record<NewsSourceName, Partial<NewsSourceConfig>> = {
  [NewsSourceName.OPENAI]: {
    baseUrl: 'https://openai.com/blog',
    reliability: SourceReliability.OFFICIAL,
    rateLimit: DEFAULT_RATE_LIMIT,
  },
  [NewsSourceName.ANTHROPIC]: {
    baseUrl: 'https://www.anthropic.com/news',
    reliability: SourceReliability.OFFICIAL,
    rateLimit: DEFAULT_RATE_LIMIT,
  },
  [NewsSourceName.GOOGLE_AI]: {
    baseUrl: 'https://blog.google/technology/ai/',
    reliability: SourceReliability.OFFICIAL,
    rateLimit: DEFAULT_RATE_LIMIT,
  },
  [NewsSourceName.ARXIV]: {
    baseUrl: 'http://export.arxiv.org/api/query',
    reliability: SourceReliability.ACADEMIC,
    rateLimit: {
      requests: 5,
      windowMs: 5000, // ArXiv has strict rate limits
    },
  },
  [NewsSourceName.HACKERNEWS]: {
    baseUrl: 'https://hacker-news.firebaseio.com/v0',
    reliability: SourceReliability.COMMUNITY,
    rateLimit: {
      requests: 30,
      windowMs: 60000,
    },
  },
  [NewsSourceName.THE_VERGE]: {
    baseUrl: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    reliability: SourceReliability.JOURNALISM,
    rateLimit: DEFAULT_RATE_LIMIT,
  },
  [NewsSourceName.MIT_TECH]: {
    baseUrl: 'https://www.technologyreview.com/feed/',
    reliability: SourceReliability.JOURNALISM,
    rateLimit: DEFAULT_RATE_LIMIT,
  },
};
