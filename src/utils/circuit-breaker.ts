/**
 * Circuit Breaker pattern implementation for fault tolerance
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Success threshold to close circuit from half-open state */
  successThreshold?: number;
  /** Time in ms before attempting to close circuit */
  timeout?: number;
  /** Time window in ms to track failures */
  windowSize?: number;
  /** Name of the service for logging */
  serviceName?: string;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  nextAttempt?: Date;
}

/**
 * Circuit Breaker for handling service failures gracefully
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: Date;
  private nextAttempt?: Date;
  private readonly config: Required<CircuitBreakerConfig>;
  private failureTimestamps: Date[] = [];

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 3,
      successThreshold: config.successThreshold || 2,
      timeout: config.timeout || 60000, // 1 minute
      windowSize: config.windowSize || 60000, // 1 minute
      serviceName: config.serviceName || 'Unknown Service'
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (!this.canAttempt()) {
        throw new Error(
          `Circuit breaker is OPEN for ${this.config.serviceName}. ` +
            `Next attempt at ${this.nextAttempt?.toISOString()}`
        );
      }
      this.transitionToHalfOpen();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Wrap a function with circuit breaker protection
   */
  wrap<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: Parameters<T>) => {
      return this.execute(() => fn(...args));
    }) as T;
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      console.log(
        `[CircuitBreaker] ${this.config.serviceName} success in HALF_OPEN state ` +
          `(${this.successes}/${this.config.successThreshold})`
      );

      if (this.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    const now = new Date();
    this.lastFailureTime = now;

    // Clean old failure timestamps outside the window
    this.failureTimestamps = this.failureTimestamps.filter(
      (timestamp) => now.getTime() - timestamp.getTime() < this.config.windowSize
    );

    // Add new failure
    this.failureTimestamps.push(now);
    this.failures = this.failureTimestamps.length;

    console.error(
      `[CircuitBreaker] ${this.config.serviceName} failure ` +
        `(${this.failures}/${this.config.failureThreshold})`
    );

    if (this.state === CircuitState.HALF_OPEN || this.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Check if we can attempt execution when circuit is open
   */
  private canAttempt(): boolean {
    if (!this.nextAttempt) return true;
    return new Date() >= this.nextAttempt;
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    console.log(`[CircuitBreaker] ${this.config.serviceName} transitioning to CLOSED`);
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.failureTimestamps = [];
    this.nextAttempt = undefined;
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    console.log(`[CircuitBreaker] ${this.config.serviceName} transitioning to OPEN`);
    this.state = CircuitState.OPEN;
    this.successes = 0;
    this.nextAttempt = new Date(Date.now() + this.config.timeout);

    console.log(
      `[CircuitBreaker] ${this.config.serviceName} will retry at ` +
        `${this.nextAttempt.toISOString()}`
    );
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    console.log(`[CircuitBreaker] ${this.config.serviceName} transitioning to HALF_OPEN`);
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;
    this.failures = 0;
    this.failureTimestamps = [];
  }

  /**
   * Get current state of the circuit breaker
   */
  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionToClosed();
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN && !this.canAttempt();
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }
}

/**
 * Factory for creating circuit breakers for different services
 */
export class CircuitBreakerFactory {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker for a service
   */
  static getBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!CircuitBreakerFactory.breakers.has(serviceName)) {
      CircuitBreakerFactory.breakers.set(
        serviceName,
        new CircuitBreaker({
          ...config,
          serviceName
        })
      );
    }
    return CircuitBreakerFactory.breakers.get(serviceName)!;
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    for (const breaker of CircuitBreakerFactory.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Clear all circuit breakers
   */
  static clear(): void {
    CircuitBreakerFactory.breakers.clear();
  }

  /**
   * Get state of all circuit breakers
   */
  static getAllStates(): Map<string, CircuitBreakerState> {
    const states = new Map<string, CircuitBreakerState>();
    CircuitBreakerFactory.breakers.forEach((breaker, name) => {
      states.set(name, breaker.getState());
    });
    return states;
  }
}
