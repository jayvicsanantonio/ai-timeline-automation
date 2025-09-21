import { OpenAIChatProvider } from './openai-provider';
import { LLMProviderInit } from './types';

const GPT5_LOW_MODEL_ID = 'gpt-5.0-low';

export class OpenAIGPT5LowProvider extends OpenAIChatProvider {
  constructor(options: Omit<LLMProviderInit, 'model'> & Partial<Pick<LLMProviderInit, 'model'>>) {
    super({
      ...options,
      model: options.model ?? GPT5_LOW_MODEL_ID,
    } as LLMProviderInit);
  }
}

export { GPT5_LOW_MODEL_ID };
