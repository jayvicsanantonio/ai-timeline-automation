import {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMEmbeddingRequest,
  LLMEmbeddingResult,
  LLMBudgetConfig,
  LLMProviderId,
} from './types';

export interface LLMProvider {
  readonly id: LLMProviderId | string;
  readonly model: string;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResult>;
  embed(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResult>;
  supportsEmbeddings(): boolean;
  updateBudget?(budget: LLMBudgetConfig): void;
}
