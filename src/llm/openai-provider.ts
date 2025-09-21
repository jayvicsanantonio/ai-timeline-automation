import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { BaseLLMProvider } from './base-provider';
import { LLMProviderError } from './errors';
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMEmbeddingRequest,
  LLMEmbeddingResult,
  LLMProviderInit,
  LLMTokens
} from './types';

export class OpenAIChatProvider extends BaseLLMProvider {
  private readonly client: OpenAI;

  constructor(options: LLMProviderInit) {
    super(options);

    if (!options.apiKey) {
      throw new LLMProviderError('OPENAI_API_KEY is required for OpenAI providers', {
        providerId: options.providerId
      });
    }

    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: this.timeoutMs
    });
  }

  supportsEmbeddings(): boolean {
    return true;
  }

  protected async doComplete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
    const messages: ChatCompletionMessageParam[] = request.messages.map((message) => ({
      role: message.role,
      content: message.content
    }));

    const maxTokens = Math.min(request.maxTokens ?? this.maxTokens, this.maxTokens);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: request.temperature ?? this.temperature,
      top_p: request.topP ?? this.topP,
      max_tokens: maxTokens
    });

    const choice = response.choices?.[0];

    if (!choice || !choice.message?.content) {
      throw new LLMProviderError('OpenAI returned an empty response', {
        providerId: this.providerId
      });
    }

    const usage = this.extractUsage(response.usage);

    return {
      providerId: this.providerId,
      text: choice.message.content,
      finishReason: choice.finish_reason ?? 'unknown',
      usage,
      raw: response
    };
  }

  protected async doEmbed(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResult> {
    const input = Array.isArray(request.input) ? request.input : [request.input];

    const response = await this.client.embeddings.create({
      model: request.model ?? this.embeddingsModel,
      input
    });

    const vectors = response.data.map((item) => item.embedding);
    const usage = this.extractUsage(response.usage);

    return {
      providerId: this.providerId,
      vectors,
      usage,
      raw: response
    };
  }

  private extractUsage(usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }): LLMTokens | undefined {
    if (!usage) {
      return undefined;
    }

    return {
      prompt: usage.prompt_tokens ?? 0,
      completion: usage.completion_tokens ?? 0,
      total: usage.total_tokens ?? 0
    };
  }
}
