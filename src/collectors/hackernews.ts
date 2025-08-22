/**
 * HackerNews collector for AI-related stories
 * Fetches top stories from HackerNews API and filters for AI content
 */

import axios from 'axios';
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
 * HackerNews API types
 */
interface HNStory {
  id: number;
  title: string;
  url?: string;
  text?: string;
  time: number; // Unix timestamp
  score: number;
  by: string;
  descendants?: number;
  type: 'story';
}

/**
 * Configuration specific to HackerNews
 */
interface HackerNewsConfig extends NewsSourceConfig {
  scoreThreshold?: number;
  maxStories?: number;
  aiKeywords?: string[];
}

/**
 * HackerNews collector implementation
 */
export class HackerNewsCollector extends NewsSource {
  readonly name = NewsSourceName.HACKERNEWS;
  readonly type = 'api' as const;
  readonly priority = 5; // Medium priority
  
  private readonly scoreThreshold: number;
  private readonly maxStories: number;
  private readonly aiKeywords: string[];
  private readonly apiBaseUrl: string;
  
  constructor(config?: Partial<HackerNewsConfig>) {
    const defaultConfig = DEFAULT_SOURCE_CONFIGS[NewsSourceName.HACKERNEWS];
    const mergedConfig: NewsSourceConfig = {
      enabled: config?.enabled ?? true,
      baseUrl: config?.baseUrl ?? defaultConfig.baseUrl ?? 'https://hacker-news.firebaseio.com/v0',
      rateLimit: config?.rateLimit ?? defaultConfig.rateLimit ?? { requests: 30, windowMs: 60000 },
      reliability: config?.reliability ?? defaultConfig.reliability ?? SourceReliability.COMMUNITY,
      apiKey: config?.apiKey,
    };
    
    super(mergedConfig);
    
    this.apiBaseUrl = mergedConfig.baseUrl;
    this.scoreThreshold = (config as HackerNewsConfig)?.scoreThreshold ?? 100;
    this.maxStories = (config as HackerNewsConfig)?.maxStories ?? 500;
    this.aiKeywords = (config as HackerNewsConfig)?.aiKeywords ?? [
      'ai', 'artificial intelligence', 'machine learning', 'ml', 
      'deep learning', 'neural network', 'llm', 'gpt', 'claude',
      'gemini', 'openai', 'anthropic', 'deepmind', 'generative ai',
      'transformer', 'diffusion', 'computer vision', 'nlp',
      'natural language', 'reinforcement learning', 'langchain',
      'vector database', 'embedding', 'hugging face', 'stable diffusion',
      'midjourney', 'copilot', 'chatgpt', 'bard', 'perplexity'
    ];
  }
  
  /**
   * Fetch events from HackerNews
   */
  async fetchEvents(options?: FetchOptions): Promise<RawEvent[]> {
    if (!this.isEnabled()) {
      return [];
    }
    
    await this.waitForRateLimit();
    this.recordRequest();
    
    try {
      // Get top story IDs
      const topStoriesResponse = await axios.get<number[]>(
        `${this.apiBaseUrl}/topstories.json`
      );
      
      const storyIds = topStoriesResponse.data.slice(0, this.maxStories);
      
      // Fetch stories in batches to avoid overwhelming the API
      const batchSize = 10;
      const stories: HNStory[] = [];
      
      for (let i = 0; i < storyIds.length; i += batchSize) {
        await this.waitForRateLimit();
        
        const batch = storyIds.slice(i, i + batchSize);
        const batchPromises = batch.map(id => this.fetchStory(id));
        const batchStories = await Promise.all(batchPromises);
        
        stories.push(...batchStories.filter((s): s is HNStory => s !== null));
        this.recordRequest();
      }
      
      // Filter for AI content and score threshold
      const aiStories = stories.filter(story => 
        story.score >= this.scoreThreshold && 
        this.isAIRelated(story)
      );
      
      // Convert to RawEvent format
      const events = aiStories.map(story => this.storyToEvent(story));
      
      // Apply date filtering if provided
      if (options) {
        return this.filterByDateRange(events, options.startDate, options.endDate);
      }
      
      return events;
      
    } catch (error) {
      console.error('Error fetching HackerNews stories:', error);
      throw error;
    }
  }
  
  /**
   * Fetch a single story by ID
   */
  private async fetchStory(id: number): Promise<HNStory | null> {
    try {
      const response = await axios.get<HNStory>(
        `${this.apiBaseUrl}/item/${id}.json`
      );
      
      if (response.data && response.data.type === 'story') {
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching story ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Check if a story is AI-related
   */
  private isAIRelated(story: HNStory): boolean {
    const searchText = `${story.title} ${story.text || ''}`.toLowerCase();
    
    return this.aiKeywords.some(keyword => {
      // Handle multi-word keywords
      const keywordLower = keyword.toLowerCase();
      if (keywordLower.includes(' ')) {
        return searchText.includes(keywordLower);
      }
      
      // For single words, use word boundary matching
      const regex = new RegExp(`\\b${keywordLower}\\b`);
      return regex.test(searchText);
    });
  }
  
  /**
   * Convert HackerNews story to RawEvent
   */
  private storyToEvent(story: HNStory): RawEvent {
    const date = new Date(story.time * 1000); // Convert Unix timestamp to Date
    
    // Construct HN discussion URL
    const hnUrl = `https://news.ycombinator.com/item?id=${story.id}`;
    
    // Use story URL if available, otherwise use HN discussion URL
    const eventUrl = story.url || hnUrl;
    
    // Create content from text or a summary
    const content = story.text 
      ? this.stripHtml(story.text)
      : `Score: ${story.score} | Comments: ${story.descendants || 0} | ${story.url ? `Article: ${story.url}` : 'Text post'}`;
    
    return {
      title: story.title,
      date,
      source: 'HackerNews',
      url: eventUrl,
      content,
      metadata: {
        hnId: story.id,
        hnUrl,
        score: story.score,
        author: story.by,
        comments: story.descendants || 0,
        originalUrl: story.url,
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
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .trim();
  }
}
