# Health Dashboard 24-Hour Status Design

## Objective

Replace the permanent “last resolved incident” block on the health dashboard with a compact operational view that answers two questions quickly:

1. How has each server behaved during the last 24 hours?
2. Which checks are degraded right now, and why?

The dedicated incident-history screen remains the place for resolved incident detail. Teams notification behavior remains unchanged.

## Approved User Experience

Each configured server occupies one full-width horizontal row. The row uses a relaxed layout rather than the previous three-column grid:

- The server name and URL appear at the top.
- A small current-state indicator sits beside the server name:
  - `Operativo` for `ok`.
  - `Parcialmente degradado` for `warning`.
  - `Servicio degradado` for `error`.
- The main visual element is a 24-hour status strip made of 96 blocks. Each block represents 15 minutes.
- The strip uses green for `ok`, yellow for `warning`, red for `error`, and grey when there is no observation data.
- Current component details appear below the strip only for checks in `error` or `warning`.
- Error checks appear first in red, followed by warning checks in yellow.
- Healthy checks are not rendered.
- When a non-healthy server has no component-level diagnostic, such as a network failure, the dashboard renders one server-level connection diagnostic instead.
- The `Ver histórico` link remains available and opens the dedicated incident-history screen.
- Resolved incidents never remain visible on the dashboard.

On narrow screens, the server header and strip stack vertically while preserving the 24-hour axis and current diagnostics.

## Status Strip Semantics

The backend returns 96 ordered buckets for the requested 24-hour window. For every bucket, the most severe observed status wins:

1. `error`
2. `warning`
3. `ok`
4. `unknown` when no status overlaps the bucket

Therefore, even a short error inside a 15-minute interval makes that complete block red. A warning makes the block yellow only when no error occurred in the same interval.

The strip labels its endpoints as `Hace 24 h` and `Ahora`. It also displays an operational percentage calculated as the number of green buckets divided by all known buckets. Grey buckets are excluded from the denominator. When every bucket is grey, the percentage is unavailable rather than reported as zero.

## Persistence Model

Warning history cannot be reconstructed from incidents because warnings intentionally do not create incidents. The monitor therefore records compressed server-status periods separately from the incident lifecycle.

A new SQLite table, `health_status_periods`, stores:

- `id`
- `server_id`
- `status` (`ok`, `warning`, or `error`)
- `started_at`
- `last_observed_at`
- `ended_at`, nullable while the period is active

Only the aggregate server status is persisted. Current per-component details continue to come from the latest monitor snapshot.

For every completed server check:

- If the active period has the same status and the observations are continuous, update only `last_observed_at`.
- If the status changes, close the previous period and open a new one.
- If the monitor has a gap longer than twice its configured check interval, close the earlier period at `last_observed_at + check interval` and open a new period at the new observation time. The uncovered time between them remains grey rather than being presented as healthy.
- When a server is removed, close its active status period.
- Periods ending more than seven days ago are pruned during normal monitor maintenance.

This transition-based model stays compact during long healthy runs while retaining enough information for accurate warning and error history.

## Backend Interfaces

The monitor records status periods after each normalized check result. This is independent from incident handling:

- `error` still drives confirmed incidents and Teams notifications.
- `warning` still never opens an incident and never sends a Teams message.
- `ok` still resolves an open incident through the existing behavior.

The dashboard uses one bulk endpoint rather than one request per server:

```text
GET /api/health/status-history?hours=24&bucketMinutes=15
```

The response shape is:

```json
{
  "from": "2026-08-03T13:00:00.000Z",
  "to": "2026-08-04T13:00:00.000Z",
  "bucketMinutes": 15,
  "servers": [
    {
      "serverId": 1,
      "availabilityPercent": 98.9,
      "buckets": [
        { "start": "2026-08-03T13:00:00.000Z", "status": "ok" }
      ]
    }
  ]
}
```

The endpoint validates and clamps its window and bucket size to safe values. The dashboard always requests exactly 24 hours and 15-minute buckets.

## Frontend Components and Data Flow

`ServerHealth` loads three read models in parallel:

1. The current monitor snapshot.
2. Configured servers.
3. The bulk 24-hour status history.

The existing recent-incidents request is removed from the dashboard because resolved incidents are no longer rendered there. Incident data remains available through the dedicated history route.

Two focused presentation components keep the dashboard manageable:

- `ServerStatusStrip` renders the 96 accessible color blocks, axis labels, operational percentage, and tooltips with each interval’s time and status.
- `CurrentCheckIssues` filters the current snapshot to `error` and `warning`, orders errors first, and renders the diagnostic message and available check information. It returns nothing when all components are healthy.

Color is never the only signal: blocks expose localized status text through accessible labels/tooltips, and current diagnostics include explicit `Error` or `Aviso` labels.

## Failure Handling

- If current monitor status fails to load, the dashboard retains its existing monitor error state.
- If status history alone fails, current status and diagnostics remain usable. The strip renders grey blocks with a discreet `Histórico no disponible` message.
- Invalid or absent status rows are treated as `unknown`, never as `ok`.
- A newly configured server starts with grey history until its first observation.
- Open periods never imply unlimited coverage. Their visible coverage ends after the most recent observation plus the continuity allowance, so monitor downtime becomes grey.

## Testing Strategy

Backend tests cover:

- Opening, extending, changing, and closing compressed status periods.
- Monitor gaps and grey coverage.
- Seven-day pruning.
- Exact 15-minute boundary behavior.
- Severity precedence: error over warning over ok.
- Exclusion of grey buckets from availability calculations.
- Bulk endpoint validation and multi-server isolation.
- Preservation of the existing warning, incident, and Teams rules.

Frontend tests cover:

- Full-width horizontal server rows.
- Exactly 96 blocks for a 24-hour response.
- Correct labels and classes for green, yellow, red, and grey blocks.
- Error details before warning details.
- Complete omission of healthy checks.
- Server-level diagnostics when component diagnostics do not exist.
- Absence of resolved incident cards on the dashboard.
- Graceful history-fetch failure.
- Responsive structure and accessible interval labels.

## Scope Boundaries

This phase does not add comments, annotations, incident editing, per-component historical strips, or Teams notifications for warnings. The existing incident-history page and notification lifecycle remain otherwise unchanged.
