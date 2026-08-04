# Compact Responsive Health Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the health dashboard shorter and responsive by merging monitor metadata into its header, moving history into each server header, and removing page-level horizontal overflow.

**Architecture:** Keep data loading, permissions, routes, and status semantics in `ServerHealth` unchanged. Reshape only presentation markup, then apply narrowly scoped responsive styles to the health view and application shell. Existing tests protect behavior; new assertions protect compact structure and healthy-monitor silence.

**Tech Stack:** React 18, React Router 6, Create React App, Testing Library, Jest, CSS media queries.

## Global Constraints

- Do not change backend code, API calls, monitor scheduling, incidents, Teams notifications, authentication, or CRUD behavior.
- Do not render `Monitor activo`; render a monitor badge only for degraded or unavailable states.
- Remove the dashboard subtitle entirely.
- Keep all 96 fifteen-minute buckets visible in one row without page-level horizontal scrolling.
- Keep `Ver histórico` visible to every user; keep edit/delete behind the existing edit-mode condition.
- Limit global changes to responsive application-header and main-content CSS.
- Preserve accessible names, DOM order, keyboard focus, textual status labels, and reduced-motion behavior.

---

## File Map

- `frontend/src/components/ServerHealth.js`: compact header, conditional monitor alert, server-header actions.
- `frontend/src/components/ServerHealth.css`: compact layout plus tablet/mobile wrapping.
- `frontend/src/components/ServerHealth.test.js`: structure, permissions, navigation, monitor-state regressions.
- `frontend/src/components/ServerStatusStrip.css`: narrow-screen spacing for the unchanged 96-block strip.
- `frontend/src/App.css`: safe sizing and responsive global navigation/main content.

### Task 1: Compact dashboard monitor header

**Files:**
- Modify: `frontend/src/components/ServerHealth.test.js`
- Modify: `frontend/src/components/ServerHealth.js`
- Modify: `frontend/src/components/ServerHealth.css`

**Interfaces:**
- Consumes: `monitorStatus.state`, `running`, `lastRunAt`, `nextRunAt`, and `formatTimestamp(value)`.
- Produces: `.server-health-heading`, `.server-health-title-line`, `.monitor-metadata`, and an optional `.monitor-badge`; removes `.monitor-summary`.

- [ ] **Step 1: Write failing header tests**

Change the healthy-dashboard assertions to:

```js
expect(await screen.findByText('Magma Nodo 1')).toBeInTheDocument();
expect(screen.queryByText('Monitor activo')).not.toBeInTheDocument();
expect(screen.getByText('Última comprobación:')).toBeInTheDocument();
expect(screen.getByText('Próxima comprobación:')).toBeInTheDocument();
expect(container.querySelector('.monitor-summary')).not.toBeInTheDocument();
expect(screen.queryByText(/Estado actual y evolución/i)).not.toBeInTheDocument();
```

Keep the degraded/unavailable label tests because failure states remain visible.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm test -- --watchAll=false --runTestsByPath src/components/ServerHealth.test.js
```

Expected: FAIL because the healthy badge, subtitle, and `.monitor-summary` still exist.

- [ ] **Step 3: Implement failure-only monitor presentation**

Derive this value before the loading return:

```js
const monitorAlert = monitorState === 'degraded'
  ? { className: 'degraded', label: 'Monitor degradado' }
  : ['stopped', 'unavailable'].includes(monitorState)
    ? { className: 'unavailable', label: 'Monitor no disponible' }
    : null;
```

Replace the old heading/subtitle and standalone summary with:

```jsx
<div className="server-health-header">
  <div className="server-health-heading">
    <div className="server-health-title-line">
      <h2>Control de servicios</h2>
      {monitorAlert && (
        <span className={`monitor-badge ${monitorAlert.className}`}>
          {monitorAlert.label}
        </span>
      )}
    </div>
    <div className="monitor-metadata" aria-label="Estado del monitor">
      <span><strong>Última comprobación:</strong> {formatTimestamp(monitorStatus.lastRunAt)}</span>
      <span><strong>Próxima comprobación:</strong> {formatTimestamp(monitorStatus.nextRunAt)}</span>
    </div>
  </div>
  <div className="refresh-controls">
    {editMode && (
      <button className="check-now-button" onClick={handleCheckNow} disabled={checking}>
        <FontAwesomeIcon icon={faBolt} />
        {checking ? 'Comprobando...' : 'Comprobar ahora'}
      </button>
    )}
    <button className="refresh-button" onClick={handleRefresh} disabled={refreshing}>
      <FontAwesomeIcon icon={faRotate} />
      {refreshing ? 'Actualizando...' : 'Actualizar vista'}
    </button>
    {editMode && (
      <button className="add-server-button" onClick={openAdd}>
        <FontAwesomeIcon icon={faPlus} /> Añadir servidor
      </button>
    )}
  </div>
</div>
```

Delete the subtitle and `.monitor-summary`. Do not add a badge for `active` or `running`.

- [ ] **Step 4: Add compact header styles**

Replace subtitle/summary rules in `ServerHealth.css` with:

```css
.server-health-container { box-sizing: border-box; }
.server-health-header { align-items: center; margin-bottom: 14px; }
.server-health-heading,
.server-health-title-line { min-width: 0; }
.server-health-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.monitor-metadata {
  display: flex;
  gap: 6px 16px;
  flex-wrap: wrap;
  margin-top: 5px;
  color: #64748b;
  font-size: 12px;
}
```

Retain badge colors/focus rules; remove unused `.server-health-subtitle` and `.monitor-summary` rules.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused command from Step 2, then:

```powershell
git add frontend/src/components/ServerHealth.js frontend/src/components/ServerHealth.css frontend/src/components/ServerHealth.test.js
git commit -m "feat(health): compact monitor header"
```

Expected: every `ServerHealth` test passes, including degraded and unavailable states.

### Task 2: Move history and admin controls into the server header

**Files:**
- Modify: `frontend/src/components/ServerHealth.test.js`
- Modify: `frontend/src/components/ServerHealth.js`
- Modify: `frontend/src/components/ServerHealth.css`

**Interfaces:**
- Consumes: `serverId`, `record`, `editMode`, `openEdit(record)`, and `handleDelete(record)`.
- Produces: `.server-header-actions` with history for every known server ID and `.server-actions` only for admins; removes `.server-row-footer`.

- [ ] **Step 1: Write failing placement and permission tests**

Extend the navigation test:

```js
const link = await screen.findByRole('link', { name: 'Ver histórico' });
expect(link).toHaveAttribute('href', '/health/servers/1/history');
expect(link.closest('.server-header-actions')).toBeInTheDocument();
expect(document.querySelector('.server-row-footer')).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: 'Editar Magma Nodo 1' })).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: 'Eliminar Magma Nodo 1' })).not.toBeInTheDocument();
```

Add this admin test:

```js
test('groups history and edit actions in the server header for admins', async () => {
  mockEditMode = true;
  prepareApi();
  renderHealth();
  const actions = (await screen.findByRole('link', { name: 'Ver histórico' }))
    .closest('.server-header-actions');
  expect(within(actions).getByRole('button', { name: 'Editar Magma Nodo 1' })).toBeInTheDocument();
  expect(within(actions).getByRole('button', { name: 'Eliminar Magma Nodo 1' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run the Task 1 test command.

Expected: FAIL because history remains in `.server-row-footer` and `.server-header-actions` does not exist.

- [ ] **Step 3: Implement shared server-header actions**

After `.server-identity`, render:

```jsx
<div className="server-header-actions">
  {serverId && (
    <Link className="server-card-history-link" to={`/health/servers/${serverId}/history`}>
      Ver histórico
    </Link>
  )}
  {editMode && record && (
    <span className="server-actions">
      <button
        className="icon-button"
        onClick={() => openEdit(record)}
        title="Editar"
        aria-label={`Editar ${record.name}`}
      >
        <FontAwesomeIcon icon={faPenToSquare} />
      </button>
      <button
        className="icon-button delete"
        onClick={() => handleDelete(record)}
        title="Eliminar"
        aria-label={`Eliminar ${record.name}`}
      >
        <FontAwesomeIcon icon={faTrash} />
      </button>
    </span>
  )}
</div>
```

Remove the footer after `CurrentCheckIssues`.

- [ ] **Step 4: Compact server row styles**

```css
.server-card { padding: 14px 18px 12px; }
.server-row-header { align-items: center; margin-bottom: 10px; }
.server-header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex: 0 0 auto;
}
.server-actions { display: inline-flex; gap: 3px; }
```

Remove `.server-row-footer`; keep history focus/hover and current diagnostic styles.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused suite, then:

```powershell
git add frontend/src/components/ServerHealth.js frontend/src/components/ServerHealth.css frontend/src/components/ServerHealth.test.js
git commit -m "feat(health): move history into server header"
```

Expected: the focused suite passes for admin and non-admin states.

### Task 3: Remove responsive overflow and preserve the 96-block strip

**Files:**
- Modify: `frontend/src/components/ServerHealth.css`
- Modify: `frontend/src/components/ServerStatusStrip.css`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: existing application-shell, navigation, dashboard, server-action, and strip classes.
- Produces: CSS-only desktop/tablet/mobile layouts; no JavaScript interface changes.

- [ ] **Step 1: Record the responsive failure before CSS changes**

Run `/health` with representative local data and inspect widths `1280`, `768`, `480`, and `360` pixels in admin and non-admin modes.

Expected before the change: a narrow layout has page-level horizontal overflow; header controls and server actions do not form the approved compact composition.

- [ ] **Step 2: Make application-shell sizing safe**

Add to `App.css`:

```css
.app,
.app-header,
.main-content,
.main-content.full-width {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}

.view-tabs {
  flex-wrap: wrap;
  gap: 4px 10px;
}

@media (max-width: 760px) {
  .app-header { padding: 14px 10px 10px; }
  .app-header h1 { margin-bottom: 8px; font-size: 1.4rem; }
  .view-tabs { margin-bottom: 0; }
  .view-tab { margin: 0; padding: 7px 9px; font-size: 0.9rem; }
  .lock-button { margin-left: 0; }
  .main-content { padding: 10px; }
}
```

Do not add `overflow-x: hidden`; fix sizing rather than masking overflow.

- [ ] **Step 3: Add deliberate dashboard wrapping**

Replace the old mobile action offset with these rules inside `max-width: 760px`:

```css
.server-health-container { padding: 8px 0; }
.server-health-header { align-items: stretch; gap: 12px; }
.monitor-metadata { flex-direction: column; gap: 3px; }
.refresh-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.refresh-button,
.check-now-button,
.add-server-button { justify-content: center; min-width: 0; }
.server-row-header { align-items: stretch; gap: 8px; }
.server-header-actions { justify-content: space-between; }
.server-row-meta { min-width: 0; }
```

Add a narrow-phone breakpoint:

```css
@media (max-width: 460px) {
  .refresh-controls { grid-template-columns: 1fr; }
  .server-health-header h2 { font-size: 23px; }
  .server-card { padding: 12px 10px 10px; }
  .server-title-line { gap: 6px; }
}
```

- [ ] **Step 4: Keep all buckets in one row**

In `ServerStatusStrip.css`, retain `repeat(96, minmax(1px, 1fr))` below 760px, use `gap: 1px`, and set `.server-status-strip`, `.status-strip-heading`, `.status-strip-blocks`, and `.status-strip-axis` to `min-width: 0; max-width: 100%`. Keep one bucket row; do not introduce strip scrolling.

- [ ] **Step 5: Verify responsive behavior after CSS changes**

Repeat widths `1280`, `768`, `480`, and `360` in both edit modes. At each width verify:

- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
- Exactly 96 status blocks exist and the first/last are within the viewport.
- History remains visible at the top of each server row.
- Edit/delete appear only in edit mode and remain reachable.
- No healthy-monitor badge or subtitle exists.
- Warning/error diagnostic cards remain below their strip.

- [ ] **Step 6: Run frontend tests/build and commit**

```powershell
npm test -- --watchAll=false
npm run build
git add frontend/src/App.css frontend/src/components/ServerHealth.css frontend/src/components/ServerStatusStrip.css
git commit -m "fix(ui): make health dashboard responsive"
```

Expected: all frontend suites pass and the production build compiles successfully.

### Task 4: Final regression verification

**Files:**
- Verify only; no planned modifications.

**Interfaces:**
- Consumes: completed markup and CSS from Tasks 1–3.
- Produces: evidence that the branch is ready to integrate.

- [ ] **Step 1: Run the complete backend suite**

```powershell
cd backend
npm test
```

Expected: 98 tests pass, including history, incidents, warnings, and Teams behavior.

- [ ] **Step 2: Re-run complete frontend verification**

```powershell
cd frontend
npm test -- --watchAll=false
npm run build
```

Expected: every frontend suite passes and the production build compiles.

- [ ] **Step 3: Check repository hygiene**

```powershell
git diff --check
git status --short
git log --oneline --decorate -6
```

Expected: no whitespace errors, no uncommitted implementation files, and only intentional commits differ from `master`.
