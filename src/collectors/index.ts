/**
 * Central export point for all news collectors
 */

export { HackerNewsCollector } from './hackernews';
export { ArXivCollector } from './arxiv';
export { RSSCollector, RSSCollectorConfig, createTechBlogCollectors } from './rss';

import { NewsSource, FetchOptions, RawEvent } from '../types';
import { HackerNewsCollector } from './hackernews';
import { ArXivCollector } from './arxiv';
import { createTechBlogCollectors } from './rss';

/**
 * Create all default collectors
 */
export function createDefaultCollectors(): NewsSource[] {
  const collectors: NewsSource[] = [];
  
  // Add HackerNews collector
  collectors.push(new HackerNewsCollector());
  
  // Add ArXiv collector
  collectors.push(new ArXivCollector());
  
  // Add RSS collectors for tech blogs
  collectors.push(...createTechBlogCollectors());
  
  return collectors;
}

/**
 * Collector manager for coordinating multiple sources
 */
export class CollectorManager {
  private collectors: Map<string, NewsSource> = new Map();
  
  /**
   * Add a collector
   */
  addCollector(collector: NewsSource): void {
    this.collectors.set(collector.name, collector);
  }
  
  /**
   * Remove a collector by name
   */
  removeCollector(name: string): void {
    this.collectors.delete(name);
  }
  
  /**
   * Get all enabled collectors
   */
  getEnabledCollectors(): NewsSource[] {
    return Array.from(this.collectors.values())
      .filter(collector => collector.isEnabled())
      .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)
  }
  
  /**
   * Fetch events from all enabled collectors
   */
  async fetchAllEvents(options?: FetchOptions): Promise<RawEvent[]> {
    const enabledCollectors = this.getEnabledCollectors();
    
    if (enabledCollectors.length === 0) {
      console.warn('No enabled collectors found');
      return [];
    }
    
    console.log(`Fetching events from ${enabledCollectors.length} collectors...`);
    
    // Fetch from all collectors in parallel
    const promises = enabledCollectors.map(async collector => {
      try {
        console.log(`Fetching from ${collector.name}...`);
        const events = await collector.fetchEvents(options);
        console.log(`Found ${events.length} events from ${collector.name}`);
        return events;
      } catch (error) {
        console.error(`Error fetching from ${collector.name}:`, error);
        return []; // Return empty array on error to not break other collectors
      }
    });
    
    const results = await Promise.all(promises);
    
    // Flatten and combine all events
    const allEvents = results.flat();
    
    console.log(`Total events collected: ${allEvents.length}`);
    
    return allEvents;
  }
  
  /**
   * Initialize with default collectors
   */
  static createWithDefaults(): CollectorManager {
    const manager = new CollectorManager();
    const defaultCollectors = createDefaultCollectors();
    
    for (const collector of defaultCollectors) {
      manager.addCollector(collector);
    }
    
    return manager;
  }
}
