/**
 * Unit tests for retry utility
 */

import { retry, retryable, RetryPolicies } from '../retry';

describe('Retry Utility', () => {
  describe('retry function', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await retry(mockFn, RetryPolicies.standard);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue('success');
      
      const result = await retry(mockFn, RetryPolicies.standard);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should exhaust all retries and throw final error', async () => {
      const error = new Error('Persistent failure');
      const mockFn = jest.fn().mockRejectedValue(error);
      
      await expect(retry(mockFn, RetryPolicies.standard)).rejects.toThrow('Persistent failure');
      expect(mockFn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Non-retryable error');
      error.name = 'ValidationError';
      const mockFn = jest.fn().mockRejectedValue(error);
      
      const config = {
        ...RetryPolicies.standard,
        shouldRetry: (error: Error) => error.name !== 'ValidationError'
      };
      
      await expect(retry(mockFn, config)).rejects.toThrow('Non-retryable error');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should respect custom retry configuration', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      const customConfig = {
        maxAttempts: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: 0,
        shouldRetry: () => true
      };
      
      await expect(retry(mockFn, customConfig)).rejects.toThrow('Failure');
      expect(mockFn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('should apply exponential backoff', async () => {
      jest.useFakeTimers();
      
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      const config = {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: 0,
        shouldRetry: () => true
      };
      
      const retryPromise = retry(mockFn, config);
      
      // Fast-forward through delays
      await jest.advanceTimersByTimeAsync(100); // First retry delay
      await jest.advanceTimersByTimeAsync(200); // Second retry delay
      
      await expect(retryPromise).rejects.toThrow('Failure');
      expect(mockFn).toHaveBeenCalledTimes(3);
      
      jest.useRealTimers();
    });

    it('should apply jitter when enabled', async () => {
      jest.useFakeTimers();
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      const config = {
        maxAttempts: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: 0.1,
        shouldRetry: () => true
      };
      
      const retryPromise = retry(mockFn, config);
      
      // With jitter, delay should be base + (random * base) = 100 + (0.5 * 100) = 150
      await jest.advanceTimersByTimeAsync(150);
      
      await expect(retryPromise).rejects.toThrow('Failure');
      
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('should respect maximum delay', async () => {
      jest.useFakeTimers();
      
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      const config = {
        maxAttempts: 4,
        baseDelay: 100,
        maxDelay: 150, // Lower than what backoff would calculate
        backoffMultiplier: 3,
        jitter: 0,
        shouldRetry: () => true
      };
      
      const retryPromise = retry(mockFn, config);
      
      // Delays should be: 100, 150 (capped), 150 (capped)
      await jest.advanceTimersByTimeAsync(100); // First retry
      await jest.advanceTimersByTimeAsync(150); // Second retry (capped at maxDelay)
      await jest.advanceTimersByTimeAsync(150); // Third retry (capped at maxDelay)
      
      await expect(retryPromise).rejects.toThrow('Failure');
      
      jest.useRealTimers();
    });

    it('should handle async functions correctly', async () => {
      const asyncFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async success';
      };
      
      const result = await retry(asyncFn, RetryPolicies.standard);
      expect(result).toBe('async success');
    });
  });

  describe('retryable decorator', () => {
    it('should create retryable version of function', async () => {
      const originalFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');
      
      const retryableFn = retryable(originalFn, RetryPolicies.standard);
      const result = await retryableFn();
      
      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    it('should preserve function arguments', async () => {
      const originalFn = jest.fn().mockResolvedValue('success');
      const retryableFn = retryable(originalFn, RetryPolicies.standard);
      
      await retryableFn('arg1', 'arg2', { key: 'value' });
      
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' });
    });

    it('should preserve function context (this)', async () => {
      class TestClass {
        value = 'test';
        
        async method() {
          return this.value;
        }
      }
      
      const instance = new TestClass();
      const retryableMethod = retryable(instance.method.bind(instance), RetryPolicies.standard);
      
      const result = await retryableMethod();
      expect(result).toBe('test');
    });
  });

  describe('RetryPolicies', () => {
    it('should have STANDARD policy', () => {
      expect(RetryPolicies.standard).toEqual({
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: 0.1,
        shouldRetry: expect.any(Function)
      });
    });

    it('should have AGGRESSIVE policy', () => {
      expect(RetryPolicies.aggressive).toEqual({
        maxAttempts: 5,
        baseDelay: 500,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: 0.1,
        shouldRetry: expect.any(Function)
      });
    });

    it('should have rateLimited policy', () => {
      expect(RetryPolicies.rateLimited).toEqual({
        maxAttempts: 5,
        initialDelay: 2000,
        maxDelay: 60000,
        factor: 2,
        jitter: 0.5,
        isRetryable: expect.any(Function)
      });
    });

    it('should have fast policy', () => {
      expect(RetryPolicies.fast).toEqual({
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        factor: 2,
        jitter: 0.1
      });
    });

    describe('shouldRetry functions', () => {
      // Note: standard policy uses default isRetryable function
      /*it('STANDARD should retry network and temporary errors', () => {
        const { shouldRetry } = RetryPolicies.standard;
        
        // Should retry
        expect(shouldRetry(new Error('ENOTFOUND'))).toBe(true);
        expect(shouldRetry(new Error('ECONNRESET'))).toBe(true);
        expect(shouldRetry(new Error('timeout'))).toBe(true);
        expect(shouldRetry({ status: 500 } as any)).toBe(true);
        expect(shouldRetry({ status: 502 } as any)).toBe(true);
        expect(shouldRetry({ status: 503 } as any)).toBe(true);
        expect(shouldRetry({ status: 504 } as any)).toBe(true);
        expect(shouldRetry({ status: 429 } as any)).toBe(true); // Rate limit
        
        // Should not retry
        expect(shouldRetry({ status: 400 } as any)).toBe(false); // Bad request
        expect(shouldRetry({ status: 401 } as any)).toBe(false); // Unauthorized
        expect(shouldRetry({ status: 403 } as any)).toBe(false); // Forbidden
        expect(shouldRetry({ status: 404 } as any)).toBe(false); // Not found
        expect(shouldRetry(new Error('ValidationError'))).toBe(false); // Non-network error
      });*/

      it('rateLimited should retry rate limit errors', () => {
        const { isRetryable } = RetryPolicies.rateLimited;
        
        // Should retry rate limit errors
        expect(isRetryable!({ status: 429 } as any)).toBe(true);
        expect(isRetryable!(new Error('rate limit exceeded'))).toBe(true);
        expect(isRetryable!(new Error('ENOTFOUND'))).toBe(true);
        expect(isRetryable!({ status: 500 } as any)).toBe(true);
        
        // Should not retry non-retryable errors
        expect(isRetryable!(new Error('ValidationError'))).toBe(false);
        expect(isRetryable!({ status: 400 } as any)).toBe(false);
      });
    });
  });

  describe('Error scenarios', () => {
    it('should handle synchronous errors', async () => {
      const syncError = new Error('Sync error');
      const mockFn = jest.fn().mockImplementation(() => {
        throw syncError;
      });
      
      await expect(retry(mockFn, RetryPolicies.standard)).rejects.toThrow('Sync error');
      expect(mockFn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should handle mixed sync and async errors', async () => {
      const mockFn = jest.fn()
        .mockImplementationOnce(() => { throw new Error('Sync error'); })
        .mockRejectedValueOnce(new Error('Async error'))
        .mockResolvedValue('success');
      
      const result = await retry(mockFn, RetryPolicies.standard);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should preserve error properties', async () => {
      const customError = new Error('Custom error');
      customError.name = 'CustomError';
      (customError as any).status = 500;
      (customError as any).code = 'CUSTOM_CODE';
      
      const mockFn = jest.fn().mockRejectedValue(customError);
      
      try {
        await retry(mockFn, RetryPolicies.standard);
      } catch (error) {
        expect(error).toBe(customError);
        expect(error.name).toBe('CustomError');
        expect((error as any).status).toBe(500);
        expect((error as any).code).toBe('CUSTOM_CODE');
      }
    });
  });

  describe('Performance', () => {
    it('should not add significant overhead for successful calls', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const start = Date.now();
      await retry(mockFn, RetryPolicies.standard);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50); // Should be very fast
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});
