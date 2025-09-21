import { type LlmConfig, loadLlmConfig } from '../config';
import { ChainedLLMProvider } from './chained-provider';
import { LLMProviderError } from './errors';
import { LocalGGUFProvider } from './local-gguf-provider';
import { MockLLMProvider } from './mock-provider';
import { OpenAIGPT4OMiniProvider } from './openai-gpt4o-mini-provider';
import { OpenAIGPT5LowProvider } from './openai-gpt5-low-provider';
import type { LLMProvider } from './provider';
import type { LLMProviderId, LLMProviderInit } from './types';

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
  mock_llm: (_options) => new MockLLMProvider()
};

const PROVIDER_MODEL_DEFAULTS: Record<LLMProviderId, string> = {
  openai_gpt5_low: 'gpt-5.0-low',
  openai_gpt4o_mini: 'gpt-4o-mini',
  local_gguf_small: 'local-gguf-small',
  mock_llm: 'mock-1'
};

const KNOWN_PROVIDERS: LLMProviderId[] = [
  'openai_gpt5_low',
  'openai_gpt4o_mini',
  'local_gguf_small',
  'mock_llm'
];

function isKnownProvider(id: string): id is LLMProviderId {
  return KNOWN_PROVIDERS.includes(id as LLMProviderId);
}

function resolveApiKey(providerId: LLMProviderId, explicit?: string): string | undefined {
  if (explicit) {
    return explicit;
  }

  if (providerId === 'local_gguf_small' || providerId === 'mock_llm') {
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
      max_delay_ms: 4000
    },
    timeouts: config.timeouts ?? {
      request_ms: 20000
    }
  };
}

function mapBudget(budget?: LlmConfig['budget']) {
  if (!budget) {
    return undefined;
  }

  const { max_prompt_tokens, max_completion_tokens } = budget;

  if (max_prompt_tokens === undefined && max_completion_tokens === undefined) {
    return undefined;
  }

  return {
    maxPromptTokens: max_prompt_tokens,
    maxCompletionTokens: max_completion_tokens
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
      maxDelayMs: config.retries.max_delay_ms
    },
    timeouts: overrides?.timeouts ?? {
      requestMs: config.timeouts.request_ms
    }
  };
}

async function instantiateProvider(
  providerId: LLMProviderId,
  config: LlmConfig,
  options: LLMFactoryOptions
): Promise<LLMProvider> {
  const providerConstructor = PROVIDER_CONSTRUCTORS[providerId];
  if (!providerConstructor) {
    throw new LLMProviderError(`No constructor registered for provider ${providerId}`);
  }

  const apiKey = resolveApiKey(providerId, options.apiKey);

  if (!apiKey && providerId !== 'local_gguf_small' && providerId !== 'mock_llm') {
    throw new LLMProviderError('Missing OPENAI_API_KEY for OpenAI provider', {
      providerId
    });
  }

  const init = buildProviderInit(providerId, config, apiKey, options.overrides);
  return providerConstructor(init);
}

export async function createLLMProvider(options: LLMFactoryOptions = {}): Promise<LLMProvider> {
  const config = normalizeConfig(await loadLlmConfig(options.configPath));

  const envOverrideRaw = process.env.LLM_PROVIDER?.trim();
  const envOverride =
    envOverrideRaw && isKnownProvider(envOverrideRaw)
      ? (envOverrideRaw as LLMProviderId)
      : undefined;

  const requestedChain = [
    ...(envOverride ? [envOverride] : []),
    config.default_provider,
    ...config.fallback_chain
  ]
    .map((id) => id.trim())
    .filter((id) => isKnownProvider(id));

  const providerChain: LLMProviderId[] = requestedChain.filter(
    (id, index) => requestedChain.indexOf(id) === index
  ) as LLMProviderId[];

  if (process.env.LLM_DEBUG === 'true') {
    console.log('[LLM] Provider chain:', providerChain.join(' -> '));
  }

  const providers: LLMProvider[] = [];
  const errors: Error[] = [];

  for (const providerId of providerChain) {
    try {
      const provider = await instantiateProvider(providerId, config, options);
      if (process.env.LLM_DEBUG === 'true') {
        console.log('[LLM] Instantiated provider:', providerId);
      }
      providers.push(provider);
    } catch (error) {
      if (process.env.LLM_DEBUG === 'true') {
        console.warn(
          '[LLM] Provider instantiation failed:',
          providerId,
          '-',
          (error as Error).message
        );
      }
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (providers.length === 0) {
    throw new LLMProviderError('Unable to instantiate any LLM provider', {
      errors: errors.map((err) => err.message)
    });
  }

  if (providers.length === 1) {
    return providers[0];
  }

  return new ChainedLLMProvider(providers);
}
