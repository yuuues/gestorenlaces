const { test } = require('node:test');
const assert = require('node:assert');
const { requireAuth } = require('../auth');

// Minimal mock of an Express req/res so we can unit-test the middleware
// without booting a server.
function makeReqRes(headerKey) {
  const req = { get: (name) => (name.toLowerCase() === 'x-admin-key' ? headerKey : undefined) };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  return { req, res };
}

test('rejects with 503 when ADMIN_KEY is not configured', () => {
  delete process.env.ADMIN_KEY;
  const { req, res } = makeReqRes('whatever');
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 503);
});

test('rejects with 401 when key is missing', () => {
  process.env.ADMIN_KEY = 'secret';
  const { req, res } = makeReqRes(undefined);
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('rejects with 401 when key is wrong', () => {
  process.env.ADMIN_KEY = 'secret';
  const { req, res } = makeReqRes('wrong');
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('calls next() when key matches', () => {
  process.env.ADMIN_KEY = 'secret';
  const { req, res } = makeReqRes('secret');
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
});
