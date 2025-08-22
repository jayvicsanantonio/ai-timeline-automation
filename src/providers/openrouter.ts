/**
 * OpenRouter provider for Vercel AI SDK
 * Supports using OpenRouter API as an alternative to OpenAI
 */

import { createOpenAI } from '@ai-sdk/openai';

/**
 * Create an OpenRouter provider instance
 * @param apiKey - OpenRouter API key
 * @param options - Additional options
 */
export function createOpenRouter(apiKey: string, options?: {
  siteUrl?: string;
  siteName?: string;
}) {
  return createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': options?.siteUrl || 'https://github.com/jayvicsanantonio/ai-timeline-automation',
      'X-Title': options?.siteName || 'AI Timeline Automation',
    }
  });
}

/**
 * Get OpenRouter model with proper formatting
 * OpenRouter models need to be prefixed with the provider
 */
export function getOpenRouterModel(model: string) {
  // If model already has a provider prefix, return as-is
  if (model.includes('/')) {
    return model;
  }
  // Default to OpenAI provider if no prefix
  return `openai/${model}`;
}

/**
 * List of recommended free models on OpenRouter
 */
export const FREE_MODELS = {
  KIMI_K2: 'moonshotai/kimi-k2:free',
  LLAMA_3_8B: 'meta-llama/llama-3-8b-instruct:free',
  MISTRAL_7B: 'mistralai/mistral-7b-instruct:free',
  QWEN_7B: 'qwen/qwen-2-7b-instruct:free',
  GEMMA_7B: 'google/gemma-7b-it:free',
  PHI_3_MINI: 'microsoft/phi-3-mini-128k-instruct:free',
  PHI_3_MEDIUM: 'microsoft/phi-3-medium-128k-instruct:free',
  NOUS_CAPYBARA_7B: 'nousresearch/nous-capybara-7b:free',
  MYTHOMIST_7B: 'gryphe/mythomist-7b:free',
  TOPPY_M_7B: 'undi95/toppy-m-7b:free',
} as const;

/**
 * Configuration for OpenRouter models
 */
export interface OpenRouterModelConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  minP?: number;
  topA?: number;
  seed?: number;
  maxRetries?: number;
  streamUsage?: boolean;
}
