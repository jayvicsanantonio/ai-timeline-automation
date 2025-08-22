/**
 * Unit tests for error classes and error handling
 */

import {
  BaseError,
  NewsSourceError,
  RateLimitError,
  ValidationError,
  GitHubError,
  AnalysisError,
  ConfigurationError,
  ErrorHandler,
  AggregateError,
  ErrorBoundary,
} from '../errors';

describe('Error Classes', () => {
  describe('BaseError', () => {
    it('should create error with message', () => {
      const error = new BaseError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('BaseError');
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.stack).toBeDefined();
    });

    it('should include context in error', () => {
      const context = { userId: '123', operation: 'test' };
      const error = new BaseError('Test error', context);

      expect(error.context).toEqual(context);
    });

    it('should handle undefined context', () => {
      const error = new BaseError('Test error');
      expect(error.context).toBeUndefined();
    });

    it('should generate unique error ID', () => {
      const error1 = new BaseError('Error 1');
      const error2 = new BaseError('Error 2');

      expect(error1.id).toBeDefined();
      expect(error2.id).toBeDefined();
      expect(error1.id).not.toBe(error2.id);
    });

    it('should serialize to JSON', () => {
      const context = { source: 'test' };
      const error = new BaseError('Test error', context);
      const json = error.toJSON();

      expect(json).toEqual({
        id: error.id,
        name: 'BaseError',
        message: 'Test error',
        timestamp: error.timestamp.toISOString(),
        context,
        stack: error.stack,
      });
    });
  });

  describe('NewsSourceError', () => {
    it('should create news source error', () => {
      const error = new NewsSourceError('HackerNews', 'API timeout');

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(NewsSourceError);
      expect(error.name).toBe('NewsSourceError');
      expect(error.source).toBe('HackerNews');
      expect(error.message).toBe('API timeout');
    });

    it('should include source in context', () => {
      const context = { retryCount: 3 };
      const error = new NewsSourceError(
        'ArXiv',
        'Parse error',
        context
      );

      expect(error.context).toEqual({
        ...context,
        source: 'ArXiv',
      });
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with reset time', () => {
      const resetTime = new Date();
      const error = new RateLimitError('GitHub', resetTime, 60);

      expect(error).toBeInstanceOf(NewsSourceError);
      expect(error.name).toBe('RateLimitError');
      expect(error.resetTime).toBe(resetTime);
      expect(error.retryAfterSeconds).toBe(60);
      expect(error.message).toContain(
        'Rate limit exceeded for GitHub'
      );
    });

    it('should calculate seconds until reset', () => {
      const resetTime = new Date(Date.now() + 30 * 1000); // 30 seconds from now
      const error = new RateLimitError('OpenAI', resetTime);

      const secondsUntilReset = error.getSecondsUntilReset();
      expect(secondsUntilReset).toBeGreaterThan(25);
      expect(secondsUntilReset).toBeLessThanOrEqual(30);
    });

    it('should handle past reset times', () => {
      const resetTime = new Date(Date.now() - 10 * 1000); // 10 seconds ago
      const error = new RateLimitError('API', resetTime);

      const secondsUntilReset = error.getSecondsUntilReset();
      expect(secondsUntilReset).toBe(0);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError(
        'email',
        'Invalid email format'
      );

      expect(error).toBeInstanceOf(BaseError);
      expect(error.name).toBe('ValidationError');
      expect(error.field).toBe('email');
      expect(error.value).toBeUndefined();
      expect(error.message).toBe('Invalid email format');
    });

    it('should include field value', () => {
      const invalidValue = 'not-an-email';
      const error = new ValidationError(
        'email',
        'Invalid format',
        invalidValue
      );

      expect(error.field).toBe('email');
      expect(error.value).toBe(invalidValue);
      expect(error.context).toEqual({
        field: 'email',
        value: invalidValue,
      });
    });
  });

  describe('GitHubError', () => {
    it('should create GitHub error', () => {
      const error = new GitHubError(
        'create-branch',
        'Branch already exists',
        422
      );

      expect(error).toBeInstanceOf(BaseError);
      expect(error.name).toBe('GitHubError');
      expect(error.operation).toBe('create-branch');
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Branch already exists');
    });

    it('should handle error without status code', () => {
      const error = new GitHubError('fetch-file', 'Network timeout');

      expect(error.operation).toBe('fetch-file');
      expect(error.statusCode).toBeUndefined();
    });

    it('should determine if error is retryable', () => {
      const retryableError = new GitHubError(
        'api-call',
        'Server error',
        500
      );
      const nonRetryableError = new GitHubError(
        'api-call',
        'Not found',
        404
      );
      const rateLimitError = new GitHubError(
        'api-call',
        'Rate limited',
        403
      );

      expect(retryableError.isRetryable()).toBe(true);
      expect(nonRetryableError.isRetryable()).toBe(false);
      expect(rateLimitError.isRetryable()).toBe(true);
    });
  });

  describe('AnalysisError', () => {
    it('should create analysis error', () => {
      const error = new AnalysisError(
        'Invalid response format from AI model'
      );

      expect(error).toBeInstanceOf(BaseError);
      expect(error.name).toBe('AnalysisError');
      expect(error.message).toBe(
        'Invalid response format from AI model'
      );
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const missingFields = ['OPENAI_API_KEY', 'GIT_TOKEN'];
      const error = new ConfigurationError(
        'Missing required environment variables',
        missingFields
      );

      expect(error).toBeInstanceOf(BaseError);
      expect(error.name).toBe('ConfigurationError');
      expect(error.missingFields).toEqual(missingFields);
      expect(error.context).toEqual({ missingFields });
    });

    it('should handle error without missing fields', () => {
      const error = new ConfigurationError('Invalid configuration');

      expect(error.missingFields).toBeUndefined();
    });
  });

  describe('AggregateError', () => {
    it('should create aggregate error with multiple errors', () => {
      const errors = [
        new NewsSourceError('HackerNews', 'Timeout'),
        new NewsSourceError('ArXiv', 'Parse error'),
        new ValidationError('data', 'Invalid format'),
      ];

      const aggregateError = new AggregateError(
        'Multiple sources failed',
        errors
      );

      expect(aggregateError).toBeInstanceOf(BaseError);
      expect(aggregateError.name).toBe('AggregateError');
      expect(aggregateError.errors).toEqual(errors);
      expect(aggregateError.errors).toHaveLength(3);
    });

    it('should generate summary message', () => {
      const errors = [new Error('Error 1'), new Error('Error 2')];

      const aggregateError = new AggregateError(
        'Batch operation failed',
        errors
      );
      const summary = aggregateError.getSummary();

      expect(summary).toContain('2 errors');
      expect(summary).toContain('Error 1');
      expect(summary).toContain('Error 2');
    });

    it('should filter errors by type', () => {
      const errors = [
        new NewsSourceError('Source1', 'Error 1'),
        new ValidationError('field1', 'Error 2'),
        new NewsSourceError('Source2', 'Error 3'),
        new GitHubError('operation', 'Error 4'),
      ];

      const aggregateError = new AggregateError(
        'Multiple errors',
        errors
      );
      const sourceErrors =
        aggregateError.getErrorsByType(NewsSourceError);

      expect(sourceErrors).toHaveLength(2);
      expect(sourceErrors[0]).toBeInstanceOf(NewsSourceError);
      expect(sourceErrors[1]).toBeInstanceOf(NewsSourceError);
    });
  });

  describe('ErrorHandler', () => {
    let handler: ErrorHandler;
    let mockLogger: any;

    beforeEach(() => {
      mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
      };
      handler = new ErrorHandler(mockLogger);
    });

    it('should handle single error', () => {
      const error = new NewsSourceError('HackerNews', 'API failed');

      handler.handle(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error occurred',
        error,
        {
          errorId: error.id,
          errorType: 'NewsSourceError',
          source: 'HackerNews',
        }
      );
    });

    it('should handle aggregate error', () => {
      const errors = [
        new NewsSourceError('Source1', 'Error 1'),
        new ValidationError('field', 'Error 2'),
      ];
      const aggregateError = new AggregateError(
        'Multiple failures',
        errors
      );

      handler.handle(aggregateError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Multiple errors occurred',
        aggregateError,
        {
          errorId: aggregateError.id,
          errorType: 'AggregateError',
          errorCount: 2,
        }
      );
    });

    it('should handle unknown errors', () => {
      const unknownError = new Error('Unknown error');

      handler.handle(unknownError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unknown error occurred',
        unknownError,
        {
          errorType: 'Error',
        }
      );
    });

    it('should collect errors', () => {
      const error1 = new NewsSourceError('Source1', 'Error 1');
      const error2 = new ValidationError('field', 'Error 2');

      handler.handle(error1);
      handler.handle(error2);

      const collected = handler.getCollectedErrors();
      expect(collected).toHaveLength(2);
      expect(collected[0]).toBe(error1);
      expect(collected[1]).toBe(error2);
    });

    it('should clear collected errors', () => {
      const error = new NewsSourceError('Source', 'Error');
      handler.handle(error);

      expect(handler.getCollectedErrors()).toHaveLength(1);

      handler.clearErrors();
      expect(handler.getCollectedErrors()).toHaveLength(0);
    });

    it('should check if has errors', () => {
      expect(handler.hasErrors()).toBe(false);

      handler.handle(new Error('Test'));
      expect(handler.hasErrors()).toBe(true);

      handler.clearErrors();
      expect(handler.hasErrors()).toBe(false);
    });

    it('should create summary of errors', () => {
      const errors = [
        new NewsSourceError('HackerNews', 'Timeout'),
        new NewsSourceError('ArXiv', 'Parse error'),
        new ValidationError('data', 'Invalid'),
      ];

      errors.forEach((error) => handler.handle(error));

      const summary = handler.getSummary();
      expect(summary.totalErrors).toBe(3);
      expect(summary.errorsByType).toEqual({
        NewsSourceError: 2,
        ValidationError: 1,
      });
      expect(summary.errors).toHaveLength(3);
    });
  });

  describe('ErrorBoundary', () => {
    let boundary: ErrorBoundary;
    let mockHandler: any;

    beforeEach(() => {
      mockHandler = {
        handle: jest.fn(),
      };
      boundary = new ErrorBoundary(mockHandler);
    });

    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await boundary.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(mockHandler.handle).not.toHaveBeenCalled();
    });

    it('should catch and handle errors', async () => {
      const error = new NewsSourceError('Source', 'Failed');
      const fn = jest.fn().mockRejectedValue(error);

      const result = await boundary.execute(fn);

      expect(result).toBeUndefined();
      expect(mockHandler.handle).toHaveBeenCalledWith(error);
    });

    it('should return fallback value on error', async () => {
      const error = new Error('Failed');
      const fn = jest.fn().mockRejectedValue(error);

      const result = await boundary.execute(fn, 'fallback');

      expect(result).toBe('fallback');
      expect(mockHandler.handle).toHaveBeenCalledWith(error);
    });

    it('should execute synchronous functions', async () => {
      const syncFn = () => 'sync result';

      const result = await boundary.execute(syncFn);

      expect(result).toBe('sync result');
    });

    it('should handle synchronous errors', async () => {
      const error = new Error('Sync error');
      const syncFn = () => {
        throw error;
      };

      const result = await boundary.execute(syncFn);

      expect(result).toBeUndefined();
      expect(mockHandler.handle).toHaveBeenCalledWith(error);
    });
  });

  describe('Error Integration', () => {
    it('should chain error handling components', async () => {
      const mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
      };

      const handler = new ErrorHandler(mockLogger);
      const boundary = new ErrorBoundary(handler);

      const failingFn = async () => {
        throw new NewsSourceError('TestSource', 'Connection failed');
      };

      const result = await boundary.execute(failingFn, 'default');

      expect(result).toBe('default');
      expect(handler.hasErrors()).toBe(true);
      expect(handler.getCollectedErrors()).toHaveLength(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
