# Health Warnings and Incident History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-notifying warning state and a dedicated, paginated incident-history page with one timeline card per confirmed error incident.

**Architecture:** Normalize `ok`, `warning`, and `error` at the health-check boundary, then let the incident manager apply a separate lifecycle for warnings. Extend the existing SQLite incident store with a server-scoped filtered query, expose it through a read-only route, and reuse a focused React timeline-card component in both the dashboard and the new history page.

**Tech Stack:** Node.js 18+, Express, SQLite3, Node test runner, React 18, React Router 6, Axios, React Testing Library, FontAwesome.

## Global Constraints

- Only `error` opens incidents or sends Teams notifications.
- `warning` is visible in amber but is never persisted as its own incident.
- An open error that becomes warning closes silently and leaves no pending recovery notification.
- Existing `ok` and `error` behavior remains compatible.
- The history is read-only and excludes `pending` incidents.
- Comments and manual annotations are outside this phase.
- Do not stage or modify the user's existing `mcp-list` changes.

---

### Task 1: Normalize warning responses without regressing HTTP errors

**Files:**
- Modify: `backend/modules/health/checker.js`
- Modify: `backend/test/health-checker.test.js`

**Interfaces:**
- Consumes: upstream payloads shaped as `{ status, components }` and Axios responses shaped as `{ status, data }`.
- Produces: `evaluateResponse(response)` returning one of:
  - `{ status: 'ok', components, error: null, warning: null }`
  - `{ status: 'warning', components, error: null, warning: { kind, message, components } }`
  - `{ status: 'error', components, error: { kind, message, components, httpStatus? }, warning: null }`

- [ ] **Step 1: Add failing warning-classification tests**

Add literal fixtures that prove component warnings remain warnings and errors take precedence:

```js
test('HTTP 200 with a warning component returns warning diagnostics', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      status: 'warning',
      components: {
        db: {
          name: 'db',
          status: 'warning',
          errors: [{ severity: 'warning', message: 'Bloqueo en BD' }]
        }
      }
    }
  });

  assert.equal(result.status, 'warning');
  assert.equal(result.error, null);
  assert.equal(result.warning.message, 'Components warning: db');
  assert.deepEqual(result.warning.components, ['db']);
});

test('an error component takes precedence over warning components', () => {
  const result = evaluateResponse({
    status: 200,
    data: {
      status: 'error',
      components: {
        db: { name: 'db', status: 'warning' },
        core: { name: 'core', status: 'error' }
      }
    }
  });

  assert.equal(result.status, 'error');
  assert.deepEqual(result.error.components, ['core']);
  assert.equal(result.warning, null);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd backend && node --test test/health-checker.test.js`

Expected: the warning case fails because the current evaluator treats every non-`ok` component as `error`.

- [ ] **Step 3: Implement severity-aware evaluation**

Compute `errorComponents` and `warningComponents` separately. Preserve the existing structured-500 fix, but only allow a structured payload to override a non-200 response when it contains a real error. Return a warning object only when there are no errors:

```js
const componentNamesWithStatus = (components, status) =>
  Object.entries(components)
    .filter(([, component]) => component?.status === status)
    .map(([key, component]) => component.name || key);

if (data.status === 'error' || errorComponents.length > 0) {
  return {
    status: 'error',
    components,
    error: {
      kind: data.status === 'error' ? 'service' : 'component',
      message: data.message || `Components failed: ${errorComponents.join(', ')}`,
      components: errorComponents,
      ...(response.status !== 200 ? { httpStatus: response.status } : {})
    },
    warning: null
  };
}

if (data.status === 'warning' || warningComponents.length > 0) {
  return {
    status: 'warning',
    components,
    error: null,
    warning: {
      kind: data.status === 'warning' ? 'service' : 'component',
      message: data.message || `Components warning: ${warningComponents.join(', ')}`,
      components: warningComponents
    }
  };
}
```

Update `checkServer()` so `info.connection` uses the error message, warning message, or success copy according to `evaluated.status`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `cd backend && node --test test/health-checker.test.js`

Expected: all checker tests pass, including the existing structured HTTP 500 regression.

- [ ] **Step 5: Commit the isolated checker change**

```powershell
git add backend/modules/health/checker.js backend/test/health-checker.test.js
git commit -m "feat(health): classify warning checks separately"
```

---

### Task 2: Make warnings silent in the incident lifecycle

**Files:**
- Modify: `backend/modules/health/incident-store.js`
- Modify: `backend/modules/health/incident-manager.js`
- Modify: `backend/test/health-incidents.test.js`

**Interfaces:**
- Consumes: normalized monitor results whose `status` is `ok`, `warning`, or `error`.
- Produces: `store.resolveSilently(incident, now, reason)` and manager outcomes shaped as `{ incident, notification }`.

- [ ] **Step 1: Add failing lifecycle tests**

Define a warning fixture with `error: null` and verify all three transitions:

```js
const warningResult = {
  ...okResult,
  status: 'warning',
  warning: {
    kind: 'component',
    message: 'Components warning: db',
    components: ['db']
  }
};

test('warning without an active incident is not persisted or notified', async (t) => {
  const { db, manager } = await fixture(t);
  const result = await manager.record(warningResult, NOW);
  assert.equal(result.incident, null);
  assert.equal(result.notification, null);
  assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM health_incidents')).count, 0);
});

test('warning discards a pending error sequence', async (t) => {
  const { store, manager } = await fixture(t);
  await manager.record(errorResult, NOW);
  await manager.record(warningResult, PLUS_ONE_MINUTE);
  assert.equal(await store.getActive(errorResult.serverId), null);
});

test('warning resolves an open error silently without pending recovery', async (t) => {
  const { store, manager } = await fixture(t);
  const opened = await openIncident(manager);
  await manager.markDelivery(opened.id, 'opened', PLUS_ONE_MINUTE, true);
  const result = await manager.record(warningResult, PLUS_TWO_MINUTES);
  assert.equal(result.incident.status, 'resolved');
  assert.equal(result.incident.resolution_reason, 'warning');
  assert.equal(result.notification, null);
  assert.equal(await store.getPendingRecovery(errorResult.serverId), null);
});
```

- [ ] **Step 2: Run incident tests and verify RED**

Run: `cd backend && node --test test/health-incidents.test.js`

Expected: warning currently enters the success path and requests a recovery notification for an open incident.

- [ ] **Step 3: Add silent resolution to the store**

Add a method that atomically resolves an open incident and marks recovery as handled:

```js
const resolveSilently = async (incident, now, reason) => {
  const updated = await run(
    db,
    `UPDATE health_incidents
     SET status = 'resolved', resolved_at = ?, resolution_reason = ?,
         recovery_notified_at = ?
     WHERE id = ? AND status = 'open'`,
    [now, reason, now, incident.id]
  );
  return updated.changes === 1 ? getById(incident.id) : null;
};
```

Expose `resolveSilently` from `createIncidentStore()`.

- [ ] **Step 4: Add the warning branch to the manager**

Implement `recordWarning()` separately from `recordSuccess()`:

```js
const recordWarning = async (now, active) => {
  if (active?.status === 'pending') {
    await store.deletePending(active.id);
    return { incident: null, notification: null };
  }
  if (active?.status === 'open') {
    return {
      incident: await store.resolveSilently(active, now, 'warning'),
      notification: null
    };
  }
  return { incident: null, notification: null };
};

const record = async (result, now) => {
  const active = await store.getActive(result.serverId);
  if (result.status === 'error') return recordFailure(result, now, active);
  if (result.status === 'warning') return recordWarning(now, active);
  return recordSuccess(result, now, active);
};
```

- [ ] **Step 5: Run incident and monitor tests**

Run: `cd backend && node --test test/health-incidents.test.js test/health-monitor.test.js`

Expected: all tests pass and monitor snapshots retain `status: 'warning'` without notification deliveries.

- [ ] **Step 6: Commit the lifecycle change**

```powershell
git add backend/modules/health/incident-store.js backend/modules/health/incident-manager.js backend/test/health-incidents.test.js
git commit -m "feat(health): keep warnings out of Teams incidents"
```

---

### Task 3: Expose paginated incident history per server

**Files:**
- Modify: `backend/modules/health/incident-store.js`
- Modify: `backend/modules/health/incident-manager.js`
- Modify: `backend/modules/health/index.js`
- Modify: `backend/test/health-incidents.test.js`
- Modify: `backend/test/health-routes.test.js`

**Interfaces:**
- Produces: `incidentManager.listForServer(serverId, filters)`.
- Produces: `GET /api/health/servers/:id/incidents?limit=20&offset=0&status=open|resolved&days=N&component=name`.
- Response: `{ items, total, limit, offset }`, excluding `pending` rows.

- [ ] **Step 1: Add failing store tests for filtering before pagination**

Insert confirmed incidents for two servers, then assert server isolation, total count, page size, status, date, and JSON component filters. Use literal expected IDs and names rather than deriving expected values with store helpers.

```js
const page = await store.listForServer(1, {
  limit: 1,
  offset: 0,
  status: 'resolved',
  component: 'db'
});
assert.equal(page.total, 2);
assert.equal(page.items.length, 1);
assert.equal(page.items[0].server_id, 1);
assert.deepEqual(page.items[0].last_error.components, ['db']);
```

- [ ] **Step 2: Run store tests and verify RED**

Run: `cd backend && node --test test/health-incidents.test.js`

Expected: FAIL because `listForServer` does not exist.

- [ ] **Step 3: Implement the filtered store query**

Build one shared `WHERE` clause and parameter list, use it for `COUNT(*)` and the ordered page, and decode every row. Component filtering uses SQLite JSON1:

```sql
EXISTS (
  SELECT 1 FROM json_each(health_incidents.last_error, '$.components')
  WHERE json_each.value = ?
)
```

Order by `COALESCE(opened_at, first_failed_at) DESC, id DESC`. Always include
`server_id = ? AND status != 'pending'`; add `status = ?`, a lower date bound,
and the JSON component predicate only when supplied.

- [ ] **Step 4: Add failing route tests**

Test a successful page, clamped query values, and a missing server:

```js
const response = await fetch(
  `${baseUrl}/api/health/servers/${serverId}/incidents?limit=20&offset=0`
);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), {
  items: [], total: 0, limit: 20, offset: 0
});

const missing = await fetch(`${baseUrl}/api/health/servers/9999/incidents`);
assert.equal(missing.status, 404);
```

- [ ] **Step 5: Register the server-history route**

Parse query values with focused helpers:

```js
const historyFilters = (query, now) => ({
  limit: clampInteger(query.limit, 20, 1, 50),
  offset: clampInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  status: ['open', 'resolved'].includes(query.status) ? query.status : null,
  component: typeof query.component === 'string' ? query.component.trim().slice(0, 100) : '',
  from: validDays(query.days)
    ? new Date(now().getTime() - Number(query.days) * 86400000).toISOString()
    : null
});
```

The route first loads `servers.id`; return `{ error: 'Server not found' }` with
404 when absent, otherwise return `incidentManager.listForServer()`.

- [ ] **Step 6: Run all backend health tests**

Run: `cd backend && node --test test/health-*.test.js test/teams-notifier.test.js`

Expected: all health, route, monitor, incident, and Teams tests pass.

- [ ] **Step 7: Commit the history API**

```powershell
git add backend/modules/health/incident-store.js backend/modules/health/incident-manager.js backend/modules/health/index.js backend/test/health-incidents.test.js backend/test/health-routes.test.js
git commit -m "feat(health): expose server incident history"
```

---

### Task 4: Render warnings and reusable incident timeline cards

**Files:**
- Create: `frontend/src/components/IncidentTimelineCard.js`
- Create: `frontend/src/components/IncidentTimelineCard.css`
- Create: `frontend/src/components/IncidentTimelineCard.test.js`
- Modify: `frontend/src/components/ServerHealth.js`
- Modify: `frontend/src/components/ServerHealth.css`
- Modify: `frontend/src/components/ServerHealth.test.js`

**Interfaces:**
- Produces: `<IncidentTimelineCard incident={incident} serverName={name} />`.
- Consumes: incidents with `status`, `first_failed_at`, `resolved_at`, `resolution_reason`, `consecutive_failures`, and `last_error`.

- [ ] **Step 1: Add failing timeline-card tests**

Test an open incident, an `ok` recovery, a silent warning closure, and a network error without components:

```jsx
render(<IncidentTimelineCard incident={warningClosedIncident} serverName="Magma" />);
expect(screen.getByText('Incidencia de db')).toBeInTheDocument();
expect(screen.getByText('Bloqueo en BD')).toBeInTheDocument();
expect(screen.getByText(/El error pasó a aviso/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/IncidentTimelineCard.test.js`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused timeline component**

Move timestamp and duration formatting into this component. Render the approved structure:

```jsx
<article className={`incident-timeline-card ${incident.status}`}>
  <header>
    <h3>{title}</h3>
    <span className={`incident-state ${incident.status}`}>{stateLabel}</span>
  </header>
  <p className="incident-diagnostic">{incident.last_error?.message}</p>
  <ol className="incident-timeline">
    <li><strong>Error detectado</strong><span>{formatTimestamp(incident.first_failed_at)}</span></li>
    <li className="incident-timeline-end"><strong>{endLabel}</strong><span>{endValue}</span></li>
  </ol>
  <footer>{incident.consecutive_failures} fallos consecutivos · {duration}</footer>
</article>
```

Use `El error pasó a aviso` when `resolution_reason === 'warning'`, `Servicio
recuperado` for ordinary resolved incidents, and `En curso` for open ones.

- [ ] **Step 4: Add failing dashboard warning tests**

Mock a server and component with `status: 'warning'`, assert the server badge
and component badge read `Aviso`, the warning message is visible, and no
incidence heading is created from the warning itself.

- [ ] **Step 5: Implement tri-state dashboard styling**

Use `faTriangleExclamation` for warning. Derive status labels and classes with a
small helper rather than nested binary conditionals. Add `.status-warning` in
amber and keep the existing automatic expansion rule for every non-`ok`
component. Replace the inline incident summary with `IncidentTimelineCard`.

- [ ] **Step 6: Run focused frontend tests**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/IncidentTimelineCard.test.js src/components/ServerHealth.test.js`

Expected: both suites pass without React act warnings introduced by the change.

- [ ] **Step 7: Commit warning presentation and incident cards**

```powershell
git add frontend/src/components/IncidentTimelineCard.js frontend/src/components/IncidentTimelineCard.css frontend/src/components/IncidentTimelineCard.test.js frontend/src/components/ServerHealth.js frontend/src/components/ServerHealth.css frontend/src/components/ServerHealth.test.js
git commit -m "feat(health): show warnings and incident timelines"
```

---

### Task 5: Add the dedicated server-history screen

**Files:**
- Create: `frontend/src/components/ServerHistory.js`
- Create: `frontend/src/components/ServerHistory.css`
- Create: `frontend/src/components/ServerHistory.test.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/components/ServerHealth.js`
- Modify: `frontend/src/components/ServerHealth.css`
- Modify: `frontend/src/components/ServerHealth.test.js`

**Interfaces:**
- Produces: `getServerIncidents(serverId, filters)` in `frontend/src/api.js`.
- Produces: route `/health/servers/:serverId/history` rendering `<ServerHistory />`.
- Consumes: `{ items, total, limit, offset }` from Task 3 and `IncidentTimelineCard` from Task 4.

- [ ] **Step 1: Add failing history-screen tests**

Mock `getServers`, `getHealthStatus`, and `getServerIncidents`. Test the server
heading/current warning state, two incident cards, empty/error states, filter
requests, and next/previous page offsets. Assert rendered behavior, not mock
elements.

```jsx
expect(await screen.findByRole('heading', { name: /Magma · Histórico/ })).toBeInTheDocument();
expect(screen.getByText('Incidencia de db')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
await waitFor(() => expect(getServerIncidents).toHaveBeenLastCalledWith(1, expect.objectContaining({ offset: 20 })));
```

- [ ] **Step 2: Run the history-screen test and verify RED**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/ServerHistory.test.js`

Expected: FAIL because the screen and API helper do not exist.

- [ ] **Step 3: Add the Axios history helper**

```js
export const getServerIncidents = (serverId, filters = {}) =>
  api.get(`/api/health/servers/${serverId}/incidents`, {
    params: Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== '' && value != null)
    )
  });
```

- [ ] **Step 4: Implement the dedicated screen**

Use `useParams()` for `serverId`, fetch server metadata/current snapshot and the
history page, and keep filters in local state. Use page size 20. Reset offset to
zero whenever status, days, or component changes. Render:

```jsx
<Link to="/health">← Volver a servidores</Link>
<header className="server-history-header">...</header>
<form className="server-history-filters">...</form>
<section className="incident-history-list">
  {items.map((incident) => (
    <IncidentTimelineCard key={incident.id} incident={incident} serverName={server.name} />
  ))}
</section>
<nav aria-label="Paginación del histórico">...</nav>
```

Filters are a status select (`all`, `open`, `resolved`), a period select (`all`,
`7`, `30`, `90` days), and a component text field applied through the form.

- [ ] **Step 5: Register navigation and route**

Add the route in `App.js` and a visible `Ver histórico` link/button to each
server card. Keep edit/delete/component buttons independent; do not make the
whole card a nested interactive link.

- [ ] **Step 6: Run all health frontend tests**

Run: `cd frontend && npm test -- --watchAll=false --runTestsByPath src/components/IncidentTimelineCard.test.js src/components/ServerHealth.test.js src/components/ServerHistory.test.js`

Expected: all suites pass.

- [ ] **Step 7: Build the frontend**

Run: `cd frontend && npm run build`

Expected: production build completes successfully with no compilation errors.

- [ ] **Step 8: Commit the history screen**

```powershell
git add frontend/src/api.js frontend/src/App.js frontend/src/components/ServerHistory.js frontend/src/components/ServerHistory.css frontend/src/components/ServerHistory.test.js frontend/src/components/ServerHealth.js frontend/src/components/ServerHealth.css frontend/src/components/ServerHealth.test.js
git commit -m "feat(health): add server incident history screen"
```

---

### Task 6: Full regression verification

**Files:**
- Verify only; no production changes expected.

**Interfaces:**
- Consumes: all backend and frontend behavior produced by Tasks 1-5.
- Produces: fresh verification evidence for handoff.

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the complete frontend test suite once**

Run: `cd frontend && npm test -- --watchAll=false`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Rebuild production frontend**

Run: `cd frontend && npm run build`

Expected: build exits zero.

- [ ] **Step 4: Review repository scope**

Run:

```powershell
git diff --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors; only intended health/docs changes are committed;
the user's `mcp-list` changes and local `.superpowers/` scratch directory remain
unstaged and untouched.
