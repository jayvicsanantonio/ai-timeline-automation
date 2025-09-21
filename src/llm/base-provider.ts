import { retry } from '../utils/retry';
import {
  LLMBudgetConfig,
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMEmbeddingRequest,
  LLMEmbeddingResult,
  LLMProviderId,
  LLMProviderInit,
  LLMTokens,
} from './types';
import { LLMProvider } from './provider';
import { LLMBudgetExceededError, LLMProviderError } from './errors';

export abstract class BaseLLMProvider implements LLMProvider {
  protected promptTokensConsumed = 0;
  protected completionTokensConsumed = 0;

  protected readonly providerId: LLMProviderId | string;
  protected readonly providerModel: string;
  protected budget: LLMBudgetConfig;
  protected readonly temperature: number;
  protected readonly topP: number;
  protected readonly maxTokens: number;
  protected readonly embeddingsModel: string;
  protected readonly retryConfig = {
    maxAttempts: 3,
    initialDelay: 250,
    maxDelay: 4000,
    factor: 2,
    jitter: 0.2,
  };
  protected readonly timeoutMs: number;

  constructor(protected readonly options: LLMProviderInit) {
    this.providerId = options.providerId;
    this.providerModel = options.model;
    this.temperature = options.temperature;
    this.topP = options.topP;
    this.maxTokens = options.maxTokens;
    this.embeddingsModel = options.embeddingsModel;
    this.timeoutMs = options.timeouts?.requestMs ?? 20000;
    this.budget = options.budget ?? {};

    if (options.retries) {
      this.retryConfig.maxAttempts = options.retries.attempts ?? this.retryConfig.maxAttempts;
      this.retryConfig.initialDelay = options.retries.baseDelayMs ?? this.retryConfig.initialDelay;
      this.retryConfig.maxDelay = options.retries.maxDelayMs ?? this.retryConfig.maxDelay;
    }
  }

  get id(): string {
    return this.providerId;
  }

  get model(): string {
    return this.providerModel;
  }

  updateBudget(budget: LLMBudgetConfig): void {
    this.budget = budget;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
    const execute = async () => {
      const response = await this.doComplete(request);
      if (response.usage) {
        this.applyUsage(response.usage);
      }
      return response;
    };

    try {
      return await retry(execute, {
        maxAttempts: this.retryConfig.maxAttempts,
        initialDelay: this.retryConfig.initialDelay,
        maxDelay: this.retryConfig.maxDelay,
        jitter: this.retryConfig.jitter,
        factor: 2,
      });
    } catch (error) {
      throw new LLMProviderError(
        (error as Error).message,
        this.buildContext(request.correlationId)
      );
    }
  }

  async embed(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResult> {
    const execute = async () => {
      const response = await this.doEmbed(request);
      if (response.usage) {
        this.applyUsage(response.usage);
      }
      return response;
    };

    try {
      return await retry(execute, {
        maxAttempts: this.retryConfig.maxAttempts,
        initialDelay: this.retryConfig.initialDelay,
        maxDelay: this.retryConfig.maxDelay,
        jitter: this.retryConfig.jitter,
        factor: 2,
      });
    } catch (error) {
      throw new LLMProviderError(
        (error as Error).message,
        this.buildContext(request.correlationId)
      );
    }
  }

  supportsEmbeddings(): boolean {
    return true;
  }

  protected applyUsage(usage: LLMTokens): void {
    this.promptTokensConsumed += usage.prompt;
    this.completionTokensConsumed += usage.completion;

    if (
      this.budget.maxPromptTokens !== undefined &&
      this.promptTokensConsumed > this.budget.maxPromptTokens
    ) {
      throw new LLMBudgetExceededError(
        this.providerId,
        'prompt',
        this.budget.maxPromptTokens,
        this.promptTokensConsumed
      );
    }

    if (
      this.budget.maxCompletionTokens !== undefined &&
      this.completionTokensConsumed > this.budget.maxCompletionTokens
    ) {
      throw new LLMBudgetExceededError(
        this.providerId,
        'completion',
        this.budget.maxCompletionTokens,
        this.completionTokensConsumed
      );
    }
  }

  protected buildContext(correlationId?: string): Record<string, unknown> {
    return {
      providerId: this.providerId,
      model: this.providerModel,
      correlationId,
    };
  }

  protected abstract doComplete(
    request: LLMCompletionRequest
  ): Promise<LLMCompletionResult>;

  protected abstract doEmbed(
    request: LLMEmbeddingRequest
  ): Promise<LLMEmbeddingResult>;
}
