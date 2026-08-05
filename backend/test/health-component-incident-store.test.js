const { test } = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const {
  createComponentIncidentStore
} = require('../modules/health/component-incident-store');

const T0 = '2026-08-04T10:00:00.000Z';
const T1 = '2026-08-04T10:01:00.000Z';
const T2 = '2026-08-04T10:02:00.000Z';
const T3 = '2026-08-04T10:03:00.000Z';

const close = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });

const exec = (db, sql) =>
  new Promise((resolve, reject) => {
    db.exec(sql, (error) => (error ? reject(error) : resolve()));
  });

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });

const fixture = async (t) => {
  const db = new sqlite3.Database(':memory:');
  t.after(() => close(db));
  const store = createComponentIncidentStore(db);
  await store.ensureSchema();
  return { db, store };
};

const observation = (overrides = {}) => ({
  serverId: 7,
  serverName: 'Magma Nodo 7',
  componentKey: 'db',
  componentName: 'Database',
  severity: 'warning',
  messages: ['Latencia alta'],
  signature: '["Latencia alta"]',
  ...overrides
});

test('creates one open component episode with a decoded detected event', async (t) => {
  const { store } = await fixture(t);

  const created = await store.createEpisode(observation(), T0);

  assert.equal(created.server_id, 7);
  assert.equal(created.component_key, 'db');
  assert.equal(created.status, 'open');
  assert.equal(created.current_severity, 'warning');
  assert.equal(created.highest_severity, 'warning');
  assert.equal(created.observation_count, 1);
  assert.deepEqual(created.events, [{
    id: created.events[0].id,
    type: 'detected',
    severity: 'warning',
    observed_at: T0,
    messages: ['Latencia alta']
  }]);
});

test('reports the store invariant when a component already has an open episode', async (t) => {
  const { store } = await fixture(t);
  await store.createEpisode(observation(), T0);

  await assert.rejects(
    store.createEpisode(observation(), T0),
    (error) => {
      assert.match(error.message, /open component incident already exists/i);
      assert.notEqual(error.code, 'SQLITE_CONSTRAINT');
      return true;
    }
  );
});

test('serializes concurrent episode transactions on the shared connection', async (t) => {
  const { store } = await fixture(t);

  const created = await Promise.all([
    store.createEpisode(observation({ componentKey: 'db' }), T0),
    store.createEpisode(observation({ componentKey: 'db2' }), T0)
  ]);

  assert.deepEqual(created.map(({ component_key }) => component_key), ['db', 'db2']);
});

test('touch increments observations without adding a timeline event', async (t) => {
  const { store } = await fixture(t);
  const created = await store.createEpisode(observation(), T0);

  const touched = await store.touch(
    created,
    observation({ severity: 'error' }),
    T1
  );

  assert.equal(touched.current_severity, 'error');
  assert.equal(touched.highest_severity, 'error');
  assert.equal(touched.observation_count, 2);
  assert.equal(touched.events.length, 1);
});

test('appendUpdate records one decoded event and the latest message signature', async (t) => {
  const { store } = await fixture(t);
  const created = await store.createEpisode(observation(), T0);
  const changed = observation({
    severity: 'error',
    messages: ['Timeout'],
    signature: '["Timeout"]'
  });

  const updated = await store.appendUpdate(created, changed, T1);

  assert.equal(updated.current_severity, 'error');
  assert.equal(updated.highest_severity, 'error');
  assert.equal(updated.last_message_signature, '["Timeout"]');
  assert.equal(updated.observation_count, 2);
  assert.deepEqual(updated.events.map(({ type, severity, messages }) => ({
    type,
    severity,
    messages
  })), [
    { type: 'detected', severity: 'warning', messages: ['Latencia alta'] },
    { type: 'update', severity: 'error', messages: ['Timeout'] }
  ]);
});

test('recovery closes only the selected component and appends one green event', async (t) => {
  const { store } = await fixture(t);
  const dbIncident = await store.createEpisode(observation(), T0);
  await store.createEpisode(observation({ componentKey: 'db2' }), T0);

  const resolved = await store.resolve(dbIncident, T1, 'recovered');
  const active = await store.listActive(7);

  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.current_severity, 'ok');
  assert.equal(resolved.resolution_reason, 'recovered');
  assert.deepEqual(resolved.events.at(-1), {
    id: resolved.events.at(-1).id,
    type: 'recovered',
    severity: 'ok',
    observed_at: T1,
    messages: []
  });
  assert.deepEqual(active.map(({ component_key }) => component_key), ['db2']);
});

test('removed monitor closes all server episodes without green recovery events', async (t) => {
  const { store } = await fixture(t);
  await store.createEpisode(observation({ componentKey: 'db' }), T0);
  await store.createEpisode(observation({ componentKey: 'db2' }), T0);
  await store.createEpisode(observation({
    serverId: 8,
    serverName: 'Magma Nodo 8',
    componentKey: 'cache'
  }), T0);

  await store.closeForRemovedServer(7, T1);

  const closed = await store.listForServer(7);
  assert.equal(closed.items.length, 2);
  assert.ok(closed.items.every(({ status }) => status === 'resolved'));
  assert.ok(closed.items.every(({ resolution_reason }) => resolution_reason === 'monitor_removed'));
  assert.ok(closed.items.every(({ events }) => events.length === 1));
  assert.deepEqual(
    (await store.listActive(8)).map(({ component_key }) => component_key),
    ['cache']
  );
});

test('filters incidents before pagination and orders newest episodes first', async (t) => {
  const { db, store } = await fixture(t);
  const oldest = await store.createEpisode(
    observation({ componentKey: 'db', componentName: 'Database' }),
    T0
  );
  await store.resolve(oldest, T1, 'recovered');
  await store.createEpisode(
    observation({ componentKey: 'cache', componentName: 'Cache' }),
    T1
  );
  const newest = await store.createEpisode(
    observation({ componentKey: 'db2', componentName: 'Replica' }),
    T2
  );
  await store.resolve(newest, T3, 'recovered');
  await store.createEpisode(observation({
    serverId: 8,
    serverName: 'Magma Nodo 8',
    componentKey: 'other'
  }), T3);

  const ordered = await store.listForServer(7, { limit: 2, offset: 0 });
  const resolvedPage = await store.listForServer(7, {
    status: 'resolved',
    limit: 1,
    offset: 1
  });
  const componentPage = await store.listForServer(7, { component: 'db2' });
  const recentPage = await store.listForServer(7, { from: T1 });

  assert.deepEqual(ordered.items.map(({ component_key }) => component_key), [
    'db2',
    'cache'
  ]);
  assert.equal(ordered.total, 3);
  assert.equal(ordered.limit, 2);
  assert.equal(ordered.offset, 0);
  assert.equal(resolvedPage.total, 2);
  assert.deepEqual(resolvedPage.items.map(({ component_key }) => component_key), ['db']);
  assert.equal(componentPage.total, 1);
  assert.equal(componentPage.items[0].component_key, 'db2');
  assert.equal(recentPage.total, 2);

  const eventSelects = [];
  db.on('trace', (sql) => {
    if (/FROM health_component_incident_events/i.test(sql)) eventSelects.push(sql);
  });
  const oneItem = await store.listForServer(7, { limit: 1, offset: 0 });

  assert.equal(eventSelects.length, 1);
  assert.match(eventSelects[0], new RegExp(`IN \\(${oneItem.items[0].id}\\)`));
  assert.doesNotMatch(eventSelects[0], new RegExp(`\\b${oldest.id}\\b`));
});

test('migrates legacy incidents into component timelines exactly once', async (t) => {
  const db = new sqlite3.Database(':memory:');
  t.after(() => close(db));
  await exec(
    db,
    `
      CREATE TABLE health_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        server_name TEXT NOT NULL,
        status TEXT NOT NULL,
        first_failed_at TEXT NOT NULL,
        last_failed_at TEXT NOT NULL,
        opened_at TEXT,
        resolved_at TEXT,
        resolution_reason TEXT,
        consecutive_failures INTEGER NOT NULL,
        last_error TEXT NOT NULL
      )
    `
  );
  await run(
    db,
    `
      INSERT INTO health_incidents (
        server_id, server_name, status, first_failed_at, last_failed_at,
        opened_at, resolved_at, resolution_reason, consecutive_failures,
        last_error
      ) VALUES (?, ?, 'resolved', ?, ?, ?, ?, 'recovered', 4, ?)
    `,
    [
      7,
      'Magma Nodo 7',
      '2026-08-04T09:00:00.000Z',
      '2026-08-04T09:04:00.000Z',
      '2026-08-04T09:01:00.000Z',
      '2026-08-04T09:05:00.000Z',
      JSON.stringify({
        kind: 'component',
        message: 'Components failed: db, db2',
        components: ['db', 'db2']
      })
    ]
  );
  await run(
    db,
    `
      INSERT INTO health_incidents (
        server_id, server_name, status, first_failed_at, last_failed_at,
        opened_at, resolved_at, resolution_reason, consecutive_failures,
        last_error
      ) VALUES (?, ?, 'open', ?, ?, ?, NULL, NULL, 2, ?)
    `,
    [
      8,
      'Magma Nodo 8',
      '2026-08-04T09:10:00.000Z',
      '2026-08-04T09:11:00.000Z',
      '2026-08-04T09:11:00.000Z',
      JSON.stringify({ kind: 'network', message: 'ECONNREFUSED' })
    ]
  );

  const store = createComponentIncidentStore(db);
  await store.ensureSchema();
  await store.ensureSchema();

  const componentEpisodes = await store.listForServer(7);
  const [networkEpisode] = (await store.listForServer(8)).items;
  const [{ incidentCount }] = await all(
    db,
    'SELECT COUNT(*) AS incidentCount FROM health_component_incidents'
  );
  const [{ eventCount }] = await all(
    db,
    'SELECT COUNT(*) AS eventCount FROM health_component_incident_events'
  );

  assert.equal(incidentCount, 3);
  assert.equal(eventCount, 5);
  assert.deepEqual(
    componentEpisodes.items.map(({ component_key }) => component_key),
    ['db2', 'db']
  );
  for (const episode of componentEpisodes.items) {
    assert.equal(episode.status, 'resolved');
    assert.equal(episode.first_observed_at, '2026-08-04T09:00:00.000Z');
    assert.equal(episode.last_observed_at, '2026-08-04T09:04:00.000Z');
    assert.equal(episode.resolved_at, '2026-08-04T09:05:00.000Z');
    assert.equal(episode.observation_count, 4);
    assert.deepEqual(
      episode.events.map(({ type, severity, messages }) => ({
        type,
        severity,
        messages
      })),
      [
        {
          type: 'detected',
          severity: 'error',
          messages: ['Components failed: db, db2']
        },
        { type: 'recovered', severity: 'ok', messages: [] }
      ]
    );
  }
  assert.equal(networkEpisode.component_key, '__server__');
  assert.equal(networkEpisode.component_name, 'Conexión');
  assert.equal(networkEpisode.status, 'open');
  assert.equal(networkEpisode.observation_count, 2);
  assert.deepEqual(networkEpisode.events[0].messages, ['ECONNREFUSED']);
});
