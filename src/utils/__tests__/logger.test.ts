/**
 * Unit tests for Logger
 */

import { type LogEntry, Logger, LogLevel } from '../logger';

describe('Logger', () => {
  let logger: Logger;
  let logEntries: LogEntry[];

  beforeEach(() => {
    logEntries = [];
    logger = new (Logger as any)(LogLevel.DEBUG, {}, (entry: LogEntry) => {
      logEntries.push(entry);
    });
  });

  describe('Log Levels', () => {
    it('should log at ERROR level', () => {
      logger.setLogLevel(LogLevel.ERROR);

      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].level).toBe('ERROR');
      expect(logEntries[0].message).toBe('Error message');
    });

    it('should log at WARN level and above', () => {
      logger.setLogLevel(LogLevel.WARN);

      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');

      expect(logEntries).toHaveLength(2);
      expect(logEntries.map((e) => e.level)).toEqual(['ERROR', 'WARN']);
    });

    it('should log at INFO level and above', () => {
      logger.setLogLevel(LogLevel.INFO);

      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');

      expect(logEntries).toHaveLength(3);
      expect(logEntries.map((e) => e.level)).toEqual(['ERROR', 'WARN', 'INFO']);
    });

    it('should log at DEBUG level (all)', () => {
      logger.setLogLevel(LogLevel.DEBUG);

      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');

      expect(logEntries).toHaveLength(4);
      expect(logEntries.map((e) => e.level)).toEqual(['ERROR', 'WARN', 'INFO', 'DEBUG']);
    });
  });

  describe('Correlation IDs', () => {
    it('should maintain correlation ID across log entries', () => {
      logger.info('First message');
      logger.info('Second message');

      expect(logEntries[0].correlationId).toBe(logEntries[1].correlationId);
      expect(logEntries[0].correlationId).toBeTruthy();
    });

    it('should create new correlation ID for child logger', () => {
      const childLogger = logger.child({ service: 'test-service' });

      logger.info('Parent message');
      childLogger.info('Child message');

      expect(logEntries[0].correlationId).toBe(logEntries[1].correlationId);
      expect(logEntries[1].context?.service).toBe('test-service');
    });

    it('should preserve custom correlation ID', () => {
      const customId = 'custom-correlation-id';
      const childLogger = logger.child({ correlationId: customId });

      childLogger.info('Message with custom ID');

      expect(logEntries[0].correlationId).toBe(customId);
    });
  });

  describe('Context', () => {
    it('should include context in log entries', () => {
      const contextLogger = logger.child({
        service: 'test-service',
        userId: 'user-123',
        operation: 'test-operation'
      });

      contextLogger.info('Test message');

      expect(logEntries[0].context).toMatchObject({
        service: 'test-service',
        userId: 'user-123',
        operation: 'test-operation'
      });
    });

    it('should merge context in child loggers', () => {
      const serviceLogger = logger.child({ service: 'api' });
      const operationLogger = serviceLogger.child({ operation: 'fetch' });

      operationLogger.info('Nested context');

      expect(logEntries[0].context).toMatchObject({
        service: 'api',
        operation: 'fetch'
      });
    });
  });

  describe('Error Logging', () => {
    it('should include error details', () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';

      logger.error('An error occurred', error);

      expect(logEntries[0].error).toEqual({
        name: 'Error',
        message: 'Test error',
        stack: 'Error stack trace'
      });
    });

    it('should include metadata with error', () => {
      const error = new Error('Test error');
      const metadata = { userId: 'user-123', action: 'test-action' };

      logger.error('Error with metadata', error, metadata);

      expect(logEntries[0].metadata).toEqual(metadata);
      expect(logEntries[0].error).toBeDefined();
    });
  });

  describe('Metadata', () => {
    it('should include metadata in log entries', () => {
      const metadata = {
        requestId: 'req-123',
        duration: 1500,
        status: 200
      };

      logger.info('Request completed', metadata);

      expect(logEntries[0].metadata).toEqual(metadata);
    });
  });

  describe('API Call Logging', () => {
    it('should log successful API call', () => {
      logger.logApiCall('GitHub', 'GET', '/repos', 250, 200);

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].level).toBe('INFO');
      expect(logEntries[0].message).toBe('API call completed: GitHub');
      expect(logEntries[0].metadata).toMatchObject({
        service: 'GitHub',
        method: 'GET',
        url: '/repos',
        duration: 250,
        status: 200,
        success: true
      });
    });

    it('should log failed API call with error', () => {
      const error = new Error('Network error');

      logger.logApiCall('GitHub', 'GET', '/repos', 500, undefined, error);

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].level).toBe('ERROR');
      expect(logEntries[0].message).toBe('API call failed: GitHub');
      expect(logEntries[0].error).toBeDefined();
    });

    it('should log API call with error status', () => {
      logger.logApiCall('GitHub', 'GET', '/repos', 300, 404);

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].level).toBe('WARN');
      expect(logEntries[0].message).toBe('API call returned error status: GitHub');
      expect(logEntries[0].metadata?.status).toBe(404);
    });
  });

  describe('Timer', () => {
    it('should track operation duration', () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      const endTimer = logger.startTimer('test-operation');

      // First log should be debug level for start
      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].level).toBe('DEBUG');
      expect(logEntries[0].message).toBe('Starting operation: test-operation');

      // Advance time by 1500ms
      jest.setSystemTime(startTime + 1500);
      endTimer();

      // Second log should be info level for completion
      expect(logEntries).toHaveLength(2);
      expect(logEntries[1].level).toBe('INFO');
      expect(logEntries[1].message).toBe('Operation completed: test-operation');
      expect(logEntries[1].metadata?.duration).toBe(1500);

      jest.useRealTimers();
    });
  });

  describe('forOperation', () => {
    it('should create logger with operation context', () => {
      const opLogger = logger.forOperation('data-fetch', { service: 'api' });

      opLogger.info('Fetching data');

      expect(logEntries[0].context).toMatchObject({
        operation: 'data-fetch',
        service: 'api'
      });
      expect(logEntries[0].context?.operationId).toBeTruthy();
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();

      expect(logger1).toBe(logger2);
    });
  });
});
