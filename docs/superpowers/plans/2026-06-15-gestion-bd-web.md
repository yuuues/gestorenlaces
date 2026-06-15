# Gestión de la BD desde la web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear/editar/borrar enlaces y servidores desde la web (BD = fuente de verdad), proteger las escrituras con una clave estática ("modo edición desbloqueable") y dar a cada vista/recurso una URL canónica enlazable.

**Architecture:** El CRUD del backend ya existe; se añade un middleware `requireAuth` (clave en `.env`) sobre las rutas de escritura y un endpoint de verificación. El frontend migra a `react-router-dom` para URLs canónicas, gestiona el modo edición con un contexto, adjunta la clave vía interceptor de axios, y añade modales con formularios para el alta/edición de cada entidad.

**Tech Stack:** Node/Express + SQLite (backend), React + react-router-dom + axios (frontend). Tests backend con `node:test`. Verificación frontend con `CI=true npm run build` + checklist manual.

---

## File Structure

**Backend**
- Create: `backend/auth.js` — middleware `requireAuth` + export. Una sola responsabilidad: autorización por cabecera `x-admin-key`.
- Create: `backend/test/auth.test.js` — tests unitarios del middleware.
- Modify: `backend/server.js` — proteger rutas de escritura de bookmarks; añadir `POST /api/auth/verify`.
- Modify: `backend/modules/health/index.js` — proteger rutas de escritura de servidores.
- Modify: `backend/package.json` — script `test`.

**Frontend**
- Modify: `frontend/package.json` — dependencia `react-router-dom` (vía npm install).
- Modify: `frontend/src/api.js` — interceptor que adjunta `x-admin-key`; `verifyKey`.
- Create: `frontend/src/EditModeContext.js` — contexto de modo edición (estado + unlock/lock).
- Create: `frontend/src/components/Modal.js` + `Modal.css` — contenedor modal reutilizable.
- Create: `frontend/src/components/UnlockControl.js` — botón candado + modal de clave.
- Create: `frontend/src/views/BookmarksView.js` — lógica de la vista de enlaces (extraída de `App.js`).
- Create: `frontend/src/components/BookmarkForm.js` — formulario alta/edición de enlace.
- Create: `frontend/src/components/ServerForm.js` — formulario alta/edición de servidor.
- Modify: `frontend/src/App.js` — shell: router + cabecera (tabs `NavLink` + candado).
- Modify: `frontend/src/components/McpList.js` — selección de MCP por ruta `/mcps/:folder`.
- Modify: `frontend/src/components/BookmarkList.js` — iconos editar/borrar por tarjeta (en `editMode`).
- Modify: `frontend/src/components/ServerHealth.js` — cargar lista de servidores + estado y cruzar por `name`; controles CRUD.
- Modify CSS: `App.css`, `BookmarkList.css`, `ServerHealth.css` — estilos de controles de edición.

---

## Phase 1 — Backend: autenticación

### Task 1: Middleware `requireAuth`

**Files:**
- Create: `backend/auth.js`
- Test: `backend/test/auth.test.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Add test script to `backend/package.json`**

In the `"scripts"` block, add a `test` entry:

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "cd ../frontend && npm install && npm run build",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing test**

Create `backend/test/auth.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { requireAuth } = require('../auth');

// Minimal mock of an Express req/res so we can unit-test the middleware
// without booting a server.
function makeReqRes(headerKey) {
  const req = { get: (name) => (name.toLowerCase() === 'x-admin-key' ? headerKey : undefined) };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  return { req, res };
}

test('rejects with 503 when ADMIN_KEY is not configured', () => {
  delete process.env.ADMIN_KEY;
  const { req, res } = makeReqRes('whatever');
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 503);
});

test('rejects with 401 when key is missing', () => {
  process.env.ADMIN_KEY = 'secret';
  const { req, res } = makeReqRes(undefined);
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('rejects with 401 when key is wrong', () => {
  process.env.ADMIN_KEY = 'secret';
  const { req, res } = makeReqRes('wrong');
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('calls next() when key matches', () => {
  process.env.ADMIN_KEY = 'secret';
  const { req, res } = makeReqRes('secret');
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../auth'`.

- [ ] **Step 4: Write minimal implementation**

Create `backend/auth.js`:

```js
// Authorization middleware for write/config routes. The admin key is read from
// the ADMIN_KEY environment variable (set in the repo-root .env, never in code
// or git). Read routes stay public; only mutating routes use this.
const requireAuth = (req, res, next) => {
  const adminKey = process.env.ADMIN_KEY;

  // Fail closed: if no key is configured, management is disabled rather than open.
  if (!adminKey) {
    return res.status(503).json({ error: 'Gestión deshabilitada: ADMIN_KEY no configurada' });
  }

  const provided = req.get('x-admin-key');
  if (provided !== adminKey) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  next();
};

module.exports = { requireAuth };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/auth.js backend/test/auth.test.js backend/package.json
git commit -m "feat(backend): add requireAuth middleware for write routes"
```

---

### Task 2: Proteger rutas de bookmarks + endpoint de verificación

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Import the middleware**

In `backend/server.js`, after the existing `require('dotenv')...` line near the top, add:

```js
const { requireAuth } = require('./auth');
```

- [ ] **Step 2: Add the verify endpoint**

In `backend/server.js`, immediately after the `app.use(bodyParser.json());` line, add:

```js
// Validate the admin key without performing any action. Used by the frontend
// to confirm the key before entering edit mode. requireAuth handles 401/503.
app.post('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ ok: true });
});
```

- [ ] **Step 3: Protect the bookmark write routes**

In `backend/server.js`, add `requireAuth` as the second argument to each mutating bookmark route. Change the three route signatures:

```js
app.post('/api/bookmarks', requireAuth, (req, res) => {
```

```js
app.put('/api/bookmarks/:id', requireAuth, (req, res) => {
```

```js
app.delete('/api/bookmarks/:id', requireAuth, (req, res) => {
```

Leave all `GET` routes and `/api/export` unchanged.

- [ ] **Step 4: Verify the server still boots and protection works**

Run (PowerShell):
```powershell
cd backend
$env:ADMIN_KEY = "testkey"
$proc = Start-Process node -ArgumentList "server.js" -PassThru -RedirectStandardOutput out.log -RedirectStandardError err.log
Start-Sleep 4
# write without key -> 401
(Invoke-WebRequest -Uri http://localhost:5000/api/bookmarks -Method POST -Body '{}' -ContentType 'application/json' -SkipHttpErrorCheck).StatusCode
# read still public -> 200
(Invoke-WebRequest -Uri http://localhost:5000/api/bookmarks -SkipHttpErrorCheck).StatusCode
# verify with key -> 200
(Invoke-WebRequest -Uri http://localhost:5000/api/auth/verify -Method POST -Headers @{'x-admin-key'='testkey'} -SkipHttpErrorCheck).StatusCode
Stop-Process -Id $proc.Id
```
Expected: `401`, then `200`, then `200`.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat(backend): protect bookmark writes + add /api/auth/verify"
```

---

### Task 3: Proteger rutas de servidores (módulo health)

**Files:**
- Modify: `backend/modules/health/index.js`

- [ ] **Step 1: Import the middleware**

At the top of `backend/modules/health/index.js`, add after the existing requires:

```js
const { requireAuth } = require('../../auth');
```

- [ ] **Step 2: Protect the server write routes**

Inside `registerRoutes`, add `requireAuth` as the second argument to the three mutating server routes:

```js
  app.post('/api/health/servers', requireAuth, (req, res) => {
```

```js
  app.put('/api/health/servers/:id', requireAuth, (req, res) => {
```

```js
  app.delete('/api/health/servers/:id', requireAuth, (req, res) => {
```

Leave `GET /api/health/servers` and `GET /api/health/check` unchanged.

- [ ] **Step 3: Verify**

Run (PowerShell):
```powershell
cd backend
$env:ADMIN_KEY = "testkey"
$proc = Start-Process node -ArgumentList "server.js" -PassThru -RedirectStandardOutput out.log -RedirectStandardError err.log
Start-Sleep 4
(Invoke-WebRequest -Uri http://localhost:5000/api/health/servers -Method POST -Body '{}' -ContentType 'application/json' -SkipHttpErrorCheck).StatusCode  # 401
(Invoke-WebRequest -Uri http://localhost:5000/api/health/servers -SkipHttpErrorCheck).StatusCode  # 200
Stop-Process -Id $proc.Id
```
Expected: `401`, then `200`.

- [ ] **Step 4: Commit**

```bash
git add backend/modules/health/index.js
git commit -m "feat(backend): protect server writes with requireAuth"
```

---

## Phase 2 — Frontend: auth (sin UI todavía)

### Task 4: Interceptor de axios + `verifyKey`

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add the request interceptor and verifyKey**

In `frontend/src/api.js`, right after `const api = axios.create();`, add:

```js
// Attach the admin key (if the user has unlocked edit mode) to every request.
// Read routes ignore it; write routes require it server-side.
api.interceptors.request.use((config) => {
  const key = sessionStorage.getItem('adminKey');
  if (key) {
    config.headers['x-admin-key'] = key;
  }
  return config;
});

// Validate a key against the backend without storing it. Passes the key
// explicitly because it is not yet in sessionStorage at unlock time.
export const verifyKey = (key) =>
  api.post('/api/auth/verify', null, { headers: { 'x-admin-key': key } });
```

- [ ] **Step 2: Verify build still compiles**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(frontend): attach admin key via axios interceptor + verifyKey"
```

---

### Task 5: `EditModeContext`

**Files:**
- Create: `frontend/src/EditModeContext.js`

- [ ] **Step 1: Create the context**

Create `frontend/src/EditModeContext.js`:

```jsx
import React, { createContext, useContext, useState } from 'react';

const EditModeContext = createContext(null);

// Holds whether the user has unlocked edit mode. The admin key lives in
// sessionStorage (cleared when the tab closes); editMode mirrors its presence.
export function EditModeProvider({ children }) {
  const [editMode, setEditMode] = useState(() => !!sessionStorage.getItem('adminKey'));

  const unlock = (key) => {
    sessionStorage.setItem('adminKey', key);
    setEditMode(true);
  };

  const lock = () => {
    sessionStorage.removeItem('adminKey');
    setEditMode(false);
  };

  return (
    <EditModeContext.Provider value={{ editMode, unlock, lock }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error('useEditMode debe usarse dentro de <EditModeProvider>');
  }
  return ctx;
}
```

- [ ] **Step 2: Verify build still compiles**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.` (Context is unused yet; CRA may warn about unused exports only at usage sites, not here — build should pass.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/EditModeContext.js
git commit -m "feat(frontend): add EditModeContext"
```

---

## Phase 3 — Frontend: enrutado + cabecera con candado

### Task 6: Instalar react-router y reestructurar `App.js`

**Files:**
- Modify: `frontend/package.json` (vía npm install)
- Create: `frontend/src/views/BookmarksView.js`
- Create: `frontend/src/components/UnlockControl.js`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Install react-router-dom**

Run: `cd frontend && npm install react-router-dom@^6`
Expected: package added to `dependencies`.

- [ ] **Step 2: Extract the bookmarks view from App.js**

Create `frontend/src/views/BookmarksView.js` (moves the bookmark/category/search logic out of `App.js`):

```jsx
import React, { useState, useEffect } from 'react';
import { getCategories, getBookmarks } from '../api';
import CategoryNav from '../components/CategoryNav';
import BookmarkList from '../components/BookmarkList';

function BookmarksView() {
  const [categories, setCategories] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCategories = async () => {
    try {
      const response = await getCategories();
      setCategories(response.data);
      if (response.data.length > 0) {
        setSelectedCategory((prev) => prev || response.data[0]);
      }
    } catch (err) {
      setError('Failed to fetch categories. Please try again later.');
      console.error('Error fetching categories:', err);
    }
  };

  const loadBookmarks = async () => {
    try {
      const response = await getBookmarks();
      setBookmarks(response.data);
    } catch (err) {
      setError('Failed to fetch bookmarks. Please try again later.');
      console.error('Error fetching bookmarks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadBookmarks();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredBookmarks(bookmarks);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredBookmarks(bookmarks.filter((b) =>
        b.short_description.toLowerCase().includes(q) ||
        (b.long_description && b.long_description.toLowerCase().includes(q)) ||
        b.link.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, bookmarks]);

  return (
    <>
      <div className="search-container">
        <input
          type="text"
          placeholder="Buscar enlaces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>
      <div className="app-content">
        <CategoryNav
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
        <main className="main-content">
          {error && <div className="error-message">{error}</div>}
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <BookmarkList
              bookmarks={filteredBookmarks}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              categories={categories}
            />
          )}
        </main>
      </div>
    </>
  );
}

export default BookmarksView;
```

- [ ] **Step 3: Create the UnlockControl (lock/unlock UI)**

Create `frontend/src/components/UnlockControl.js`:

```jsx
import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { useEditMode } from '../EditModeContext';
import { verifyKey } from '../api';

function UnlockControl() {
  const { editMode, unlock, lock } = useEditMode();
  const [showModal, setShowModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyKey(keyInput);
      unlock(keyInput);
      setShowModal(false);
      setKeyInput('');
    } catch (err) {
      setError('Clave incorrecta o gestión deshabilitada.');
    } finally {
      setSubmitting(false);
    }
  };

  if (editMode) {
    return (
      <button className="lock-button active" onClick={lock} title="Bloquear edición">
        <FontAwesomeIcon icon={faLockOpen} /> Edición
      </button>
    );
  }

  return (
    <>
      <button className="lock-button" onClick={() => setShowModal(true)} title="Desbloquear edición">
        <FontAwesomeIcon icon={faLock} />
      </button>
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Desbloquear edición</h3>
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                placeholder="Clave de administrador"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
              {error && <div className="error-message">{error}</div>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" disabled={submitting}>Desbloquear</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default UnlockControl;
```

- [ ] **Step 4: Rewrite App.js as the router shell**

Replace the entire contents of `frontend/src/App.js`:

```jsx
import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import './App.css';
import { EditModeProvider } from './EditModeContext';
import BookmarksView from './views/BookmarksView';
import ServerHealth from './components/ServerHealth';
import McpList from './components/McpList';
import UnlockControl from './components/UnlockControl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookmark, faServer, faPlug } from '@fortawesome/free-solid-svg-icons';

function App() {
  return (
    <EditModeProvider>
      <BrowserRouter>
        <div className="app">
          <header className="app-header">
            <h1>Bookmarks Manager</h1>
            <div className="view-tabs">
              <NavLink to="/" end className={({ isActive }) => `view-tab ${isActive ? 'active' : ''}`}>
                <FontAwesomeIcon icon={faBookmark} /> Bookmarks
              </NavLink>
              <NavLink to="/health" className={({ isActive }) => `view-tab ${isActive ? 'active' : ''}`}>
                <FontAwesomeIcon icon={faServer} /> Server Health
              </NavLink>
              <NavLink to="/mcps" className={({ isActive }) => `view-tab ${isActive ? 'active' : ''}`}>
                <FontAwesomeIcon icon={faPlug} /> MCPs
              </NavLink>
              <UnlockControl />
            </div>
          </header>
          <Routes>
            <Route path="/" element={<BookmarksView />} />
            <Route path="/health" element={<main className="main-content full-width"><ServerHealth /></main>} />
            <Route path="/mcps" element={<main className="main-content full-width"><McpList /></main>} />
            <Route path="/mcps/:folder" element={<main className="main-content full-width"><McpList /></main>} />
          </Routes>
        </div>
      </BrowserRouter>
    </EditModeProvider>
  );
}

export default App;
```

Nesting check: `<EditModeProvider>` wraps `<BrowserRouter>`, which wraps `<div className="app">`. Closing tags mirror that order: `</div>`, then `</BrowserRouter>`, then `</EditModeProvider>`.

- [ ] **Step 5: Add lock-button CSS**

Append to `frontend/src/App.css`:

```css
.lock-button {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: inherit;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 12px;
}
.lock-button.active {
  background: rgba(255, 255, 255, 0.2);
}
```

- [ ] **Step 6: Verify build + manual nav**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.`

Manual (after `npm start` in frontend + backend running): click the three tabs and confirm the URL changes to `/`, `/health`, `/mcps`; the active tab is highlighted; the lock icon opens the key modal.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/App.js frontend/src/views/BookmarksView.js frontend/src/components/UnlockControl.js frontend/src/App.css
git commit -m "feat(frontend): client routing + edit-mode unlock control"
```

---

### Task 7: Deep-link de MCP por ruta `/mcps/:folder`

**Files:**
- Modify: `frontend/src/components/McpList.js`

- [ ] **Step 1: Drive MCP selection from the route param**

In `frontend/src/components/McpList.js`, replace the `selectedMcp` state with the route param. Update the imports and the selection logic.

Change the React import line to also import the router hooks:

```jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
```

Replace the `const [selectedMcp, setSelectedMcp] = useState(null);` line and derive `selectedMcp` from the URL instead. Inside the component, after the other `useState` hooks, add:

```jsx
  const { folder } = useParams();
  const navigate = useNavigate();
  const selectedMcp = folder ? mcps.find((m) => m.folder === folder) || null : null;
```

- [ ] **Step 2: Replace the detail-fetch effect dependency**

Change the details `useEffect` to depend on `folder` (and `mcps`, since `selectedMcp` is derived from the loaded list). Replace its dependency array and guard:

```jsx
  useEffect(() => {
    const fetchMcpDetails = async () => {
      if (!folder) {
        setMcpReadme('');
        setMcpFiles([]);
        return;
      }
      // Wait until the list is loaded so we can resolve the folder.
      if (mcps.length === 0) return;
      const mcp = mcps.find((m) => m.folder === folder);
      if (!mcp) {
        setMcpReadme('');
        setMcpFiles([]);
        return;
      }
      try {
        const readmeResponse = await getMcpReadme(mcp.folder);
        setMcpReadme(readmeResponse.data);
        const filesResponse = await getMcpFiles(mcp.folder);
        setMcpFiles(filesResponse.data);
      } catch (err) {
        console.error('Error fetching MCP details:', err);
        setMcpReadme('## Error\n\nNo se pudo cargar el README de este MCP.');
        setMcpFiles([]);
      }
    };
    fetchMcpDetails();
  }, [folder, mcps]);
```

- [ ] **Step 3: Navigate instead of setState on click / back**

Replace the click and back handlers:

```jsx
  const handleMcpClick = (mcp) => {
    navigate(`/mcps/${mcp.folder}`);
  };

  const handleBackToList = () => {
    navigate('/mcps');
  };
```

(Remove the old `setSelectedMcp` usages.)

- [ ] **Step 4: Handle unknown folder (deep-link to a non-existent MCP)**

In the render, after the `if (error)` guard and before the main `return`, add a not-found guard:

```jsx
  if (folder && mcps.length > 0 && !selectedMcp) {
    return (
      <div className="mcp-list-container">
        <div className="no-results">
          <p>MCP no encontrado.</p>
          <button className="back-button" onClick={handleBackToList}>← Volver al listado</button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Verify build + deep-link**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.`

Manual: with frontend dev + backend running, open `http://localhost:3000/mcps/sqlserver` directly (reload) → detail loads; open `/mcps/doesnotexist` → "MCP no encontrado"; click a card → URL becomes `/mcps/<folder>`; "volver" → `/mcps`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/McpList.js
git commit -m "feat(frontend): deep-linkable MCP detail via /mcps/:folder"
```

---

## Phase 4 — Frontend: CRUD de enlaces

### Task 8: Componente `Modal` reutilizable

**Files:**
- Create: `frontend/src/components/Modal.js`
- Create: `frontend/src/components/Modal.css`

- [ ] **Step 1: Create the Modal component**

Create `frontend/src/components/Modal.js`:

```jsx
import React, { useEffect } from 'react';
import './Modal.css';

// Reusable modal: overlay + centered panel. Closes on overlay click and Escape.
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export default Modal;
```

- [ ] **Step 2: Create Modal.css**

Create `frontend/src/components/Modal.css`:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: #fff;
  color: #222;
  border-radius: 8px;
  padding: 24px;
  width: 420px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}
.modal h3 { margin-top: 0; }
.modal form { display: flex; flex-direction: column; gap: 12px; }
.modal input, .modal textarea, .modal select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
  font: inherit;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions button { padding: 8px 16px; border-radius: 4px; cursor: pointer; border: 1px solid #ccc; }
.modal-actions button[type="submit"] { background: #1976d2; color: #fff; border-color: #1976d2; }
```

Note: `UnlockControl` (Task 6) currently has its own inline overlay markup using the same `.modal-overlay`/`.modal` classes — its styles are now provided here. Leave UnlockControl as-is (it works with these styles); refactoring it to use `<Modal>` is optional and out of scope.

- [ ] **Step 3: Verify build**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Modal.js frontend/src/components/Modal.css
git commit -m "feat(frontend): reusable Modal component"
```

---

### Task 9: `BookmarkForm` + alta/edición/borrado de enlaces

**Files:**
- Create: `frontend/src/components/BookmarkForm.js`
- Modify: `frontend/src/views/BookmarksView.js`
- Modify: `frontend/src/components/BookmarkList.js`
- Modify: `frontend/src/components/BookmarkList.css`

- [ ] **Step 1: Create the BookmarkForm**

Create `frontend/src/components/BookmarkForm.js`:

```jsx
import React, { useState } from 'react';
import Modal from './Modal';
import { createBookmark, updateBookmark } from '../api';
import { useEditMode } from '../EditModeContext';

const NEW_CATEGORY = '__new__';

// Add/edit form for a bookmark. `bookmark` is the record to edit, or null to create.
// Calls onSaved() after a successful write so the parent can reload from the API.
function BookmarkForm({ bookmark, categories, onClose, onSaved }) {
  const { lock } = useEditMode();
  const [category, setCategory] = useState(bookmark ? bookmark.category : (categories[0] || NEW_CATEGORY));
  const [newCategory, setNewCategory] = useState('');
  const [shortDescription, setShortDescription] = useState(bookmark ? bookmark.short_description : '');
  const [longDescription, setLongDescription] = useState(bookmark ? bookmark.long_description || '' : '');
  const [link, setLink] = useState(bookmark ? bookmark.link : '');
  const [icon, setIcon] = useState(bookmark ? bookmark.icon || '' : '');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const resolvedCategory = category === NEW_CATEGORY ? newCategory.trim() : category;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resolvedCategory || !shortDescription.trim() || !link.trim()) {
      setError('Categoría, descripción corta y enlace son obligatorios.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      category: resolvedCategory,
      short_description: shortDescription.trim(),
      long_description: longDescription.trim(),
      link: link.trim(),
      icon: icon.trim()
    };
    try {
      if (bookmark) {
        await updateBookmark(bookmark.id, payload);
      } else {
        await createBookmark(payload);
      }
      onSaved();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock(); // key invalid/changed: drop edit mode so the user re-unlocks
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={bookmark ? 'Editar enlace' : 'Añadir enlace'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>Categoría</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value={NEW_CATEGORY}>+ Nueva categoría…</option>
        </select>
        {category === NEW_CATEGORY && (
          <input
            type="text"
            placeholder="Nombre de la nueva categoría"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
        )}
        <label>Descripción corta</label>
        <input type="text" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
        <label>Descripción larga</label>
        <textarea value={longDescription} onChange={(e) => setLongDescription(e.target.value)} rows={3} />
        <label>Enlace</label>
        <input type="text" value={link} onChange={(e) => setLink(e.target.value)} />
        <label>Icono (opcional, p.ej. "globe" o "fab fa-github")</label>
        <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} />
        {error && <div className="error-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={submitting}>{bookmark ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default BookmarkForm;
```

- [ ] **Step 2: Wire add/edit/delete into BookmarksView**

In `frontend/src/views/BookmarksView.js`, import the needed pieces at the top:

```jsx
import { getCategories, getBookmarks, deleteBookmark } from '../api';
import BookmarkForm from '../components/BookmarkForm';
import { useEditMode } from '../EditModeContext';
```

Inside the component, add edit-mode state and handlers (after the existing `useState` hooks):

```jsx
  const { editMode, lock } = useEditMode();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const reload = () => { loadCategories(); loadBookmarks(); };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (bookmark) => { setEditing(bookmark); setFormOpen(true); };
  const handleSaved = () => { setFormOpen(false); setEditing(null); reload(); };

  const handleDelete = async (bookmark) => {
    if (!window.confirm(`¿Borrar "${bookmark.short_description}"?`)) return;
    try {
      await deleteBookmark(bookmark.id);
      reload();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock();
        alert('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        alert(err.response?.data?.error || 'No se pudo borrar.');
      }
    }
  };
```

Add the "Añadir enlace" button in the search container and pass edit handlers to `BookmarkList`, and render the form. Replace the returned JSX with:

```jsx
  return (
    <>
      <div className="search-container">
        <input
          type="text"
          placeholder="Buscar enlaces..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {editMode && (
          <button className="add-button" onClick={openAdd}>+ Añadir enlace</button>
        )}
      </div>
      <div className="app-content">
        <CategoryNav
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
        <main className="main-content">
          {error && <div className="error-message">{error}</div>}
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <BookmarkList
              bookmarks={filteredBookmarks}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              categories={categories}
              editMode={editMode}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
        </main>
      </div>
      {formOpen && (
        <BookmarkForm
          bookmark={editing}
          categories={categories}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
```

- [ ] **Step 3: Render edit/delete buttons in BookmarkList**

In `frontend/src/components/BookmarkList.js`, update imports and signature. Add to the FontAwesome import:

```jsx
import { faPenToSquare, faTrash } from '@fortawesome/free-solid-svg-icons';
```

Change the function signature:

```jsx
function BookmarkList({ bookmarks, selectedCategory, searchQuery, categories, editMode, onEdit, onDelete }) {
```

Inside the `.bookmark-card` div, right after the opening `<div key={bookmark.id} className="bookmark-card">`, add the controls:

```jsx
                {editMode && (
                  <div className="bookmark-actions">
                    <button className="icon-button" onClick={() => onEdit(bookmark)} title="Editar">
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </button>
                    <button className="icon-button" onClick={() => onDelete(bookmark)} title="Borrar">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                )}
```

- [ ] **Step 4: Add CSS for actions and add-button**

Append to `frontend/src/components/BookmarkList.css`:

```css
.bookmark-card { position: relative; }
.bookmark-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
}
.icon-button {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  padding: 4px;
}
.icon-button:hover { color: #1976d2; }
```

Append to `frontend/src/App.css`:

```css
.add-button {
  margin-left: 12px;
  padding: 8px 16px;
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 6: Manual verification**

With backend (with `ADMIN_KEY` set) + frontend running: unlock edit mode; "Añadir enlace" creates one (appears after reload); pencil edits; trash deletes (with confirm); creating with a new category shows it in CategoryNav. Lock edit mode → buttons disappear.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/BookmarkForm.js frontend/src/views/BookmarksView.js frontend/src/components/BookmarkList.js frontend/src/components/BookmarkList.css frontend/src/App.css
git commit -m "feat(frontend): bookmark create/edit/delete UI"
```

---

## Phase 5 — Frontend: CRUD de servidores

### Task 10: `ServerForm` + gestión de servidores en ServerHealth

**Files:**
- Create: `frontend/src/components/ServerForm.js`
- Modify: `frontend/src/components/ServerHealth.js`
- Modify: `frontend/src/components/ServerHealth.css`

- [ ] **Step 1: Create the ServerForm**

Create `frontend/src/components/ServerForm.js`:

```jsx
import React, { useState } from 'react';
import Modal from './Modal';
import { createServer, updateServer } from '../api';
import { useEditMode } from '../EditModeContext';

// Add/edit form for a monitored server. `server` is the record to edit, or null to create.
function ServerForm({ server, onClose, onSaved }) {
  const { lock } = useEditMode();
  const [name, setName] = useState(server ? server.name : '');
  const [url, setUrl] = useState(server ? server.url : '');
  const [description, setDescription] = useState(server ? server.description || '' : '');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('Nombre y URL son obligatorios.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = { name: name.trim(), url: url.trim(), description: description.trim() };
    try {
      if (server) {
        await updateServer(server.id, payload);
      } else {
        await createServer(payload);
      }
      onSaved();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock(); // key invalid/changed: drop edit mode so the user re-unlocks
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar (¿nombre duplicado?).');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={server ? 'Editar servidor' : 'Añadir servidor'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>Nombre</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <label>URL (endpoint /health)</label>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} />
        <label>Descripción</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <div className="error-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={submitting}>{server ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default ServerForm;
```

- [ ] **Step 2: Load the server list and merge with status in ServerHealth**

In `frontend/src/components/ServerHealth.js`, update imports:

```jsx
import { checkServersHealth, getServers, deleteServer } from '../api';
import { useEditMode } from '../EditModeContext';
import ServerForm from './ServerForm';
import { faPenToSquare, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';
```

(Keep the existing icon imports; add the three above to the import list.)

Add new state near the other `useState` hooks:

```jsx
  const { editMode, lock } = useEditMode();
  const [servers, setServers] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
```

Add a loader for the server records and call it on mount. After the existing `fetchServerHealth` definition, add:

```jsx
  const loadServers = async () => {
    try {
      const response = await getServers();
      setServers(response.data);
    } catch (err) {
      console.error('Error fetching servers:', err);
    }
  };
```

In the initial-fetch effect, also load servers:

```jsx
  useEffect(() => {
    fetchServerHealth();
    loadServers();
  }, []);
```

Add the CRUD handlers:

```jsx
  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (server) => { setEditing(server); setFormOpen(true); };
  const handleSaved = () => {
    setFormOpen(false);
    setEditing(null);
    loadServers();
    fetchServerHealth();
  };
  const handleDelete = async (server) => {
    if (!window.confirm(`¿Borrar el servidor "${server.name}"?`)) return;
    try {
      await deleteServer(server.id);
      loadServers();
      fetchServerHealth();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock();
        alert('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        alert(err.response?.data?.error || 'No se pudo borrar.');
      }
    }
  };
```

- [ ] **Step 3: Render the add button, per-server controls, and the form**

In the `server-health-header` `refresh-controls` div, add the add button (only in edit mode), before the auto-refresh container:

```jsx
          {editMode && (
            <button className="add-button" onClick={openAdd}>
              <FontAwesomeIcon icon={faPlus} /> Añadir servidor
            </button>
          )}
```

In the server card header (`.server-header`), after the status badge `<span>`, add edit/delete buttons. The status is keyed by name in `serverStatus`; the editable record comes from `servers`. Add inside `.server-header`:

```jsx
                {editMode && (() => {
                  const record = servers.find((s) => s.name === serverData.name);
                  if (!record) return null;
                  return (
                    <span className="server-actions">
                      <button className="icon-button" onClick={() => openEdit(record)} title="Editar">
                        <FontAwesomeIcon icon={faPenToSquare} />
                      </button>
                      <button className="icon-button" onClick={() => handleDelete(record)} title="Borrar">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </span>
                  );
                })()}
```

At the end of the component's returned JSX, just before the final closing `</div>` of `.server-health-container`, render the form:

```jsx
      {formOpen && (
        <ServerForm
          server={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
```

Note: a newly added server appears once a health check has run that includes it (`handleSaved` calls `fetchServerHealth`, which returns all servers from the DB). Servers with a failing/unreachable URL still appear with `status: error`, so they remain editable.

- [ ] **Step 4: Add CSS**

Append to `frontend/src/components/ServerHealth.css`:

```css
.server-actions {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}
.server-actions .icon-button {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  padding: 4px;
}
.server-actions .icon-button:hover { color: #1976d2; }
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 6: Manual verification**

With backend (`ADMIN_KEY` set) + frontend running, go to `/health`, unlock edit mode: "Añadir servidor" creates one; pencil edits; trash deletes (with confirm). Lock → controls disappear.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ServerForm.js frontend/src/components/ServerHealth.js frontend/src/components/ServerHealth.css
git commit -m "feat(frontend): server create/edit/delete UI"
```

---

## Phase 6 — Verificación final

### Task 11: Verificación integral

**Files:** none (verification only)

- [ ] **Step 1: Backend tests**

Run: `cd backend && npm test`
Expected: all auth tests PASS.

- [ ] **Step 2: Frontend build**

Run: `cd frontend && CI=true npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 3: Backend boot + key behavior (no key configured = fail closed)**

Run (PowerShell, ADMIN_KEY intentionally unset):
```powershell
cd backend
Remove-Item Env:\ADMIN_KEY -ErrorAction SilentlyContinue
$proc = Start-Process node -ArgumentList "server.js" -PassThru -RedirectStandardOutput out.log -RedirectStandardError err.log
Start-Sleep 4
(Invoke-WebRequest -Uri http://localhost:5000/api/bookmarks -Method POST -Body '{}' -ContentType 'application/json' -SkipHttpErrorCheck).StatusCode  # 503
(Invoke-WebRequest -Uri http://localhost:5000/api/bookmarks -SkipHttpErrorCheck).StatusCode  # 200 (read still public)
Stop-Process -Id $proc.Id
```
Expected: `503`, then `200`.

- [ ] **Step 4: End-to-end manual smoke**

Set `ADMIN_KEY` in repo-root `.env`, start backend (`npm start`) and frontend (`npm start`). Walk: deep-link `/mcps/sqlserver`; unlock with the key; create/edit/delete a bookmark and a server; lock; confirm controls hidden and writes now blocked.

- [ ] **Step 5: Update README**

Add an "Autenticación" note to `README.md` documenting the `ADMIN_KEY` env var (required for managing data from the web; writes are disabled when unset) and the new `/mcps/:folder` deep-link route. Commit:

```bash
git add README.md
git commit -m "docs: document ADMIN_KEY and MCP deep-link route"
```
