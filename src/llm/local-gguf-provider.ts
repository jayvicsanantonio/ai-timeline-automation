import { BaseLLMProvider } from './base-provider';
import { LLMProviderError } from './errors';
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMEmbeddingRequest,
  LLMEmbeddingResult,
  LLMProviderInit
} from './types';

const LOCAL_GGUF_MODEL_ID = 'local-gguf-small';

export class LocalGGUFProvider extends BaseLLMProvider {
  constructor(options: Omit<LLMProviderInit, 'model'> & Partial<Pick<LLMProviderInit, 'model'>>) {
    super({
      ...options,
      model: options.model ?? LOCAL_GGUF_MODEL_ID
    } as LLMProviderInit);
  }

  supportsEmbeddings(): boolean {
    return false;
  }

  protected async doComplete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
    throw new LLMProviderError(
      'Local GGUF provider endpoint is not configured',
      this.buildContext(request.correlationId)
    );
  }

  protected async doEmbed(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResult> {
    throw new LLMProviderError(
      'Local GGUF provider does not support embeddings yet',
      this.buildContext(request.correlationId)
    );
  }
}

export { LOCAL_GGUF_MODEL_ID };
