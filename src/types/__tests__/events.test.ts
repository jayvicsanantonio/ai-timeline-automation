/**
 * Tests for event type definitions and utilities
 */

import {
  RawEvent,
  AnalyzedEvent,
  TimelineEntry,
  RawEventSchema,
  AnalyzedEventSchema,
  TimelineEntrySchema,
  isRawEvent,
  isAnalyzedEvent,
  isTimelineEntry,
  toTimelineEntry,
  generateEventId,
} from '../events';

describe('Event Types', () => {
  describe('RawEvent', () => {
    const validRawEvent: RawEvent = {
      title: 'OpenAI Releases GPT-5',
      date: new Date('2024-01-15'),
      source: 'OpenAI Blog',
      url: 'https://openai.com/blog/gpt-5',
      content: 'OpenAI announced the release of GPT-5...',
      metadata: { author: 'Sam Altman' },
    };

    it('should validate a valid RawEvent', () => {
      expect(RawEventSchema.parse(validRawEvent)).toEqual(validRawEvent);
      expect(isRawEvent(validRawEvent)).toBe(true);
    });

    it('should reject invalid RawEvent', () => {
      const invalidEvent = { ...validRawEvent, url: 'not-a-url' };
      expect(() => RawEventSchema.parse(invalidEvent)).toThrow();
      expect(isRawEvent(invalidEvent)).toBe(false);
    });

    it('should accept RawEvent without metadata', () => {
      const { metadata, ...eventWithoutMetadata } = validRawEvent;
      expect(isRawEvent(eventWithoutMetadata)).toBe(true);
    });
  });

  describe('AnalyzedEvent', () => {
    const validAnalyzedEvent: AnalyzedEvent = {
      id: '2024-01-15-openai-releases-gpt-5',
      title: 'OpenAI Releases GPT-5',
      date: '2024-01-15T00:00:00Z',
      description: 'OpenAI announced the release of GPT-5, a major advancement...',
      category: 'product',
      sources: ['https://openai.com/blog/gpt-5'],
      impactScore: 9.5,
      significance: {
        technologicalBreakthrough: 9,
        industryImpact: 10,
        adoptionScale: 9,
        novelty: 9,
      },
    };

    it('should validate a valid AnalyzedEvent', () => {
      expect(AnalyzedEventSchema.parse(validAnalyzedEvent)).toEqual(validAnalyzedEvent);
      expect(isAnalyzedEvent(validAnalyzedEvent)).toBe(true);
    });

    it('should reject invalid category', () => {
      const invalidEvent = { ...validAnalyzedEvent, category: 'invalid' };
      expect(() => AnalyzedEventSchema.parse(invalidEvent)).toThrow();
      expect(isAnalyzedEvent(invalidEvent)).toBe(false);
    });

    it('should reject invalid ID format', () => {
      const invalidEvent = { ...validAnalyzedEvent, id: 'invalid-id' };
      expect(() => AnalyzedEventSchema.parse(invalidEvent)).toThrow();
      expect(isAnalyzedEvent(invalidEvent)).toBe(false);
    });

    it('should reject scores outside 0-10 range', () => {
      const invalidEvent = {
        ...validAnalyzedEvent,
        impactScore: 11,
      };
      expect(() => AnalyzedEventSchema.parse(invalidEvent)).toThrow();
      expect(isAnalyzedEvent(invalidEvent)).toBe(false);
    });
  });

  describe('TimelineEntry', () => {
    const validTimelineEntry: TimelineEntry = {
      id: '2024-01-15-openai-releases-gpt-5',
      date: '2024-01-15T00:00:00Z',
      title: 'OpenAI Releases GPT-5',
      description: 'OpenAI announced the release of GPT-5...',
      category: 'product',
      sources: ['https://openai.com/blog/gpt-5'],
      impact_score: 9.5,
    };

    it('should validate a valid TimelineEntry', () => {
      expect(TimelineEntrySchema.parse(validTimelineEntry)).toEqual(validTimelineEntry);
      expect(isTimelineEntry(validTimelineEntry)).toBe(true);
    });

    it('should use snake_case for impact_score', () => {
      const entry = { ...validTimelineEntry, impactScore: 9.5 };
      delete (entry as any).impact_score;
      expect(isTimelineEntry(entry)).toBe(false);
    });
  });

  describe('Conversion Utilities', () => {
    describe('toTimelineEntry', () => {
      it('should convert AnalyzedEvent to TimelineEntry', () => {
        const analyzedEvent: AnalyzedEvent = {
          id: '2024-01-15-test-event',
          title: 'Test Event',
          date: '2024-01-15T00:00:00Z',
          description: 'Test description',
          category: 'research',
          sources: ['https://example.com'],
          impactScore: 8.5,
          significance: {
            technologicalBreakthrough: 8,
            industryImpact: 9,
            adoptionScale: 8,
            novelty: 9,
          },
        };

        const timelineEntry = toTimelineEntry(analyzedEvent);
        
        expect(timelineEntry).toEqual({
          id: analyzedEvent.id,
          date: analyzedEvent.date,
          title: analyzedEvent.title,
          description: analyzedEvent.description,
          category: analyzedEvent.category,
          sources: analyzedEvent.sources,
          impact_score: analyzedEvent.impactScore,
        });
        
        expect(isTimelineEntry(timelineEntry)).toBe(true);
      });
    });

    describe('generateEventId', () => {
      it('should generate valid event ID from date and title', () => {
        const date = new Date('2024-01-15');
        const title = 'OpenAI Releases GPT-5: A Major Breakthrough!';
        
        const id = generateEventId(date, title);
        
        expect(id).toBe('2024-01-15-openai-releases-gpt-5-a-major-breakthrough');
        expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
      });

      it('should handle special characters in title', () => {
        const date = new Date('2024-01-15');
        const title = 'AI & ML: What\'s Next? (2024 Edition)';
        
        const id = generateEventId(date, title);
        
        expect(id).toBe('2024-01-15-ai-ml-what-s-next-2024-edition');
      });

      it('should truncate long titles', () => {
        const date = new Date('2024-01-15');
        const title = 'A'.repeat(100); // Very long title
        
        const id = generateEventId(date, title);
        
        expect(id.length).toBeLessThanOrEqual(61); // 10 for date + 1 for dash + 50 for slug
      });
    });
  });
});
