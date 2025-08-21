/**
 * Tests for HackerNews collector
 */

import axios from 'axios';
import { HackerNewsCollector } from '../hackernews';
import { FetchOptions } from '../../types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HackerNewsCollector', () => {
  let collector: HackerNewsCollector;
  
  beforeEach(() => {
    collector = new HackerNewsCollector({
      scoreThreshold: 50, // Lower threshold for testing
      maxStories: 10, // Fewer stories for testing
    });
    jest.clearAllMocks();
  });
  
  describe('fetchEvents', () => {
    it('should fetch and filter AI-related stories', async () => {
      // Mock top stories response
      mockedAxios.get.mockImplementationOnce(() =>
        Promise.resolve({
          data: [1, 2, 3, 4, 5],
        })
      );
      
      // Mock individual story responses
      const mockStories = [
        {
          id: 1,
          title: 'OpenAI Announces GPT-5',
          url: 'https://example.com/gpt5',
          time: Math.floor(Date.now() / 1000),
          score: 150,
          by: 'user1',
          descendants: 50,
          type: 'story',
        },
        {
          id: 2,
          title: 'Machine Learning Breakthrough',
          text: 'New deep learning model achieves state of the art',
          time: Math.floor(Date.now() / 1000),
          score: 100,
          by: 'user2',
          descendants: 30,
          type: 'story',
        },
        {
          id: 3,
          title: 'Unrelated Tech News', // Not AI-related
          url: 'https://example.com/other',
          time: Math.floor(Date.now() / 1000),
          score: 200,
          by: 'user3',
          descendants: 20,
          type: 'story',
        },
        {
          id: 4,
          title: 'AI Ethics Discussion',
          url: 'https://example.com/ethics',
          time: Math.floor(Date.now() / 1000),
          score: 25, // Below threshold
          by: 'user4',
          descendants: 10,
          type: 'story',
        },
        {
          id: 5,
          title: 'Claude 3 Released by Anthropic',
          url: 'https://example.com/claude3',
          time: Math.floor(Date.now() / 1000),
          score: 300,
          by: 'user5',
          descendants: 100,
          type: 'story',
        },
      ];
      
      // Mock each story fetch
      mockStories.forEach(story => {
        mockedAxios.get.mockImplementationOnce(() =>
          Promise.resolve({ data: story })
        );
      });
      
      const events = await collector.fetchEvents();
      
      // Should have 3 events (stories 1, 2, and 5 - AI-related and above threshold)
      expect(events).toHaveLength(3);
      
      // Check first event
      expect(events[0].title).toBe('OpenAI Announces GPT-5');
      expect(events[0].source).toBe('HackerNews');
      expect(events[0].url).toBe('https://example.com/gpt5');
      expect(events[0].metadata?.score).toBe(150);
      
      // Check that low-score AI story was filtered out
      const titles = events.map(e => e.title);
      expect(titles).not.toContain('AI Ethics Discussion');
      
      // Check that non-AI story was filtered out
      expect(titles).not.toContain('Unrelated Tech News');
    });
    
    it('should handle date filtering', async () => {
      const now = Date.now();
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
      
      mockedAxios.get.mockImplementationOnce(() =>
        Promise.resolve({ data: [1, 2] })
      );
      
      // One recent story, one old story
      const mockStories = [
        {
          id: 1,
          title: 'Recent AI News',
          url: 'https://example.com/recent',
          time: Math.floor(oneWeekAgo / 1000) + 86400, // 6 days ago
          score: 100,
          by: 'user1',
          type: 'story',
        },
        {
          id: 2,
          title: 'Old AI News',
          url: 'https://example.com/old',
          time: Math.floor(twoWeeksAgo / 1000), // 14 days ago
          score: 100,
          by: 'user2',
          type: 'story',
        },
      ];
      
      mockStories.forEach(story => {
        mockedAxios.get.mockImplementationOnce(() =>
          Promise.resolve({ data: story })
        );
      });
      
      const options: FetchOptions = {
        startDate: new Date(oneWeekAgo),
        endDate: new Date(),
      };
      
      const events = await collector.fetchEvents(options);
      
      // Should only have the recent story
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Recent AI News');
    });
    
    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API Error'));
      
      await expect(collector.fetchEvents()).rejects.toThrow('API Error');
    });
    
    it('should return empty array when disabled', async () => {
      const disabledCollector = new HackerNewsCollector({ enabled: false });
      
      const events = await disabledCollector.fetchEvents();
      
      expect(events).toEqual([]);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });
  
  describe('AI keyword detection', () => {
    it('should detect various AI-related keywords', async () => {
      mockedAxios.get.mockImplementationOnce(() =>
        Promise.resolve({ data: [1, 2, 3, 4, 5, 6] })
      );
      
      const testCases = [
        { title: 'GPT-4 Performance Analysis', shouldMatch: true },
        { title: 'Machine Learning in Production', shouldMatch: true },
        { title: 'Deep Learning Framework Update', shouldMatch: true },
        { title: 'ChatGPT Plugin Development', shouldMatch: true },
        { title: 'Hugging Face Model Release', shouldMatch: true },
        { title: 'JavaScript Framework Update', shouldMatch: false },
      ];
      
      const mockStories = testCases.map((tc, i) => ({
        id: i + 1,
        title: tc.title,
        url: `https://example.com/${i}`,
        time: Math.floor(Date.now() / 1000),
        score: 100,
        by: `user${i}`,
        type: 'story' as const,
      }));
      
      mockStories.forEach(story => {
        mockedAxios.get.mockImplementationOnce(() =>
          Promise.resolve({ data: story })
        );
      });
      
      const events = await collector.fetchEvents();
      
      const titles = events.map(e => e.title);
      
      testCases.forEach(tc => {
        if (tc.shouldMatch) {
          expect(titles).toContain(tc.title);
        } else {
          expect(titles).not.toContain(tc.title);
        }
      });
    });
  });
});
