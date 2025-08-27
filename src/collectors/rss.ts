/**
 * Generic RSS feed collector for tech blogs and news sites
 * Supports multiple RSS feeds with AI content filtering
 */

import Parser from 'rss-parser';
import {
  NewsSource,
  NewsSourceType,
  NewsSourceConfig,
  FetchOptions,
  RawEvent,
  SourceReliability,
} from '../types';

/**
 * RSS feed item structure
 */
interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  creator?: string;
  [key: string]: any;
}

/**
 * Configuration for RSS collector
 */
export interface RSSCollectorConfig extends NewsSourceConfig {
  feedUrl: string;
  sourceName: string;
  aiKeywords?: string[];
  requireAIContent?: boolean;
}

/**
 * Generic RSS collector implementation
 */
export class RSSCollector extends NewsSource {
  readonly name: string;
  readonly type: NewsSourceType = 'rss';
  readonly priority: number;
  
  private readonly parser: Parser;
  private readonly feedUrl: string;
  private readonly sourceName: string;
  private readonly aiKeywords: string[];
  private readonly requireAIContent: boolean;
  
  constructor(
    name: string,
    config: RSSCollectorConfig,
    priority: number = 5
  ) {
    super(config);
    
    this.name = name;
    this.priority = priority;
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'AI-News-Automation/1.0',
      },
    });
    
    this.feedUrl = config.feedUrl;
    this.sourceName = config.sourceName;
    this.requireAIContent = config.requireAIContent ?? true;
    this.aiKeywords = config.aiKeywords ?? [
      'ai', 'artificial intelligence', 'machine learning', 'ml',
      'deep learning', 'neural network', 'llm', 'gpt', 'claude',
      'gemini', 'openai', 'anthropic', 'deepmind', 'generative ai',
      'transformer', 'chatgpt', 'langchain', 'hugging face',
    ];
  }
  
  /**
   * Fetch events from RSS feed
   */
  async fetchEvents(options?: FetchOptions): Promise<RawEvent[]> {
    if (!this.isEnabled()) {
      return [];
    }
    
    await this.waitForRateLimit();
    this.recordRequest();
    
    try {
      // Parse RSS feed
      const feed = await this.parser.parseURL(this.feedUrl);
      
      if (!feed.items || feed.items.length === 0) {
        return [];
      }
      
      // Convert RSS items to RawEvents
      const events: RawEvent[] = [];
      
      for (const item of feed.items) {
        // Skip items without required fields
        if (!item.title || !item.link) {
          continue;
        }
        
        // Check if AI-related (if required)
        if (this.requireAIContent && !this.isAIRelated(item)) {
          continue;
        }
        
        const event = this.itemToEvent(item);
        if (event) {
          events.push(event);
        }
      }
      
      // Apply date filtering if provided
      if (options) {
        return this.filterByDateRange(events, options.startDate, options.endDate);
      }
      
      // Default: filter to last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return this.filterByDateRange(events, sevenDaysAgo, new Date());
      
    } catch (error) {
      console.error(`Error fetching RSS feed from ${this.feedUrl}:`, error);
      throw error;
    }
  }
  
  /**
   * Check if an RSS item is AI-related
   */
  private isAIRelated(item: RSSItem): boolean {
    const categories = Array.isArray(item.categories) ? item.categories.join(' ') : String(item.categories || '');
    const searchText = `${item.title || ''} ${item.content || ''} ${item.contentSnippet || ''} ${categories}`.toLowerCase();
    
    return this.aiKeywords.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (keywordLower.includes(' ')) {
        return searchText.includes(keywordLower);
      }
      
      const regex = new RegExp(`\\b${keywordLower}\\b`);
      return regex.test(searchText);
    });
  }
  
  /**
   * Convert RSS item to RawEvent
   */
  private itemToEvent(item: RSSItem): RawEvent | null {
    if (!item.title || !item.link) {
      return null;
    }
    
    // Parse date
    let date: Date;
    if (item.isoDate) {
      date = new Date(item.isoDate);
    } else if (item.pubDate) {
      date = new Date(item.pubDate);
    } else {
      // No date available, skip
      return null;
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Extract content
    const content = item.content || item.contentSnippet || item.title;
    
    return {
      title: item.title,
      date,
      source: this.sourceName,
      url: item.link,
      content: this.stripHtml(content),
      metadata: {
        guid: item.guid,
        categories: item.categories,
        creator: item.creator,
        feedSource: this.name,
      },
    };
  }
  
  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

/**
 * Factory function to create RSS collectors for known feeds
 */
export function createTechBlogCollectors(): RSSCollector[] {
  const collectors: RSSCollector[] = [];
  
  // OpenAI Blog
  collectors.push(new RSSCollector(
    'openai-blog',
    {
      enabled: true,
      feedUrl: 'https://openai.com/blog/rss.xml',
      sourceName: 'OpenAI Blog',
      baseUrl: 'https://openai.com/blog',
      reliability: SourceReliability.OFFICIAL,
      rateLimit: { requests: 10, windowMs: 60000 },
      requireAIContent: false, // All content is AI-related
    },
    10 // Highest priority
  ));
  
  // The Verge AI Section
  collectors.push(new RSSCollector(
    'verge-ai',
    {
      enabled: true,
      feedUrl: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
      sourceName: 'The Verge',
      baseUrl: 'https://www.theverge.com',
      reliability: SourceReliability.JOURNALISM,
      rateLimit: { requests: 10, windowMs: 60000 },
      requireAIContent: false, // Already filtered to AI section
    },
    6
  ));
  
  // MIT Technology Review
  collectors.push(new RSSCollector(
    'mit-tech-review',
    {
      enabled: true,
      feedUrl: 'https://www.technologyreview.com/feed/',
      sourceName: 'MIT Technology Review',
      baseUrl: 'https://www.technologyreview.com',
      reliability: SourceReliability.JOURNALISM,
      rateLimit: { requests: 10, windowMs: 60000 },
      requireAIContent: true, // Filter for AI content
    },
    7
  ));
  
  // VentureBeat AI
  collectors.push(new RSSCollector(
    'venturebeat-ai',
    {
      enabled: true,
      feedUrl: 'https://venturebeat.com/category/ai/feed/',
      sourceName: 'VentureBeat',
      baseUrl: 'https://venturebeat.com',
      reliability: SourceReliability.JOURNALISM,
      rateLimit: { requests: 10, windowMs: 60000 },
      requireAIContent: false, // Already AI category
    },
    6
  ));
  
  // TechCrunch (with AI filtering)
  collectors.push(new RSSCollector(
    'techcrunch',
    {
      enabled: true,
      feedUrl: 'https://techcrunch.com/feed/',
      sourceName: 'TechCrunch',
      baseUrl: 'https://techcrunch.com',
      reliability: SourceReliability.JOURNALISM,
      rateLimit: { requests: 10, windowMs: 60000 },
      requireAIContent: true, // Filter for AI content
    },
    5
  ));
  
  return collectors;
}
