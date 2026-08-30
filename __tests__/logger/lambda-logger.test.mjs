/**
 * Unit tests for the LambdaLogger module.
 *
 * Validates Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { jest } from '@jest/globals';
import { LambdaLogger } from '../../lib/logger/lambda-logger.ts';

describe('LambdaLogger', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  function getLastOutput() {
    const calls = stdoutSpy.mock.calls;
    if (calls.length === 0) return null;
    const lastCall = calls[calls.length - 1][0];
    return JSON.parse(lastCall.replace(/\n$/, ''));
  }

  function getAllOutputs() {
    return stdoutSpy.mock.calls.map((call) => JSON.parse(call[0].replace(/\n$/, '')));
  }

  describe('Notification domain (Req 12.4)', () => {
    it('uses "notification" domain for send-email function', () => {
      const logger = new LambdaLogger('send-email', 'req-abc-123');
      logger.info('Email sent');

      const output = getLastOutput();
      expect(output.domain).toBe('notification');
    });

    it('uses "notification" domain for send-sms function', () => {
      const logger = new LambdaLogger('send-sms', 'req-xyz-456');
      logger.info('SMS sent');

      const output = getLastOutput();
      expect(output.domain).toBe('notification');
    });

    it('uses "notification" domain for all log levels', () => {
      const logger = new LambdaLogger('send-email', 'req-111');
      logger.error('error msg');
      logger.warn('warn msg');
      logger.info('info msg');
      logger.debug('debug msg');

      const outputs = getAllOutputs();
      for (const output of outputs) {
        expect(output.domain).toBe('notification');
      }
    });
  });

  describe('AWS request ID as correlationId (Req 12.3)', () => {
    it('uses awsRequestId as correlationId', () => {
      const requestId = 'aws-req-550e8400-e29b-41d4';
      const logger = new LambdaLogger('send-email', requestId);
      logger.info('Test message');

      const output = getLastOutput();
      expect(output.correlationId).toBe(requestId);
    });

    it('uses same correlationId across multiple entries', () => {
      const requestId = 'aws-req-unique-id';
      const logger = new LambdaLogger('send-sms', requestId);
      logger.info('First');
      logger.error('Second');

      const outputs = getAllOutputs();
      expect(outputs[0].correlationId).toBe(requestId);
      expect(outputs[1].correlationId).toBe(requestId);
    });
  });

  describe('Event field summary excludes values (Req 12.2)', () => {
    it('includes field names and value lengths, not actual values', () => {
      const logger = new LambdaLogger('send-email', 'req-001');
      const event = {
        to: 'jane.doe@example.com',
        subject: 'Hello World',
        htmlBody: '<p>This is the body</p>',
      };

      logger.logError(new Error('Something failed'), event);

      const output = getLastOutput();
      const summary = output.context.eventFieldSummary;

      // Should contain field names with value lengths
      expect(summary).toContain('to(');
      expect(summary).toContain('subject(');
      expect(summary).toContain('htmlBody(');

      // Should NOT contain actual values
      expect(summary).not.toContain('jane.doe@example.com');
      expect(summary).not.toContain('Hello World');
      expect(summary).not.toContain('<p>This is the body</p>');
    });

    it('formats event summary as "field(length)" entries', () => {
      const logger = new LambdaLogger('send-sms', 'req-002');
      const event = {
        to: '+15558675309',
        body: 'Your appointment is confirmed',
      };

      logger.logError(new Error('Delivery failed'), event);

      const output = getLastOutput();
      const summary = output.context.eventFieldSummary;

      // to is 12 chars, body is 29 chars
      expect(summary).toContain(`to(${'+15558675309'.length})`);
      expect(summary).toContain(`body(${'Your appointment is confirmed'.length})`);
    });

    it('handles null/undefined event values with length 0', () => {
      const logger = new LambdaLogger('send-email', 'req-003');
      const event = {
        to: null,
        subject: undefined,
      };

      logger.logError(new Error('Error'), event);

      const output = getLastOutput();
      const summary = output.context.eventFieldSummary;
      expect(summary).toContain('to(0)');
      expect(summary).toContain('subject(0)');
    });

    it('includes error message and stack trace in error log', () => {
      const logger = new LambdaLogger('send-email', 'req-004');
      const error = new Error('Connection timeout');

      logger.logError(error, { recipient: 'test@example.com' });

      const output = getLastOutput();
      expect(output.level).toBe('error');
      expect(output.context.errorMessage).toBe('Connection timeout');
      expect(output.context.stackTrace).toContain('Connection timeout');
      expect(output.context.functionName).toBe('send-email');
    });
  });

  describe('Masked recipient on success (Req 12.5)', () => {
    it('masks email recipient as first char + *** + @domain', () => {
      const logger = new LambdaLogger('send-email', 'req-010');
      logger.logSuccess('delivered', 'jane@example.com');

      const output = getLastOutput();
      expect(output.context.recipient).toBe('j***@example.com');
    });

    it('masks phone recipient showing only last 4 digits', () => {
      const logger = new LambdaLogger('send-sms', 'req-011');
      logger.logSuccess('delivered', '555-867-5309');

      const output = getLastOutput();
      // Last 4 digits: 5309
      expect(output.context.recipient).toContain('5309');
      // Earlier digits should be masked
      expect(output.context.recipient).not.toMatch(/^555/);
    });

    it('emits info-level entry on success', () => {
      const logger = new LambdaLogger('send-email', 'req-012');
      logger.logSuccess('delivered', 'test@domain.com');

      const output = getLastOutput();
      expect(output.level).toBe('info');
    });

    it('includes function name and status in success log', () => {
      const logger = new LambdaLogger('send-sms', 'req-013');
      logger.logSuccess('sent', '555-123-4567');

      const output = getLastOutput();
      expect(output.context.functionName).toBe('send-sms');
      expect(output.context.status).toBe('sent');
    });
  });

  describe('Missing parameter names on validation failure (Req 12.7)', () => {
    it('emits warn-level entry with missing param names', () => {
      const logger = new LambdaLogger('send-email', 'req-020');
      logger.logValidationFailure(['to', 'subject']);

      const output = getLastOutput();
      expect(output.level).toBe('warn');
      expect(output.context.missingParams).toContain('to');
      expect(output.context.missingParams).toContain('subject');
    });

    it('includes function name in validation failure log', () => {
      const logger = new LambdaLogger('send-sms', 'req-021');
      logger.logValidationFailure(['to']);

      const output = getLastOutput();
      expect(output.context.functionName).toBe('send-sms');
    });

    it('handles single missing param', () => {
      const logger = new LambdaLogger('send-email', 'req-022');
      logger.logValidationFailure(['htmlBody']);

      const output = getLastOutput();
      expect(output.level).toBe('warn');
      expect(output.context.missingParams).toContain('htmlBody');
    });

    it('handles multiple missing params', () => {
      const logger = new LambdaLogger('send-email', 'req-023');
      logger.logValidationFailure(['to', 'subject', 'htmlBody']);

      const output = getLastOutput();
      expect(output.context.missingParams).toContain('to');
      expect(output.context.missingParams).toContain('subject');
      expect(output.context.missingParams).toContain('htmlBody');
    });
  });

  describe('Never throws (Req 12.7)', () => {
    it('does not throw when logError receives non-Error input', () => {
      const logger = new LambdaLogger('send-email', 'req-030');
      expect(() => logger.logError('string error')).not.toThrow();
      expect(() => logger.logError(null)).not.toThrow();
      expect(() => logger.logError(undefined)).not.toThrow();
      expect(() => logger.logError(42)).not.toThrow();
    });

    it('does not throw when logSuccess receives empty recipient', () => {
      const logger = new LambdaLogger('send-email', 'req-031');
      expect(() => logger.logSuccess('delivered', '')).not.toThrow();
    });

    it('does not throw when logValidationFailure receives empty array', () => {
      const logger = new LambdaLogger('send-email', 'req-032');
      expect(() => logger.logValidationFailure([])).not.toThrow();
    });

    it('does not throw when context contains problematic values', () => {
      const logger = new LambdaLogger('send-sms', 'req-033');
      expect(() => logger.info('test', { key: undefined })).not.toThrow();
      expect(() => logger.info('test', { key: null })).not.toThrow();
    });
  });

  describe('Sanitizer applied to context (Req 12.6)', () => {
    it('redacts fields with sensitive keys', () => {
      const logger = new LambdaLogger('send-email', 'req-040');
      logger.info('Processing', {
        accessToken: 'sq-token-xyz123',
        functionName: 'send-email',
      });

      const output = getLastOutput();
      expect(output.context.accessToken).toBe('[REDACTED]');
      expect(output.context.functionName).toBe('send-email');
    });

    it('redacts keys containing "secret"', () => {
      const logger = new LambdaLogger('send-email', 'req-041');
      logger.info('Processing', { apiSecret: 'super-secret-value' });

      const output = getLastOutput();
      expect(output.context.apiSecret).toBe('[REDACTED]');
    });

    it('redacts keys containing "password"', () => {
      const logger = new LambdaLogger('send-email', 'req-042');
      logger.info('Processing', { userPassword: 'abc123' });

      const output = getLastOutput();
      expect(output.context.userPassword).toBe('[REDACTED]');
    });

    it('redacts keys containing "credential"', () => {
      const logger = new LambdaLogger('send-email', 'req-043');
      logger.info('Processing', { oauthCredential: 'cred-value' });

      const output = getLastOutput();
      expect(output.context.oauthCredential).toBe('[REDACTED]');
    });

    it('tracks redacted fields in context', () => {
      const logger = new LambdaLogger('send-email', 'req-044');
      logger.info('Processing', {
        refreshToken: 'token-value',
        normalField: 'visible',
      });

      const output = getLastOutput();
      expect(output.context.redactedFields).toContain('refreshToken');
      expect(output.context.normalField).toBe('visible');
    });
  });
});
