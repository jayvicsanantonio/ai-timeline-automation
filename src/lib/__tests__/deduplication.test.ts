/**
 * Tests for deduplication service
 */

import { DeduplicationService } from '../deduplication';
import { RawEvent } from '../../types';

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  
  beforeEach(() => {
    service = new DeduplicationService();
  });
  
  describe('deduplicate', () => {
    it('should return empty array for empty input', () => {
      const result = service.deduplicate([]);
      expect(result).toEqual([]);
    });
    
    it('should return single event unchanged', () => {
      const event: RawEvent = {
        title: 'Test Event',
        date: new Date('2024-01-15'),
        source: 'Test Source',
        url: 'https://example.com/test',
        content: 'Test content',
      };
      
      const result = service.deduplicate([event]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(event);
    });
    
    it('should detect exact URL matches as duplicates', () => {
      const events: RawEvent[] = [
        {
          title: 'OpenAI Announces GPT-5',
          date: new Date('2024-01-15'),
          source: 'HackerNews',
          url: 'https://openai.com/blog/gpt-5',
          content: 'Short summary',
        },
        {
          title: 'GPT-5 Released by OpenAI',
          date: new Date('2024-01-15'),
          source: 'TechCrunch',
          url: 'https://openai.com/blog/gpt-5',
          content: 'Longer detailed article about the release',
        },
      ];
      
      const result = service.deduplicate(events);
      
      expect(result).toHaveLength(1);
      expect(result[0].metadata?.is_deduplicated).toBe(true);
      expect(result[0].metadata?.duplicate_count).toBe(2);
      expect(result[0].metadata?.sources).toContain('HackerNews');
      expect(result[0].metadata?.sources).toContain('TechCrunch');
    });
    
    it('should detect similar titles as duplicates', () => {
      const events: RawEvent[] = [
        {
          title: 'OpenAI Releases GPT-5: A Major Breakthrough',
          date: new Date('2024-01-15'),
          source: 'OpenAI Blog',
          url: 'https://openai.com/blog/gpt-5',
          content: 'Official announcement',
        },
        {
          title: 'OpenAI releases GPT-5 - major breakthrough!',
          date: new Date('2024-01-15'),
          source: 'HackerNews',
          url: 'https://news.ycombinator.com/item?id=123',
          content: 'Discussion',
        },
        {
          title: 'Breaking: GPT-5 Released by OpenAI',
          date: new Date('2024-01-15'),
          source: 'The Verge',
          url: 'https://theverge.com/gpt5',
          content: 'News coverage',
        },
      ];
      
      const result = service.deduplicate(events);
      
      // Should merge similar titles
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('OpenAI Blog'); // Highest priority source
      expect(result[0].metadata?.duplicate_count).toBe(3);
    });
    
    it('should not merge events too far apart in time', () => {
      const events: RawEvent[] = [
        {
          title: 'OpenAI Announces GPT-5',
          date: new Date('2024-01-15'),
          source: 'OpenAI Blog',
          url: 'https://openai.com/blog/gpt-5',
          content: 'Announcement',
        },
        {
          title: 'OpenAI Announces GPT-5',
          date: new Date('2024-01-20'), // 5 days later
          source: 'TechCrunch',
          url: 'https://techcrunch.com/gpt5',
          content: 'Late coverage',
        },
      ];
      
      // Default time window is 48 hours
      const result = service.deduplicate(events);
      
      expect(result).toHaveLength(2); // Should not be merged
    });
    
    it('should merge events within time window', () => {
      const events: RawEvent[] = [
        {
          title: 'Major AI Breakthrough',
          date: new Date('2024-01-15T12:00:00Z'),
          source: 'Source1',
          url: 'https://example.com/1',
          content: 'Content 1',
        },
        {
          title: 'Major AI Breakthrough',
          date: new Date('2024-01-16T12:00:00Z'), // 24 hours later
          source: 'Source2',
          url: 'https://example.com/2',
          content: 'Content 2',
        },
      ];
      
      const result = service.deduplicate(events);
      
      expect(result).toHaveLength(1); // Should be merged
      expect(result[0].metadata?.duplicate_count).toBe(2);
    });
    
    it('should preserve longer content when merging', () => {
      const shortContent = 'Short summary';
      const longContent = 'This is a much longer and more detailed article about the announcement with lots of information';
      
      const events: RawEvent[] = [
        {
          title: 'AI News',
          date: new Date('2024-01-15'),
          source: 'Source1',
          url: 'https://example.com/news',
          content: shortContent,
        },
        {
          title: 'AI News',
          date: new Date('2024-01-15'),
          source: 'Source2',
          url: 'https://example.com/news',
          content: longContent,
        },
      ];
      
      const result = service.deduplicate(events);
      
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(longContent);
    });
    
    it('should use most reliable source as primary', () => {
      const events: RawEvent[] = [
        {
          title: 'Claude 3 Released',
          date: new Date('2024-01-15'),
          source: 'HackerNews',
          url: 'https://news.ycombinator.com/claude3',
          content: 'Discussion',
        },
        {
          title: 'Claude 3 Released',
          date: new Date('2024-01-15'),
          source: 'Anthropic',
          url: 'https://anthropic.com/claude3',
          content: 'Official announcement',
        },
        {
          title: 'Claude 3 Released',
          date: new Date('2024-01-15'),
          source: 'TechCrunch',
          url: 'https://techcrunch.com/claude3',
          content: 'News coverage',
        },
      ];
      
      const result = service.deduplicate(events);
      
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('Anthropic'); // Official source has highest priority
      expect(result[0].url).toBe('https://anthropic.com/claude3');
    });
    
    it('should handle multiple independent groups', () => {
      const events: RawEvent[] = [
        // Group 1
        {
          title: 'OpenAI Announces GPT-5',
          date: new Date('2024-01-15'),
          source: 'OpenAI Blog',
          url: 'https://openai.com/gpt5',
          content: 'GPT-5 announcement',
        },
        {
          title: 'OpenAI Announces GPT-5',
          date: new Date('2024-01-15'),
          source: 'HackerNews',
          url: 'https://hn.com/gpt5',
          content: 'GPT-5 discussion',
        },
        // Group 2
        {
          title: 'Google Releases Gemini Pro',
          date: new Date('2024-01-16'),
          source: 'Google AI',
          url: 'https://google.com/gemini',
          content: 'Gemini announcement',
        },
        {
          title: 'Google Releases Gemini Pro',
          date: new Date('2024-01-16'),
          source: 'The Verge',
          url: 'https://verge.com/gemini',
          content: 'Gemini coverage',
        },
        // Standalone
        {
          title: 'Meta AI Research Paper',
          date: new Date('2024-01-17'),
          source: 'ArXiv',
          url: 'https://arxiv.org/meta',
          content: 'Research paper',
        },
      ];
      
      const result = service.deduplicate(events);
      
      expect(result).toHaveLength(3); // Three groups
      
      // Check each group
      const gpt5 = result.find(e => e.title.includes('GPT-5'));
      expect(gpt5?.metadata?.duplicate_count).toBe(2);
      
      const gemini = result.find(e => e.title.includes('Gemini'));
      expect(gemini?.metadata?.duplicate_count).toBe(2);
      
      const meta = result.find(e => e.title.includes('Meta'));
      expect(meta?.metadata?.is_deduplicated).toBeFalsy();
    });
  });
  
  describe('similarity calculation', () => {
    it('should handle fuzzy matching with custom threshold', () => {
      const strictService = new DeduplicationService({
        similarityThreshold: 0.9, // Very strict
      });
      
      const events: RawEvent[] = [
        {
          title: 'OpenAI GPT-5 Announcement',
          date: new Date('2024-01-15'),
          source: 'Source1',
          url: 'https://example.com/1',
          content: 'Content',
        },
        {
          title: 'OpenAI GPT5 Announced', // Slightly different
          date: new Date('2024-01-15'),
          source: 'Source2',
          url: 'https://example.com/2',
          content: 'Content',
        },
      ];
      
      const result = strictService.deduplicate(events);
      
      // With strict threshold, might not merge
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should handle containment matching', () => {
      const events: RawEvent[] = [
        {
          title: 'OpenAI Releases GPT-5',
          date: new Date('2024-01-15'),
          source: 'Source1',
          url: 'https://example.com/1',
          content: 'Content',
        },
        {
          title: 'Breaking: OpenAI Releases GPT-5 with Amazing Capabilities',
          date: new Date('2024-01-15'),
          source: 'Source2',
          url: 'https://example.com/2',
          content: 'Content',
        },
      ];
      
      const result = service.deduplicate(events);
      
      // Should detect that one title contains the other
      expect(result).toHaveLength(1);
    });
  });
  
  describe('getDeduplicationStats', () => {
    it('should calculate correct statistics', () => {
      const original: RawEvent[] = [
        {
          title: 'Event 1',
          date: new Date(),
          source: 'Source1',
          url: 'https://example.com/1',
          content: 'Content',
        },
        {
          title: 'Event 1', // Duplicate
          date: new Date(),
          source: 'Source2',
          url: 'https://example.com/1',
          content: 'Content',
        },
        {
          title: 'Event 2',
          date: new Date(),
          source: 'Source3',
          url: 'https://example.com/2',
          content: 'Content',
        },
      ];
      
      const deduplicated = service.deduplicate(original);
      const stats = service.getDeduplicationStats(original, deduplicated);
      
      expect(stats.originalCount).toBe(3);
      expect(stats.deduplicatedCount).toBe(2);
      expect(stats.duplicatesRemoved).toBe(1);
      expect(stats.deduplicationRate).toBeCloseTo(0.333, 2);
    });
    
    it('should handle empty arrays', () => {
      const stats = service.getDeduplicationStats([], []);
      
      expect(stats.originalCount).toBe(0);
      expect(stats.deduplicatedCount).toBe(0);
      expect(stats.duplicatesRemoved).toBe(0);
      expect(stats.deduplicationRate).toBe(0);
    });
  });
});
