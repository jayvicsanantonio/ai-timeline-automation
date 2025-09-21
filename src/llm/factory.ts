import {
  loadLlmConfig,
  LlmConfig,
} from '../config';
import { ChainedLLMProvider } from './chained-provider';
import { LLMProvider } from './provider';
import {
  LLMProviderId,
  LLMProviderInit,
} from './types';
import { OpenAIGPT5LowProvider } from './openai-gpt5-low-provider';
import { OpenAIGPT4OMiniProvider } from './openai-gpt4o-mini-provider';
import { LocalGGUFProvider } from './local-gguf-provider';
import { LLMProviderError } from './errors';

export interface LLMFactoryOptions {
  apiKey?: string;
  configPath?: string;
  overrides?: Partial<Omit<LLMProviderInit, 'providerId' | 'model'>> & {
    model?: string;
  };
}

type ProviderConstructor = (options: LLMProviderInit) => LLMProvider;

const PROVIDER_CONSTRUCTORS: Record<LLMProviderId, ProviderConstructor> = {
  openai_gpt5_low: (options) => new OpenAIGPT5LowProvider(options),
  openai_gpt4o_mini: (options) => new OpenAIGPT4OMiniProvider(options),
  local_gguf_small: (options) => new LocalGGUFProvider(options),
};

const PROVIDER_MODEL_DEFAULTS: Record<LLMProviderId, string> = {
  openai_gpt5_low: 'gpt-5.0-low',
  openai_gpt4o_mini: 'gpt-4o-mini',
  local_gguf_small: 'local-gguf-small',
};

function resolveApiKey(providerId: LLMProviderId, explicit?: string): string | undefined {
  if (explicit) {
    return explicit;
  }

  if (providerId === 'local_gguf_small') {
    return undefined;
  }

  return process.env.OPENAI_API_KEY;
}

function normalizeConfig(config: LlmConfig): LlmConfig {
  return {
    ...config,
    fallback_chain: config.fallback_chain ?? [],
    budget: config.budget ?? {},
    retries: config.retries ?? {
      attempts: 3,
      base_delay_ms: 250,
      max_delay_ms: 4000,
    },
    timeouts: config.timeouts ?? {
      request_ms: 20000,
    },
  };
}

function mapBudget(budget?: LlmConfig['budget']) {
  if (!budget) {
    return undefined;
  }

  const { max_prompt_tokens, max_completion_tokens } = budget;

  if (
    max_prompt_tokens === undefined &&
    max_completion_tokens === undefined
  ) {
    return undefined;
  }

  return {
    maxPromptTokens: max_prompt_tokens,
    maxCompletionTokens: max_completion_tokens,
  } as const;
}

function buildProviderInit(
  providerId: LLMProviderId,
  config: LlmConfig,
  apiKey?: string,
  overrides?: LLMFactoryOptions['overrides']
): LLMProviderInit {
  const model = overrides?.model ?? PROVIDER_MODEL_DEFAULTS[providerId];
  if (!model) {
    throw new LLMProviderError(`Unknown model for provider ${providerId}`);
  }

  return {
    providerId,
    apiKey,
    model,
    temperature: overrides?.temperature ?? config.temperature,
    topP: overrides?.topP ?? config.top_p,
    maxTokens: overrides?.maxTokens ?? config.max_tokens,
    embeddingsModel: overrides?.embeddingsModel ?? config.embeddings_model,
    budget: overrides?.budget ?? mapBudget(config.budget),
    retries: overrides?.retries ?? {
      attempts: config.retries.attempts,
      baseDelayMs: config.retries.base_delay_ms,
      maxDelayMs: config.retries.max_delay_ms,
    },
    timeouts: overrides?.timeouts ?? {
      requestMs: config.timeouts.request_ms,
    },
  };
}

async function instantiateProvider(
  providerId: LLMProviderId,
  config: LlmConfig,
  options: LLMFactoryOptions
): Promise<LLMProvider> {
  const constructor = PROVIDER_CONSTRUCTORS[providerId];
  if (!constructor) {
    throw new LLMProviderError(`No constructor registered for provider ${providerId}`);
  }

  const apiKey = resolveApiKey(providerId, options.apiKey);

  if (!apiKey && providerId !== 'local_gguf_small') {
    throw new LLMProviderError('Missing OPENAI_API_KEY for OpenAI provider', {
      providerId,
    });
  }

  const init = buildProviderInit(providerId, config, apiKey, options.overrides);
  return constructor(init);
}

export async function createLLMProvider(
  options: LLMFactoryOptions = {}
): Promise<LLMProvider> {
  const config = normalizeConfig(await loadLlmConfig(options.configPath));

  const providerChain: LLMProviderId[] = [
    config.default_provider as LLMProviderId,
    ...config.fallback_chain.map((id) => id as LLMProviderId),
  ];

  const providers: LLMProvider[] = [];
  const errors: Error[] = [];

  for (const providerId of providerChain) {
    try {
      const provider = await instantiateProvider(providerId, config, options);
      providers.push(provider);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (providers.length === 0) {
    throw new LLMProviderError('Unable to instantiate any LLM provider', {
      errors: errors.map((err) => err.message),
    });
  }

  if (providers.length === 1) {
    return providers[0];
  }

  return new ChainedLLMProvider(providers);
}
