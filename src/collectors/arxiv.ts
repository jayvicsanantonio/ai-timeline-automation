/**
 * ArXiv collector for AI research papers
 * Fetches recent papers from cs.AI and cs.LG categories
 */

import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import {
  NewsSource,
  NewsSourceName,
  NewsSourceConfig,
  FetchOptions,
  RawEvent,
  SourceReliability,
  DEFAULT_SOURCE_CONFIGS,
} from '../types';

/**
 * ArXiv API response structure
 */
interface ArXivEntry {
  id: string[];
  updated: string[];
  published: string[];
  title: string[];
  summary: string[];
  author?: Array<{ name: string[] }>;
  link?: Array<{ $: { href: string; rel?: string; type?: string } }>;
  category?: Array<{ $: { term: string } }>;
}

interface ArXivResponse {
  feed: {
    entry?: ArXivEntry[];
    'opensearch:totalResults'?: string[];
    'opensearch:startIndex'?: string[];
    'opensearch:itemsPerPage'?: string[];
  };
}

/**
 * Configuration specific to ArXiv
 */
interface ArXivConfig extends NewsSourceConfig {
  categories?: string[];
  maxResults?: number;
}

/**
 * ArXiv collector implementation
 */
export class ArXivCollector extends NewsSource {
  readonly name = NewsSourceName.ARXIV;
  readonly type = 'api' as const;
  readonly priority = 8; // High priority for academic sources
  
  private readonly categories: string[];
  private readonly maxResults: number;
  private readonly apiUrl: string;
  
  constructor(config?: Partial<ArXivConfig>) {
    const defaultConfig = DEFAULT_SOURCE_CONFIGS[NewsSourceName.ARXIV];
    const mergedConfig: NewsSourceConfig = {
      enabled: config?.enabled ?? true,
      baseUrl: config?.baseUrl ?? defaultConfig.baseUrl ?? 'http://export.arxiv.org/api/query',
      rateLimit: config?.rateLimit ?? defaultConfig.rateLimit ?? { requests: 5, windowMs: 5000 },
      reliability: config?.reliability ?? defaultConfig.reliability ?? SourceReliability.ACADEMIC,
      apiKey: config?.apiKey,
    };
    
    super(mergedConfig);
    
    this.apiUrl = mergedConfig.baseUrl;
    this.categories = (config as ArXivConfig)?.categories ?? ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV'];
    this.maxResults = (config as ArXivConfig)?.maxResults ?? 100;
  }
  
  /**
   * Fetch events from ArXiv
   */
  async fetchEvents(options?: FetchOptions): Promise<RawEvent[]> {
    if (!this.isEnabled()) {
      return [];
    }
    
    const endDate = options?.endDate ?? new Date();
    const startDate = options?.startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    await this.waitForRateLimit();
    this.recordRequest();
    
    try {
      // Build search query for AI categories
      const categoryQuery = this.categories
        .map(cat => `cat:${cat}`)
        .join(' OR ');
      
      // Format dates for ArXiv query (YYYYMMDD format)
      const startDateStr = this.formatDateForArXiv(startDate);
      const endDateStr = this.formatDateForArXiv(endDate);
      
      // Build full query
      const query = `(${categoryQuery}) AND submittedDate:[${startDateStr} TO ${endDateStr}]`;
      
      // Make API request
      const response = await axios.get(this.apiUrl, {
        params: {
          search_query: query,
          start: 0,
          max_results: this.maxResults,
          sortBy: 'submittedDate',
          sortOrder: 'descending',
        },
      });
      
      // Parse XML response
      const parsed: ArXivResponse = await parseStringPromise(response.data);
      
      if (!parsed.feed.entry || parsed.feed.entry.length === 0) {
        return [];
      }
      
      // Convert to RawEvent format
      const events = parsed.feed.entry.map(entry => this.entryToEvent(entry));
      
      // Apply date filtering (double-check as ArXiv API date filtering can be unreliable)
      if (options) {
        return this.filterByDateRange(events, options.startDate, options.endDate);
      }
      
      return events;
      
    } catch (error) {
      console.error('Error fetching ArXiv papers:', error);
      throw error;
    }
  }
  
  /**
   * Format date for ArXiv API query
   */
  private formatDateForArXiv(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  
  /**
   * Convert ArXiv entry to RawEvent
   */
  private entryToEvent(entry: ArXivEntry): RawEvent {
    // Extract ID from the URL (last part after /)
    const idMatch = entry.id[0].match(/([^/]+)$/);
    const arxivId = idMatch ? idMatch[1] : entry.id[0];
    
    // Get publication date
    const date = new Date(entry.published[0]);
    
    // Clean title (remove newlines and extra spaces)
    const title = entry.title[0].replace(/\s+/g, ' ').trim();
    
    // Clean summary
    const summary = entry.summary[0].replace(/\s+/g, ' ').trim();
    
    // Extract authors
    const authors = entry.author
      ? entry.author.map(a => a.name[0]).join(', ')
      : 'Unknown';
    
    // Find PDF link
    const pdfLink = entry.link?.find(l => l.$.type === 'application/pdf')?.$.href;
    const abstractLink = entry.link?.find(l => l.$.type === 'text/html')?.$.href;
    
    // Extract categories
    const categories = entry.category
      ? entry.category.map(c => c.$.term).join(', ')
      : '';
    
    // Create content
    const content = `${summary}\n\nAuthors: ${authors}\nCategories: ${categories}`;
    
    return {
      title: `[ArXiv] ${title}`,
      date,
      source: 'ArXiv',
      url: abstractLink || `https://arxiv.org/abs/${arxivId}`,
      content,
      metadata: {
        arxivId,
        pdfUrl: pdfLink || `https://arxiv.org/pdf/${arxivId}.pdf`,
        authors: authors.split(', '),
        categories: categories.split(', '),
        abstract: summary,
        updatedDate: entry.updated[0],
      },
    };
  }
}
