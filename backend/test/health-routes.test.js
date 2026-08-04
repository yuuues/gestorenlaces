const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { readHealthConfig } = require('../modules/health/config');
const { createHealthModule } = require('../modules/health');

const silentLogger = { info() {}, warn() {}, error() {} };

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const closeDb = (db) =>
  new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const createFixture = async (t) => {
  const previousAdminKey = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = 'secret';
  t.after(() => {
    if (previousAdminKey === undefined) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = previousAdminKey;
  });

  const db = new sqlite3.Database(':memory:');
  const monitor = {
    runCount: 0,
    startCount: 0,
    stopped: false,
    getStatus: () => ({
      started: true,
      running: false,
      lastRunAt: '2026-07-28T10:00:00.000Z',
      nextRunAt: '2026-07-28T10:01:00.000Z',
      lastError: null,
      servers: {}
    }),
    start: async () => {
      monitor.startCount += 1;
      return monitor.getStatus();
    },
    stop: () => {
      monitor.stopped = true;
    },
    runNow: async () => {
      monitor.runCount += 1;
      return monitor.getStatus();
    },
    mutateCatalog: async (operation) => {
      monitor.mutationCount = (monitor.mutationCount || 0) + 1;
      return operation();
    }
  };
  const incidentManager = {
    requestedLimit: null,
    requestedHistory: null,
    closed: null,
    listRecent: async (limit) => {
      incidentManager.requestedLimit = limit;
      return [{ id: 1, status: 'open' }];
    },
    listForServer: async (serverId, filters) => {
      incidentManager.requestedHistory = { serverId, filters };
      return {
        items: [{ id: 7, server_id: serverId, status: 'resolved' }],
        total: 1,
        limit: filters.limit,
        offset: filters.offset
      };
    },
    closeForRemovedServer: async (serverId, now) => {
      incidentManager.closed = {
        serverId,
        reason: 'monitor_removed',
        at: now
      };
    }
  };
  const incidentStore = { ensureSchema: async () => {} };
  const statusHistoryStore = {
    ensureSchema: async () => {},
    closeForRemovedServer: async () => {}
  };
  const statusHistoryService = {
    calls: [],
    getHistory: async (serverIds, options) => {
      statusHistoryService.calls.push({ serverIds, options });
      return {
        from: options.from,
        to: options.to,
        bucketMinutes: options.bucketMinutes,
        servers: serverIds.map((serverId) => ({
          serverId,
          availabilityPercent: null,
          buckets: []
        }))
      };
    }
  };

  const app = express();
  app.use(express.json());
  const module = createHealthModule(app, db, {
    monitor,
    incidentManager,
    incidentStore,
    statusHistoryStore,
    statusHistoryService,
    logger: silentLogger,
    now: () => new Date('2026-07-28T10:00:00.000Z')
  });
  await module.ready;

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    module.monitor.stop();
    await closeServer(server);
    await closeDb(db);
  });

  return {
    db,
    monitor,
    incidentManager,
    statusHistoryStore,
    statusHistoryService,
    baseUrl
  };
};

test('invalid environment values use safe defaults without logging secrets', () => {
  const messages = [];
  const config = readHealthConfig(
    {
      HEALTH_CHECK_INTERVAL_SECONDS: '-1',
      HEALTH_FAILURE_THRESHOLD: 'zero',
      HEALTH_REMINDER_MINUTES: '',
      HEALTH_REQUEST_TIMEOUT_MS: 'NaN',
      TEAMS_HEALTH_WEBHOOK_URL: 'https://secret.example/hook'
    },
    {
      warn: (message) => messages.push(message)
    }
  );

  assert.equal(config.intervalMs, 60000);
  assert.equal(config.failureThreshold, 2);
  assert.equal(config.reminderMs, 15 * 60 * 1000);
  assert.equal(config.timeoutMs, 5000);
  assert.equal(config.teamsWebhookUrl, 'https://secret.example/hook');
  assert.equal(
    messages.join(' ').includes('https://secret.example/hook'),
    false
  );
});

test('valid environment values are converted to monitor units', () => {
  const config = readHealthConfig(
    {
      HEALTH_CHECK_INTERVAL_SECONDS: '30',
      HEALTH_FAILURE_THRESHOLD: '3',
      HEALTH_REMINDER_MINUTES: '10',
      HEALTH_REQUEST_TIMEOUT_MS: '2500',
      TEAMS_HEALTH_WEBHOOK_URL: ''
    },
    silentLogger
  );

  assert.deepEqual(config, {
    intervalMs: 30000,
    failureThreshold: 3,
    reminderMs: 600000,
    timeoutMs: 2500,
    teamsWebhookUrl: ''
  });
});

test('module starts its monitor after storage is ready', async (t) => {
  const { monitor } = await createFixture(t);

  assert.equal(monitor.startCount, 1);
});

test('GET status returns snapshot without starting a health run', async (t) => {
  const { monitor, baseUrl } = await createFixture(t);

  const response = await fetch(`${baseUrl}/api/health/status`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.started, true);
  assert.equal(monitor.runCount, 0);
});

test('legacy GET check is a side-effect-free status alias', async (t) => {
  const { monitor, baseUrl } = await createFixture(t);

  const response = await fetch(`${baseUrl}/api/health/check`);

  assert.equal(response.status, 200);
  assert.equal(monitor.runCount, 0);
});

test('POST check requires admin key and triggers one immediate run', async (t) => {
  const { monitor, baseUrl } = await createFixture(t);

  const unauthorized = await fetch(`${baseUrl}/api/health/check`, {
    method: 'POST'
  });
  const authorized = await fetch(`${baseUrl}/api/health/check`, {
    method: 'POST',
    headers: { 'x-admin-key': 'secret' }
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(authorized.status, 200);
  assert.equal(monitor.runCount, 1);
});

test('incidents endpoint clamps limit to one through one hundred', async (t) => {
  const { incidentManager, baseUrl } = await createFixture(t);

  const response = await fetch(
    `${baseUrl}/api/health/incidents?limit=9999`
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(incidentManager.requestedLimit, 100);
  assert.equal(body[0].status, 'open');
});

test('bulk status history uses all configured servers and 24-hour defaults', async (t) => {
  const { db, statusHistoryService, baseUrl } = await createFixture(t);
  const first = await run(
    db,
    'INSERT INTO servers (name, url, description) VALUES (?, ?, ?)',
    ['Magma 1', 'https://magma-1.example/health', 'Principal']
  );
  const second = await run(
    db,
    'INSERT INTO servers (name, url, description) VALUES (?, ?, ?)',
    ['Magma 2', 'https://magma-2.example/health', 'Secundario']
  );

  const response = await fetch(`${baseUrl}/api/health/status-history`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(statusHistoryService.calls, [
    {
      serverIds: [first.lastID, second.lastID],
      options: {
        from: '2026-07-27T10:00:00.000Z',
        to: '2026-07-28T10:00:00.000Z',
        bucketMinutes: 15
      }
    }
  ]);
  assert.equal(body.bucketMinutes, 15);
  assert.deepEqual(
    body.servers.map(({ serverId }) => serverId),
    [first.lastID, second.lastID]
  );
});

test('bulk status history validates its window and bucket size', async (t) => {
  const { statusHistoryService, baseUrl } = await createFixture(t);

  const clamped = await fetch(
    `${baseUrl}/api/health/status-history?hours=999&bucketMinutes=17`
  );
  const accepted = await fetch(
    `${baseUrl}/api/health/status-history?hours=1&bucketMinutes=30`
  );

  assert.equal(clamped.status, 200);
  assert.equal(accepted.status, 200);
  assert.deepEqual(statusHistoryService.calls.map(({ options }) => options), [
    {
      from: '2026-07-21T10:00:00.000Z',
      to: '2026-07-28T10:00:00.000Z',
      bucketMinutes: 15
    },
    {
      from: '2026-07-28T09:00:00.000Z',
      to: '2026-07-28T10:00:00.000Z',
      bucketMinutes: 30
    }
  ]);
});

test('server incident history validates filters before querying', async (t) => {
  const { db, incidentManager, baseUrl } = await createFixture(t);
  const inserted = await run(
    db,
    'INSERT INTO servers (name, url, description) VALUES (?, ?, ?)',
    ['Magma', 'https://magma.example/health', 'Principal']
  );

  const response = await fetch(
    `${baseUrl}/api/health/servers/${inserted.lastID}/incidents` +
      '?limit=999&offset=-5&status=resolved&days=30&component=db'
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(incidentManager.requestedHistory, {
    serverId: inserted.lastID,
    filters: {
      limit: 50,
      offset: 0,
      status: 'resolved',
      component: 'db',
      from: '2026-06-28T10:00:00.000Z'
    }
  });
  assert.deepEqual(body, {
    items: [
      { id: 7, server_id: inserted.lastID, status: 'resolved' }
    ],
    total: 1,
    limit: 50,
    offset: 0
  });
});

test('server incident history returns 404 for an unknown server', async (t) => {
  const { incidentManager, baseUrl } = await createFixture(t);

  const response = await fetch(
    `${baseUrl}/api/health/servers/9999/incidents`
  );

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { error: 'Server not found' });
  assert.equal(incidentManager.requestedHistory, null);
});

test('deleting a server closes its incident as monitor_removed', async (t) => {
  const { db, monitor, incidentManager, baseUrl } = await createFixture(t);
  const inserted = await run(
    db,
    'INSERT INTO servers (name, url, description) VALUES (?, ?, ?)',
    ['API', 'https://api.example/health', 'API']
  );

  const response = await fetch(
    `${baseUrl}/api/health/servers/${inserted.lastID}`,
    {
      method: 'DELETE',
      headers: { 'x-admin-key': 'secret' }
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(incidentManager.closed, {
    serverId: inserted.lastID,
    reason: 'monitor_removed',
    at: '2026-07-28T10:00:00.000Z'
  });
  assert.equal(monitor.mutationCount, 1);
});
