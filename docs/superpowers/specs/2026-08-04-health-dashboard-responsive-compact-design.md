# Compact Responsive Health Dashboard Design

## Objective

Reduce the vertical footprint of the health dashboard and remove horizontal
overflow without changing monitor behavior, permissions, API calls, routes, or
the information available to operators.

The page should prioritize the 24-hour status strips and current problems. A
healthy monitor stays visually quiet; only monitor failures receive an alert.

## Approved Layout

### Dashboard header

The standalone monitor-summary panel and the descriptive subtitle are removed.
The main header becomes one responsive composition containing:

- `Control de servicios`.
- The last and next check timestamps in compact metadata.
- The existing actions: `Comprobar ahora`, `Actualizar vista`, and `Añadir
  servidor`.
- A monitor badge only when the monitor is degraded or unavailable.

An active, healthy monitor renders no badge. While a manual check is running,
the existing `Comprobar ahora` button communicates progress; no additional
monitor badge is added.

The timestamps remain visible when the monitor is healthy so operators can
verify freshness without a redundant success message.

### Server rows

Each server remains a full-width row. Its header contains:

- Server name and current aggregate state.
- URL and last-check timestamp.
- `Ver histórico` as a first-class header action.
- Edit and delete actions beside the history link only when edit mode is
  enabled and the configured server record exists.

The dedicated footer used only by `Ver histórico` is removed. The 24-hour strip
follows the header directly. Current warnings and errors continue to appear
below the strip; healthy checks remain hidden.

Desktop rows use tighter vertical padding and spacing, but keep enough room for
the strip, keyboard focus rings, and current diagnostic cards.

## Responsive Behavior

The page must not create horizontal scrolling at desktop, tablet, or mobile
viewport widths.

- All principal containers use border-box sizing and allow flex/grid children
  to shrink through `min-width: 0`.
- The application header and navigation wrap at intermediate widths instead of
  forcing a fixed horizontal row.
- Dashboard metadata and actions wrap into deliberate rows when space is
  limited.
- On mobile, action buttons remain fully reachable and may use the available
  row width rather than overflowing.
- The server header separates identity from actions cleanly. The history link
  remains at the top; admin actions remain adjacent when present.
- Long URLs truncate visually within their container and expose their complete
  value through the existing content/accessible DOM.
- All 96 fifteen-minute blocks remain in one row. Their gap contracts on narrow
  screens so the complete 24-hour period remains visible without horizontal
  scrolling or changing bucket semantics.

The responsive changes to the global application header are CSS-only. Existing
routes, labels, edit-mode behavior, and navigation destinations remain intact.

## Component Changes

`ServerHealth` changes presentation structure only:

- Move monitor metadata into `.server-health-header`.
- Render the monitor badge conditionally for `degraded` and `stopped` states.
- Move `Ver histórico` into a shared server-header action group.
- Keep edit/delete rendering behind the existing `editMode && record` check.
- Remove the now-empty server footer.

`ServerStatusStrip` keeps its API, 96 accessible blocks, labels, percentage, and
status semantics. Only responsive spacing and sizing change.

The global application shell receives narrowly scoped responsive styles for
the header, navigation, and main content. No other view-specific layout or
behavior changes.

## Accessibility

- Existing button and link accessible names remain unchanged.
- History, edit, and delete controls retain visible keyboard focus.
- Wrapping never changes DOM order: identity and metadata precede actions, then
  the status strip and diagnostics.
- Color remains supplemental; textual current-state and diagnostic labels stay
  visible.
- Responsive styling preserves usable control sizes and respects the existing
  reduced-motion rule.

## Testing Strategy

Frontend component tests will verify:

- A healthy monitor has timestamps but no `Monitor activo` badge.
- Degraded and unavailable monitors still render their warning badges.
- `Ver histórico` is inside the server header and keeps its route.
- Non-admin users see history but not edit/delete actions.
- Admin users see history, edit, and delete actions together in the server
  header.
- The standalone monitor summary and server history footer no longer exist.
- Existing status strips, current warning/error diagnostics, refresh behavior,
  and permissions continue to work.

Responsive CSS will be checked at representative desktop, tablet, and mobile
widths, including both admin and non-admin states. Verification must confirm
there is no page-level horizontal overflow and that all 96 blocks remain
visible in one row.

## Scope Boundaries

This change does not alter backend code, monitor scheduling, incident rules,
Teams notifications, historical bucket calculation, authentication, edit-mode
authorization, server CRUD behavior, or other application views beyond the
minimum global-header CSS needed to prevent overflow.
