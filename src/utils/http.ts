import { BaseError } from './errors';

interface TimeoutResult {
  signal?: AbortSignal;
  cancel: () => void;
}

function createTimeoutSignal(timeout?: number): TimeoutResult {
  if (timeout === undefined) {
    return { cancel: () => {} };
  }

  const abortSignalCtor = AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  };

  if (typeof abortSignalCtor.timeout === 'function') {
    return {
      signal: abortSignalCtor.timeout(timeout),
      cancel: () => {}
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new Error(`Request timed out after ${timeout}ms`));
    }
  }, timeout);

  const cancel = () => {
    clearTimeout(timer);
  };

  controller.signal.addEventListener('abort', cancel, { once: true });

  return { signal: controller.signal, cancel };
}

function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));

  if (active.length === 0) {
    return undefined;
  }

  if (active.length === 1) {
    return active[0];
  }

  const abortSignalCtor = AbortSignal as typeof AbortSignal & {
    any?: (signals: Iterable<AbortSignal>) => AbortSignal;
  };

  if (typeof abortSignalCtor.any === 'function') {
    return abortSignalCtor.any(active);
  }

  const controller = new AbortController();

  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  active.forEach((signal) => {
    if (signal.aborted) {
      abort(signal.reason);
    } else {
      signal.addEventListener('abort', () => abort(signal.reason), { once: true });
    }
  });

  return controller.signal;
}

export class HttpRequestError extends BaseError {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly method: string,
    public readonly headers?: Record<string, string>,
    public readonly body?: string
  ) {
    super(`HTTP ${method} ${url} failed with ${status} ${statusText}`, {
      url,
      status,
      statusText,
      method,
      headers,
      body
    });
  }
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeout?: number;
  signal?: AbortSignal;
}

function buildUrl(baseUrl: string, query?: HttpRequestOptions['query']): string {
  if (!query) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function executeRequest(url: string, options: HttpRequestOptions = {}): Promise<Response> {
  const { timeout, signal, method = 'GET', headers, query } = options;

  const requestUrl = buildUrl(url, query);
  const timeoutResult = createTimeoutSignal(timeout);
  const mergedSignal = mergeSignals([signal, timeoutResult.signal]);

  try {
    const response = await fetch(requestUrl, {
      method,
      headers,
      signal: mergedSignal
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new BaseError(`HTTP ${method} ${requestUrl} aborted`, {
        url: requestUrl,
        method,
        reason: (error as Error).message
      });
    }
    throw error;
  } finally {
    timeoutResult.cancel();
  }
}

function extractHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

export async function fetchText(url: string, options: HttpRequestOptions = {}): Promise<string> {
  const response = await executeRequest(url, options);

  if (!response.ok) {
    const body = await response.text().catch(() => undefined);
    throw new HttpRequestError(
      url,
      response.status,
      response.statusText,
      options.method ?? 'GET',
      extractHeaders(response),
      body
    );
  }

  return response.text();
}

export async function fetchJson<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
  const response = await executeRequest(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => undefined);
    throw new HttpRequestError(
      url,
      response.status,
      response.statusText,
      options.method ?? 'GET',
      extractHeaders(response),
      body
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new BaseError('Failed to parse JSON response', {
      url,
      method: options.method ?? 'GET',
      error: error instanceof Error ? error.message : error
    });
  }
}
