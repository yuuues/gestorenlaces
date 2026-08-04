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

test('HTTP 200 with a warning component returns warning diagnostics', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      status: 'warning',
      components: {
        db: {
          name: 'db',
          status: 'warning',
          errors: [
            {
              severity: 'warning',
              message: 'Bloqueo en BD: 1 sesión bloqueada.'
            }
          ]
        }
      }
    }
  });

  assert.equal(result.status, 'warning');
  assert.equal(result.error, null);
  assert.equal(result.warning.kind, 'service');
  assert.equal(result.warning.message, 'Components warning: db');
  assert.deepEqual(result.warning.components, ['db']);
  assert.equal(result.components.db.status, 'warning');
});

test('an error component takes precedence over warning components', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      status: 'error',
      components: {
        db: { name: 'db', status: 'warning', errors: [] },
        core: { name: 'core', status: 'error', errors: [] }
      }
    }
  });

  assert.equal(result.status, 'error');
  assert.deepEqual(result.error.components, ['core']);
  assert.equal(result.warning, null);
});

test('HTTP error takes precedence over a structured warning payload', () => {
  const result = evaluateResponse({
    status: 500,
    data: {
      status: 'warning',
      components: {
        db: { name: 'db', status: 'warning', errors: [] }
      }
    }
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'http');
  assert.equal(result.error.httpStatus, 500);
  assert.equal(result.warning, null);
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

test('HTTP 500 with a structured health failure identifies the failed component', () => {
  const result = evaluateResponse({
    status: 500,
    data: {
      status: 'error',
      components: {
        core: {
          name: 'core',
          status: 'error',
          errors: [
            {
              severity: 'error',
              message: 'FALLO, no se ha podido validar la conexión!'
            }
          ]
        },
        database: { name: 'db', status: 'ok', errors: [] }
      }
    }
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'service');
  assert.equal(result.error.message, 'Components failed: core');
  assert.deepEqual(result.error.components, ['core']);
  assert.equal(result.error.httpStatus, 500);
  assert.equal(result.components.core.status, 'error');
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

test('HTTP 200 without a top-level ok status is invalid even when components are healthy', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      components: {
        database: { name: 'Database', status: 'ok' }
      }
    }
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'invalid_response');
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
