/**
 * Unit tests for the Error Logging Middleware.
 *
 * Validates Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { jest } from '@jest/globals';
import { withErrorLogging, inferDomain, extractCorrelationId } from '../../lib/logger/middleware.ts';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('inferDomain', () => {
  it('maps /api/payment/* to payment', () => {
    expect(inferDomain('/api/payment/charge')).toBe('payment');
    expect(inferDomain('/api/payment/')).toBe('payment');
  });

  it('maps /api/square/* to payment', () => {
    expect(inferDomain('/api/square/webhook')).toBe('payment');
  });

  it('maps /api/appointments/* to booking', () => {
    expect(inferDomain('/api/appointments/create')).toBe('booking');
  });

  it('maps /api/booking-blackout/* to booking', () => {
    expect(inferDomain('/api/booking-blackout/list')).toBe('booking');
  });

  it('maps /api/availability/* to booking', () => {
    expect(inferDomain('/api/availability/check')).toBe('booking');
  });

  it('maps /api/available-dates/* to booking', () => {
    expect(inferDomain('/api/available-dates/2024')).toBe('booking');
  });

  it('maps /api/eligible-staff/* to booking', () => {
    expect(inferDomain('/api/eligible-staff/list')).toBe('booking');
  });

  it('maps /api/staff-schedules/* to scheduling', () => {
    expect(inferDomain('/api/staff-schedules/update')).toBe('scheduling');
  });

  it('maps /api/staff/* to scheduling', () => {
    expect(inferDomain('/api/staff/abc123')).toBe('scheduling');
  });

  it('maps /api/send-sms/* to notification', () => {
    expect(inferDomain('/api/send-sms/send')).toBe('notification');
  });

  it('returns general for unmatched paths', () => {
    expect(inferDomain('/api/unknown/route')).toBe('general');
    expect(inferDomain('/dashboard')).toBe('general');
    expect(inferDomain('/')).toBe('general');
  });
});

describe('extractCorrelationId', () => {
  it('generates a new UUID when no X-Correlation-ID header is present', () => {
    const request = new Request('http://localhost/api/test');
    const result = extractCorrelationId(request);

    expect(UUID_V4_REGEX.test(result.correlationId)).toBe(true);
    expect(result.originalCorrelationId).toBeUndefined();
  });

  it('uses valid UUID v4 from X-Correlation-ID header', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Correlation-ID': validUuid },
    });
    const result = extractCorrelationId(request);

    expect(result.correlationId).toBe(validUuid);
    expect(result.originalCorrelationId).toBeUndefined();
  });

  it('generates new UUID and stores original when X-Correlation-ID is invalid', () => {
    const invalidValue = 'not-a-uuid';
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Correlation-ID': invalidValue },
    });
    const result = extractCorrelationId(request);

    expect(UUID_V4_REGEX.test(result.correlationId)).toBe(true);
    expect(result.correlationId).not.toBe(invalidValue);
    expect(result.originalCorrelationId).toBe(invalidValue);
  });

  it('rejects UUID v1 format (wrong version digit)', () => {
    const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Correlation-ID': uuidV1 },
    });
    const result = extractCorrelationId(request);

    expect(UUID_V4_REGEX.test(result.correlationId)).toBe(true);
    expect(result.originalCorrelationId).toBe(uuidV1);
  });
});

describe('withErrorLogging', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('passes through successful responses with X-Correlation-ID header', async () => {
    const handler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/payment/charge', {
      method: 'POST',
    });
    const response = await wrapped(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Correlation-ID')).toBeTruthy();
    expect(UUID_V4_REGEX.test(response.headers.get('X-Correlation-ID'))).toBe(true);
  });

  it('preserves provided valid correlation ID in response', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const handler = async () => new Response('ok', { status: 200 });
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Correlation-ID': validUuid },
    });
    const response = await wrapped(request);

    expect(response.headers.get('X-Correlation-ID')).toBe(validUuid);
  });

  it('returns HTTP 500 with correlationId on unhandled exception', async () => {
    const handler = async () => { throw new Error('Something broke'); };
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/payment/charge', {
      method: 'POST',
    });
    const response = await wrapped(request);

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Correlation-ID')).toBeTruthy();

    const body = await response.json();
    expect(body.error).toBe('Internal Server Error');
    expect(body.correlationId).toBeTruthy();
    expect(UUID_V4_REGEX.test(body.correlationId)).toBe(true);
  });

  it('emits error-level log entry on unhandled exception', async () => {
    const handler = async () => { throw new Error('Test error'); };
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/payment/charge', {
      method: 'POST',
      body: JSON.stringify({ amount: 5000 }),
    });
    const response = await wrapped(request);

    expect(response.status).toBe(500);

    // Find the error log entry from stdout writes
    const logCalls = stdoutSpy.mock.calls.map(call => call[0]);
    const errorLog = logCalls.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.level === 'error' && parsed.message.includes('Test error');
      } catch { return false; }
    });

    expect(errorLog).toBeDefined();
    const parsed = JSON.parse(errorLog);
    expect(parsed.level).toBe('error');
    expect(parsed.domain).toBe('payment');
    expect(parsed.context.httpMethod).toBe('POST');
    expect(parsed.context.routePath).toBe('/api/payment/charge');
    expect(parsed.context.errorMessage).toBe('Test error');
    expect(parsed.context.stackTrace).toBeTruthy();
    expect(UUID_V4_REGEX.test(parsed.correlationId)).toBe(true);
  });

  it('includes sanitized request body in log context', async () => {
    const handler = async () => { throw new Error('Fail'); };
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/payment/charge', {
      method: 'POST',
      body: JSON.stringify({ vendorId: 'v123', note: 'charge test' }),
    });
    await wrapped(request);

    const logCalls = stdoutSpy.mock.calls.map(call => call[0]);
    const errorLog = logCalls.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.level === 'error' && parsed.context.requestBody;
      } catch { return false; }
    });

    expect(errorLog).toBeDefined();
    const parsed = JSON.parse(errorLog);
    expect(parsed.context.requestBody).toContain('vendorId');
    expect(parsed.context.requestBody).toContain('v123');
  });

  it('truncates stack trace to 4096 characters', async () => {
    const longStackError = new Error('Stack overflow');
    longStackError.stack = 'a'.repeat(5000);

    const handler = async () => { throw longStackError; };
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/test', { method: 'GET' });
    await wrapped(request);

    const logCalls = stdoutSpy.mock.calls.map(call => call[0]);
    const errorLog = logCalls.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.level === 'error' && parsed.context.stackTrace;
      } catch { return false; }
    });

    expect(errorLog).toBeDefined();
    const parsed = JSON.parse(errorLog);
    expect(parsed.context.stackTrace.length).toBeLessThanOrEqual(4096);
  });

  it('stores original invalid correlation ID in log context', async () => {
    const handler = async () => { throw new Error('Fail'); };
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/test', {
      method: 'GET',
      headers: { 'X-Correlation-ID': 'invalid-id' },
    });
    await wrapped(request);

    const logCalls = stdoutSpy.mock.calls.map(call => call[0]);
    const errorLog = logCalls.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.level === 'error' && parsed.context.originalCorrelationId;
      } catch { return false; }
    });

    expect(errorLog).toBeDefined();
    const parsed = JSON.parse(errorLog);
    expect(parsed.context.originalCorrelationId).toBe('invalid-id');
  });

  it('infers domain correctly for error logs', async () => {
    const handler = async () => { throw new Error('Fail'); };
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/appointments/create', {
      method: 'POST',
    });
    await wrapped(request);

    const logCalls = stdoutSpy.mock.calls.map(call => call[0]);
    const errorLog = logCalls.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.level === 'error';
      } catch { return false; }
    });

    expect(errorLog).toBeDefined();
    const parsed = JSON.parse(errorLog);
    expect(parsed.domain).toBe('booking');
  });

  it('handles non-Error exceptions gracefully', async () => {
    const handler = async () => { throw 'string error'; };
    const wrapped = withErrorLogging(handler);

    const request = new Request('http://localhost/api/test', { method: 'GET' });
    const response = await wrapped(request);

    expect(response.status).toBe(500);

    const logCalls = stdoutSpy.mock.calls.map(call => call[0]);
    const errorLog = logCalls.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.level === 'error' && parsed.context.errorMessage === 'string error';
      } catch { return false; }
    });

    expect(errorLog).toBeDefined();
  });

  it('passes route context to the original handler', async () => {
    let receivedContext;
    const handler = async (_req, ctx) => {
      receivedContext = ctx;
      return new Response('ok');
    };
    const wrapped = withErrorLogging(handler);

    const routeContext = { params: { id: '123' } };
    const request = new Request('http://localhost/api/test');
    await wrapped(request, routeContext);

    expect(receivedContext).toEqual(routeContext);
  });
});
