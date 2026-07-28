const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateResponse, checkServer } = require('../modules/health/checker');

test('HTTP 200 with all components ok is healthy', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      status: 'ok',
      components: {
        database: { name: 'Database', status: 'ok' }
      }
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.error, null);
  assert.equal(result.components.database.status, 'ok');
});

test('HTTP 200 with one failed component fails the whole server', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      status: 'ok',
      components: {
        database: {
          name: 'Database',
          status: 'error',
          errors: ['connection refused']
        }
      }
    }
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'component');
  assert.deepEqual(result.error.components, ['Database']);
});

test('HTTP 200 with a top-level error status is a failure', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      status: 'error',
      message: 'service unavailable'
    }
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'service');
  assert.equal(result.error.message, 'service unavailable');
});

test('non-200 response is a failure', () => {
  const result = evaluateResponse({ status: 503, data: {} });

  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'http');
  assert.equal(result.error.httpStatus, 503);
});

test('missing or non-object response body is invalid', () => {
  assert.equal(
    evaluateResponse({ status: 200, data: null }).error.kind,
    'invalid_response'
  );
  assert.equal(
    evaluateResponse({ status: 200, data: 'ok' }).error.kind,
    'invalid_response'
  );
});

test('checkServer passes the configured timeout and normalizes network errors', async () => {
  let receivedOptions;
  const httpClient = {
    get: async (_url, options) => {
      receivedOptions = options;
      const error = new Error('timeout of 5000ms exceeded');
      error.code = 'ECONNABORTED';
      throw error;
    }
  };

  const result = await checkServer(
    { id: 7, name: 'API', url: 'https://api.example/health' },
    {
      httpClient,
      timeoutMs: 5000,
      checkedAt: '2026-07-28T10:00:00.000Z'
    }
  );

  assert.equal(receivedOptions.timeout, 5000);
  assert.equal(receivedOptions.validateStatus(503), true);
  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'timeout');
  assert.equal(result.serverId, 7);
  assert.equal(result.checkedAt, '2026-07-28T10:00:00.000Z');
});

test('checkServer returns normalized information for a healthy response', async () => {
  const httpClient = {
    get: async () => ({
      status: 200,
      data: { status: 'ok', components: {} }
    })
  };

  const result = await checkServer(
    { id: 9, name: 'Auth', url: 'https://auth.example/health' },
    {
      httpClient,
      timeoutMs: 5000,
      checkedAt: '2026-07-28T10:00:00.000Z'
    }
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.info.connection, 'Conexión validada');
  assert.equal(result.name, 'Auth');
  assert.equal(result.url, 'https://auth.example/health');
});
