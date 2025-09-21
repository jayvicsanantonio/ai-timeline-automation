import { OpenAIChatProvider } from './openai-provider';
import type { LLMProviderInit } from './types';

const GPT4O_MINI_MODEL_ID = 'gpt-4o-mini';

export class OpenAIGPT4OMiniProvider extends OpenAIChatProvider {
  constructor(options: Omit<LLMProviderInit, 'model'> & Partial<Pick<LLMProviderInit, 'model'>>) {
    super({
      ...options,
      model: options.model ?? GPT4O_MINI_MODEL_ID
    } as LLMProviderInit);
  }
}

export { GPT4O_MINI_MODEL_ID };
