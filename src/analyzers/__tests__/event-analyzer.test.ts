import type { LLMProvider } from '../../llm/provider';
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMEmbeddingRequest,
  LLMEmbeddingResult
} from '../../llm/types';
import type { RawEvent } from '../../types';
import { EventAnalyzer } from '../event-analyzer';

describe('EventAnalyzer sanitization', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.GIT_TOKEN = 'test-token';
    process.env.TIMELINE_REPO = 'owner/repo';
  });

  it('removes prompt artifacts while preserving summary content', async () => {
    const provider = createStubProvider({
      title:
        'Event briefing for analysis: Title: Breakthrough in AI Chips. Return the JSON object now.',
      description: `Event briefing for analysis:\nFull content:\nQuantum AI leaps forward with modular hardware integrations.\nReturn the JSON object now.`
    });

    const analyzer = new EventAnalyzer({}, { llmProvider: provider });

    const event: RawEvent = {
      title: 'Original Event Title',
      date: new Date('2024-05-17T00:00:00Z'),
      source: 'Test Source',
      url: 'https://example.com/event',
      content: 'Original article body content.',
      metadata: {}
    };

    const [analyzed] = await analyzer.analyzeEvents([event]);

    expect(analyzed.title).toBe('Breakthrough in AI Chips.');
    expect(analyzed.description).toBe(
      'Quantum AI leaps forward with modular hardware integrations.'
    );
    expect(analyzed.description).not.toMatch(/Return the JSON object now/i);
  });

  it('falls back to source data when analysis output is only prompt text', async () => {
    const provider = createStubProvider({
      title: 'Event briefing for analysis:',
      description: 'Return the JSON object now.'
    });

    const analyzer = new EventAnalyzer({}, { llmProvider: provider });

    const event: RawEvent = {
      title: 'Fallback Title From Source',
      date: new Date('2024-01-05T00:00:00Z'),
      source: 'Test Source',
      url: 'https://example.com/source',
      content: 'First paragraph with the essential summary.\n\nSecond paragraph with details.',
      metadata: {}
    };

    const [analyzed] = await analyzer.analyzeEvents([event]);

    expect(analyzed.title).toBe('Fallback Title From Source');
    expect(analyzed.description).toBe('First paragraph with the essential summary.');
  });
});

type StubAnalysis = {
  title: string;
  description: string;
};

function createStubProvider(result: StubAnalysis): LLMProvider {
  return {
    id: 'stub-provider',
    model: 'stub-model',
    supportsEmbeddings(): boolean {
      return false;
    },
    async complete(_request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      return {
        providerId: 'stub-provider',
        text: JSON.stringify({
          title: result.title,
          description: result.description,
          category: 'research',
          significance: {
            technologicalBreakthrough: 8,
            industryImpact: 7,
            adoptionScale: 6,
            novelty: 7
          },
          keyInsights: ['Insight 1', 'Insight 2'],
          relatedTopics: ['ai', 'chips']
        }),
        finishReason: 'stop',
        usage: { prompt: 0, completion: 0, total: 0 }
      };
    },
    async embed(_request: LLMEmbeddingRequest): Promise<LLMEmbeddingResult> {
      return {
        providerId: 'stub-provider',
        vectors: [],
        usage: { prompt: 0, completion: 0, total: 0 }
      };
    }
  };
}
