import { BaseError } from '../utils/errors';

export class LLMProviderError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(`LLM provider error: ${message}`, context);
  }
}

export class LLMBudgetExceededError extends LLMProviderError {
  constructor(
    public readonly providerId: string,
    public readonly dimension: 'prompt' | 'completion',
    public readonly limit: number,
    public readonly attempted: number
  ) {
    super('Token budget exceeded', {
      providerId,
      dimension,
      limit,
      attempted
    });
  }
}

export class LLMProviderAggregateError extends LLMProviderError {
  constructor(
    message: string,
    public readonly errors: Error[]
  ) {
    super(message, {
      causes: errors.map((err) => ({
        name: err.name,
        message: err.message
      }))
    });
  }
}
