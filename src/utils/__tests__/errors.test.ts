/**
 * Tests for error utilities
 */

import {
  AnalysisError,
  BaseError,
  ConfigurationError,
  AggregateError as CustomAggregateError,
  ErrorHandler,
  GitHubError,
  NewsSourceError,
  RateLimitError,
  ValidationError
} from '../errors';

describe('BaseError', () => {
  it('should create a base error with message and context', () => {
    const context = { key: 'value' };
    const error = new BaseError('Test error', context);

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('BaseError');
    expect(error.context).toEqual(context);
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(typeof error.id).toBe('string');
  });

  it('should create a base error without context', () => {
    const error = new BaseError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.context).toBeUndefined();
  });

  it('should serialize to JSON', () => {
    const error = new BaseError('Test error', { key: 'value' });
    const json = error.toJSON();

    expect(json).toMatchObject({
      name: 'BaseError',
      message: 'Test error',
      context: { key: 'value' },
      timestamp: expect.any(Date),
      stack: expect.any(String)
    });
  });
});

describe('NewsSourceError', () => {
  it('should create news source error', () => {
    const originalError = new Error('Original error');
    const error = new NewsSourceError('hackernews', 'Test error', originalError);

    expect(error.message).toBe('News source hackernews error: Test error');
    expect(error.source).toBe('hackernews');
    expect(error.originalError).toBe(originalError);
  });

  it('should handle non-Error original error', () => {
    const error = new NewsSourceError('arxiv', 'Test error', 'string error');

    expect(error.message).toBe('News source arxiv error: Test error');
    expect(error.originalError).toBe('string error');
  });
});

describe('RateLimitError', () => {
  it('should create rate limit error with retry seconds', () => {
    const error = new RateLimitError('openai', 60);

    expect(error.message).toBe('Rate limit exceeded for openai');
    expect(error.service).toBe('openai');
    expect(error.retryAfterSeconds).toBe(60);
  });

  it('should create rate limit error with reset time', () => {
    const resetTime = new Date(Date.now() + 60000);
    const error = new RateLimitError('github', resetTime);

    expect(error.service).toBe('github');
    expect(error.resetTime).toBe(resetTime);
  });

  it('should calculate seconds until reset', () => {
    const resetTime = new Date(Date.now() + 5000);
    const error = new RateLimitError('test', resetTime);
    const seconds = error.getSecondsUntilReset();

    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(5);
  });
});

describe('ValidationError', () => {
  it('should create validation error with field and message', () => {
    const error = new ValidationError('title', 'Title is required', 'invalid value');

    expect(error.message).toBe('Title is required');
    expect(error.field).toBe('title');
    expect(error.value).toBe('invalid value');
  });

  it('should create validation error with validation errors array', () => {
    const validationErrors = ['Field required', 'Invalid format'];
    const error = new ValidationError('General error', validationErrors);

    expect(error.message).toBe('General error');
    expect(error.validationErrors).toEqual(validationErrors);
  });
});

describe('GitHubError', () => {
  it('should create GitHub error', () => {
    const error = new GitHubError('Not found', 'fetch', 404);

    expect(error.message).toBe('GitHub fetch failed: Not found');
    expect(error.operation).toBe('fetch');
    expect(error.statusCode).toBe(404);
  });

  it('should determine if error is retryable', () => {
    const retryableError = new GitHubError('Rate limited', 'api', 429);
    const nonRetryableError = new GitHubError('Not found', 'api', 404);

    expect(retryableError.isRetryable()).toBe(true);
    expect(nonRetryableError.isRetryable()).toBe(false);
  });
});

describe('AnalysisError', () => {
  it('should create analysis error', () => {
    const event = { title: 'Test event' };
    const error = new AnalysisError('Analysis failed', 'gpt-4', event);

    expect(error.message).toBe('Analysis failed: Analysis failed');
    expect(error.model).toBe('gpt-4');
    expect(error.event).toBe(event);
  });
});

describe('ConfigurationError', () => {
  it('should create configuration error', () => {
    const missingFields = ['API_KEY', 'TOKEN'];
    const error = new ConfigurationError('Missing configuration', missingFields);

    expect(error.message).toBe('Configuration error: Missing configuration');
    expect(error.missingFields).toEqual(missingFields);
  });
});

describe('ErrorHandler', () => {
  it('should collect errors', () => {
    const handler = new ErrorHandler();
    const error1 = new Error('Error 1');
    const error2 = new Error('Error 2');

    handler.handle(error1);
    handler.handle(error2);

    expect(handler.hasErrors()).toBe(true);
    expect(handler.getCollectedErrors()).toHaveLength(2);
  });

  it('should clear errors', () => {
    const handler = new ErrorHandler();
    handler.handle(new Error('Test'));

    expect(handler.hasErrors()).toBe(true);

    handler.clearErrors();

    expect(handler.hasErrors()).toBe(false);
    expect(handler.getCollectedErrors()).toHaveLength(0);
  });

  it('should get error summary', () => {
    const handler = new ErrorHandler();
    handler.handle(new BaseError('Base error'));
    handler.handle(new ValidationError('field', 'Validation error'));

    const summary = handler.getSummary();

    expect(summary.total).toBe(2);
    expect(summary.byType).toEqual({
      BaseError: 1,
      ValidationError: 1
    });
  });

  it('should check if errors are retryable', () => {
    const rateLimitError = new RateLimitError('api', 60);
    const gitHubError = new GitHubError('Rate limit', 'api', 429);
    const baseError = new BaseError('Generic error');

    expect(ErrorHandler.isRetryable(rateLimitError)).toBe(true);
    expect(ErrorHandler.isRetryable(gitHubError)).toBe(true);
    expect(ErrorHandler.isRetryable(baseError)).toBe(false);
  });

  it('should calculate retry delay', () => {
    const baseError = new BaseError('Test error');

    const delay1 = ErrorHandler.getRetryDelay(baseError, 1);
    const delay2 = ErrorHandler.getRetryDelay(baseError, 2);

    expect(delay1).toBeGreaterThan(0);
    expect(delay2).toBeGreaterThan(delay1);
  });
});

describe('AggregateError', () => {
  it('should create aggregate error', () => {
    const errors = [new BaseError('Error 1'), new ValidationError('field', 'Error 2')];
    const error = new CustomAggregateError('Multiple errors', errors);

    expect(error.message).toBe('Multiple errors');
    expect(error.errors).toEqual(errors);
  });

  it('should get errors by type', () => {
    const baseError = new BaseError('Base error');
    const validationError = new ValidationError('field', 'Validation error');
    const gitHubError = new GitHubError('GitHub error', 'api', 404);
    const errors = [baseError, validationError, gitHubError];

    const aggregateError = new CustomAggregateError('Multiple errors', errors);

    const validationErrors = aggregateError.getErrorsOfType(ValidationError);
    const gitHubErrors = aggregateError.getErrorsByType(GitHubError);

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0]).toBe(validationError);
    expect(gitHubErrors).toHaveLength(1);
    expect(gitHubErrors[0]).toBe(gitHubError);
  });

  it('should get error summary', () => {
    const errors = [
      new BaseError('Error 1'),
      new BaseError('Error 2'),
      new ValidationError('field', 'Validation error')
    ];
    const aggregateError = new CustomAggregateError('Multiple errors', errors);

    const summary = aggregateError.getSummary();

    expect(summary.total).toBe(3);
    expect(summary.byType).toEqual({
      BaseError: 2,
      ValidationError: 1
    });
  });

  it('should check if has specific error', () => {
    const errors = [new BaseError('Error 1'), new ValidationError('field', 'Validation error')];
    const aggregateError = new CustomAggregateError('Multiple errors', errors);

    const hasValidationError = aggregateError.hasError((error) => error instanceof ValidationError);
    const hasGitHubError = aggregateError.hasError((error) => error instanceof GitHubError);

    expect(hasValidationError).toBe(true);
    expect(hasGitHubError).toBe(false);
  });
});
