/**
 * Unit tests for TimelineReader
 */

import { Octokit } from '@octokit/rest';
import type { TimelineEntry } from '../../types';
import { TimelineReader } from '../timeline-reader';

// Mock Octokit
jest.mock('@octokit/rest');

describe('TimelineReader', () => {
  let reader: TimelineReader;
  let mockOctokit: {
    repos: {
      getContent: jest.MockedFunction<any>;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockOctokit = {
      repos: {
        getContent: jest.fn(),
        getBranch: jest.fn()
      }
    };

    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit as unknown);

    reader = new TimelineReader({
      owner: 'test-owner',
      repo: 'test-repo',
      filePath: 'data/timeline-events.json',
      branch: 'main',
      token: 'test-token'
    });
  });

  describe('fetchTimeline', () => {
    it('should fetch and parse timeline successfully', async () => {
      const mockEvents: TimelineEntry[] = [
        {
          id: '2024-01-15-test-event',
          date: '2024-01-15T00:00:00Z',
          title: 'Test Event',
          description: 'Test description',
          category: 'product',
          sources: ['https://example.com'],
          impact_score: 8.5
        }
      ];

      const mockContent = {
        lastUpdated: '2024-01-15T00:00:00Z',
        totalEntries: 1,
        entries: mockEvents
      };

      mockOctokit.repos.getContent.mockResolvedValueOnce({
        data: {
          type: 'file',
          content: Buffer.from(JSON.stringify(mockContent, null, 2)).toString('base64'),
          sha: 'mock-sha-123'
        }
      });

      const result = await reader.fetchTimeline();

      expect(result.events).toEqual(mockEvents);
      expect(result.sha).toBe('mock-sha-123');
      expect(JSON.parse(result.content)).toEqual(mockContent);
      expect(mockOctokit.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'data/timeline-events.json',
        ref: 'main'
      });
    });

    it('should handle file not found (404) gracefully', async () => {
      mockOctokit.repos.getContent.mockRejectedValueOnce({ status: 404 });

      const result = await reader.fetchTimeline();

      expect(result.events).toEqual([]);
      expect(result.sha).toBe('');
      expect(JSON.parse(result.content)).toEqual({
        lastUpdated: expect.any(String),
        totalEntries: 0,
        entries: []
      });
    });

    it('should handle new structure format', async () => {
      const mockEvents: TimelineEntry[] = [
        {
          id: '2024-01-15-test-event',
          date: '2024-01-15T00:00:00Z',
          title: 'Test Event',
          description: 'Test description',
          category: 'research',
          sources: ['https://example.com'],
          impact_score: 7.0
        }
      ];

      const mockContent = {
        lastUpdated: '2024-01-15T00:00:00Z',
        totalEntries: 1,
        entries: mockEvents
      };

      mockOctokit.repos.getContent.mockResolvedValueOnce({
        data: {
          type: 'file',
          content: Buffer.from(JSON.stringify(mockContent)).toString('base64'),
          sha: 'mock-sha-456'
        }
      });

      const result = await reader.fetchTimeline();

      expect(result.events).toEqual(mockEvents);
      expect(result.sha).toBe('mock-sha-456');
    });

    it('should throw error for directory response', async () => {
      mockOctokit.repos.getContent.mockResolvedValueOnce({
        data: [{ type: 'dir' }]
      });

      await expect(reader.fetchTimeline()).rejects.toThrow('Expected a file but got a directory');
    });

    it('should throw error for non-404 errors', async () => {
      mockOctokit.repos.getContent.mockRejectedValueOnce(new Error('Network error'));

      await expect(reader.fetchTimeline()).rejects.toThrow(
        'Failed to fetch timeline: Network error'
      );
    });
  });

  describe('eventExists', () => {
    it('should return true if event exists', () => {
      const events: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-15T00:00:00Z',
          title: 'Event 1',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        }
      ];

      expect(reader.eventExists('event-1', events)).toBe(true);
    });

    it('should return false if event does not exist', () => {
      const events: TimelineEntry[] = [];
      expect(reader.eventExists('event-1', events)).toBe(false);
    });
  });

  describe('filterNewEvents', () => {
    it('should filter out existing events', () => {
      const newEvents: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-15T00:00:00Z',
          title: 'Event 1',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        },
        {
          id: 'event-2',
          date: '2024-01-16T00:00:00Z',
          title: 'Event 2',
          description: 'Description',
          category: 'research',
          sources: [],
          impact_score: 7.5
        }
      ];

      const existingEvents: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-15T00:00:00Z',
          title: 'Event 1',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        }
      ];

      const filtered = reader.filterNewEvents(newEvents, existingEvents);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('event-2');
    });
  });

  describe('getEventsInRange', () => {
    it('should return events within date range', () => {
      const events: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-10T00:00:00Z',
          title: 'Event 1',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        },
        {
          id: 'event-2',
          date: '2024-01-15T00:00:00Z',
          title: 'Event 2',
          description: 'Description',
          category: 'research',
          sources: [],
          impact_score: 7.5
        },
        {
          id: 'event-3',
          date: '2024-01-20T00:00:00Z',
          title: 'Event 3',
          description: 'Description',
          category: 'industry',
          sources: [],
          impact_score: 9.0
        }
      ];

      const startDate = new Date('2024-01-12');
      const endDate = new Date('2024-01-18');
      const filtered = reader.getEventsInRange(events, startDate, endDate);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('event-2');
    });
  });

  describe('getRecentEvents', () => {
    it('should return most recent events', () => {
      const events: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-10T00:00:00Z',
          title: 'Event 1',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        },
        {
          id: 'event-2',
          date: '2024-01-20T00:00:00Z',
          title: 'Event 2',
          description: 'Description',
          category: 'research',
          sources: [],
          impact_score: 7.5
        },
        {
          id: 'event-3',
          date: '2024-01-15T00:00:00Z',
          title: 'Event 3',
          description: 'Description',
          category: 'industry',
          sources: [],
          impact_score: 9.0
        }
      ];

      const recent = reader.getRecentEvents(events, 2);

      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('event-2');
      expect(recent[1].id).toBe('event-3');
    });
  });

  describe('getEventsByCategory', () => {
    it('should return events by category', () => {
      const events: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-10T00:00:00Z',
          title: 'Event 1',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        },
        {
          id: 'event-2',
          date: '2024-01-15T00:00:00Z',
          title: 'Event 2',
          description: 'Description',
          category: 'research',
          sources: [],
          impact_score: 7.5
        },
        {
          id: 'event-3',
          date: '2024-01-20T00:00:00Z',
          title: 'Event 3',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 9.0
        }
      ];

      const productEvents = reader.getEventsByCategory(events, 'product');

      expect(productEvents).toHaveLength(2);
      expect(productEvents[0].id).toBe('event-1');
      expect(productEvents[1].id).toBe('event-3');
    });
  });

  describe('getTimelineStats', () => {
    it('should calculate timeline statistics', () => {
      const events: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-10T00:00:00Z',
          title: 'Event 1',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        },
        {
          id: 'event-2',
          date: '2024-01-15T00:00:00Z',
          title: 'Event 2',
          description: 'Description',
          category: 'research',
          sources: [],
          impact_score: 7.0
        },
        {
          id: 'event-3',
          date: '2024-01-20T00:00:00Z',
          title: 'Event 3',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 9.0
        }
      ];

      const stats = reader.getTimelineStats(events);

      expect(stats.totalEvents).toBe(3);
      expect(stats.byCategory).toEqual({
        product: 2,
        research: 1
      });
      expect(stats.averageImpactScore).toBe(8.0);
      expect(stats.dateRange.earliest).toBe('2024-01-10T00:00:00Z');
      expect(stats.dateRange.latest).toBe('2024-01-20T00:00:00Z');
    });

    it('should handle empty events array', () => {
      const stats = reader.getTimelineStats([]);

      expect(stats.totalEvents).toBe(0);
      expect(stats.byCategory).toEqual({});
      expect(stats.averageImpactScore).toBe(0);
      expect(stats.dateRange.earliest).toBeNull();
      expect(stats.dateRange.latest).toBeNull();
    });
  });

  describe('validateNewEvents', () => {
    it('should detect ID conflicts', () => {
      const newEvents: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-15T00:00:00Z',
          title: 'New Event',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        }
      ];

      const existingEvents: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-10T00:00:00Z',
          title: 'Existing Event',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 7.0
        }
      ];

      const validation = reader.validateNewEvents(newEvents, existingEvents);

      expect(validation.valid).toBe(false);
      expect(validation.conflicts).toContain('Event ID already exists: event-1');
    });

    it('should warn about similar events on same date', () => {
      const newEvents: TimelineEntry[] = [
        {
          id: 'event-2',
          date: '2024-01-15T00:00:00Z',
          title: 'OpenAI Releases GPT-5',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 9.0
        }
      ];

      const existingEvents: TimelineEntry[] = [
        {
          id: 'event-1',
          date: '2024-01-15T00:00:00Z',
          title: 'OpenAI Releases GPT-5',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 9.0
        }
      ];

      const validation = reader.validateNewEvents(newEvents, existingEvents);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('Potential duplicate');
    });

    it('should warn about future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const newEvents: TimelineEntry[] = [
        {
          id: 'event-1',
          date: futureDate.toISOString(),
          title: 'Future Event',
          description: 'Description',
          category: 'product',
          sources: [],
          impact_score: 8.0
        }
      ];

      const validation = reader.validateNewEvents(newEvents, []);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('has a future date');
    });
  });
});
