const { test } = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const {
  createStatusHistoryStore
} = require('../modules/health/status-history-store');

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });

const close = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });

const fixture = async (
  t,
  { intervalMs = 60000, retentionMs = 7 * 24 * 60 * 60 * 1000 } = {}
) => {
  const db = new sqlite3.Database(':memory:');
  t.after(() => close(db));
  const store = createStatusHistoryStore(db, { intervalMs, retentionMs });
  await store.ensureSchema();
  return { db, store };
};

test('records one compressed period while status remains unchanged', async (t) => {
  const { db, store } = await fixture(t);

  await store.record(1, 'ok', '2026-08-04T10:00:00.000Z');
  await store.record(1, 'ok', '2026-08-04T10:01:00.000Z');

  const rows = await all(db, 'SELECT * FROM health_status_periods');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].server_id, 1);
  assert.equal(rows[0].status, 'ok');
  assert.equal(rows[0].started_at, '2026-08-04T10:00:00.000Z');
  assert.equal(rows[0].last_observed_at, '2026-08-04T10:01:00.000Z');
  assert.equal(rows[0].ended_at, null);
});

test('closes the previous period when severity changes', async (t) => {
  const { db, store } = await fixture(t);

  await store.record(1, 'ok', '2026-08-04T10:00:00.000Z');
  await store.record(1, 'warning', '2026-08-04T10:01:00.000Z');

  const rows = await all(
    db,
    'SELECT status, ended_at FROM health_status_periods ORDER BY id'
  );
  assert.deepEqual(rows, [
    { status: 'ok', ended_at: '2026-08-04T10:01:00.000Z' },
    { status: 'warning', ended_at: null }
  ]);
});

test('leaves unknown time between observations separated by a monitor gap', async (t) => {
  const { db, store } = await fixture(t, { intervalMs: 60000 });

  await store.record(1, 'ok', '2026-08-04T10:00:00.000Z');
  await store.record(1, 'ok', '2026-08-04T10:05:00.000Z');

  const rows = await all(
    db,
    'SELECT started_at, ended_at FROM health_status_periods ORDER BY id'
  );
  assert.deepEqual(rows, [
    {
      started_at: '2026-08-04T10:00:00.000Z',
      ended_at: '2026-08-04T10:01:00.000Z'
    },
    {
      started_at: '2026-08-04T10:05:00.000Z',
      ended_at: null
    }
  ]);
});

test('rejects invalid statuses and timestamps without inserting rows', async (t) => {
  const { db, store } = await fixture(t);

  await assert.rejects(
    store.record(1, 'degraded', '2026-08-04T10:00:00.000Z'),
    /Invalid health status/
  );
  await assert.rejects(store.record(1, 'ok', 'not-a-date'), /Invalid observation/);

  const [{ count }] = await all(
    db,
    'SELECT COUNT(*) AS count FROM health_status_periods'
  );
  assert.equal(count, 0);
});

test('closing a removed server preserves the final covered interval', async (t) => {
  const { db, store } = await fixture(t);
  await store.record(1, 'error', '2026-08-04T10:00:00.000Z');

  await store.closeForRemovedServer(1, '2026-08-04T10:01:30.000Z');

  const [row] = await all(
    db,
    'SELECT ended_at FROM health_status_periods WHERE server_id = 1'
  );
  assert.equal(row.ended_at, '2026-08-04T10:01:30.000Z');
});

test('prunes only completed periods older than the retention window', async (t) => {
  const { db, store } = await fixture(t, {
    retentionMs: 7 * 24 * 60 * 60 * 1000
  });
  await store.record(1, 'ok', '2026-07-20T10:00:00.000Z');
  await store.record(1, 'error', '2026-07-20T10:01:00.000Z');
  await store.closeForRemovedServer(1, '2026-07-20T10:02:00.000Z');
  await store.record(2, 'warning', '2026-08-03T10:00:00.000Z');
  await store.closeForRemovedServer(2, '2026-08-03T10:01:00.000Z');
  await store.record(3, 'ok', '2026-07-01T10:00:00.000Z');

  await store.prune('2026-08-04T10:00:00.000Z');

  const rows = await all(
    db,
    'SELECT server_id, ended_at FROM health_status_periods ORDER BY server_id, id'
  );
  assert.deepEqual(rows, [
    { server_id: 2, ended_at: '2026-08-03T10:01:00.000Z' },
    { server_id: 3, ended_at: null }
  ]);
});

test('lists only periods overlapping the requested servers and window', async (t) => {
  const { store } = await fixture(t, { intervalMs: 60 * 60 * 1000 });
  await store.record(1, 'ok', '2026-08-04T09:00:00.000Z');
  await store.record(1, 'error', '2026-08-04T10:00:00.000Z');
  await store.closeForRemovedServer(1, '2026-08-04T10:30:00.000Z');
  await store.record(2, 'warning', '2026-08-04T10:10:00.000Z');
  await store.record(3, 'error', '2026-08-04T10:15:00.000Z');

  const rows = await store.listOverlapping(
    [1, 2],
    '2026-08-04T09:30:00.000Z',
    '2026-08-04T11:00:00.000Z'
  );

  assert.deepEqual(
    rows.map(({ server_id, status }) => ({ server_id, status })),
    [
      { server_id: 1, status: 'ok' },
      { server_id: 1, status: 'error' },
      { server_id: 2, status: 'warning' }
    ]
  );
});

test('returns no periods when no server ids are requested', async (t) => {
  const { store } = await fixture(t);
  await store.record(1, 'ok', '2026-08-04T10:00:00.000Z');

  const rows = await store.listOverlapping(
    [],
    '2026-08-04T09:00:00.000Z',
    '2026-08-04T11:00:00.000Z'
  );

  assert.deepEqual(rows, []);
});
