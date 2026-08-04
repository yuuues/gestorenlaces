const { test } = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { createIncidentStore } = require('../modules/health/incident-store');
const { createIncidentManager } = require('../modules/health/incident-manager');

const NOW = '2026-07-28T10:00:00.000Z';
const PLUS_ONE_MINUTE = '2026-07-28T10:01:00.000Z';
const PLUS_TWO_MINUTES = '2026-07-28T10:02:00.000Z';
const PLUS_FOURTEEN_MINUTES = '2026-07-28T10:14:00.000Z';
const PLUS_SIXTEEN_MINUTES = '2026-07-28T10:16:00.000Z';

const okResult = {
  serverId: 1,
  name: 'Magma Nodo 1',
  url: 'https://magma.example/health',
  status: 'ok',
  components: {},
  error: null
};

const errorResult = {
  ...okResult,
  status: 'error',
  components: {
    database: { name: 'Database', status: 'error' }
  },
  error: {
    kind: 'component',
    message: 'Components failed: Database',
    components: ['Database']
  }
};

const warningResult = {
  ...okResult,
  status: 'warning',
  components: {
    database: { name: 'Database', status: 'warning' }
  },
  error: null,
  warning: {
    kind: 'component',
    message: 'Components warning: Database',
    components: ['Database']
  }
};

const get = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const close = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });

const fixture = async (t) => {
  const db = new sqlite3.Database(':memory:');
  t.after(() => close(db));
  const store = createIncidentStore(db);
  await store.ensureSchema();
  const manager = createIncidentManager({
    store,
    failureThreshold: 2,
    reminderMs: 15 * 60 * 1000
  });
  return { db, store, manager };
};

const openIncident = async (manager) => {
  await manager.record(errorResult, NOW);
  const opened = await manager.record(errorResult, PLUS_ONE_MINUTE);
  return opened.incident;
};

test('success without an incident performs no insert', async (t) => {
  const { db, manager } = await fixture(t);

  const outcome = await manager.record(okResult, NOW);

  assert.equal(outcome.incident, null);
  assert.equal(outcome.notification, null);
  assert.equal(
    (await get(db, 'SELECT COUNT(*) AS count FROM health_incidents')).count,
    0
  );
});

test('warning without an active incident is not persisted or notified', async (t) => {
  const { db, manager } = await fixture(t);

  const outcome = await manager.record(warningResult, NOW);

  assert.equal(outcome.incident, null);
  assert.equal(outcome.notification, null);
  assert.equal(
    (await get(db, 'SELECT COUNT(*) AS count FROM health_incidents')).count,
    0
  );
});

test('warning discards a pending error sequence', async (t) => {
  const { store, manager } = await fixture(t);
  await manager.record(errorResult, NOW);

  const outcome = await manager.record(warningResult, PLUS_ONE_MINUTE);

  assert.equal(outcome.incident, null);
  assert.equal(outcome.notification, null);
  assert.equal(await store.getActive(errorResult.serverId), null);
});

test('warning resolves an open error silently without pending recovery', async (t) => {
  const { store, manager } = await fixture(t);
  const opened = await openIncident(manager);
  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, true);

  const outcome = await manager.record(warningResult, PLUS_TWO_MINUTES);

  assert.equal(outcome.incident.status, 'resolved');
  assert.equal(outcome.incident.resolution_reason, 'warning');
  assert.equal(outcome.incident.recovery_notified_at, PLUS_TWO_MINUTES);
  assert.equal(outcome.notification, null);
  assert.equal(await store.getPendingRecovery(errorResult.serverId), null);
});

test('one failure creates pending state and recovery deletes it', async (t) => {
  const { db, store, manager } = await fixture(t);

  const first = await manager.record(errorResult, NOW);

  assert.equal(first.incident.status, 'pending');
  assert.equal(first.notification, null);
  assert.equal((await store.getActive(errorResult.serverId)).status, 'pending');

  await manager.record(okResult, PLUS_ONE_MINUTE);

  assert.equal(
    (await get(db, 'SELECT COUNT(*) AS count FROM health_incidents')).count,
    0
  );
});

test('second consecutive failure opens one incident', async (t) => {
  const { db, store, manager } = await fixture(t);

  await manager.record(errorResult, NOW);
  const second = await manager.record(errorResult, PLUS_ONE_MINUTE);

  assert.equal(second.incident.status, 'open');
  assert.equal(second.incident.consecutive_failures, 2);
  assert.equal(second.notification.type, 'opened');
  assert.deepEqual(second.notification.server, {
    id: 1,
    name: 'Magma Nodo 1',
    url: 'https://magma.example/health'
  });
  assert.equal((await store.listRecent(20)).length, 1);
  assert.equal(
    (await get(db, 'SELECT COUNT(*) AS count FROM health_incidents')).count,
    1
  );
});

test('continued failures update one row and remind only after 15 minutes', async (t) => {
  const { db, store, manager } = await fixture(t);
  const opened = await openIncident(manager);
  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, true);

  const early = await manager.record(errorResult, PLUS_FOURTEEN_MINUTES);
  const due = await manager.record(errorResult, PLUS_SIXTEEN_MINUTES);

  assert.equal(early.notification, null);
  assert.equal(due.notification.type, 'reminder');
  assert.equal(due.incident.consecutive_failures, 4);
  assert.equal(
    (await get(db, 'SELECT COUNT(*) AS count FROM health_incidents')).count,
    1
  );
  assert.equal((await store.listRecent(20))[0].last_error.kind, 'component');
});

test('failed delivery increments attempts but remains eligible next cycle', async (t) => {
  const { store, manager } = await fixture(t);
  const opened = await openIncident(manager);

  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, false);
  const retry = await manager.record(errorResult, PLUS_TWO_MINUTES);

  assert.equal(retry.notification.type, 'opened');
  assert.equal(retry.incident.notification_attempts, 1);
  assert.equal(retry.incident.alert_notified_at, null);
  assert.equal((await store.getActive(errorResult.serverId)).status, 'open');
});

test('success resolves an open incident and requests recovery delivery', async (t) => {
  const { manager } = await fixture(t);
  const opened = await openIncident(manager);
  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, true);

  const result = await manager.record(okResult, PLUS_TWO_MINUTES);

  assert.equal(result.incident.status, 'resolved');
  assert.equal(result.incident.resolution_reason, 'recovered');
  assert.equal(result.notification.type, 'recovered');
});

test('resolved incident without an initial delivery requests one summary', async (t) => {
  const { manager } = await fixture(t);
  await openIncident(manager);

  const result = await manager.record(okResult, PLUS_TWO_MINUTES);

  assert.equal(result.incident.status, 'resolved');
  assert.equal(result.notification.type, 'resolved-summary');
});

test('a failed recovery delivery is requested again on the next healthy check', async (t) => {
  const { manager } = await fixture(t);
  const opened = await openIncident(manager);
  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, true);
  const resolved = await manager.record(okResult, PLUS_TWO_MINUTES);
  await manager.markDelivery(
    resolved.incident.id,
    'recovered',
    PLUS_TWO_MINUTES,
    false
  );

  const retry = await manager.record(
    okResult,
    '2026-07-28T10:03:00.000Z'
  );

  assert.equal(retry.notification.type, 'recovered');
  assert.equal(retry.incident.notification_attempts, 2);
});

test('a new manager instance resumes an open incident from SQLite', async (t) => {
  const { store, manager } = await fixture(t);
  await openIncident(manager);
  const restarted = createIncidentManager({
    store,
    failureThreshold: 2,
    reminderMs: 15 * 60 * 1000
  });

  const result = await restarted.record(errorResult, PLUS_TWO_MINUTES);

  assert.equal(result.incident.status, 'open');
  assert.equal(result.incident.consecutive_failures, 3);
  assert.equal((await store.listRecent(20)).length, 1);
});

test('removing a monitored server discards pending state', async (t) => {
  const { db, manager } = await fixture(t);
  await manager.record(errorResult, NOW);

  await manager.closeForRemovedServer(errorResult.serverId, PLUS_ONE_MINUTE);

  assert.equal(
    (await get(db, 'SELECT COUNT(*) AS count FROM health_incidents')).count,
    0
  );
});

test('removing a server closes an open incident without recovery delivery', async (t) => {
  const { store, manager } = await fixture(t);
  await openIncident(manager);

  await manager.closeForRemovedServer(errorResult.serverId, PLUS_TWO_MINUTES);

  const [incident] = await store.listRecent(20);
  assert.equal(incident.status, 'resolved');
  assert.equal(incident.resolution_reason, 'monitor_removed');
  assert.equal(incident.recovery_notified_at, PLUS_TWO_MINUTES);
  assert.equal(await store.getPendingRecovery(errorResult.serverId), null);
});

test('a stale failure cannot reopen an incident closed after server removal', async (t) => {
  const { store, manager } = await fixture(t);
  const opened = await openIncident(manager);
  await manager.closeForRemovedServer(errorResult.serverId, PLUS_TWO_MINUTES);

  const staleUpdate = await store.updateFailure(
    opened,
    errorResult,
    '2026-07-28T10:03:00.000Z'
  );
  const [stored] = await store.listRecent(20);

  assert.equal(staleUpdate, null);
  assert.equal(stored.status, 'resolved');
  assert.equal(stored.resolution_reason, 'monitor_removed');
  assert.equal(stored.resolved_at, PLUS_TWO_MINUTES);
});

test('failureThreshold one opens an incident on the first failure', async (t) => {
  const { store } = await fixture(t);
  const manager = createIncidentManager({
    store,
    failureThreshold: 1,
    reminderMs: 15 * 60 * 1000
  });

  const result = await manager.record(errorResult, NOW);

  assert.equal(result.incident.status, 'open');
  assert.equal(result.notification.type, 'opened');
});

test('listRecent clamps storage output to confirmed incidents', async (t) => {
  const { store, manager } = await fixture(t);
  await manager.record(errorResult, NOW);

  assert.deepEqual(await store.listRecent(20), []);
});

test('server history filters confirmed incidents before pagination', async (t) => {
  const { db, store } = await fixture(t);
  const insertIncident = (values) =>
    run(
      db,
      `
        INSERT INTO health_incidents (
          server_id, server_name, status, first_failed_at, last_failed_at,
          opened_at, resolved_at, resolution_reason, consecutive_failures,
          last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        values.serverId,
        values.serverName,
        values.status,
        values.firstFailedAt,
        values.firstFailedAt,
        values.firstFailedAt,
        values.resolvedAt,
        values.reason,
        2,
        JSON.stringify(values.error)
      ]
    );

  await insertIncident({
    serverId: 1,
    serverName: 'Magma Nodo 1',
    status: 'resolved',
    firstFailedAt: '2026-07-28T10:00:00.000Z',
    resolvedAt: '2026-07-28T10:02:00.000Z',
    reason: 'recovered',
    error: { message: 'DB newer', components: ['Database'] }
  });
  await insertIncident({
    serverId: 1,
    serverName: 'Magma Nodo 1',
    status: 'resolved',
    firstFailedAt: '2026-07-27T10:00:00.000Z',
    resolvedAt: '2026-07-27T10:03:00.000Z',
    reason: 'warning',
    error: { message: 'DB older', components: ['Database'] }
  });
  await insertIncident({
    serverId: 2,
    serverName: 'Other',
    status: 'resolved',
    firstFailedAt: '2026-07-30T10:00:00.000Z',
    resolvedAt: '2026-07-30T10:01:00.000Z',
    reason: 'recovered',
    error: { message: 'Other DB', components: ['Database'] }
  });
  await insertIncident({
    serverId: 1,
    serverName: 'Magma Nodo 1',
    status: 'pending',
    firstFailedAt: '2026-07-31T10:00:00.000Z',
    resolvedAt: null,
    reason: null,
    error: { message: 'Pending DB', components: ['Database'] }
  });

  const firstPage = await store.listForServer(1, {
    limit: 1,
    offset: 0,
    status: 'resolved',
    component: 'Database',
    from: '2026-07-27T00:00:00.000Z'
  });
  const secondPage = await store.listForServer(1, {
    limit: 1,
    offset: 1,
    status: 'resolved',
    component: 'Database',
    from: '2026-07-27T00:00:00.000Z'
  });

  assert.equal(firstPage.total, 2);
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.items[0].last_error.message, 'DB newer');
  assert.equal(secondPage.total, 2);
  assert.equal(secondPage.items[0].last_error.message, 'DB older');
  assert.equal(firstPage.items[0].server_id, 1);
});
