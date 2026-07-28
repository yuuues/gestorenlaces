# Autonomous Health Monitor with Teams Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Server Health run continuously in the backend, persist only real incidents, and notify a Microsoft Teams channel on failure, reminders, and recovery.

**Architecture:** Split the current health module into a pure checker, an SQLite incident repository/state machine, a Teams notifier, and a single-flight scheduler. The module entry point wires these units to the existing Express app and SQLite connection; the React view becomes a read-only status dashboard whose lifecycle no longer controls monitoring.

**Tech Stack:** Node.js 18+, Express 4, axios, sqlite3, Node test runner, React 18, Create React App/Jest, Microsoft Teams Workflows webhook with Adaptive Cards.

## Global Constraints

- Check all configured servers every 60 seconds.
- Use a 5-second HTTP timeout and check servers concurrently.
- Confirm an incident after exactly two consecutive failures.
- Treat network errors, timeouts, non-`200` responses, invalid bodies, and any component whose status is not `ok` as failures.
- Send reminders no more often than every 15 minutes and send a recovery notification.
- Persist no successful check history and only one row per provisional/confirmed incident.
- Keep the Teams webhook URL backend-only in `TEAMS_HEALTH_WEBHOOK_URL`; never return or log it.
- Preserve the current CRUD endpoints and admin-key protection.
- Assume one backend/PM2 instance; do not introduce queues, workers, or distributed locks.
- Do not modify or commit the pre-existing local changes under `mcp-list/`.

---

## File Structure

### Backend health module

- Create `backend/modules/health/checker.js`: HTTP request and pure response classification.
- Create `backend/modules/health/incident-store.js`: schema and SQLite persistence.
- Create `backend/modules/health/incident-manager.js`: incident state transitions and notification decisions.
- Create `backend/modules/health/teams-notifier.js`: Adaptive Card creation and webhook delivery.
- Create `backend/modules/health/monitor.js`: scheduler, concurrency, latest in-memory snapshot, and notification coordination.
- Create `backend/modules/health/config.js`: validated environment configuration and defaults.
- Modify `backend/modules/health/index.js`: server CRUD, dependency wiring, routes, startup, and delete behavior.

### Tests

- Create `backend/test/health-checker.test.js`.
- Create `backend/test/health-incidents.test.js`.
- Create `backend/test/teams-notifier.test.js`.
- Create `backend/test/health-monitor.test.js`.
- Create `backend/test/health-routes.test.js`.

### Frontend and configuration

- Modify `frontend/src/api.js`: status, incidents, and manual-check API functions.
- Modify `frontend/src/components/ServerHealth.js`: autonomous monitor UI and polling.
- Modify `frontend/src/components/ServerHealth.css`: monitor metadata and incident presentation.
- Create `frontend/src/components/ServerHealth.test.js`: dashboard behavior.
- Modify `base.env`: documented defaults and Teams secret.
- Modify `README.md`: autonomous monitoring, API, configuration, and Teams Workflow setup.

---

### Task 1: Health result checker

**Files:**
- Create: `backend/modules/health/checker.js`
- Test: `backend/test/health-checker.test.js`

**Interfaces:**
- Consumes: a server row `{ id, name, url }`, an axios-compatible client, a timeout, and an ISO timestamp.
- Produces:
  - `evaluateResponse(response)` → `{ status, components, error }`
  - `checkServer(server, options)` → `{ serverId, name, url, status, checkedAt, components, error, info }`

- [ ] **Step 1: Write failing classification tests**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateResponse, checkServer } = require('../modules/health/checker');

test('HTTP 200 with all components ok is healthy', () => {
  const result = evaluateResponse({
    status: 200,
    data: { components: { db: { name: 'DB', status: 'ok' } } }
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.error, null);
});

test('HTTP 200 with one failed component fails the whole server', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      components: {
        db: { name: 'DB', status: 'error', errors: ['connection refused'] }
      }
    }
  });
  assert.equal(result.status, 'error');
  assert.deepEqual(result.error.components, ['DB']);
});

test('HTTP 200 with a top-level error status is a failure', () => {
  const result = evaluateResponse({
    status: 200,
    data: { status: 'error', message: 'service unavailable' }
  });
  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'service');
});

test('non-200 response is a failure', () => {
  const result = evaluateResponse({ status: 503, data: {} });
  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'http');
  assert.equal(result.error.httpStatus, 503);
});

test('missing or non-object response body is invalid', () => {
  assert.equal(evaluateResponse({ status: 200, data: null }).error.kind, 'invalid_response');
  assert.equal(evaluateResponse({ status: 200, data: 'ok' }).error.kind, 'invalid_response');
});

test('checkServer normalizes network errors without throwing', async () => {
  const httpClient = {
    get: async () => {
      const error = new Error('timeout of 5000ms exceeded');
      error.code = 'ECONNABORTED';
      throw error;
    }
  };
  const result = await checkServer(
    { id: 7, name: 'API', url: 'https://api/health' },
    { httpClient, timeoutMs: 5000, checkedAt: '2026-07-28T10:00:00.000Z' }
  );
  assert.equal(result.status, 'error');
  assert.equal(result.error.kind, 'timeout');
  assert.equal(result.serverId, 7);
});
```

- [ ] **Step 2: Run the checker tests and verify RED**

Run: `node --test test/health-checker.test.js` from `backend/`
Expected: FAIL because `modules/health/checker.js` does not exist.

- [ ] **Step 3: Implement the pure evaluator and HTTP wrapper**

```js
const axios = require('axios');

function evaluateResponse(response) {
  const data = response.data;
  if (response.status !== 200) {
    return {
      status: 'error',
      components: data && typeof data === 'object' ? data.components || {} : {},
      error: { kind: 'http', message: `HTTP ${response.status}`, httpStatus: response.status, components: [] }
    };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      status: 'error',
      components: {},
      error: { kind: 'invalid_response', message: 'Health response must be an object', components: [] }
    };
  }
  const components = data.components || {};
  const failed = Object.entries(components)
    .filter(([, component]) => !component || component.status !== 'ok')
    .map(([key, component]) => component?.name || key);
  if (data.status !== undefined && data.status !== 'ok') {
    return {
      status: 'error',
      components,
      error: {
        kind: 'service',
        message: data.message || `Service status: ${String(data.status)}`,
        components: failed
      }
    };
  }
  return failed.length
    ? { status: 'error', components, error: { kind: 'component', message: `Components failed: ${failed.join(', ')}`, components: failed } }
    : { status: 'ok', components, error: null };
}

async function checkServer(server, options = {}) {
  const httpClient = options.httpClient || axios;
  const timeoutMs = options.timeoutMs || 5000;
  const checkedAt = options.checkedAt || new Date().toISOString();
  try {
    const response = await httpClient.get(server.url, {
      timeout: timeoutMs,
      validateStatus: () => true
    });
    const evaluated = evaluateResponse(response);
    return {
      serverId: server.id,
      name: server.name,
      url: server.url,
      checkedAt,
      ...evaluated,
      info: { connection: evaluated.status === 'ok' ? 'Conexión validada' : evaluated.error.message }
    };
  } catch (error) {
    const kind = error.code === 'ECONNABORTED' ? 'timeout' : 'network';
    return {
      serverId: server.id,
      name: server.name,
      url: server.url,
      checkedAt,
      status: 'error',
      components: {},
      error: { kind, message: error.message, components: [] },
      info: { connection: error.message }
    };
  }
}

module.exports = { evaluateResponse, checkServer };
```

- [ ] **Step 4: Run the checker tests and verify GREEN**

Run: `node --test test/health-checker.test.js` from `backend/`
Expected: all checker tests PASS.

- [ ] **Step 5: Commit the checker**

```bash
git add backend/modules/health/checker.js backend/test/health-checker.test.js
git commit -m "feat(health): classify server and component failures"
```

---

### Task 2: Incident persistence and state machine

**Files:**
- Create: `backend/modules/health/incident-store.js`
- Create: `backend/modules/health/incident-manager.js`
- Test: `backend/test/health-incidents.test.js`

**Interfaces:**
- `createIncidentStore(db)` produces `ensureSchema()`, `getActive(serverId)`, `getPendingRecovery(serverId)`, `insertPending(server, result, now)`, `updateFailure(incident, result, now)`, `resolve(incident, now, reason)`, `deletePending(id)`, `recordDelivery(id, type, now, delivered)`, `closeForRemovedServer(serverId, now)`, and `listRecent(limit)`.
- `createIncidentManager({ store, failureThreshold, reminderMs })` produces `record(result, now)`, `markDelivery(id, type, now, delivered)`, `closeForRemovedServer(serverId, now)`, and `listRecent(limit)`.
- `record` returns `{ incident, notification }`, where notification is `null` or `{ type: 'opened'|'reminder'|'recovered'|'resolved-summary', incident }`.

- [ ] **Step 1: Write failing SQLite/state-machine tests**

```js
test('success without an incident performs no insert', async () => {
  const outcome = await manager.record(okResult, NOW);
  assert.equal(outcome.incident, null);
  assert.equal((await store.listRecent(20)).length, 0);
});

test('one failure creates pending state and recovery deletes it', async () => {
  const first = await manager.record(errorResult, NOW);
  assert.equal(first.incident.status, 'pending');
  assert.equal(first.notification, null);
  await manager.record(okResult, PLUS_ONE_MINUTE);
  assert.equal((await store.listRecent(20)).length, 0);
});

test('second consecutive failure opens one incident', async () => {
  await manager.record(errorResult, NOW);
  const second = await manager.record(errorResult, PLUS_ONE_MINUTE);
  assert.equal(second.incident.status, 'open');
  assert.equal(second.notification.type, 'opened');
  assert.equal((await store.listRecent(20)).length, 1);
});

test('continued failures update one row and remind only after 15 minutes', async () => {
  const opened = await openIncident();
  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, true);
  const early = await manager.record(errorResult, PLUS_FOURTEEN_MINUTES);
  assert.equal(early.notification, null);
  const due = await manager.record(errorResult, PLUS_SIXTEEN_MINUTES);
  assert.equal(due.notification.type, 'reminder');
  assert.equal((await store.listRecent(20)).length, 1);
});

test('success resolves an open incident and requests recovery delivery', async () => {
  const opened = await openIncident();
  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, true);
  const result = await manager.record(okResult, PLUS_TWO_MINUTES);
  assert.equal(result.incident.status, 'resolved');
  assert.equal(result.notification.type, 'recovered');
});

test('resolved incident without an initial delivery requests one summary', async () => {
  await manager.record(errorResult, NOW);
  await manager.record(errorResult, PLUS_ONE_MINUTE);
  const result = await manager.record(okResult, PLUS_TWO_MINUTES);
  assert.equal(result.notification.type, 'resolved-summary');
});

test('a new manager instance resumes an open incident from SQLite', async () => {
  await manager.record(errorResult, NOW);
  await manager.record(errorResult, PLUS_ONE_MINUTE);
  const restarted = createIncidentManager({ store, failureThreshold: 2, reminderMs: 900000 });
  const result = await restarted.record(errorResult, PLUS_TWO_MINUTES);
  assert.equal(result.incident.status, 'open');
  assert.equal((await store.listRecent(20)).length, 1);
});
```

Use an in-memory `sqlite3.Database(':memory:')` and Promise helpers in the test.

- [ ] **Step 2: Run incident tests and verify RED**

Run: `node --test test/health-incidents.test.js` from `backend/`
Expected: FAIL because the store and manager modules do not exist.

- [ ] **Step 3: Implement the `health_incidents` schema and repository**

Create the table with the exact columns from the design, a foreign-key-like
`server_id`, JSON-encoded normalized `last_error`, and a partial unique index:

```sql
CREATE TABLE IF NOT EXISTS health_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL,
  server_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'open', 'resolved')),
  first_failed_at TEXT NOT NULL,
  last_failed_at TEXT NOT NULL,
  opened_at TEXT,
  resolved_at TEXT,
  resolution_reason TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NOT NULL,
  alert_notified_at TEXT,
  last_reminder_at TEXT,
  recovery_notified_at TEXT,
  notification_attempts INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_incidents_active_server
ON health_incidents(server_id)
WHERE status IN ('pending', 'open');
```

Serialize only the normalized error object from the checker. Convert
`last_error` back into an object when returning rows.

- [ ] **Step 4: Implement deterministic state transitions**

Implement `record(result, now)` with these branches:

```js
if (result.status === 'error' && !active) return createPending();
if (result.status === 'error' && active.status === 'pending') return confirmOrUpdatePending();
if (result.status === 'error' && active.status === 'open') return updateOpenAndMaybeRemind();
if (result.status === 'ok' && active?.status === 'pending') return discardPending();
if (result.status === 'ok' && active?.status === 'open') return resolveAndNotify();
if (result.status === 'ok' && !active) {
  const pendingRecovery = await store.getPendingRecovery(result.serverId);
  if (!pendingRecovery) return { incident: null, notification: null };
  return {
    incident: pendingRecovery,
    notification: {
      type: pendingRecovery.alert_notified_at ? 'recovered' : 'resolved-summary',
      incident: pendingRecovery
    }
  };
}
```

Use successful delivery timestamps—not attempted delivery timestamps—to decide
whether a reminder is due. A failed delivery therefore becomes eligible again
on the next check. `markDelivery` must increment `notification_attempts` on
every call, set the corresponding timestamp only when `delivered === true`,
and delegate those writes to `store.recordDelivery`.

- [ ] **Step 5: Run incident tests and verify GREEN**

Run: `node --test test/health-incidents.test.js` from `backend/`
Expected: all incident tests PASS and the single-row assertions hold.

- [ ] **Step 6: Commit incident persistence**

```bash
git add backend/modules/health/incident-store.js backend/modules/health/incident-manager.js backend/test/health-incidents.test.js
git commit -m "feat(health): persist confirmed incidents"
```

---

### Task 3: Teams webhook notifier

**Files:**
- Create: `backend/modules/health/teams-notifier.js`
- Test: `backend/test/teams-notifier.test.js`

**Interfaces:**
- `buildAdaptiveCard(notification)` returns the Teams webhook payload.
- `createTeamsNotifier({ webhookUrl, httpClient, timeoutMs, logger })` returns `{ configured, send(notification) }`.
- `send` returns `{ delivered: true }` or `{ delivered: false, error }` and never throws.

- [ ] **Step 1: Write failing notifier tests**

```js
test('opened incident renders a red Adaptive Card', () => {
  const payload = buildAdaptiveCard(openedNotification);
  const card = payload.attachments[0].content;
  assert.equal(payload.type, 'message');
  assert.equal(card.type, 'AdaptiveCard');
  assert.match(JSON.stringify(card), /Incidencia detectada/);
  assert.match(JSON.stringify(card), /Magma Nodo 1/);
  assert.match(JSON.stringify(card), /database/);
});

test('recovery renders a green card with duration', () => {
  const payload = buildAdaptiveCard(recoveredNotification);
  assert.match(JSON.stringify(payload), /Servicio recuperado/);
  assert.match(JSON.stringify(payload), /Duración/);
});

test('reminder and resolved summary have distinct titles', () => {
  assert.match(JSON.stringify(buildAdaptiveCard(reminderNotification)), /sigue fallando/);
  assert.match(JSON.stringify(buildAdaptiveCard(resolvedSummaryNotification)), /incidencia ocurrió/i);
});

test('missing webhook returns an undelivered result without HTTP', async () => {
  let called = false;
  const notifier = createTeamsNotifier({
    webhookUrl: '',
    httpClient: { post: async () => { called = true; } },
    logger: { warn() {}, error() {} }
  });
  assert.equal((await notifier.send(openedNotification)).delivered, false);
  assert.equal(called, false);
});

test('HTTP errors are normalized and the webhook URL is not logged', async () => {
  const messages = [];
  const notifier = createTeamsNotifier({
    webhookUrl: 'https://secret.example/hook',
    httpClient: { post: async () => { throw new Error('503'); } },
    logger: { warn: (message) => messages.push(message), error: (message) => messages.push(message) }
  });
  assert.equal((await notifier.send(openedNotification)).delivered, false);
  assert.equal(messages.join(' ').includes('https://secret.example/hook'), false);
});
```

- [ ] **Step 2: Run notifier tests and verify RED**

Run: `node --test test/teams-notifier.test.js` from `backend/`
Expected: FAIL because the notifier module does not exist.

- [ ] **Step 3: Implement Adaptive Cards and safe delivery**

Build cards with:

- opened: title `🔴 Incidencia detectada`, red attention container;
- reminder: title `🟠 El servicio sigue fallando`, orange warning container;
- recovered/resolved-summary: title `🟢 Servicio recuperado`, green good container;
- a `FactSet` for server, URL, timestamps, duration, failure count, and affected components.

POST the payload with a 5-second timeout. Never include the webhook URL in an
exception or log message. Return a delivery result instead of throwing.

- [ ] **Step 4: Run notifier tests and verify GREEN**

Run: `node --test test/teams-notifier.test.js` from `backend/`
Expected: all notifier tests PASS.

- [ ] **Step 5: Commit Teams delivery**

```bash
git add backend/modules/health/teams-notifier.js backend/test/teams-notifier.test.js
git commit -m "feat(health): notify Teams about incidents"
```

---

### Task 4: Single-flight autonomous monitor

**Files:**
- Create: `backend/modules/health/monitor.js`
- Test: `backend/test/health-monitor.test.js`

**Interfaces:**
- `createHealthMonitor(options)` returns:
  - `start()` and `stop()`
  - `runNow()` → latest snapshot or the active run Promise
  - `getStatus()` → `{ running, started, lastRunAt, nextRunAt, servers }`
- Options include `listServers`, `check`, `incidentManager`, `notifier`,
  `intervalMs`, `timeoutMs`, `now`, `setTimer`, `clearTimer`, and `logger`.

- [ ] **Step 1: Write failing monitor tests with a fake clock**

```js
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function makeMonitor(overrides = {}) {
  return createHealthMonitor({
    listServers: async () => [serverA],
    check: async () => okA,
    incidentManager: {
      record: async () => ({ incident: null, notification: null }),
      markDelivery: async () => {}
    },
    notifier: { send: async () => ({ delivered: true }) },
    intervalMs: 60000,
    timeoutMs: 5000,
    now: () => new Date('2026-07-28T10:00:00.000Z'),
    setTimer: () => 1,
    clearTimer: () => {},
    logger: { info() {}, warn() {}, error() {} },
    ...overrides
  });
}

test('checks servers concurrently and publishes one snapshot', async () => {
  const gates = [deferred(), deferred()];
  const started = new Set();
  const monitor = makeMonitor({
    listServers: async () => [serverA, serverB],
    check: (server) => {
      started.add(server.id);
      return server.id === 1 ? gates[0].promise : gates[1].promise;
    }
  });
  const running = monitor.runNow();
  assert.deepEqual([...started].sort(), [1, 2]);
  gates[0].resolve(okA);
  gates[1].resolve(errorB);
  await running;
  assert.equal(Object.keys(monitor.getStatus().servers).length, 2);
});

test('overlapping runNow calls share one active run', async () => {
  const gate = deferred();
  const monitor = makeMonitor({ check: () => gate.promise });
  const first = monitor.runNow();
  const second = monitor.runNow();
  assert.strictEqual(second, first);
  gate.resolve(okA);
  await first;
});

test('an empty server catalog publishes an empty successful snapshot', async () => {
  const monitor = makeMonitor({ listServers: async () => [] });
  await monitor.runNow();
  assert.deepEqual(monitor.getStatus().servers, {});
  assert.equal(monitor.getStatus().started, true);
});

test('successful Teams delivery is persisted', async () => {
  const calls = [];
  const monitor = makeMonitor({
    notifier: { send: async () => ({ delivered: true }) },
    incidentManager: {
      record: async () => ({ incident, notification: openedNotification }),
      markDelivery: async (...args) => calls.push(args)
    }
  });
  await monitor.runNow();
  assert.deepEqual(calls[0].slice(0, 2), [incident.id, 'opened']);
  assert.equal(calls[0][3], true);
});

test('failed Teams delivery remains pending', async () => {
  const calls = [];
  const monitor = makeMonitor({
    incidentManager: {
      record: async () => ({ incident, notification: openedNotification }),
      markDelivery: async (...args) => calls.push(args)
    },
    notifier: { send: async () => ({ delivered: false, error: '503' }) },
  });
  await monitor.runNow();
  assert.equal(calls[0][3], false);
});
```

- [ ] **Step 2: Run monitor tests and verify RED**

Run: `node --test test/health-monitor.test.js` from `backend/`
Expected: FAIL because the monitor module does not exist.

- [ ] **Step 3: Implement lifecycle and rounds**

Use recursive `setTimeout`, not `setInterval`, so the next timer is scheduled
after a round finishes. `runNow()` must reuse the active Promise. Within a
round:

```js
const servers = await listServers();
const results = await Promise.all(
  servers.map((server) => check(server, {
    timeoutMs,
    checkedAt: now().toISOString()
  }))
);
for (const result of results) {
  const outcome = await incidentManager.record(result, now().toISOString());
  if (outcome.notification) {
    const delivery = await notifier.send(outcome.notification);
    await incidentManager.markDelivery(
      outcome.incident.id,
      outcome.notification.type,
      now().toISOString(),
      delivery.delivered
    );
  }
}
```

Publish the complete snapshot only after all results are available. Errors
checking one server become that server's error result; infrastructure errors
loading servers or persisting state set `started: false` and are logged.

- [ ] **Step 4: Run monitor tests and verify GREEN**

Run: `node --test test/health-monitor.test.js` from `backend/`
Expected: concurrency, single-flight, status, and delivery tests PASS.

- [ ] **Step 5: Commit the monitor**

```bash
git add backend/modules/health/monitor.js backend/test/health-monitor.test.js
git commit -m "feat(health): run autonomous health checks"
```

---

### Task 5: Wire schema, API routes, startup, and CRUD behavior

**Files:**
- Create: `backend/modules/health/config.js`
- Modify: `backend/modules/health/index.js`
- Test: `backend/test/health-routes.test.js`

**Interfaces:**
- Uses the checker, incident store/manager, notifier, and monitor from Tasks 1–4.
- `readHealthConfig(env, logger)` returns positive numeric values in milliseconds
  and `teamsWebhookUrl`, using the approved defaults for missing/invalid input.
- Produces:
  - `GET /api/health/status`
  - `GET /api/health/incidents?limit=20`
  - `GET /api/health/check` as a side-effect-free compatibility alias
  - `POST /api/health/check` as an admin-protected immediate run
  - unchanged server CRUD paths

- [ ] **Step 1: Write failing route tests**

Create an Express test harness using a random local port and an in-memory
SQLite database. Stub the monitor and assert:

```js
test('GET status returns the snapshot without starting a run', async () => {
  const response = await fetch(`${baseUrl}/api/health/status`);
  assert.equal(response.status, 200);
  assert.equal(monitor.runCount, 0);
  assert.equal((await response.json()).started, true);
});

test('legacy GET check is a side-effect-free status alias', async () => {
  await fetch(`${baseUrl}/api/health/check`);
  assert.equal(monitor.runCount, 0);
});

test('POST check requires the admin key and triggers one run', async () => {
  assert.equal((await fetch(`${baseUrl}/api/health/check`, { method: 'POST' })).status, 401);
  const response = await fetch(`${baseUrl}/api/health/check`, {
    method: 'POST',
    headers: { 'x-admin-key': 'secret' }
  });
  assert.equal(response.status, 200);
  assert.equal(monitor.runCount, 1);
});

test('incidents endpoint clamps the requested limit', async () => {
  await fetch(`${baseUrl}/api/health/incidents?limit=9999`);
  assert.equal(store.requestedLimit, 100);
});

test('deleting a server closes its open incident as monitor_removed', async () => {
  await deleteServer(server.id);
  assert.deepEqual(store.closed, { serverId: server.id, reason: 'monitor_removed' });
});

test('invalid environment values use safe defaults', () => {
  const config = readHealthConfig({
    HEALTH_CHECK_INTERVAL_SECONDS: '-1',
    HEALTH_FAILURE_THRESHOLD: 'zero',
    HEALTH_REMINDER_MINUTES: '',
    HEALTH_REQUEST_TIMEOUT_MS: 'NaN'
  }, silentLogger);
  assert.equal(config.intervalMs, 60000);
  assert.equal(config.failureThreshold, 2);
  assert.equal(config.reminderMs, 900000);
  assert.equal(config.timeoutMs, 5000);
});
```

- [ ] **Step 2: Run route tests and verify RED**

Run: `node --test test/health-routes.test.js` from `backend/`
Expected: FAIL because the new endpoints and dependency injection seam do not exist.

- [ ] **Step 3: Implement validated environment configuration**

Implement `readHealthConfig` in `config.js`. Parse each number with
`Number.parseInt`, accept it only when `Number.isInteger(value) && value > 0`,
and convert seconds/minutes to milliseconds. Read the webhook as an opaque
string. Warn with the variable name and default when a supplied number is
invalid; never include `TEAMS_HEALTH_WEBHOOK_URL` in logs.

- [ ] **Step 4: Refactor module initialization**

Keep `exports.initialize(app, db)` for the loader. Add an exported
`createHealthModule(app, db, overrides = {})` used by tests. It returns
`{ monitor, ready }`, registers routes synchronously, and makes `ready` a
Promise that:

1. create/reconcile `servers`;
2. seed servers;
3. call `incidentStore.ensureSchema()`;
4. start the monitor only after steps 1–3 finish.

`initialize` calls `createHealthModule`, attaches a rejection handler to
`ready`, and logs startup errors. Never start the scheduler if schema
preparation fails. Tests await `ready` before exercising routes that require the
schema.

- [ ] **Step 5: Replace request-driven checks with monitor routes**

Register the exact routes listed in Interfaces. Parse incident limit as an
integer, default to 20, minimum 1, maximum 100. Update `exports.routes`
metadata. Remove the in-memory OS-notification throttle and direct
`sendSystemNotification` calls from the module.

- [ ] **Step 6: Handle server deletion and rename**

Before deleting, remove pending state or resolve an open incident with
`monitor_removed`; do not send a recovery card. Keep active incidents linked by
`server_id` when a name changes. Refresh the monitor after CRUD operations by
calling `runNow()` asynchronously and logging—but not returning—refresh errors.

- [ ] **Step 7: Run health routes and full backend tests**

Run: `node --test test/health-routes.test.js`
Expected: route tests PASS.

Run: `npm test`
Expected: all existing and new backend tests PASS.

- [ ] **Step 8: Commit backend integration**

```bash
git add backend/modules/health/config.js backend/modules/health/index.js backend/test/health-routes.test.js
git commit -m "feat(health): expose autonomous monitor API"
```

---

### Task 6: Convert Server Health into an autonomous status dashboard

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/ServerHealth.js`
- Modify: `frontend/src/components/ServerHealth.css`
- Create: `frontend/src/components/ServerHealth.test.js`

**Interfaces:**
- `getHealthStatus()` → `GET /api/health/status`
- `getHealthIncidents(limit = 20)` → `GET /api/health/incidents?limit=...`
- `triggerHealthCheck()` → `POST /api/health/check`

- [ ] **Step 1: Write failing component tests**

Mock `../api` and render inside `EditModeProvider`. Cover:

```js
test('shows monitor metadata and latest server state', async () => {
  getHealthStatus.mockResolvedValue({ data: healthySnapshot });
  getHealthIncidents.mockResolvedValue({ data: [] });
  renderDashboard();
  expect(await screen.findByText(/Monitor activo/i)).toBeInTheDocument();
  expect(screen.getByText(/Última comprobación/i)).toBeInTheDocument();
  expect(screen.getByText('Magma Nodo 1')).toBeInTheDocument();
});

test('has no browser Start or Stop controls', async () => {
  renderDashboard();
  await screen.findByText('Magma Nodo 1');
  expect(screen.queryByRole('button', { name: /Start|Stop/i })).not.toBeInTheDocument();
});

test('ordinary refresh only reads status', async () => {
  renderDashboard();
  await user.click(await screen.findByRole('button', { name: /Actualizar vista/i }));
  expect(getHealthStatus).toHaveBeenCalled();
  expect(triggerHealthCheck).not.toHaveBeenCalled();
});

test('admin check-now action triggers POST', async () => {
  renderDashboard({ editMode: true });
  await user.click(await screen.findByRole('button', { name: /Comprobar ahora/i }));
  expect(triggerHealthCheck).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `CI=true npm test -- --runInBand ServerHealth.test.js` from `frontend/`
Expected: FAIL because the new API and UI do not exist.

- [ ] **Step 3: Add API functions and refactor state loading**

Replace `checkServersHealth` usage with `getHealthStatus`. Load incidents
alongside status. Keep a 30-second visual polling timer that only performs GET
requests and is always cleaned up on unmount.

- [ ] **Step 4: Replace browser monitor controls**

Remove interval input and Start/Stop. Add:

- monitor active/unavailable badge;
- last and next run timestamps;
- `Actualizar vista` GET button;
- admin-only `Comprobar ahora` POST button;
- current status cards with affected components;
- open or latest resolved incident information.

Keep add/edit/delete controls and their existing admin-mode behavior.

- [ ] **Step 5: Style monitor metadata and incidents**

Add focused classes such as:

```css
.monitor-summary { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.monitor-badge.active { background: #dcfce7; color: #166534; }
.monitor-badge.unavailable { background: #fee2e2; color: #991b1b; }
.incident-summary { border-left: 4px solid #dc2626; padding-left: 0.75rem; }
.incident-summary.resolved { border-left-color: #16a34a; }
```

Reuse the existing visual language instead of redesigning unrelated pages.

- [ ] **Step 6: Run frontend tests and build**

Run: `CI=true npm test -- --runInBand ServerHealth.test.js`
Expected: component tests PASS.

Run: `npm run build`
Expected: production build succeeds without ESLint errors.

- [ ] **Step 7: Commit the dashboard**

```bash
git add frontend/src/api.js frontend/src/components/ServerHealth.js frontend/src/components/ServerHealth.css frontend/src/components/ServerHealth.test.js
git commit -m "feat(health): show autonomous monitor status"
```

---

### Task 7: Configuration and operator documentation

**Files:**
- Modify: `base.env`
- Modify: `README.md`

**Interfaces:**
- Documents the exact environment variables and API behavior implemented above.

- [ ] **Step 1: Add safe configuration examples**

Append defaults to `base.env`:

```dotenv
HEALTH_CHECK_INTERVAL_SECONDS=60
HEALTH_FAILURE_THRESHOLD=2
HEALTH_REMINDER_MINUTES=15
HEALTH_REQUEST_TIMEOUT_MS=5000
TEAMS_HEALTH_WEBHOOK_URL=
```

State explicitly that the webhook is a secret and must not be committed.

- [ ] **Step 2: Update README behavior and setup**

Document:

1. the backend monitor runs without the web open;
2. the two-failure and 15-minute policies;
3. component failures with HTTP `200`;
4. the new status/incidents/manual-check endpoints;
5. creation of a Teams Workflow using “When a Teams webhook request is
   received” and selection of the target channel;
6. copying the generated webhook URL to `.env`;
7. PM2 restart after changing `.env`;
8. no successful check history is stored.

- [ ] **Step 3: Validate documentation against the implementation**

Run:

```powershell
rg -n "HEALTH_|TEAMS_HEALTH_WEBHOOK_URL|api/health/status|api/health/incidents" README.md base.env
```

Expected: every variable and endpoint appears with the implemented spelling.

- [ ] **Step 4: Commit configuration and docs**

```bash
git add README.md base.env
git commit -m "docs(health): configure Teams monitoring"
```

---

### Task 8: Final verification

**Files:**
- Verify all files changed in Tasks 1–7.

**Interfaces:**
- The complete system must satisfy the ten acceptance criteria in the approved design.

- [ ] **Step 1: Run the complete backend suite**

Run: `npm test` from `backend/`
Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run focused frontend tests**

Run: `CI=true npm test -- --runInBand ServerHealth.test.js` from `frontend/`
Expected: all Server Health tests PASS.

- [ ] **Step 3: Build the frontend**

Run: `npm run build` from `frontend/`
Expected: optimized production build completes successfully.

- [ ] **Step 4: Perform a configuration-free backend smoke test**

Start the backend without `TEAMS_HEALTH_WEBHOOK_URL`, request
`GET /api/health/status`, and stop it.
Expected: backend remains healthy, the endpoint returns JSON, and the log says
Teams delivery is not configured without revealing any secret.

- [ ] **Step 5: Inspect scope and repository state**

Run:

```powershell
git status --short
git diff --check
git log --oneline -8
```

Expected: only intentional health-monitor changes and the user's pre-existing
`mcp-list/` changes are present; no whitespace errors exist.

- [ ] **Step 6: Review acceptance criteria**

Map test names and manual results to all ten criteria in
`docs/superpowers/specs/2026-07-28-health-monitor-teams-design.md`. Fix any
uncovered criterion before completion.
