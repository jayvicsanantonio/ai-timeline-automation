/**
 * Unit tests for EventAnalyzer
 */

import { EventAnalyzer } from '../event-analyzer';
import { RawEvent, AnalyzedEvent } from '../../types';
import { generateObject } from 'ai';

// Mock the AI SDK
jest.mock('ai', () => ({
  generateObject: jest.fn(),
  generateText: jest.fn()
}));

jest.mock('@ai-sdk/openai', () => ({
  openai: jest.fn(() => 'mocked-model')
}));

describe('EventAnalyzer', () => {
  let analyzer: EventAnalyzer;
  const mockGenerateObject = generateObject as jest.MockedFunction<typeof generateObject>;

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new EventAnalyzer({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxRetries: 2,
      significanceThreshold: 7.0,
      maxEventsToSelect: 3
    });
  });

  describe('analyzeEvents', () => {
    it('should analyze multiple events successfully', async () => {
      const rawEvents: RawEvent[] = [
        {
          title: 'OpenAI Releases GPT-5',
          date: new Date('2024-01-15'),
          source: 'OpenAI Blog',
          url: 'https://openai.com/blog/gpt-5',
          content: 'OpenAI announces GPT-5 with breakthrough capabilities...',
          metadata: { category: 'product' }
        },
        {
          title: 'DeepMind Solves Protein Folding',
          date: new Date('2024-01-14'),
          source: 'Nature',
          url: 'https://nature.com/articles/deepmind',
          content: 'DeepMind achieves new milestone in protein structure prediction...',
          metadata: { category: 'research' }
        }
      ];

      // Mock AI responses
      mockGenerateObject
        .mockResolvedValueOnce({
          object: {
            title: 'OpenAI Unveils GPT-5: Major Leap in AI Capabilities',
            description: 'OpenAI releases GPT-5, featuring unprecedented language understanding and reasoning abilities',
            category: 'product',
            significance: {
              technologicalBreakthrough: 9.5,
              industryImpact: 9.0,
              adoptionScale: 8.5,
              novelty: 8.0
            },
            keyInsights: ['Revolutionary architecture', 'Improved reasoning'],
            relatedTopics: ['LLMs', 'AGI', 'Transformers']
          }
        } as any)
        .mockResolvedValueOnce({
          object: {
            title: 'DeepMind Achieves Protein Folding Breakthrough',
            description: 'DeepMind solves long-standing protein folding challenge with new AI model',
            category: 'research',
            significance: {
              technologicalBreakthrough: 9.0,
              industryImpact: 8.0,
              adoptionScale: 7.5,
              novelty: 9.0
            },
            keyInsights: ['Medical applications', 'Drug discovery'],
            relatedTopics: ['AlphaFold', 'Bioinformatics', 'Drug Discovery']
          }
        } as any);

      const results = await analyzer.analyzeEvents(rawEvents);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('OpenAI Unveils GPT-5: Major Leap in AI Capabilities');
      expect(results[0].category).toBe('product');
      expect(results[0].impactScore).toBeCloseTo(8.8, 1);
      expect(results[1].title).toBe('DeepMind Achieves Protein Folding Breakthrough');
      expect(results[1].category).toBe('research');
      expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    });

    it('should handle failed analyses gracefully', async () => {
      const rawEvents: RawEvent[] = [
        {
          title: 'Test Event 1',
          date: new Date('2024-01-15'),
          source: 'Test Source',
          url: 'https://example.com',
          content: 'Test content'
        },
        {
          title: 'Test Event 2',
          date: new Date('2024-01-14'),
          source: 'Test Source',
          url: 'https://example.com',
          content: 'Test content'
        }
      ];

      // First event fails, second succeeds
      mockGenerateObject
        .mockRejectedValueOnce(new Error('AI service error'))
        .mockRejectedValueOnce(new Error('AI service error')) // Retry also fails
        .mockResolvedValueOnce({
          object: {
            title: 'Successful Analysis',
            description: 'This event was successfully analyzed',
            category: 'industry',
            significance: {
              technologicalBreakthrough: 7.0,
              industryImpact: 7.0,
              adoptionScale: 7.0,
              novelty: 7.0
            },
            keyInsights: ['Test insight'],
            relatedTopics: ['Test topic']
          }
        } as any);

      const results = await analyzer.analyzeEvents(rawEvents);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Successful Analysis');
    });

    it('should process events in batches', async () => {
      // Create 12 events to test batching (batch size is 5)
      const rawEvents: RawEvent[] = Array.from({ length: 12 }, (_, i) => ({
        title: `Event ${i + 1}`,
        date: new Date('2024-01-15'),
        source: 'Test Source',
        url: `https://example.com/${i}`,
        content: `Content for event ${i + 1}`
      }));

      // Mock all responses
      for (let i = 0; i < 12; i++) {
        mockGenerateObject.mockResolvedValueOnce({
          object: {
            title: `Analyzed Event ${i + 1}`,
            description: `Description for event ${i + 1}`,
            category: 'product',
            significance: {
              technologicalBreakthrough: 7.0,
              industryImpact: 7.0,
              adoptionScale: 7.0,
              novelty: 7.0
            },
            keyInsights: ['Insight'],
            relatedTopics: ['Topic']
          }
        } as any);
      }

      const results = await analyzer.analyzeEvents(rawEvents);

      expect(results).toHaveLength(12);
      expect(mockGenerateObject).toHaveBeenCalledTimes(12);
      
      // Verify events are processed in correct order
      results.forEach((result, i) => {
        expect(result.title).toBe(`Analyzed Event ${i + 1}`);
      });
    });
  });

  describe('selectTopEvents', () => {
    it('should select top N events by impact score', async () => {
      const analyzedEvents: AnalyzedEvent[] = [
        createMockAnalyzedEvent('Event 1', 9.5),
        createMockAnalyzedEvent('Event 2', 7.5),
        createMockAnalyzedEvent('Event 3', 8.0),
        createMockAnalyzedEvent('Event 4', 6.0), // Below threshold
        createMockAnalyzedEvent('Event 5', 9.0),
        createMockAnalyzedEvent('Event 6', 7.8)
      ];

      const selected = await analyzer.selectTopEvents(analyzedEvents);

      expect(selected).toHaveLength(3);
      expect(selected[0].title).toBe('Event 1');
      expect(selected[0].impactScore).toBe(9.5);
      expect(selected[1].title).toBe('Event 5');
      expect(selected[1].impactScore).toBe(9.0);
      expect(selected[2].title).toBe('Event 3');
      expect(selected[2].impactScore).toBe(8.0);
    });

    it('should filter by significance threshold', async () => {
      const analyzedEvents: AnalyzedEvent[] = [
        createMockAnalyzedEvent('Event 1', 6.5),
        createMockAnalyzedEvent('Event 2', 6.0),
        createMockAnalyzedEvent('Event 3', 5.5)
      ];

      const selected = await analyzer.selectTopEvents(analyzedEvents);

      expect(selected).toHaveLength(0); // All below threshold of 7.0
    });

    it('should handle fewer events than max selection', async () => {
      const analyzedEvents: AnalyzedEvent[] = [
        createMockAnalyzedEvent('Event 1', 8.0),
        createMockAnalyzedEvent('Event 2', 7.5)
      ];

      const selected = await analyzer.selectTopEvents(analyzedEvents);

      expect(selected).toHaveLength(2);
      expect(selected[0].title).toBe('Event 1');
      expect(selected[1].title).toBe('Event 2');
    });

    it('should use date as tiebreaker for equal scores', async () => {
      const analyzedEvents: AnalyzedEvent[] = [
        {
          ...createMockAnalyzedEvent('Event 1', 8.0),
          date: '2024-01-10T00:00:00Z'
        },
        {
          ...createMockAnalyzedEvent('Event 2', 8.0),
          date: '2024-01-15T00:00:00Z'
        },
        {
          ...createMockAnalyzedEvent('Event 3', 8.0),
          date: '2024-01-12T00:00:00Z'
        }
      ];

      const selected = await analyzer.selectTopEvents(analyzedEvents);

      expect(selected).toHaveLength(3);
      expect(selected[0].title).toBe('Event 2'); // Most recent
      expect(selected[1].title).toBe('Event 3');
      expect(selected[2].title).toBe('Event 1'); // Oldest
    });
  });

  describe('generateEventsSummary', () => {
    it('should generate summary for selected events', () => {
      const events: AnalyzedEvent[] = [
        {
          ...createMockAnalyzedEvent('GPT-5 Released', 9.5),
          date: '2024-01-15T00:00:00Z',
          category: 'product',
          description: 'OpenAI releases GPT-5 with groundbreaking capabilities in reasoning and understanding.',
          sources: ['https://openai.com/blog/gpt-5']
        },
        {
          ...createMockAnalyzedEvent('New AI Regulation', 8.0),
          date: '2024-01-14T00:00:00Z',
          category: 'regulation',
          description: 'EU passes comprehensive AI Act regulating AI systems.',
          sources: ['https://eu.int/ai-act']
        }
      ];

      const summary = analyzer.generateEventsSummary(events);

      expect(summary).toContain('Weekly AI Timeline Update');
      expect(summary).toContain('2 significant AI developments');
      expect(summary).toContain('GPT-5 Released');
      expect(summary).toContain('Impact Score: 9.5/10');
      expect(summary).toContain('New AI Regulation');
      expect(summary).toContain('Impact Score: 8/10');
      expect(summary).toContain('Significance Metrics');
    });

    it('should handle empty event list', () => {
      const summary = analyzer.generateEventsSummary([]);
      expect(summary).toBe('No significant events found this week.');
    });

    it('should handle single event', () => {
      const events: AnalyzedEvent[] = [
        createMockAnalyzedEvent('Single Event', 8.0)
      ];

      const summary = analyzer.generateEventsSummary(events);
      
      expect(summary).toContain('1 significant AI development from this week');
      expect(summary).not.toContain('developments'); // Singular form
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'A'.repeat(250);
      const events: AnalyzedEvent[] = [
        {
          ...createMockAnalyzedEvent('Event with Long Description', 8.0),
          description: longDescription
        }
      ];

      const summary = analyzer.generateEventsSummary(events);
      
      expect(summary).toContain('A'.repeat(200) + '...');
      expect(summary).not.toContain('A'.repeat(201));
    });
  });

  describe('impact score calculation', () => {
    it('should calculate weighted impact score correctly', () => {
      // Create analyzer instance to access private method through public interface
      const testAnalyzer = new EventAnalyzer();
      
      // We'll test this indirectly through a successful analysis
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: 'Test Event',
          description: 'Test description',
          category: 'product',
          significance: {
            technologicalBreakthrough: 10.0,  // 0.35 weight
            industryImpact: 8.0,              // 0.30 weight
            adoptionScale: 6.0,               // 0.20 weight
            novelty: 4.0                      // 0.15 weight
          },
          keyInsights: [],
          relatedTopics: []
        }
      } as any);

      const event: RawEvent = {
        title: 'Test',
        date: new Date(),
        source: 'Test',
        url: 'https://test.com',
        content: 'Test'
      };

      return testAnalyzer.analyzeEvents([event]).then(results => {
        // Expected: (10 * 0.35) + (8 * 0.30) + (6 * 0.20) + (4 * 0.15) = 7.7
        expect(results[0].impactScore).toBeCloseTo(7.7, 1);
      });
    });
  });

  describe('event ID generation', () => {
    it('should generate consistent IDs', async () => {
      const event: RawEvent = {
        title: 'Test Event With Special Characters!@#',
        date: new Date('2024-01-15'),
        source: 'Test',
        url: 'https://test.com',
        content: 'Test'
      };

      mockGenerateObject.mockResolvedValueOnce({
        object: {
          title: 'Analyzed Title',
          description: 'Description',
          category: 'product',
          significance: {
            technologicalBreakthrough: 7.0,
            industryImpact: 7.0,
            adoptionScale: 7.0,
            novelty: 7.0
          },
          keyInsights: [],
          relatedTopics: []
        }
      } as any);

      const results = await analyzer.analyzeEvents([event]);
      
      expect(results[0].id).toMatch(/^2024-01-15-[a-z0-9-]+$/);
      expect(results[0].id).toBe('2024-01-15-test-event-with-special-charac');
    });
  });
});

// Helper function to create mock analyzed events
function createMockAnalyzedEvent(title: string, impactScore: number): AnalyzedEvent {
  return {
    id: `event-${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    date: new Date().toISOString(),
    description: `Description for ${title}`,
    category: 'product',
    sources: [],
    url: 'https://example.com',
    impactScore,
    significance: {
      technologicalBreakthrough: impactScore,
      industryImpact: impactScore,
      adoptionScale: impactScore,
      novelty: impactScore
    }
  };
}
