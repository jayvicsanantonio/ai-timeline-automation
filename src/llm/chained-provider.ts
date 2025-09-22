import { LLMProviderAggregateError } from './errors';
import type { LLMProvider } from './provider';
import type {
  LLMBudgetConfig,
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMEmbeddingRequest,
  LLMEmbeddingResult
} from './types';

export class ChainedLLMProvider implements LLMProvider {
  readonly id: string;
  readonly model: string;

  constructor(private readonly providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error('ChainedLLMProvider requires at least one provider');
    }

    this.id = providers[0].id;
    this.model = providers[0].model;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
    const errors: Error[] = [];

    for (const provider of this.providers) {
      try {
        return await provider.complete(request);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    throw new LLMProviderAggregateError('All LLM providers in the fallback chain failed', errors);
  }

  async embed(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResult> {
    const errors: Error[] = [];

    for (const provider of this.providers) {
      if (!provider.supportsEmbeddings()) {
        continue;
      }

      try {
        return await provider.embed(request);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    throw new LLMProviderAggregateError(
      'No provider in the fallback chain could produce embeddings',
      errors
    );
  }

  supportsEmbeddings(): boolean {
    return this.providers.some((provider) => provider.supportsEmbeddings());
  }

  updateBudget(budget: LLMBudgetConfig): void {
    for (const provider of this.providers) {
      if (typeof provider.updateBudget === 'function') {
        provider.updateBudget(budget);
      }
    }
  }
}
