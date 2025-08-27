/**
 * Structured logger with JSON output and correlation IDs
 */

import { randomUUID } from 'crypto';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogContext {
  correlationId?: string;
  service?: string;
  operation?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  correlationId: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export class Logger {
  private static instance: Logger;
  private correlationId: string;
  private context: LogContext;
  private logLevel: LogLevel;
  private outputStream: (entry: LogEntry) => void;

  private constructor(
    logLevel: LogLevel = LogLevel.INFO,
    context: LogContext = {},
    outputStream?: (entry: LogEntry) => void
  ) {
    this.logLevel = logLevel;
    this.correlationId = context.correlationId || randomUUID();
    this.context = { ...context, correlationId: this.correlationId };
    this.outputStream =
      outputStream || ((entry) => console.log(JSON.stringify(entry)));
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    logLevel?: LogLevel,
    context?: LogContext
  ): Logger {
    if (!Logger.instance) {
      const level =
        logLevel ?? Logger.parseLogLevel(process.env.LOG_LEVEL);
      Logger.instance = new Logger(level, context);
    }
    return Logger.instance;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new Logger(
      this.logLevel,
      {
        ...this.context,
        ...context,
        correlationId: context.correlationId || this.correlationId,
      },
      this.outputStream
    );
  }

  /**
   * Create a logger for a specific operation
   */
  forOperation(operation: string, context?: LogContext): Logger {
    return this.child({
      ...context,
      operation,
      operationId: randomUUID(),
    });
  }

  /**
   * Parse log level from string
   */
  private static parseLogLevel(level?: string): LogLevel {
    switch (level?.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Format log entry
   */
  private formatEntry(
    level: string,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.correlationId,
      context: this.context,
    };

    if (metadata) {
      entry.metadata = metadata;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  /**
   * Log an error
   */
  error(
    message: string,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.formatEntry(
        'ERROR',
        message,
        metadata,
        error
      );
      this.outputStream(entry);
    }
  }

  /**
   * Log a warning
   */
  warn(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.formatEntry('WARN', message, metadata);
      this.outputStream(entry);
    }
  }

  /**
   * Log info
   */
  info(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.formatEntry('INFO', message, metadata);
      this.outputStream(entry);
    }
  }

  /**
   * Log debug information
   */
  debug(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.formatEntry('DEBUG', message, metadata);
      this.outputStream(entry);
    }
  }

  /**
   * Log API call
   */
  logApiCall(
    service: string,
    method: string,
    url: string,
    duration: number,
    status?: number,
    error?: Error
  ): void {
    const metadata = {
      service,
      method,
      url,
      duration,
      status,
      success: !error && status && status < 400,
    };

    if (error) {
      this.error(`API call failed: ${service}`, error, metadata);
    } else if (status && status >= 400) {
      this.warn(
        `API call returned error status: ${service}`,
        metadata
      );
    } else {
      this.info(`API call completed: ${service}`, metadata);
    }
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string): () => void {
    const start = Date.now();
    this.debug(`Starting operation: ${operation}`);

    return () => {
      const duration = Date.now() - start;
      this.info(`Operation completed: ${operation}`, { duration });
    };
  }

  /**
   * Get correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Set output stream (useful for testing)
   */
  setOutputStream(stream: (entry: LogEntry) => void): void {
    this.outputStream = stream;
  }
}

// Export convenience functions
export function createLogger(context?: LogContext): Logger {
  return Logger.getInstance(undefined, context);
}

export function getLogger(): Logger {
  return Logger.getInstance();
}
