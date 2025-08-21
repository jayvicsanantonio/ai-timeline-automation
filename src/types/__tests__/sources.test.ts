/**
 * Tests for news source types and abstract class
 */

import {
  NewsSource,
  NewsSourceConfig,
  NewsSourceConfigSchema,
  NewsSourceName,
  SourceReliability,
  FetchOptions,
  DEFAULT_SOURCE_CONFIGS,
} from '../sources';
import { RawEvent } from '../events';

// Mock implementation for testing
class MockNewsSource extends NewsSource {
  readonly name = NewsSourceName.HACKERNEWS;
  readonly type = 'api' as const;
  readonly priority = 5;
  
  async fetchEvents(options?: FetchOptions): Promise<RawEvent[]> {
    // Mock implementation
    await this.waitForRateLimit();
    this.recordRequest();
    
    const events: RawEvent[] = [
      {
        title: 'Test Event 1',
        date: new Date('2024-01-15'),
        source: this.name,
        url: 'https://example.com/1',
        content: 'Test content 1',
      },
      {
        title: 'Test Event 2',
        date: new Date('2024-01-10'),
        source: this.name,
        url: 'https://example.com/2',
        content: 'Test content 2',
      },
      {
        title: 'Test Event 3',
        date: new Date('2024-01-05'),
        source: this.name,
        url: 'https://example.com/3',
        content: 'Test content 3',
      },
    ];
    
    if (options) {
      return this.filterByDateRange(events, options.startDate, options.endDate);
    }
    
    return events;
  }
}

describe('News Source Types', () => {
  describe('NewsSourceConfig', () => {
    const validConfig: NewsSourceConfig = {
      enabled: true,
      apiKey: 'test-api-key',
      baseUrl: 'https://api.example.com',
      rateLimit: {
        requests: 10,
        windowMs: 60000,
      },
      reliability: SourceReliability.OFFICIAL,
    };

    it('should validate a valid config', () => {
      expect(NewsSourceConfigSchema.parse(validConfig)).toEqual(validConfig);
    });

    it('should accept config without apiKey', () => {
      const { apiKey, ...configWithoutKey } = validConfig;
      expect(NewsSourceConfigSchema.parse(configWithoutKey)).toBeDefined();
    });

    it('should reject invalid URL', () => {
      const invalidConfig = { ...validConfig, baseUrl: 'not-a-url' };
      expect(() => NewsSourceConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject negative rate limits', () => {
      const invalidConfig = {
        ...validConfig,
        rateLimit: { requests: -1, windowMs: 60000 },
      };
      expect(() => NewsSourceConfigSchema.parse(invalidConfig)).toThrow();
    });
  });

  describe('NewsSource Abstract Class', () => {
    let source: MockNewsSource;
    let config: NewsSourceConfig;

    beforeEach(() => {
      config = {
        enabled: true,
        baseUrl: 'https://api.example.com',
        rateLimit: {
          requests: 3,
          windowMs: 1000, // 1 second window
        },
        reliability: SourceReliability.COMMUNITY,
      };
      source = new MockNewsSource(config);
    });

    describe('Basic properties', () => {
      it('should have correct properties', () => {
        expect(source.name).toBe(NewsSourceName.HACKERNEWS);
        expect(source.type).toBe('api');
        expect(source.priority).toBe(5);
      });

      it('should report enabled status', () => {
        expect(source.isEnabled()).toBe(true);
        
        const disabledSource = new MockNewsSource({ ...config, enabled: false });
        expect(disabledSource.isEnabled()).toBe(false);
      });

      it('should return reliability weight', () => {
        expect(source.getReliability()).toBe(SourceReliability.COMMUNITY);
      });
    });

    describe('Date filtering', () => {
      it('should filter events by date range', async () => {
        const options: FetchOptions = {
          startDate: new Date('2024-01-10'),
          endDate: new Date('2024-01-15'),
        };
        
        const events = await source.fetchEvents(options);
        
        expect(events).toHaveLength(2);
        expect(events[0].title).toBe('Test Event 1');
        expect(events[1].title).toBe('Test Event 2');
      });

      it('should return all events without options', async () => {
        const events = await source.fetchEvents();
        expect(events).toHaveLength(3);
      });
    });

    describe('Rate limiting', () => {
      it('should respect rate limits', async () => {
        const startTime = Date.now();
        
        // Make requests up to the limit
        for (let i = 0; i < 3; i++) {
          await source.fetchEvents();
        }
        
        // This should trigger rate limiting
        await source.fetchEvents();
        
        const endTime = Date.now();
        const elapsed = endTime - startTime;
        
        // Should have waited at least some time
        expect(elapsed).toBeGreaterThanOrEqual(100);
      });
    });
  });

  describe('Default Configurations', () => {
    it('should have configurations for all NewsSourceName entries', () => {
      Object.values(NewsSourceName).forEach(sourceName => {
        expect(DEFAULT_SOURCE_CONFIGS[sourceName]).toBeDefined();
        expect(DEFAULT_SOURCE_CONFIGS[sourceName].baseUrl).toBeDefined();
        expect(DEFAULT_SOURCE_CONFIGS[sourceName].reliability).toBeDefined();
      });
    });

    it('should have valid URLs in default configs', () => {
      Object.values(DEFAULT_SOURCE_CONFIGS).forEach(config => {
        if (config.baseUrl) {
          expect(() => new URL(config.baseUrl!)).not.toThrow();
        }
      });
    });

    it('should have appropriate reliability scores', () => {
      expect(DEFAULT_SOURCE_CONFIGS[NewsSourceName.OPENAI]?.reliability)
        .toBe(SourceReliability.OFFICIAL);
      expect(DEFAULT_SOURCE_CONFIGS[NewsSourceName.ARXIV]?.reliability)
        .toBe(SourceReliability.ACADEMIC);
      expect(DEFAULT_SOURCE_CONFIGS[NewsSourceName.THE_VERGE]?.reliability)
        .toBe(SourceReliability.JOURNALISM);
      expect(DEFAULT_SOURCE_CONFIGS[NewsSourceName.HACKERNEWS]?.reliability)
        .toBe(SourceReliability.COMMUNITY);
    });
  });

  describe('Source Reliability', () => {
    it('should have correct weight values', () => {
      expect(SourceReliability.OFFICIAL).toBe(1.0);
      expect(SourceReliability.ACADEMIC).toBe(0.9);
      expect(SourceReliability.JOURNALISM).toBe(0.7);
      expect(SourceReliability.COMMUNITY).toBe(0.6);
    });

    it('should order sources by reliability', () => {
      const reliabilities = [
        SourceReliability.COMMUNITY,
        SourceReliability.OFFICIAL,
        SourceReliability.JOURNALISM,
        SourceReliability.ACADEMIC,
      ];
      
      reliabilities.sort((a, b) => b - a);
      
      expect(reliabilities).toEqual([
        SourceReliability.OFFICIAL,
        SourceReliability.ACADEMIC,
        SourceReliability.JOURNALISM,
        SourceReliability.COMMUNITY,
      ]);
    });
  });
});
