# Health Dashboard 24-Hour Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persistent resolved-incident cards on the health dashboard with full-width server rows containing a 96-block, 24-hour status strip and details only for current warning or error checks.

**Architecture:** Record compressed server-level `ok`, `warning`, and `error` periods in a dedicated SQLite store that is independent of incidents and Teams. A bulk read service converts overlapping periods into fixed 15-minute buckets for every configured server, and focused React components render the strip and current non-healthy checks. The existing incident-history screen remains unchanged.

**Tech Stack:** Node.js 18+, Express, SQLite3, Node test runner, React 18, Axios, React Testing Library, CSS.

## Global Constraints

- The dashboard window is exactly 24 hours split into 96 blocks of 15 minutes.
- Bucket precedence is `error` > `warning` > `ok` > `unknown`.
- `unknown` is grey and is excluded from the operational-percentage denominator.
- Only current `error` and `warning` checks render details; `ok` checks remain hidden.
- Current errors appear before current warnings.
- A non-healthy server without component diagnostics renders a server-level connection diagnostic.
- Resolved incidents never render on the dashboard and remain accessible through `Ver histórico`.
- Warning periods never create incidents or Teams notifications.
- Status periods older than seven days are pruned.
- Preserve the user's uncommitted `mcp-list` changes and local `.superpowers/` content.

---

### Task 1: Persist compressed server-status periods

**Files:**
- Create: `backend/modules/health/status-history-store.js`
- Create: `backend/test/health-status-history.test.js`

**Interfaces:**
- Produces: `createStatusHistoryStore(db, { intervalMs, retentionMs })`.
- Produces store methods:
  - `ensureSchema(): Promise<void>`
  - `record(serverId, status, observedAt): Promise<object>`
  - `closeForRemovedServer(serverId, observedAt): Promise<void>`
  - `prune(now): Promise<void>`
  - `listOverlapping(serverIds, from, to): Promise<object[]>`
- Status values are exactly `ok`, `warning`, and `error`.

- [ ] **Step 1: Write failing schema and transition tests**

Create an in-memory SQLite fixture and literal tests for opening, extending, changing, gapped, removed, pruned, and overlapping periods:

```js
test('records one compressed period while the status remains unchanged', async (t) => {
  const { db, store } = await fixture(t, { intervalMs: 60000 });
  await store.record(1, 'ok', '2026-08-04T10:00:00.000Z');
  await store.record(1, 'ok', '2026-08-04T10:01:00.000Z');

  const rows = await all(db, 'SELECT * FROM health_status_periods');
  assert.equal(rows.length, 1);
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

test('leaves a gap when observations are farther apart than twice the interval', async (t) => {
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
```

Also assert that an invalid status rejects, removal closes the active row, `prune()` removes only periods ending more than seven days ago, and `listOverlapping()` isolates requested server IDs and time bounds.

- [ ] **Step 2: Run the store tests and verify RED**

Run: `cd backend && node --test test/health-status-history.test.js`

Expected: FAIL because `status-history-store.js` does not exist.

- [ ] **Step 3: Implement the SQLite status-period store**

Create this schema and indexes in `ensureSchema()`:

```sql
CREATE TABLE IF NOT EXISTS health_status_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
  started_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_status_active_server
ON health_status_periods(server_id)
WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_health_status_server_window
ON health_status_periods(server_id, started_at, ended_at);
```

In `record()`:

1. Parse and validate `observedAt` and `status`.
2. Load the active row for `server_id`.
3. Insert when no active row exists.
4. When `observedAt - last_observed_at > intervalMs * 2`, close the active row at `last_observed_at + intervalMs` and insert a new row even if the status is unchanged.
5. When the status changes continuously, close the active row at `observedAt` and insert the new status.
6. Otherwise update only `last_observed_at`.

Implement `prune(now)` with a cutoff of `now - retentionMs` and delete only rows whose `ended_at` is older than that cutoff. Implement `listOverlapping()` with:

```sql
WHERE server_id IN (...)
  AND started_at < ?
  AND (ended_at IS NULL OR ended_at > ?)
ORDER BY server_id, started_at, id
```

- [ ] **Step 4: Run the focused store tests and verify GREEN**

Run: `cd backend && node --test test/health-status-history.test.js`

Expected: all status-history store tests pass.

- [ ] **Step 5: Commit the isolated store**

```powershell
git add backend/modules/health/status-history-store.js backend/test/health-status-history.test.js
git commit -m "feat(health): persist compressed status periods"
```

---

### Task 2: Convert periods into bulk 15-minute status strips

**Files:**
- Create: `backend/modules/health/status-history.js`
- Modify: `backend/test/health-status-history.test.js`
- Modify: `backend/modules/health/index.js`
- Modify: `backend/test/health-routes.test.js`

**Interfaces:**
- Consumes: `statusHistoryStore.listOverlapping(serverIds, from, to)` from Task 1.
- Produces: `buildServerStatusHistory({ serverIds, periods, from, to, bucketMinutes, coverageMs })`.
- Produces: `createStatusHistoryService({ store, coverageMs })` with `getHistory(serverIds, options)`.
- Produces: `GET /api/health/status-history?hours=24&bucketMinutes=15`.

- [ ] **Step 1: Add failing bucket-precedence and availability tests**

Append literal tests for a one-hour, four-bucket example:

```js
test('builds fixed buckets using the worst overlapping severity', () => {
  const result = buildServerStatusHistory({
    serverIds: [1],
    from: '2026-08-04T10:00:00.000Z',
    to: '2026-08-04T11:00:00.000Z',
    bucketMinutes: 15,
    coverageMs: 60000,
    periods: [
      period(1, 'ok', '2026-08-04T10:00:00.000Z', '2026-08-04T10:30:00.000Z'),
      period(1, 'warning', '2026-08-04T10:16:00.000Z', '2026-08-04T10:17:00.000Z'),
      period(1, 'error', '2026-08-04T10:29:00.000Z', '2026-08-04T10:31:00.000Z')
    ]
  });

  assert.deepEqual(
    result.servers[0].buckets.map((bucket) => bucket.status),
    ['ok', 'error', 'error', 'unknown']
  );
  assert.equal(result.servers[0].availabilityPercent, 33.3);
});

test('returns 96 unknown buckets for a server without observations', () => {
  const result = buildServerStatusHistory({
    serverIds: [7],
    from: '2026-08-03T10:00:00.000Z',
    to: '2026-08-04T10:00:00.000Z',
    bucketMinutes: 15,
    coverageMs: 60000,
    periods: []
  });
  assert.equal(result.servers[0].buckets.length, 96);
  assert.ok(result.servers[0].buckets.every(({ status }) => status === 'unknown'));
  assert.equal(result.servers[0].availabilityPercent, null);
});
```

Also cover an open period ending at `last_observed_at + coverageMs`, exact bucket boundaries, warning without error, and server isolation.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd backend && node --test test/health-status-history.test.js`

Expected: FAIL because the builder and service do not exist.

- [ ] **Step 3: Implement the pure bucket builder and service**

Use the rank map below and generate bucket starts from `from` until `to`:

```js
const STATUS_RANK = { unknown: 0, ok: 1, warning: 2, error: 3 };
```

For every period, compute effective coverage as:

```js
const periodEnd = period.ended_at
  ? Date.parse(period.ended_at)
  : Math.min(Date.parse(period.last_observed_at) + coverageMs, toMs);
```

Mark every overlapping bucket with the highest-ranked status. Calculate `availabilityPercent` as `green / known * 100`, rounded to one decimal, with `null` when `known === 0`.

`createStatusHistoryService()` loads overlapping rows once and returns:

```js
{
  from,
  to,
  bucketMinutes,
  servers: [{ serverId, availabilityPercent, buckets }]
}
```

- [ ] **Step 4: Add failing bulk-route tests**

In `health-routes.test.js`, inject a `statusHistoryService` fake and verify configured server IDs, default parameters, clamping, and response passthrough:

```js
const response = await fetch(`${baseUrl}/api/health/status-history`);
assert.equal(response.status, 200);
assert.deepEqual(calls[0].serverIds, [serverId]);
assert.equal(calls[0].options.bucketMinutes, 15);
assert.equal(
  Date.parse(calls[0].options.to) - Date.parse(calls[0].options.from),
  24 * 60 * 60 * 1000
);
```

Assert `hours` is clamped to `1..168`, and unsupported `bucketMinutes` falls back to `15` while `5`, `15`, `30`, and `60` are accepted.

- [ ] **Step 5: Register the bulk status-history endpoint**

Extend `registerRoutes()` to receive `statusHistoryService`. Query all configured server IDs once, derive `from` and `to` from the injected `now`, and call:

```js
statusHistoryService.getHistory(serverIds, {
  from: from.toISOString(),
  to: to.toISOString(),
  bucketMinutes
});
```

Register the endpoint in `exports.routes`. Construct and expose the service from `createHealthModule()`.

- [ ] **Step 6: Run status-history and route tests**

Run: `cd backend && node --test test/health-status-history.test.js test/health-routes.test.js`

Expected: both suites pass.

- [ ] **Step 7: Commit the bulk history API**

```powershell
git add backend/modules/health/status-history.js backend/modules/health/index.js backend/test/health-status-history.test.js backend/test/health-routes.test.js
git commit -m "feat(health): expose bucketed status history"
```

---

### Task 3: Record status periods without affecting incidents or Teams

**Files:**
- Modify: `backend/modules/health/monitor.js`
- Modify: `backend/modules/health/index.js`
- Modify: `backend/test/health-monitor.test.js`
- Modify: `backend/test/health-routes.test.js`

**Interfaces:**
- Consumes store methods from Task 1.
- `createHealthMonitor()` consumes `statusHistory` with:
  - `record(serverId, status, observedAt): Promise<void>`
  - `prune(observedAt): Promise<void>`
- Server deletion consumes `statusHistory.closeForRemovedServer(serverId, observedAt)`.

- [ ] **Step 1: Add failing monitor-recording tests**

Extend the monitor fixture with a `statusHistory` fake. Prove all three severities are recorded and telemetry failures do not suppress snapshots, incidents, or Teams:

```js
test('records every normalized server severity after a round', async () => {
  const calls = [];
  const monitor = makeMonitor({
    listServers: async () => [serverA, serverB],
    check: async (server) => server.id === 1 ? okA : warningB,
    statusHistory: {
      record: async (...args) => calls.push(args),
      prune: async () => {}
    }
  });

  await monitor.runNow();
  assert.deepEqual(calls, [
    [1, 'ok', '2026-07-28T10:00:00.000Z'],
    [2, 'warning', '2026-07-28T10:00:00.000Z']
  ]);
});

test('status-history write failure does not break current health processing', async () => {
  const monitor = makeMonitor({
    statusHistory: {
      record: async () => { throw new Error('history unavailable'); },
      prune: async () => {}
    }
  });
  await monitor.runNow();
  assert.equal(monitor.getStatus().servers.API.status, 'ok');
  assert.equal(monitor.getStatus().lastError, null);
});
```

Assert pruning is requested once per completed round.

- [ ] **Step 2: Run monitor tests and verify RED**

Run: `cd backend && node --test test/health-monitor.test.js`

Expected: FAIL because the monitor does not call `statusHistory`.

- [ ] **Step 3: Integrate resilient status-history recording**

Add a no-op default for backwards-compatible unit fixtures:

```js
statusHistory = {
  record: async () => {},
  prune: async () => {}
}
```

After checks complete and before incident handling, call `record()` for every result. Catch each history error, log `Health status history write failed: <message>`, and continue. After processing results, call `prune(checkedAt)` with the same failure isolation.

Pass the real store from `createHealthModule()` into the monitor. Ensure the store schema before `monitor.start()`.

- [ ] **Step 4: Add and implement server-removal coverage**

Update the existing route deletion test to assert:

```js
assert.deepEqual(statusHistoryStore.closeForRemovedServer.mock.calls[0], [
  serverId,
  '2026-07-28T10:00:00.000Z'
]);
```

Call `closeForRemovedServer()` in the same catalog mutation that closes incidents and deletes the server.

- [ ] **Step 5: Run monitor, route, incident, and Teams tests**

Run: `cd backend && node --test test/health-monitor.test.js test/health-routes.test.js test/health-incidents.test.js test/teams-notifier.test.js`

Expected: all suites pass; warning behavior remains silent in Teams.

- [ ] **Step 6: Commit monitor integration**

```powershell
git add backend/modules/health/monitor.js backend/modules/health/index.js backend/test/health-monitor.test.js backend/test/health-routes.test.js
git commit -m "feat(health): record monitor status history"
```

---

### Task 4: Build accessible status-strip and current-issue components

**Files:**
- Create: `frontend/src/components/ServerStatusStrip.js`
- Create: `frontend/src/components/ServerStatusStrip.css`
- Create: `frontend/src/components/ServerStatusStrip.test.js`
- Create: `frontend/src/components/CurrentCheckIssues.js`
- Create: `frontend/src/components/CurrentCheckIssues.css`
- Create: `frontend/src/components/CurrentCheckIssues.test.js`

**Interfaces:**
- Produces: `<ServerStatusStrip history={serverHistory} unavailable={boolean} />`.
- Produces: `<CurrentCheckIssues server={serverSnapshot} />`.
- `serverHistory` contains `{ availabilityPercent, buckets: [{ start, status }] }`.

- [ ] **Step 1: Write failing status-strip tests**

Test 96 blocks, localized accessible labels, all four classes, percentage copy, and failure fallback:

```jsx
test('renders one accessible block per 15-minute interval', () => {
  const buckets = Array.from({ length: 96 }, (_, index) => ({
    start: new Date(Date.UTC(2026, 7, 3, 10, index * 15)).toISOString(),
    status: ['ok', 'warning', 'error', 'unknown'][index % 4]
  }));
  render(
    <ServerStatusStrip
      history={{ availabilityPercent: 50, buckets }}
      unavailable={false}
    />
  );
  expect(screen.getAllByRole('img')).toHaveLength(96);
  expect(screen.getByText('50 % operativo')).toBeInTheDocument();
  expect(screen.getByText('Hace 24 h')).toBeInTheDocument();
  expect(screen.getByText('Ahora')).toBeInTheDocument();
});
```

Assert each block has an `aria-label` containing its interval and `Operativo`, `Parcialmente degradado`, `Servicio degradado`, or `Sin datos`.

- [ ] **Step 2: Write failing current-issue tests**

Use a literal snapshot containing `ok`, `warning`, and `error` components. Assert error precedes warning, healthy content is absent, diagnostic messages are visible, and a component-free network error renders `Conexión · Error`.

```jsx
expect(screen.getAllByRole('article').map((node) => node.textContent)).toEqual([
  expect.stringContaining('dbError'),
  expect.stringContaining('cacheAviso')
]);
expect(screen.queryByText('core')).not.toBeInTheDocument();
```

- [ ] **Step 3: Run both component suites and verify RED**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/ServerStatusStrip.test.js src/components/CurrentCheckIssues.test.js`

Expected: FAIL because both components do not exist.

- [ ] **Step 4: Implement `ServerStatusStrip`**

Render a labeled strip with CSS Grid, `grid-template-columns: repeat(96, minmax(2px, 1fr))`, a 30-pixel height, two-pixel gaps, and the approved semantic colors. Normalize unexpected statuses to `unknown`. Use native `title` plus `aria-label` per block and `role="img"` because the blocks are informational rather than interactive.

When `unavailable` is true or history is absent, synthesize 96 `unknown` blocks and render `Histórico no disponible`. When `availabilityPercent` is `null`, render `Disponibilidad no calculable`.

- [ ] **Step 5: Implement `CurrentCheckIssues`**

Create a pure selector:

```js
export const selectCurrentIssues = (server) => {
  const rank = { error: 0, warning: 1 };
  return Object.entries(server?.components || {})
    .filter(([, component]) => component?.status in rank)
    .sort((left, right) => rank[left[1].status] - rank[right[1].status]);
};
```

Render red/yellow issue articles with the component name, explicit `Error` or `Aviso`, every `errors[].message`, and the existing `info` facts. Return `null` when there are no issues. If the server itself is warning/error but the selector is empty, render one issue from `server.error || server.warning` and `server.info.connection`.

- [ ] **Step 6: Run both component suites and verify GREEN**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/ServerStatusStrip.test.js src/components/CurrentCheckIssues.test.js`

Expected: both suites pass.

- [ ] **Step 7: Commit the focused presentation components**

```powershell
git add frontend/src/components/ServerStatusStrip.js frontend/src/components/ServerStatusStrip.css frontend/src/components/ServerStatusStrip.test.js frontend/src/components/CurrentCheckIssues.js frontend/src/components/CurrentCheckIssues.css frontend/src/components/CurrentCheckIssues.test.js
git commit -m "feat(health): add status strip and current issues"
```

---

### Task 5: Replace dashboard incident cards with full-width server rows

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/ServerHealth.js`
- Modify: `frontend/src/components/ServerHealth.css`
- Modify: `frontend/src/components/ServerHealth.test.js`

**Interfaces:**
- Consumes: `GET /api/health/status-history` from Task 2.
- Produces: `getHealthStatusHistory({ hours = 24, bucketMinutes = 15 })`.
- Consumes the two components from Task 4.

- [ ] **Step 1: Rewrite dashboard tests for the approved behavior**

Mock `getHealthStatusHistory` with one 96-bucket server result. Replace incident-card assertions with:

```jsx
expect(await screen.findByText('Últimas 24 horas')).toBeInTheDocument();
expect(screen.getAllByRole('img', { name: /15 minutos/ })).toHaveLength(96);
expect(screen.queryByText('Última incidencia resuelta')).not.toBeInTheDocument();
expect(screen.queryByText('Servicio recuperado')).not.toBeInTheDocument();
expect(getHealthIncidents).not.toHaveBeenCalled();
```

Add tests for:

- Small state labels `Operativo`, `Parcialmente degradado`, and `Servicio degradado`.
- Error and warning issue details in the same server row, with error first.
- Omission of healthy components.
- History-fetch failure retaining current diagnostics and rendering grey fallback.
- Ordinary refresh reading current status and status history without triggering a check.
- Admin `Comprobar ahora` refreshing history after the server-side check.
- `Ver histórico` navigation remaining intact.

- [ ] **Step 2: Run the dashboard suite and verify RED**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/ServerHealth.test.js`

Expected: FAIL because the dashboard still requests recent incidents and renders incident cards/component accordions.

- [ ] **Step 3: Add the bulk API helper**

In `frontend/src/api.js` add:

```js
export const getHealthStatusHistory = ({
  hours = 24,
  bucketMinutes = 15
} = {}) => api.get('/api/health/status-history', {
  params: { hours, bucketMinutes }
});
```

Keep `getHealthIncidents()` because other consumers may still use it, but remove it from `ServerHealth` imports and calls.

- [ ] **Step 4: Reshape `ServerHealth` data loading**

Maintain independent `historyByServer` and `historyUnavailable` state. `loadDashboard()` requests current status and bulk history in parallel, but if only history fails, retain the successful current snapshot and set `historyUnavailable` instead of showing a page-level failure.

Map the bulk response once:

```js
const byServer = Object.fromEntries(
  (historyResponse.data?.servers || []).map((entry) => [entry.serverId, entry])
);
```

After `triggerHealthCheck()`, store its returned snapshot and request status history again. Do not fetch recent incidents.

- [ ] **Step 5: Implement the horizontal server-row composition**

Remove `IncidentTimelineCard`, incident state, component expansion state, and the complete healthy-component list. Each `.server-card` renders:

```jsx
<header className="server-row-header">...</header>
<ServerStatusStrip
  history={historyByServer[serverData.serverId]}
  unavailable={historyUnavailable}
/>
<CurrentCheckIssues server={serverData} />
<Link to={`/health/servers/${serverData.serverId}/history`}>
  Ver histórico
</Link>
```

Use current-state copy:

```js
const CURRENT_STATE_LABEL = {
  ok: 'Operativo',
  warning: 'Parcialmente degradado',
  error: 'Servicio degradado',
  unknown: 'Pendiente'
};
```

- [ ] **Step 6: Apply the approved responsive styling**

Change `.server-list` to a one-column grid. Remove hover translation and obsolete component/incident styles. Give the strip the dominant horizontal area, render the state indicator as a small colored dot plus text near the server name, and keep edit/delete actions visually secondary. Under 760 pixels, stack header metadata and actions while keeping the strip horizontally compressed.

- [ ] **Step 7: Run all health frontend tests**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/ServerStatusStrip.test.js src/components/CurrentCheckIssues.test.js src/components/ServerHealth.test.js src/components/ServerHistory.test.js src/components/IncidentTimelineCard.test.js`

Expected: all suites pass. The existing history-screen and timeline-card suites remain green because those components continue to serve incident history.

- [ ] **Step 8: Build the production frontend**

Run: `cd frontend && npm run build`

Expected: production compilation succeeds with no errors.

- [ ] **Step 9: Commit the dashboard replacement**

```powershell
git add frontend/src/api.js frontend/src/components/ServerHealth.js frontend/src/components/ServerHealth.css frontend/src/components/ServerHealth.test.js
git commit -m "feat(health): show 24-hour server status rows"
```

---

### Task 6: Full regression verification

**Files:**
- Verify only; no production changes expected.

**Interfaces:**
- Consumes all behavior from Tasks 1–5.
- Produces fresh evidence for the final handoff.

- [ ] **Step 1: Run the complete backend suite**

Run: `cd backend && npm test`

Expected: every backend test passes with zero failures.

- [ ] **Step 2: Run the complete frontend suite**

Run: `cd frontend && npm test -- --watchAll=false`

Expected: every frontend suite passes with zero failures.

- [ ] **Step 3: Rebuild the frontend**

Run: `cd frontend && npm run build`

Expected: build exits zero and reports `Compiled successfully`.

- [ ] **Step 4: Review scope and whitespace**

Run:

```powershell
git diff --check
git status --short
git log --oneline master..HEAD
```

Expected: no whitespace errors; only planned health and documentation commits are on the feature branch; the user's `mcp-list` changes and `.superpowers/` directory remain unstaged and untouched.
