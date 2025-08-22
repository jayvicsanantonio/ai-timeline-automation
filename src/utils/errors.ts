/**
 * Custom error classes and error handling utilities
 */

/**
 * Base error class for all custom errors
 */
export class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;
  public readonly id: string;

  constructor(message: string, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;
    this.id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Error thrown when a news source fails
 */
export class NewsSourceError extends BaseError {
  constructor(
    public readonly source: string,
    message: string,
    public readonly originalError?: any
  ) {
    super(`News source ${source} error: ${message}`, {
      source,
      originalError: originalError?.message || originalError
    });
  }
}

/**
 * Error thrown when API rate limit is exceeded
 */
export class RateLimitError extends BaseError {
  public readonly resetTime?: Date;
  public readonly retryAfterSeconds?: number;

  constructor(
    public readonly service: string,
    resetTimeOrRetryAfter?: Date | number,
    retryAfterSeconds?: number
  ) {
    super(`Rate limit exceeded for ${service}`, {
      service,
      resetTime: resetTimeOrRetryAfter instanceof Date ? resetTimeOrRetryAfter : undefined,
      retryAfterSeconds: typeof resetTimeOrRetryAfter === 'number' ? resetTimeOrRetryAfter : retryAfterSeconds,
    });
    if (resetTimeOrRetryAfter instanceof Date) {
      this.resetTime = resetTimeOrRetryAfter;
      this.retryAfterSeconds = retryAfterSeconds;
    } else if (typeof resetTimeOrRetryAfter === 'number') {
      this.retryAfterSeconds = resetTimeOrRetryAfter;
    }
  }

  getSecondsUntilReset(): number | undefined {
    if (!this.resetTime) return undefined;
    const diff = Math.ceil((this.resetTime.getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  }
}

/**
 * Error thrown when event validation fails
 */
export class ValidationError extends BaseError {
  public readonly field?: string;
  public readonly value?: any;
  public readonly validationErrors?: string[];

  constructor(fieldOrMessage: string, messageOrErrors: string | string[], value?: any) {
    if (Array.isArray(messageOrErrors)) {
      // Original signature: (message, validationErrors)
      super(fieldOrMessage, { validationErrors: messageOrErrors });
      this.validationErrors = messageOrErrors;
    } else {
      // Expected by tests: (field, message, value?)
      super(messageOrErrors, { field: fieldOrMessage, value });
      this.field = fieldOrMessage;
      this.value = value;
    }
  }
}

/**
 * Error thrown when GitHub operations fail
 */
export class GitHubError extends BaseError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly statusCode?: number
  ) {
    super(`GitHub ${operation} failed: ${message}`, {
      operation,
      statusCode
    });
  }

  isRetryable(): boolean {
    const retryableStatuses = [429, 502, 503, 504];
    return this.statusCode ? retryableStatuses.includes(this.statusCode) : false;
  }
}

/**
 * Error thrown when AI analysis fails
 */
export class AnalysisError extends BaseError {
  constructor(
    message: string,
    public readonly model?: string,
    public readonly event?: any
  ) {
    super(`Analysis failed: ${message}`, {
      model,
      event
    });
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends BaseError {
  constructor(
    message: string,
    public readonly missingFields?: string[]
  ) {
    super(`Configuration error: ${message}`, {
      missingFields
    });
  }
}

/**
 * Error handler with logging and recovery
 */
export class ErrorHandler {
  private static errorCounts: Map<string, number> = new Map();
  private static lastErrors: Map<string, Error> = new Map();

  private collected: Error[] = [];

  constructor(_logger?: any) {
    // Logger parameter is intentionally unused but kept for compatibility
  }

  /**
   * Handle an error with logging and optional recovery
   */
  static async handle(
    error: Error,
    context: string,
    recoveryFn?: () => Promise<void>
  ): Promise<void> {
    // Increment error count
    const count = (this.errorCounts.get(context) || 0) + 1;
    this.errorCounts.set(context, count);
    this.lastErrors.set(context, error);

    // Log error with context
    console.error(`[ERROR] ${context} (occurrence ${count}):`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof BaseError ? error.context : {})
    });

    // Attempt recovery if provided
    if (recoveryFn) {
      try {
        console.log(`[RECOVERY] Attempting recovery for ${context}`);
        await recoveryFn();
        console.log(`[RECOVERY] Recovery successful for ${context}`);
      } catch (recoveryError) {
        console.error(`[RECOVERY] Recovery failed for ${context}:`, recoveryError);
      }
    }
  }

  /**
   * Wrap a function with error handling
   */
  static wrap<T extends (...args: any[]) => any>(
    fn: T,
    context: string,
    recoveryFn?: () => Promise<void>
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        await this.handle(error as Error, context, recoveryFn);
        throw error;
      }
    }) as T;
  }

  // Instance methods expected by tests
  handle(error: Error): void {
    this.collected.push(error);
  }
  getCollectedErrors(): Error[] {
    return [...this.collected];
  }
  clearErrors(): void {
    this.collected = [];
  }
  hasErrors(): boolean {
    return this.collected.length > 0;
  }
  getSummary(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    this.collected.forEach(e => { byType[e.name] = (byType[e.name] || 0) + 1; });
    return { total: this.collected.length, byType };
  }

  /**
   * Get error statistics
   */
  static getStats() {
    const stats: Record<string, { count: number; lastError?: string }> = {};
    
    this.errorCounts.forEach((count, context) => {
      stats[context] = {
        count,
        lastError: this.lastErrors.get(context)?.message
      };
    });
    
    return stats;
  }

  /**
   * Reset error statistics
   */
  static reset(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: Error): boolean {
    // Rate limit errors are retryable
    if (error instanceof RateLimitError) {
      return true;
    }

    // Network errors are retryable
    if (error instanceof NewsSourceError) {
      const originalError = error.originalError;
      if (originalError?.code === 'ECONNRESET' ||
          originalError?.code === 'ETIMEDOUT' ||
          originalError?.code === 'ENOTFOUND') {
        return true;
      }
    }

    // GitHub errors with specific status codes are retryable
    if (error instanceof GitHubError) {
      const retryableStatuses = [429, 502, 503, 504];
      if (error.statusCode && retryableStatuses.includes(error.statusCode)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get retry delay based on error type
   */
  static getRetryDelay(error: Error, attempt: number): number {
    // Use retry-after header for rate limit errors
    if (error instanceof RateLimitError && (error as any).retryAfter) {
      return (error as any).retryAfter * 1000;
    }

    // Exponential backoff for other errors
    const baseDelay = 1000;
    const maxDelay = 60000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add jitter
    const jitter = delay * 0.2 * Math.random();
    return Math.round(delay + jitter);
  }
}

/**
 * Aggregate multiple errors
 */
export class AggregateError extends BaseError {
  constructor(
    message: string,
    public readonly errors: Error[]
  ) {
    super(message, {
      errorCount: errors.length,
      errors: errors.map(e => ({
        name: e.name,
        message: e.message
      }))
    });
  }

  /**
   * Get all errors of a specific type
   */
  getErrorsOfType<T extends Error>(errorClass: new (...args: any[]) => T): T[] {
    return this.errors.filter(e => e instanceof errorClass) as T[];
  }

  /** Alias expected by tests */
  getErrorsByType<T extends Error>(errorClass: new (...args: any[]) => T): T[] {
    return this.getErrorsOfType(errorClass);
  }

  getSummary(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    this.errors.forEach(e => {
      byType[e.name] = (byType[e.name] || 0) + 1;
    });
    return { total: this.errors.length, byType };
  }

  /**
   * Check if any error matches a condition
   */
  hasError(predicate: (error: Error) => boolean): boolean {
    return this.errors.some(predicate);
  }
}

/**
 * Error boundary for catching and handling errors
 */
export class ErrorBoundary {
  private errors: Error[] = [];
  private handlers: Map<string, (error: Error) => void> = new Map();

  constructor(_handler?: ErrorHandler) {
    // Handler parameter is intentionally unused but kept for compatibility
  }

  /**
   * Register an error handler for a specific error type
   */
  on<T extends Error>(
    errorClass: new (...args: any[]) => T,
    handler: (error: T) => void
  ): this {
    this.handlers.set(errorClass.name, handler as any);
    return this;
  }

  /**
   * Execute a function within the error boundary
   */
  async execute<T>(fn: () => Promise<T> | T, fallback?: T): Promise<T> {
    try {
      const result = fn();
      return (result instanceof Promise) ? await result : result;
    } catch (error) {
      this.handleError(error as Error);
      return fallback as T;
    }
  }

  /**
   * Handle an error
   */
  private handleError(error: Error): void {
    this.errors.push(error);
    
    // Find and execute specific handler
    const handler = this.handlers.get(error.constructor.name);
    if (handler) {
      handler(error);
    } else {
      console.error('Unhandled error in boundary:', error);
    }
  }

  /**
   * Get all caught errors
   */
  getErrors(): Error[] {
    return [...this.errors];
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Check if there were any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
