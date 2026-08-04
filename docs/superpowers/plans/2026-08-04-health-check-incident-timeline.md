# Per-Check Health Incident Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one diagnostic episode per failing or warning health check, expose its deduplicated message timeline, and render that timeline without changing Teams notification behavior.

**Architecture:** Add a component-level incident manager and SQLite store beside the existing server-level incident manager. The new path records every error or warning immediately for history, while the existing manager remains the sole owner of failure thresholds and Teams notifications. The server-history endpoint reads component episodes with their events; the current-services page keeps using the latest monitor snapshot.

**Tech Stack:** Node.js 18+, Express, sqlite3, Node test runner, React 18, React Testing Library, Jest, CSS.

## Global Constraints

- Current service cards show only checks whose latest status is `error` or `warning`; healthy checks remain hidden.
- Each server/check pair has at most one open historical episode.
- Warnings are persisted in history but never open, remind, resolve, or recover a Teams incident.
- An update event is created only when the normalized set of messages changes; whitespace, duplicates, and array order do not count as changes.
- Multiple messages from one observation render together in one event.
- A component closes only after an explicit `ok`; transport failure must not silently close component episodes.
- Existing server-level incident and Teams behavior must remain unchanged.
- Existing historical rows remain readable through an idempotent migration; lost legacy diagnostics cannot be reconstructed.
- No new runtime dependency is allowed.

---

## File Structure

- Create `backend/modules/health/component-incident-manager.js`: normalize component observations and reconcile open episodes.
- Create `backend/modules/health/component-incident-store.js`: own SQLite schema, atomic episode/event writes, migration, filtering, and pagination.
- Create `backend/test/health-component-incident-manager.test.js`: unit-test message normalization and state transitions with a fake store.
- Create `backend/test/health-component-incident-store.test.js`: integration-test schema, writes, migration, filters, and event hydration.
- Modify `backend/modules/health/monitor.js`: record component history as a non-blocking side effect of each completed check.
- Modify `backend/modules/health/index.js`: initialize the new store/manager, route server history to it, and close episodes when a server is removed.
- Modify `backend/test/health-monitor.test.js`: prove history writes do not alter snapshots or Teams flow and failures do not abort a round.
- Modify `backend/test/health-routes.test.js`: prove the server endpoint and deletion route use the component manager.
- Modify `frontend/src/components/IncidentTimelineCard.js`: render event-level messages and retain a legacy fallback.
- Modify `frontend/src/components/IncidentTimelineCard.css`: add error/warning/update/recovery timeline styling and long-message wrapping.
- Modify `frontend/src/components/IncidentTimelineCard.test.js`: cover red and yellow episodes, deduplicated updates, multiple messages, and legacy fallback.
- Modify `frontend/src/components/ServerHistory.js`: use episode terminology and continue paginating the same endpoint.
- Modify `frontend/src/components/ServerHistory.test.js`: cover the new API item shape and warning history.
- Modify `frontend/src/components/ServerHealth.test.js`: retain a regression test that all current warning/error checks render while `ok` remains hidden.

---

### Task 1: Normalize and Reconcile Per-Check Observations

**Files:**
- Create: `backend/modules/health/component-incident-manager.js`
- Create: `backend/test/health-component-incident-manager.test.js`

**Interfaces:**
- Consumes: checker result `{ serverId, name, status, components, error, warning }` and store methods `listActive`, `createEpisode`, `appendUpdate`, `touch`, `resolve`, `listForServer`, `closeForRemovedServer`.
- Produces: `normalizeMessages(errors) -> string[]`, `messageSignature(messages) -> string`, and `createComponentIncidentManager({ store }) -> { record, listForServer, closeForRemovedServer }`.
- `record(result, observedAt)` resolves to an array of changed episode rows; it does not send notifications.

- [ ] **Step 1: Write failing normalization tests**

Create tests that prove strings and `{ message }` objects are accepted, blank values are removed, duplicates are removed, and array order does not change the signature:

```js
test('normalizes messages as an order-independent unique set', () => {
  const left = normalizeMessages([
    { message: ' Bloqueo en BD ' },
    'Timeout',
    { message: 'Bloqueo en BD' },
    { severity: 'error' }
  ]);
  const right = normalizeMessages(['Timeout', 'Bloqueo en BD']);

  assert.deepEqual(left, ['Bloqueo en BD', 'Timeout']);
  assert.equal(messageSignature(left), messageSignature(right));
});
```

- [ ] **Step 2: Run the manager test and verify RED**

Run: `node --test test/health-component-incident-manager.test.js` from `backend/`.

Expected: FAIL because `component-incident-manager.js` does not exist.

- [ ] **Step 3: Implement message normalization and observation extraction**

Export the pure helpers and keep fallback copy centralized:

```js
const FALLBACK_MESSAGE = 'El check no devolvió detalle del problema';

const normalizeMessages = (errors = []) => {
  const values = errors
    .map((entry) => typeof entry === 'string' ? entry : entry?.message)
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return unique.length > 0 ? unique : [FALLBACK_MESSAGE];
};

const messageSignature = (messages) => JSON.stringify([...messages].sort());
```

Extract every `error` or `warning` component using its object key as `componentKey`, `component.name || key` as `componentName`, and the component's own `errors`. When a result is `error` but contains no affected component, emit the reserved observation `{ componentKey: '__server__', componentName: 'Conexión' }` using `result.error.message`.

- [ ] **Step 4: Write failing reconciliation tests**

Use a fake store and cover these exact sequences:

```js
test('tracks db and db2 independently and closes only explicit ok checks', async () => {
  await manager.record(result({
    db: component('error', 'Bloqueo'),
    db2: component('warning', 'Latencia')
  }), T0);
  await manager.record(result({
    db: component('ok'),
    db2: component('warning', 'Latencia alta')
  }), T1);

  assert.deepEqual(store.created.map((entry) => entry.componentKey), ['db', 'db2']);
  assert.deepEqual(store.resolved.map((entry) => entry.component_key), ['db']);
  assert.equal(store.updates[0].incident.component_key, 'db2');
  assert.deepEqual(store.updates[0].observation.messages, ['Latencia alta']);
});

test('repeated messages touch the episode without adding an update', async () => {
  await manager.record(result({ db: component('error', 'Bloqueo') }), T0);
  await manager.record(result({ db: component('error', ' Bloqueo ') }), T1);

  assert.equal(store.updates.length, 0);
  assert.equal(store.touches.length, 1);
});

test('transport failure does not resolve active component episodes', async () => {
  store.active = [openIncident('db')];
  await manager.record(networkFailure('ECONNREFUSED'), T1);

  assert.equal(store.resolved.length, 0);
  assert.equal(store.created[0].componentKey, '__server__');
});
```

Also cover warning-to-error with the same message: call `touch` with updated severities but do not append an event.

- [ ] **Step 5: Implement the manager state machine**

Implement `record` with this order:

```js
const record = async (result, observedAt) => {
  const active = await store.listActive(result.serverId);
  const activeByKey = new Map(active.map((row) => [row.component_key, row]));
  const observations = extractObservations(result);
  const observationByKey = new Map(observations.map((item) => [item.componentKey, item]));
  const changed = [];

  for (const [key, component] of Object.entries(result.components || {})) {
    if (component?.status === 'ok' && activeByKey.has(key)) {
      changed.push(await store.resolve(activeByKey.get(key), observedAt, 'recovered'));
    }
  }

  if (!isUnstructuredServerFailure(result) && activeByKey.has('__server__')) {
    changed.push(await store.resolve(activeByKey.get('__server__'), observedAt, 'recovered'));
  }

  for (const observation of observationByKey.values()) {
    const incident = activeByKey.get(observation.componentKey);
    if (!incident) changed.push(await store.createEpisode(observation, observedAt));
    else if (incident.last_message_signature !== observation.signature) {
      changed.push(await store.appendUpdate(incident, observation, observedAt));
    } else {
      changed.push(await store.touch(incident, observation, observedAt));
    }
  }
  return changed.filter(Boolean);
};
```

Do not resolve active keys absent from `result.components`; absence is not an explicit healthy observation.

- [ ] **Step 6: Run manager tests and verify GREEN**

Run: `node --test test/health-component-incident-manager.test.js` from `backend/`.

Expected: all manager tests PASS.

- [ ] **Step 7: Commit the manager**

```bash
git add backend/modules/health/component-incident-manager.js backend/test/health-component-incident-manager.test.js
git commit -m "feat(health): model per-check incident episodes"
```

---

### Task 2: Persist Episodes, Events, and Legacy Migration

**Files:**
- Create: `backend/modules/health/component-incident-store.js`
- Create: `backend/test/health-component-incident-store.test.js`

**Interfaces:**
- Consumes: normalized observations from Task 1.
- Produces: `createComponentIncidentStore(db)` with `ensureSchema`, `listActive`, `createEpisode`, `appendUpdate`, `touch`, `resolve`, `listForServer`, and `closeForRemovedServer`.
- `listForServer(serverId, filters)` returns `{ items, total, limit, offset }`; each item contains `events` in chronological order.

- [ ] **Step 1: Write failing schema and creation tests**

Use an in-memory SQLite database. Assert one call to `createEpisode` creates one incident plus one `detected` event, and a second open episode for the same server/check violates the unique invariant through the store rather than surfacing a raw constraint error.

Expected hydrated shape:

```js
assert.deepEqual(created.events, [{
  id: created.events[0].id,
  type: 'detected',
  severity: 'warning',
  observed_at: T0,
  messages: ['Latencia alta']
}]);
assert.equal(created.current_severity, 'warning');
assert.equal(created.highest_severity, 'warning');
assert.equal(created.observation_count, 1);
```

- [ ] **Step 2: Run store tests and verify RED**

Run: `node --test test/health-component-incident-store.test.js` from `backend/`.

Expected: FAIL because `createComponentIncidentStore` is unavailable.

- [ ] **Step 3: Create the two-table schema and decoders**

Create `health_component_incidents` and `health_component_incident_events` with the fields defined in the design. Add these indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_component_incidents_open
ON health_component_incidents(server_id, component_key)
WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_component_incidents_legacy
ON health_component_incidents(legacy_incident_id, component_key)
WHERE legacy_incident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_health_component_events_incident_time
ON health_component_incident_events(incident_id, observed_at, id);
```

Decode `messages` with `JSON.parse` at the repository boundary. Never expose JSON strings to routes or React.

- [ ] **Step 4: Implement atomic write methods**

Wrap the row update and event insert of `createEpisode`, `appendUpdate`, and `resolve` in `BEGIN IMMEDIATE` / `COMMIT`, with `ROLLBACK` on error. Serialize these transactions through a store-local promise tail so two server results cannot interleave transactions on the shared SQLite connection.

`appendUpdate` must:

```sql
UPDATE health_component_incidents
SET current_severity = ?,
    highest_severity = CASE
      WHEN highest_severity = 'error' OR ? = 'error' THEN 'error'
      ELSE 'warning'
    END,
    last_observed_at = ?,
    observation_count = observation_count + 1,
    last_message_signature = ?
WHERE id = ? AND status = 'open';
```

`touch` performs the same incident update without inserting an event. `resolve` appends a `recovered` event with severity `ok`, empty messages, and sets `status = 'resolved'`.

- [ ] **Step 5: Write failing deduplication, recovery, pagination, and filter tests**

Cover:

- a touch increments `observation_count` but leaves the event count unchanged;
- an update appends one event and changes the message signature;
- recovery closes only the selected component;
- `closeForRemovedServer` resolves every open episode with
  `resolution_reason = 'monitor_removed'` and does not insert a green recovery
  event;
- results are ordered by `first_observed_at DESC, id DESC`;
- `status`, `component`, and `from` filters apply before pagination;
- only events for the selected page are hydrated.

- [ ] **Step 6: Implement queries and event hydration**

Query incident rows first, then hydrate the page with one `IN (...)` event query. Group events by `incident_id`, preserve chronological order, and attach `events: []` when no event exists.

Implement `closeForRemovedServer(serverId, observedAt)` as one serialized
transaction that marks matching open rows resolved with `monitor_removed`.
Do not append `recovered`: removal means the check stopped being monitored,
not that it returned to `ok`.

- [ ] **Step 7: Write failing idempotent migration tests**

Create legacy `health_incidents` rows before `ensureSchema`: one resolved row with `components: ['db', 'db2']` and one open network row with no components. Run `ensureSchema()` twice and assert:

- exactly three component episodes exist;
- each migrated resolved component has a detected and recovered event;
- the network row uses `component_key = '__server__'`;
- the old summary remains only as the inherited detected message;
- the second run creates no duplicates.

- [ ] **Step 8: Implement legacy migration**

Read non-pending rows from `health_incidents` only when that table exists. For every component in `last_error.components`, create one migrated episode; use `__server__` / `Conexión` when the array is empty. Set `legacy_incident_id`, copy dates/count/status, insert the detected event, and insert a recovered event for resolved rows. Catch only the unique legacy constraint needed for idempotency; propagate other database errors.

- [ ] **Step 9: Run store tests and verify GREEN**

Run: `node --test test/health-component-incident-store.test.js` from `backend/`.

Expected: all store and migration tests PASS.

- [ ] **Step 10: Commit persistence**

```bash
git add backend/modules/health/component-incident-store.js backend/test/health-component-incident-store.test.js
git commit -m "feat(health): persist component incident timelines"
```

---

### Task 3: Wire Recording, Routes, and Server Removal Without Changing Teams

**Files:**
- Modify: `backend/modules/health/monitor.js`
- Modify: `backend/modules/health/index.js`
- Modify: `backend/test/health-monitor.test.js`
- Modify: `backend/test/health-routes.test.js`

**Interfaces:**
- Consumes: `createComponentIncidentStore` and `createComponentIncidentManager` from Tasks 1–2.
- Produces: monitor option `componentIncidents`, module properties `componentIncidentStore` and `componentIncidentManager`, and component-based payloads from `GET /api/health/servers/:id/incidents`.
- Existing `incidentManager` remains the only dependency used for Teams deliveries and `/api/health/incidents`.

- [ ] **Step 1: Write failing monitor integration tests**

Add a fake `componentIncidents` recorder to the monitor fixture and assert it receives every result exactly once with the round timestamp. Add a failure case:

```js
test('component history failure does not abort aggregate incidents or notifications', async () => {
  componentIncidents.record = async () => { throw new Error('disk busy'); };
  const status = await monitor.runNow();

  assert.equal(status.servers.Magma.status, 'error');
  assert.equal(incidentManager.recorded.length, 1);
  assert.match(logger.errors.join(' '), /component incident history write failed/i);
});
```

- [ ] **Step 2: Run monitor tests and verify RED**

Run: `node --test test/health-monitor.test.js` from `backend/`.

Expected: FAIL because the monitor ignores `componentIncidents`.

- [ ] **Step 3: Add component-history recording to the monitor**

Accept a default no-op dependency:

```js
componentIncidents = {
  record: async () => {}
}
```

After status-history writes and before aggregate incident delivery, call `record(result, checkedAt)` for each result inside its own `try/catch`. Log the failure and continue. Do not pass the component manager to the notifier and do not alter `outcome.notification` handling.

- [ ] **Step 4: Run monitor tests and verify GREEN**

Run: `node --test test/health-monitor.test.js` from `backend/`.

Expected: all monitor tests PASS.

- [ ] **Step 5: Write failing route and lifecycle tests**

Update the route fixture with separate aggregate and component managers. Assert:

- `/api/health/incidents` still calls `incidentManager.listRecent`;
- `/api/health/servers/:id/incidents` calls `componentIncidentManager.listForServer` with validated filters;
- deleting a server calls both managers' `closeForRemovedServer`;
- module readiness calls `componentIncidentStore.ensureSchema` before `monitor.start`.

- [ ] **Step 6: Wire the new store and manager in `index.js`**

Create or accept overrides:

```js
const componentIncidentStore = overrides.componentIncidentStore ||
  createComponentIncidentStore(db);
const componentIncidentManager = overrides.componentIncidentManager ||
  createComponentIncidentManager({ store: componentIncidentStore });
```

Pass the component manager to `createHealthMonitor`, route only the per-server history endpoint to it, close it during server deletion, call `ensureSchema()` before monitor startup, and return both objects from `createHealthModule` for tests.

- [ ] **Step 7: Run backend health tests**

Run: `node --test test/health-monitor.test.js test/health-routes.test.js test/health-incidents.test.js test/teams-notifier.test.js` from `backend/`.

Expected: all selected tests PASS; existing Teams assertions remain unchanged.

- [ ] **Step 8: Commit integration**

```bash
git add backend/modules/health/monitor.js backend/modules/health/index.js backend/test/health-monitor.test.js backend/test/health-routes.test.js
git commit -m "feat(health): expose per-check incident history"
```

---

### Task 4: Render Diagnostic Events in Historical Cards

**Files:**
- Modify: `frontend/src/components/IncidentTimelineCard.js`
- Modify: `frontend/src/components/IncidentTimelineCard.css`
- Modify: `frontend/src/components/IncidentTimelineCard.test.js`

**Interfaces:**
- Consumes new episode fields `component_name`, `status`, `current_severity`, `highest_severity`, `first_observed_at`, `last_observed_at`, `resolved_at`, `observation_count`, and `events[]`.
- Supports legacy fields `first_failed_at`, `last_failed_at`, `consecutive_failures`, and `last_error` as a fallback.
- Produces accessible timeline markup; no API call is added.

- [ ] **Step 1: Replace fixtures and write failing timeline tests**

Use a warning episode with three events and an error episode with multiple messages:

```js
const warningEpisode = {
  id: 9,
  component_name: 'db',
  status: 'resolved',
  current_severity: 'warning',
  highest_severity: 'warning',
  first_observed_at: '2026-08-04T15:06:29.000Z',
  resolved_at: '2026-08-04T15:10:11.000Z',
  observation_count: 4,
  events: [
    { type: 'detected', severity: 'warning', observed_at: '2026-08-04T15:06:29.000Z', messages: ['Espera de 30s'] },
    { type: 'update', severity: 'warning', observed_at: '2026-08-04T15:07:29.000Z', messages: ['Espera de 45s'] },
    { type: 'recovered', severity: 'ok', observed_at: '2026-08-04T15:10:11.000Z', messages: [] }
  ]
};
```

Assert the heading is `Aviso de db`, the labels are `Aviso detectado`, `Actualización`, and `Servicio recuperado`, both warning messages render, and the generic `Components failed` banner is absent. For an error event with two messages, assert both render inside the same list item. Retain one legacy incident test.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/IncidentTimelineCard.test.js` from `frontend/`.

Expected: FAIL because the card does not read `events`.

- [ ] **Step 3: Implement a normalized view model in the component file**

Build new-event markup when `incident.events` is an array. Derive:

```js
const severity = incident.highest_severity || incident.current_severity || 'error';
const context = incident.component_name || incident.component_key || serverName;
const title = `${severity === 'warning' ? 'Aviso' : 'Incidencia'} de ${context}`;
const count = incident.observation_count ?? incident.consecutive_failures ?? 0;
```

Map labels by event type/severity:

```js
const eventLabel = (event) => {
  if (event.type === 'recovered') return 'Servicio recuperado';
  if (event.type === 'update') return 'Actualización';
  return event.severity === 'warning' ? 'Aviso detectado' : 'Error detectado';
};
```

Render every event message beneath its timestamp. Keep the current legacy branch when `events` is missing so cached or unmigrated payloads still render.

- [ ] **Step 4: Style episode and event severities**

Replace the single open/red assumption with explicit classes:

- `.incident-timeline-card.severity-error` uses the existing red accent;
- `.incident-timeline-card.severity-warning` uses the existing amber token;
- resolved badges stay green, while open warning badges are amber;
- `.incident-timeline li.error`, `.warning`, and `.recovered` color their marker;
- `.incident-event-messages` uses `overflow-wrap: anywhere`, normal weight, and compact list spacing.

Remove `.incident-diagnostic` only after the legacy branch has an equivalent scoped fallback style.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/IncidentTimelineCard.test.js` from `frontend/`.

Expected: all timeline-card tests PASS.

- [ ] **Step 6: Commit the timeline UI**

```bash
git add frontend/src/components/IncidentTimelineCard.js frontend/src/components/IncidentTimelineCard.css frontend/src/components/IncidentTimelineCard.test.js
git commit -m "feat(health): show diagnostic incident updates"
```

---

### Task 5: Update the History Page and Protect Current-Issue Behavior

**Files:**
- Modify: `frontend/src/components/ServerHistory.js`
- Modify: `frontend/src/components/ServerHistory.test.js`
- Modify: `frontend/src/components/ServerHealth.test.js`

**Interfaces:**
- Consumes the unchanged `getServerIncidents(serverId, filters)` API helper and new episode item shape.
- Produces the same route `/health/servers/:serverId/history`, filters, and pagination controls.

- [ ] **Step 1: Write failing history-page tests with warning and error episodes**

Replace the page fixture with two items, one `highest_severity: 'warning'` and one `highest_severity: 'error'`. Assert both `Aviso de db` and `Incidencia de db2` render, total copy says `2 registros históricos`, and the empty state says `Este servidor todavía no tiene avisos ni incidencias registrados.`

Keep the existing filter and pagination assertions unchanged to prove the route contract is stable.

- [ ] **Step 2: Add a current-services regression test**

In `ServerHealth.test.js`, return one server whose components include two errors, one warning, and one healthy check. Assert all three affected names/messages appear below that server and the healthy component does not appear. This locks the approved current-page behavior without adding a new control.

- [ ] **Step 3: Run the focused tests and verify RED where copy changed**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/ServerHistory.test.js src/components/ServerHealth.test.js` from `frontend/`.

Expected: the new history wording test FAILS; current issue behavior either passes already or reveals a regression to fix narrowly.

- [ ] **Step 4: Update history copy and episode rendering inputs**

Change only the total and empty-state copy. Continue passing each item directly to `IncidentTimelineCard`; do not add client grouping because the backend already returns one item per check episode.

If the current-services regression fails, fix `CurrentCheckIssues` only enough to list every `error` and `warning` entry while preserving error-first ordering and omitting `ok`.

- [ ] **Step 5: Run focused frontend tests and verify GREEN**

Run: `npm test -- --watchAll=false --runTestsByPath src/components/ServerHistory.test.js src/components/ServerHealth.test.js src/components/CurrentCheckIssues.test.js` from `frontend/`.

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the page integration**

```bash
git add frontend/src/components/ServerHistory.js frontend/src/components/ServerHistory.test.js frontend/src/components/ServerHealth.test.js frontend/src/components/CurrentCheckIssues.js
git commit -m "feat(health): list warning and error histories"
```

Only stage `CurrentCheckIssues.js` if the regression test required a production change.

---

### Task 6: Full Regression, Migration Smoke Test, and Responsive Verification

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Consumes the complete backend and frontend implementation from Tasks 1–5.
- Produces a release-ready branch with all suites and build green.

- [ ] **Step 1: Run the complete backend suite**

Run: `npm test` from `backend/`.

Expected: all backend tests PASS, including checker, aggregate incidents, Teams, status history, component incidents, monitor, and routes.

- [ ] **Step 2: Run the complete frontend suite**

Run: `npm test -- --watchAll=false` from `frontend/`.

Expected: all frontend suites PASS.

- [ ] **Step 3: Build the frontend**

Run: `npm run build` from `frontend/`.

Expected: production build succeeds. Existing Browserslist or bundle-size warnings are acceptable; compilation errors are not.

- [ ] **Step 4: Smoke-test a real SQLite migration**

Create a temporary SQLite database through a test script, initialize the old `health_incidents` schema with one resolved row, run both old and new `ensureSchema()` calls twice, and query the per-server history. Confirm one migrated episode per listed component and no duplicate events. Remove only the explicit temporary database after resolving its absolute path inside the worktree temp directory.

- [ ] **Step 5: Verify the UI at desktop and mobile widths**

Start the application against temporary local data containing:

- one warning episode with a changed message;
- one error episode with two messages in one event;
- one recovered episode;
- one currently healthy component that must not appear on the service page.

At 1280 px and 360 px, verify:

- the service page lists only current warnings/errors;
- the historical page shows independent cards per check;
- red, amber, and green markers have matching text labels;
- long messages wrap and create no page-level horizontal overflow;
- filters and `Ver histórico` still work.

- [ ] **Step 6: Check the final diff**

Run:

```bash
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no whitespace errors, no temporary files, and only intentional commits/files.

- [ ] **Step 7: Commit any verification-only corrections**

If Tasks 1–6 required a final correction, stage only its explicit files and commit:

```bash
git commit -m "fix(health): harden component incident history"
```

If no files changed, do not create an empty commit.
