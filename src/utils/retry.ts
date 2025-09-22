/**
 * Retry utility with exponential backoff and jitter
 */

interface RetryableError {
  code?: string;
  status?: number;
  message?: string;
}

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Backoff factor (2 = double delay each time) */
  factor?: number;
  /** Add random jitter to delays (0-1, 0 = no jitter, 1 = up to 100% jitter) */
  jitter?: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: RetryableError) => boolean;
  /** Callback for retry attempts */
  onRetry?: (attempt: number, error: RetryableError, nextDelay: number) => void;
}

/**
 * Default function to check if an error is retryable
 */
function defaultIsRetryable(error: RetryableError): boolean {
  // Retry on network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // Retry on specific HTTP status codes
  if (
    error.status === 429 || // Too Many Requests
    error.status === 502 || // Bad Gateway
    error.status === 503 || // Service Unavailable
    error.status === 504
  ) {
    // Gateway Timeout
    return true;
  }

  // Retry on rate limit errors
  if (error.message?.toLowerCase().includes('rate limit')) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: Required<RetryConfig>): number {
  // Calculate exponential backoff
  let delay = Math.min(config.initialDelay * config.factor ** (attempt - 1), config.maxDelay);

  // Add jitter if configured
  if (config.jitter > 0) {
    const jitterAmount = delay * config.jitter * Math.random();
    delay = delay - jitterAmount / 2 + jitterAmount;
  }

  return Math.round(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(fn: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
  const finalConfig: Required<RetryConfig> = {
    maxAttempts: config.maxAttempts ?? 3,
    initialDelay: config.initialDelay ?? 1000,
    maxDelay: config.maxDelay ?? 60000,
    factor: config.factor ?? 2,
    jitter: config.jitter ?? 0.2,
    isRetryable: config.isRetryable ?? defaultIsRetryable,
    onRetry: config.onRetry ?? (() => {})
  };

  let lastError: RetryableError | undefined;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as RetryableError;

      // Check if we should retry
      if (attempt === finalConfig.maxAttempts || !finalConfig.isRetryable(lastError)) {
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, finalConfig);

      // Call retry callback
      finalConfig.onRetry(attempt, lastError, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError || new Error('Retry failed without capturing error');
}

/**
 * Create a retry wrapper for a function
 */
export function retryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  config: RetryConfig = {}
): T {
  return (async (...args: Parameters<T>) => {
    return retry(() => fn(...args), config);
  }) as T;
}

/**
 * Retry policies registry for different services
 */
const registeredPolicies: Map<string, RetryConfig> = new Map();

/**
 * Register a retry policy for a service
 */
export function registerRetryPolicy(name: string, config: RetryConfig): void {
  registeredPolicies.set(name, config);
}

/**
 * Get retry configuration for a service
 */
export function getRetryPolicy(name: string): RetryConfig {
  return registeredPolicies.get(name) || {};
}

/**
 * Execute with service-specific retry policy
 */
export async function executeWithRetryPolicy<T>(
  serviceName: string,
  fn: () => Promise<T>
): Promise<T> {
  const config = getRetryPolicy(serviceName);
  return retry(fn, config);
}

/**
 * Create retryable function with service-specific policy
 */
export function wrapWithRetryPolicy<T extends (...args: unknown[]) => Promise<unknown>>(
  serviceName: string,
  fn: T
): T {
  const config = getRetryPolicy(serviceName);
  return retryable(fn, config);
}

/**
 * Clear all policies
 */
export function clearRetryPolicies(): void {
  registeredPolicies.clear();
}

/**
 * Pre-configured retry policies
 */
export const RetryPolicies = {
  /** Fast retry for quick operations */
  fast: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    factor: 2,
    jitter: 0.1
  } as RetryConfig,

  /** Standard retry for most operations */
  standard: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    factor: 2,
    jitter: 0.2
  } as RetryConfig,

  /** Aggressive retry for critical operations */
  aggressive: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 30000,
    factor: 2,
    jitter: 0.3
  } as RetryConfig,

  /** Retry for rate-limited APIs */
  rateLimited: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 60000,
    factor: 2,
    jitter: 0.5,
    isRetryable: (error: RetryableError) => {
      return (
        error.status === 429 ||
        error.message?.toLowerCase().includes('rate limit') ||
        defaultIsRetryable(error)
      );
    }
  } as RetryConfig,

  /** No retry */
  none: {
    maxAttempts: 1
  } as RetryConfig
};

/**
 * Decorator for retryable methods
 */
export function Retryable(config: RetryConfig = RetryPolicies.standard) {
  return (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return retry(() => originalMethod.apply(this, args), config);
    };

    return descriptor;
  };
}
