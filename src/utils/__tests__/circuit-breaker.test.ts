/**
 * Unit tests for CircuitBreaker
 */

import { CircuitBreaker, CircuitBreakerFactory, CircuitState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    breaker = new CircuitBreaker({
      failureThreshold: 2,
      successThreshold: 2,
      timeout: 100,
      windowSize: 1000,
      serviceName: 'TestService'
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('execute', () => {
    it('should execute function successfully when circuit is closed', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after failure threshold', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // First failure
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.getState().failures).toBe(1);
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);

      // Second failure - should open circuit
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
      expect(breaker.getState().failures).toBe(2);
      expect(breaker.getState().state).toBe(CircuitState.OPEN);
    });

    it('should reject calls when circuit is open', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      // Should reject without calling function
      fn.mockClear();
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should transition to half-open after timeout', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getState().state).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should transition to half-open and execute
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after success threshold in half-open', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // First success in half-open
      await breaker.execute(fn);
      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);
      expect(breaker.getState().successes).toBe(1);

      // Second success - should close circuit
      await breaker.execute(fn);
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
      expect(breaker.getState().successes).toBe(0);
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail again'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Success in half-open
      await breaker.execute(fn);
      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);

      // Failure in half-open - should reopen
      await expect(breaker.execute(fn)).rejects.toThrow('fail again');
      expect(breaker.getState().state).toBe(CircuitState.OPEN);
    });
  });

  describe('wrap', () => {
    it('should wrap a function with circuit breaker', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrappedFn = breaker.wrap(originalFn);

      const result = await wrappedFn('arg1', 'arg2');

      expect(result).toBe('result');
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should handle wrapped function failures', async () => {
      const originalFn = jest.fn().mockRejectedValue(new Error('error'));
      const wrappedFn = breaker.wrap(originalFn);

      await expect(wrappedFn()).rejects.toThrow('error');
      await expect(wrappedFn()).rejects.toThrow('error');

      // Circuit should be open
      expect(breaker.getState().state).toBe(CircuitState.OPEN);
    });
  });

  describe('state management', () => {
    it('should reset circuit breaker', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.isOpen()).toBe(true);

      // Reset
      breaker.reset();

      expect(breaker.isClosed()).toBe(true);
      expect(breaker.getState().failures).toBe(0);
      expect(breaker.getState().successes).toBe(0);
    });

    it('should track failures within time window', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // First failure
      await expect(breaker.execute(fn)).rejects.toThrow();

      // Wait beyond window size
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second failure - should not count first failure
      await expect(breaker.execute(fn)).rejects.toThrow();
      expect(breaker.getState().failures).toBe(1);
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
    });
  });

  describe('state checks', () => {
    it('should correctly report circuit state', async () => {
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.isHalfOpen()).toBe(false);

      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Open circuit
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();

      expect(breaker.isClosed()).toBe(false);
      expect(breaker.isOpen()).toBe(true);
      expect(breaker.isHalfOpen()).toBe(false);
    });
  });
});

describe('CircuitBreakerFactory', () => {
  beforeEach(() => {
    CircuitBreakerFactory.clear();
  });

  it('should create and cache circuit breakers', () => {
    const breaker1 = CircuitBreakerFactory.getBreaker('Service1');
    const breaker2 = CircuitBreakerFactory.getBreaker('Service1');
    const breaker3 = CircuitBreakerFactory.getBreaker('Service2');

    expect(breaker1).toBe(breaker2);
    expect(breaker1).not.toBe(breaker3);
  });

  it('should reset all breakers', async () => {
    const breaker1 = CircuitBreakerFactory.getBreaker('Service1', {
      failureThreshold: 1
    });
    const breaker2 = CircuitBreakerFactory.getBreaker('Service2', {
      failureThreshold: 1
    });

    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    // Open both circuits
    await expect(breaker1.execute(fn)).rejects.toThrow();
    await expect(breaker2.execute(fn)).rejects.toThrow();

    expect(breaker1.isOpen()).toBe(true);
    expect(breaker2.isOpen()).toBe(true);

    // Reset all
    CircuitBreakerFactory.resetAll();

    expect(breaker1.isClosed()).toBe(true);
    expect(breaker2.isClosed()).toBe(true);
  });

  it('should get all breaker states', async () => {
    const breaker1 = CircuitBreakerFactory.getBreaker('Service1', {
      failureThreshold: 1
    });
    const _breaker2 = CircuitBreakerFactory.getBreaker('Service2');

    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(breaker1.execute(fn)).rejects.toThrow();

    const states = CircuitBreakerFactory.getAllStates();

    expect(states.get('Service1')?.state).toBe(CircuitState.OPEN);
    expect(states.get('Service2')?.state).toBe(CircuitState.CLOSED);
  });
});
