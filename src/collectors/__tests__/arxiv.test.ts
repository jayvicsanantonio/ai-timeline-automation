/**
 * Unit tests for ArXiv collector
 */

import { ArXivCollector } from '../arxiv';
import { SourceReliability } from '../../types';

// Mock RSS parser
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn()
  }));
});

describe('ArXivCollector', () => {
  let collector: ArXivCollector;
  let mockRSSParser: any;

  beforeEach(() => {
    const RSSParser = require('rss-parser');
    mockRSSParser = new RSSParser();
    collector = new ArXivCollector({
      name: 'ArXiv',
      url: 'http://export.arxiv.org/rss/',
      reliability: SourceReliability.HIGH,
      categories: ['cs.AI', 'cs.LG']
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(collector.getName()).toBe('ArXiv');
      expect(collector.getReliability()).toBe(SourceReliability.HIGH);
    });

    it('should accept custom categories', () => {
      const customCollector = new ArXivCollector({
        name: 'ArXiv Custom',
        url: 'http://export.arxiv.org/rss/',
        reliability: SourceReliability.HIGH,
        categories: ['cs.CV', 'cs.NE']
      });

      expect(customCollector.getName()).toBe('ArXiv Custom');
    });
  });

  describe('fetchEvents', () => {
    it('should fetch and parse ArXiv papers successfully', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Large Language Models for Code Generation',
            link: 'https://arxiv.org/abs/2023.12345',
            pubDate: new Date().toISOString(),
            content: 'This paper explores the use of large language models for automated code generation...',
            creator: 'John Doe, Jane Smith',
            categories: ['cs.AI', 'cs.SE'],
            guid: 'https://arxiv.org/abs/2023.12345'
          },
          {
            title: 'Neural Architecture Search with Reinforcement Learning',
            link: 'https://arxiv.org/abs/2023.67890',
            pubDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
            content: 'We propose a new method for neural architecture search using reinforcement learning...',
            creator: 'Alice Johnson',
            categories: ['cs.LG', 'cs.AI'],
            guid: 'https://arxiv.org/abs/2023.67890'
          },
          {
            title: 'Computer Vision for Medical Imaging',
            link: 'https://arxiv.org/abs/2023.11111',
            pubDate: new Date().toISOString(),
            content: 'This work applies computer vision techniques to medical imaging...',
            creator: 'Bob Wilson',
            categories: ['cs.CV', 'cs.AI'], // Should be filtered out (cs.CV not in our categories)
            guid: 'https://arxiv.org/abs/2023.11111'
          },
          {
            title: 'Old Paper',
            link: 'https://arxiv.org/abs/2023.22222',
            pubDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
            content: 'This is an old paper...',
            creator: 'Old Author',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.22222'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(mockRSSParser.parseURL).toHaveBeenCalledWith('http://export.arxiv.org/rss/cs');
      expect(events).toHaveLength(2); // Only recent papers with correct categories
      
      expect(events[0]).toMatchObject({
        id: expect.stringMatching(/^arxiv-/),
        title: 'Large Language Models for Code Generation',
        url: 'https://arxiv.org/abs/2023.12345',
        source: 'ArXiv',
        sourceReliability: SourceReliability.HIGH,
        content: 'This paper explores the use of large language models for automated code generation...',
        authors: ['John Doe', 'Jane Smith'],
        categories: ['cs.AI', 'cs.SE']
      });

      expect(events[1]).toMatchObject({
        title: 'Neural Architecture Search with Reinforcement Learning',
        authors: ['Alice Johnson'],
        categories: ['cs.LG', 'cs.AI']
      });
    });

    it('should handle empty RSS feed', async () => {
      mockRSSParser.parseURL.mockResolvedValue({ items: [] });

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(0);
    });

    it('should filter papers by categories', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'AI Paper',
            link: 'https://arxiv.org/abs/2023.12345',
            pubDate: new Date().toISOString(),
            content: 'AI content',
            creator: 'Author',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.12345'
          },
          {
            title: 'Non-AI Paper',
            link: 'https://arxiv.org/abs/2023.67890',
            pubDate: new Date().toISOString(),
            content: 'Non-AI content',
            creator: 'Author',
            categories: ['cs.DS', 'cs.DB'], // Not in our categories
            guid: 'https://arxiv.org/abs/2023.67890'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('AI Paper');
    });

    it('should filter papers by date (past 7 days)', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Recent Paper',
            link: 'https://arxiv.org/abs/2023.12345',
            pubDate: new Date().toISOString(),
            content: 'Recent content',
            creator: 'Author',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.12345'
          },
          {
            title: 'Old Paper',
            link: 'https://arxiv.org/abs/2023.67890',
            pubDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
            content: 'Old content',
            creator: 'Author',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.67890'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Recent Paper');
    });

    it('should handle papers with single author', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Single Author Paper',
            link: 'https://arxiv.org/abs/2023.12345',
            pubDate: new Date().toISOString(),
            content: 'Content',
            creator: 'Single Author',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.12345'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].authors).toEqual(['Single Author']);
    });

    it('should handle papers with multiple authors', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Multi Author Paper',
            link: 'https://arxiv.org/abs/2023.12345',
            pubDate: new Date().toISOString(),
            content: 'Content',
            creator: 'Author One, Author Two, Author Three',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.12345'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(1);
      expect(events[0].authors).toEqual(['Author One', 'Author Two', 'Author Three']);
    });

    it('should generate unique IDs for papers', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Paper 1',
            link: 'https://arxiv.org/abs/2023.12345',
            pubDate: new Date().toISOString(),
            content: 'Content 1',
            creator: 'Author',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.12345'
          },
          {
            title: 'Paper 2',
            link: 'https://arxiv.org/abs/2023.67890',
            pubDate: new Date().toISOString(),
            content: 'Content 2',
            creator: 'Author',
            categories: ['cs.LG'],
            guid: 'https://arxiv.org/abs/2023.67890'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(2);
      expect(events[0].id).toMatch(/^arxiv-/);
      expect(events[1].id).toMatch(/^arxiv-/);
      expect(events[0].id).not.toBe(events[1].id);
    });

    it('should handle RSS parsing errors', async () => {
      const error = new Error('RSS parsing failed');
      mockRSSParser.parseURL.mockRejectedValue(error);

      await expect(collector.fetchEvents()).rejects.toThrow('RSS parsing failed');
    });

    it('should handle malformed RSS items gracefully', async () => {
      const mockRSSData = {
        items: [
          {
            title: 'Valid Paper',
            link: 'https://arxiv.org/abs/2023.12345',
            pubDate: new Date().toISOString(),
            content: 'Valid content',
            creator: 'Author',
            categories: ['cs.AI'],
            guid: 'https://arxiv.org/abs/2023.12345'
          },
          {
            // Missing required fields
            title: 'Invalid Paper',
            categories: ['cs.AI']
          },
          {
            title: 'Another Valid Paper',
            link: 'https://arxiv.org/abs/2023.67890',
            pubDate: new Date().toISOString(),
            content: 'Valid content',
            creator: 'Author',
            categories: ['cs.LG'],
            guid: 'https://arxiv.org/abs/2023.67890'
          }
        ]
      };

      mockRSSParser.parseURL.mockResolvedValue(mockRSSData);

      const events = await collector.fetchEvents();

      expect(events).toHaveLength(2); // Only valid papers
      expect(events.map(e => e.title)).toEqual(['Valid Paper', 'Another Valid Paper']);
    });
  });
});
