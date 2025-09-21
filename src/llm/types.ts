export type LLMProviderId =
  | 'openai_gpt5_low'
  | 'openai_gpt4o_mini'
  | 'local_gguf_small';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface LLMCompletionResult {
  providerId: LLMProviderId | string;
  text: string;
  finishReason: string;
  usage?: LLMTokens;
  raw?: unknown;
}

export interface LLMEmbeddingRequest {
  input: string | string[];
  correlationId?: string;
  model?: string;
}

export interface LLMEmbeddingResult {
  providerId: LLMProviderId | string;
  vectors: number[][];
  usage?: LLMTokens;
  raw?: unknown;
}

export interface LLMTokens {
  prompt: number;
  completion: number;
  total: number;
}

export interface LLMBudgetConfig {
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
}

export interface LLMRetryConfig {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface LLMTimeoutConfig {
  requestMs: number;
}

export interface LLMProviderInit {
  providerId: LLMProviderId | string;
  apiKey?: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  embeddingsModel: string;
  budget?: LLMBudgetConfig;
  retries?: Partial<LLMRetryConfig>;
  timeouts?: Partial<LLMTimeoutConfig>;
}
