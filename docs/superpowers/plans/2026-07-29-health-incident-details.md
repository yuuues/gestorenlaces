# Health Incident Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show incident start time, end time, and the failed subcheck when one exists in each Server Health incident summary.

**Architecture:** Keep the backend and persisted incident model unchanged because the API already exposes `first_failed_at`, `resolved_at`, and `last_error.components`. Extend the existing React incident summary with labeled metadata and reuse `formatTimestamp` for locale-consistent dates.

**Tech Stack:** React 18, Create React App, Jest, React Testing Library.

## Global Constraints

- Preserve the existing incident title, error message, consecutive-failure count, and duration.
- Show `Fin: En curso` for an open incident and the formatted `resolved_at` value for a resolved incident.
- Render `Subcheck` only when `last_error.components` is a non-empty array.
- Do not change SQLite, backend routes, or the persisted incident schema.
- Keep user-facing strings in Spanish.

---

### Task 1: Render incident timing and conditional subcheck details

**Files:**
- Modify: `frontend/src/components/ServerHealth.test.js:72-181`
- Modify: `frontend/src/components/ServerHealth.js:358-380`

**Interfaces:**
- Consumes: incident objects returned by `/api/health/incidents`, including `status`, `first_failed_at`, `resolved_at`, and `last_error.components`.
- Produces: labeled `Inicio`, `Fin`, and conditional `Subcheck` text in `.incident-summary`; no new exported functions.

- [ ] **Step 1: Write failing component tests**

Extend the existing open-incident test and add resolved/no-subcheck cases:

```javascript
test('shows timing and failed subcheck for an open incident', async () => {
  prepareApi({ incidents: [openIncident] });

  render(<ServerHealth />);

  expect(await screen.findByText('Incidencia abierta')).toBeInTheDocument();
  expect(screen.getByText(/Inicio:/)).toHaveTextContent(
    `Inicio: ${new Date(openIncident.first_failed_at).toLocaleString('es-ES')}`
  );
  expect(screen.getByText(/Fin:/)).toHaveTextContent('Fin: En curso');
  expect(screen.getByText(/Subcheck:/)).toHaveTextContent(
    'Subcheck: Database'
  );
});

test('shows start and end timing for a resolved incident', async () => {
  const resolvedIncident = {
    ...openIncident,
    status: 'resolved',
    resolved_at: '2026-07-28T10:02:00.000Z'
  };
  prepareApi({ incidents: [resolvedIncident] });

  render(<ServerHealth />);

  expect(
    await screen.findByText('Última incidencia resuelta')
  ).toBeInTheDocument();
  expect(screen.getByText(/Inicio:/)).toHaveTextContent(
    `Inicio: ${new Date(resolvedIncident.first_failed_at).toLocaleString(
      'es-ES'
    )}`
  );
  expect(screen.getByText(/Fin:/)).toHaveTextContent(
    `Fin: ${new Date(resolvedIncident.resolved_at).toLocaleString('es-ES')}`
  );
  expect(screen.getByText(/Subcheck:/)).toHaveTextContent(
    'Subcheck: Database'
  );
});

test('does not show a subcheck for a failure without failed components', async () => {
  prepareApi({
    incidents: [
      {
        ...openIncident,
        last_error: {
          kind: 'timeout',
          message: 'timeout of 5000ms exceeded',
          components: []
        }
      }
    ]
  });

  render(<ServerHealth />);

  expect(await screen.findByText('Incidencia abierta')).toBeInTheDocument();
  expect(screen.queryByText(/Subcheck:/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
$env:CI='true'
npm test -- --runInBand src/components/ServerHealth.test.js
```

Working directory: `frontend`.

Expected: the three new assertions fail because `Inicio`, `Fin`, and
`Subcheck` are not rendered yet.

- [ ] **Step 3: Implement the minimal incident metadata markup**

Inside the existing `.incident-summary`, after the error message and before
the failure-count paragraph, add:

```javascript
<p>
  <strong>Inicio:</strong>{' '}
  {formatTimestamp(storedIncident.first_failed_at)}
</p>
<p>
  <strong>Fin:</strong>{' '}
  {storedIncident.status === 'resolved'
    ? formatTimestamp(storedIncident.resolved_at)
    : 'En curso'}
</p>
{Array.isArray(storedIncident.last_error?.components) &&
  storedIncident.last_error.components.length > 0 && (
    <p>
      <strong>Subcheck:</strong>{' '}
      {storedIncident.last_error.components.join(', ')}
    </p>
  )}
```

Do not modify the existing message or count/duration paragraphs.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
$env:CI='true'
npm test -- --runInBand src/components/ServerHealth.test.js
```

Working directory: `frontend`.

Expected: all tests in `ServerHealth.test.js` pass without warnings introduced
by this change.

- [ ] **Step 5: Run the frontend production build**

Run:

```powershell
npm run build
```

Working directory: `frontend`.

Expected: `Compiled successfully`.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- frontend/src/components/ServerHealth.test.js frontend/src/components/ServerHealth.js
git commit -m "feat(health): show incident timing and subcheck"
```
