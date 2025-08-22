/**
 * Unit tests for RSS collector
 */

import { RSSCollector } from '../rss';
import { SourceReliability } from '../../types';

// Mock RSS parser
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn()
  }));
});

describe('RSSCollector', () => {
  let collector: RSSCollector;
  let mockRSSParser: any;

  beforeEach(async () => {
    const RSSParser = await import('rss-parser');
    mockRSSParser = new RSSParser.default();
    collector = new RSSCollector({
      name: 'TechBlog',
      url: 'https://example.com/rss',
      reliability: SourceReliability.MEDIUM
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(collector.getName()).toBe('TechBlog');
      expect(collector.getReliability()).toBe(SourceReliability.MEDIUM);
    });

    it('should accept different reliability levels', () => {
      const highReliabilityCollector = new RSSCollector({
        name: 'HighTechBlog',
        url: 'https://high-tech.com/rss',
        reliability: SourceReliability.HIGH
      });

      expect(highReliabilityCollector.getReliability()).toBe(SourceReliability.HIGH);
    });
  });

  describe('fetchEvents', () => {
    it('should fetch and parse RSS articles successfully', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Breaking: New AI Model Achieves Human-Level Performance',
            link: 'https://example.com/article1',
            pubDate: new Date().toISOString(),
            content: 'A new AI model has achieved human-level performance on multiple benchmarks...',
            creator: 'Tech Reporter',
            guid: 'https://example.com/article1'
          },
          {
            title: 'Machine Learning Breakthrough in Medical Diagnosis',
            link: 'https://example.com/article2',
            pubDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
            content: 'Researchers have developed a new ML system for medical diagnosis...',
            creator: 'Medical AI Team',
            guid: 'https://example.com/article2'
          },
          {
            title: 'Old Article About AI',
            link: 'https://example.com/article3',
            pubDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
            content: 'This is an old article about AI...',
            creator: 'Old Author',
            guid: 'https://example.com/article3'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(mockRSSParser.parseURL).toHaveBeenCalledWith('https://example.com/rss');
      expect(events).toHaveLength(2); // Only recent articles (within 7 days)
      
      expect(events[0]).toMatchObject({
        id: expect.stringMatching(/^rss-/),
        title: 'Breaking: New AI Model Achieves Human-Level Performance',
        url: 'https://example.com/article1',
        source: 'TechBlog',
        sourceReliability: SourceReliability.MEDIUM,
        content: 'A new AI model has achieved human-level performance on multiple benchmarks...',
        author: 'Tech Reporter'
      });

      expect(events[1]).toMatchObject({
        title: 'Machine Learning Breakthrough in Medical Diagnosis',
        author: 'Medical AI Team',
        url: 'https://example.com/article2'
      });
    });

    it('should handle empty RSS feed', async () => {
      mockRSSParser.parseURL.mockResolvedValue({ items: [] });

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(0);
    });

    it('should filter articles by date (past 7 days)', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Recent Article',
            link: 'https://example.com/recent',
            pubDate: new Date().toISOString(),
            content: 'Recent content',
            creator: 'Author',
            guid: 'https://example.com/recent'
          },
          {
            title: 'Week Old Article',
            link: 'https://example.com/week-old',
            pubDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
            content: 'Week old content',
            creator: 'Author',
            guid: 'https://example.com/week-old'
          },
          {
            title: 'Too Old Article',
            link: 'https://example.com/too-old',
            pubDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
            content: 'Too old content',
            creator: 'Author',
            guid: 'https://example.com/too-old'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(2); // Only articles within 7 days
      expect(events.map(e => e.title)).toEqual(['Recent Article', 'Week Old Article']);
    });

    it('should handle articles without author', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Article Without Author',
            link: 'https://example.com/no-author',
            pubDate: new Date().toISOString(),
            content: 'Content without author',
            guid: 'https://example.com/no-author'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].author).toBeUndefined();
    });

    it('should handle articles with contentSnippet instead of content', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Article with Snippet',
            link: 'https://example.com/snippet',
            pubDate: new Date().toISOString(),
            contentSnippet: 'This is a content snippet...',
            creator: 'Author',
            guid: 'https://example.com/snippet'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('This is a content snippet...');
    });

    it('should handle articles with both content and contentSnippet', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Article with Both',
            link: 'https://example.com/both',
            pubDate: new Date().toISOString(),
            content: 'Full content here...',
            contentSnippet: 'This is a snippet...',
            creator: 'Author',
            guid: 'https://example.com/both'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('Full content here...'); // Prefers full content
    });

    it('should generate unique IDs for articles', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/article1',
            pubDate: new Date().toISOString(),
            content: 'Content 1',
            creator: 'Author',
            guid: 'https://example.com/article1'
          },
          {
            title: 'Article 2',
            link: 'https://example.com/article2',
            pubDate: new Date().toISOString(),
            content: 'Content 2',
            creator: 'Author',
            guid: 'https://example.com/article2'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(2);
      expect(events[0].id).toMatch(/^rss-/);
      expect(events[1].id).toMatch(/^rss-/);
      expect(events[0].id).not.toBe(events[1].id);
    });

    it('should handle RSS parsing errors', async () => {
      const error = new Error('RSS feed not accessible');
      mockRSSParser.parseURL.mockRejectedValue(error);

      await expect(collector.fetchEvents()).rejects.toThrow('RSS feed not accessible');
    });

    it('should handle malformed RSS items gracefully', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Valid Article',
            link: 'https://example.com/valid',
            pubDate: new Date().toISOString(),
            content: 'Valid content',
            creator: 'Author',
            guid: 'https://example.com/valid'
          },
          {
            // Missing required fields
            title: 'Invalid Article'
            // No link, pubDate, etc.
          },
          {
            title: 'Another Valid Article',
            link: 'https://example.com/valid2',
            pubDate: new Date().toISOString(),
            content: 'Another valid content',
            creator: 'Author',
            guid: 'https://example.com/valid2'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(2); // Only valid articles
      expect(events.map(e => e.title)).toEqual(['Valid Article', 'Another Valid Article']);
    });

    it('should handle articles with invalid dates', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Valid Article',
            link: 'https://example.com/valid',
            pubDate: new Date().toISOString(),
            content: 'Valid content',
            creator: 'Author',
            guid: 'https://example.com/valid'
          },
          {
            title: 'Invalid Date Article',
            link: 'https://example.com/invalid-date',
            pubDate: 'invalid-date-string',
            content: 'Content with invalid date',
            creator: 'Author',
            guid: 'https://example.com/invalid-date'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1); // Only valid article with valid date
      expect(events[0].title).toBe('Valid Article');
    });

    it('should use title for ID generation when guid is not available', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Article Without GUID',
            link: 'https://example.com/no-guid',
            pubDate: new Date().toISOString(),
            content: 'Content without GUID',
            creator: 'Author'
            // No guid field
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].id).toMatch(/^rss-/);
    });

    it('should handle different RSS feed structures', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Article with Description',
            link: 'https://example.com/description',
            pubDate: new Date().toISOString(),
            description: 'This is in description field instead of content',
            creator: 'Author',
            guid: 'https://example.com/description'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      // Should fall back to description if content and contentSnippet are not available
      expect(events[0].content).toBe('This is in description field instead of content');
    });
  });
});
