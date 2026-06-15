# Categorías: CRUD y reordenación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear, renombrar, borrar y reordenar categorías desde la web (en modo edición), con las categorías como entidad real con posición.

**Architecture:** Tabla `categories(id, name, position)` como catálogo de orden; los enlaces siguen guardando `category` como texto. La lógica de datos vive en un módulo testeable `backend/categories.js` (Promesas sobre sqlite3); `server.js` registra rutas finas que lo invocan. El frontend pasa las categorías como objetos a `CategoryNav` (con controles de edición) y como nombres a `BookmarkList`/`BookmarkForm`.

**Tech Stack:** Node + Express + sqlite3 (backend, tests con `node:test`); React (CRA) + axios + FontAwesome (frontend, verificación manual).

---

## Estructura de ficheros

- **Crear** `backend/categories.js` — acceso a datos del catálogo de categorías (crear tabla, listar, crear, renombrar, borrar, reordenar, asegurar, sembrar). Funciones que devuelven Promesas.
- **Crear** `backend/test/categories.test.js` — tests unitarios con `node:test` contra una BD sqlite `:memory:`.
- **Modificar** `backend/server.js` — `require('./categories')`; reemplazar `GET /api/categories`; añadir rutas POST/PUT/DELETE/reorder; sembrar el catálogo al arrancar tras los bookmarks; `ensureCategory` en crear/editar enlace.
- **Modificar** `frontend/src/api.js` — añadir `createCategory`, `renameCategory`, `deleteCategory`, `reorderCategories`.
- **Crear** `frontend/src/components/CategoryForm.js` — modal de un campo para crear/renombrar.
- **Modificar** `frontend/src/components/CategoryNav.js` — controles de edición (añadir / editar / borrar / ↑ / ↓).
- **Modificar** `frontend/src/components/CategoryNav.css` — estilos de los controles.
- **Modificar** `frontend/src/views/BookmarksView.js` — manejar objetos, derivar `categoryNames`, handlers y reselección.

**Patrón de errores backend:** las funciones de `categories.js` lanzan `Error` con una propiedad `.status` (400/404/409). Cada ruta hace `res.status(err.status || 500).json({ error: err.message })`.

---

## Task 1: Módulo `categories.js` — tabla, siembra y listado

**Files:**
- Create: `backend/categories.js`
- Test: `backend/test/categories.test.js`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/categories.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const sqlite3 = require('sqlite3');
const categories = require('../categories');

// BD en memoria con las tablas bookmarks + categories y bookmarks de ejemplo.
function setupDb(bookmarks = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:');
    db.serialize(() => {
      db.run(`CREATE TABLE bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL, short_description TEXT NOT NULL,
        long_description TEXT, link TEXT NOT NULL, icon TEXT
      )`);
      const stmt = db.prepare('INSERT INTO bookmarks (category, short_description, link) VALUES (?, ?, ?)');
      bookmarks.forEach((b) => stmt.run(b.category, b.short_description || 'd', b.link || 'http://x'));
      stmt.finalize();
    });
    categories.createCategoriesTable(db).then(() => resolve(db)).catch(reject);
  });
}

module.exports = { setupDb };

test('seedCategoriesFromBookmarks siembra categorías distintas en orden de aparición', async () => {
  const db = await setupDb([
    { category: 'Dev', link: 'http://a' },
    { category: 'Ops', link: 'http://b' },
    { category: 'Dev', link: 'http://c' },
  ]);
  await categories.seedCategoriesFromBookmarks(db);
  const list = await categories.listCategories(db);
  assert.deepStrictEqual(list.map((c) => c.name), ['Dev', 'Ops']);
  assert.deepStrictEqual(list.map((c) => c.position), [0, 1]);
});

test('seedCategoriesFromBookmarks no hace nada si el catálogo ya tiene filas', async () => {
  const db = await setupDb([{ category: 'Dev', link: 'http://a' }]);
  await categories.seedCategoriesFromBookmarks(db); // siembra Dev
  await categories.seedCategoriesFromBookmarks(db); // segunda llamada: no-op
  const list = await categories.listCategories(db);
  assert.deepStrictEqual(list.map((c) => c.name), ['Dev']);
});
```

- [ ] **Step 2: Ejecutar el test y ver que falla**

Run: `cd backend; npm test`
Expected: FAIL — `Cannot find module '../categories'` (aún no existe).

- [ ] **Step 3: Implementar lo mínimo**

Crear `backend/categories.js`:

```js
// Acceso a datos del catálogo de categorías. La tabla categories posee la lista
// ordenada de nombres; los bookmarks siguen guardando su categoría como texto,
// por eso renombrar actualiza ambas tablas dentro de una transacción.

// Envoltorios en Promesa sobre la API por callbacks de sqlite3.
const run = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

const get = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

// Error con código HTTP para que las rutas lo mapeen directamente.
const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const createCategoriesTable = (db) =>
  run(db, `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      position INTEGER NOT NULL
    )
  `);

// Siembra el catálogo desde las categorías distintas ya usadas por los bookmarks,
// solo si el catálogo está vacío. El orden sigue la primera aparición de cada una.
const seedCategoriesFromBookmarks = async (db) => {
  const { count } = await get(db, 'SELECT COUNT(*) as count FROM categories');
  if (count > 0) return;
  const rows = await all(db, 'SELECT category FROM bookmarks GROUP BY category ORDER BY MIN(id)');
  for (let i = 0; i < rows.length; i++) {
    await run(db, 'INSERT INTO categories (name, position) VALUES (?, ?)', [rows[i].category, i]);
  }
};

const listCategories = (db) =>
  all(db, 'SELECT id, name, position FROM categories ORDER BY position, name');

module.exports = {
  createCategoriesTable,
  seedCategoriesFromBookmarks,
  listCategories,
};
```

- [ ] **Step 4: Ejecutar el test y ver que pasa**

Run: `cd backend; npm test`
Expected: PASS (los 2 tests de Task 1 en verde).

- [ ] **Step 5: Commit**

```bash
git add backend/categories.js backend/test/categories.test.js
git commit -m "feat(categories): catalog table, seeding and listing"
```

---

## Task 2: `createCategory` y `ensureCategory`

**Files:**
- Modify: `backend/categories.js`
- Test: `backend/test/categories.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `backend/test/categories.test.js`:

```js
test('createCategory añade al final y devuelve la fila', async () => {
  const db = await setupDb();
  const a = await categories.createCategory(db, 'Alpha');
  const b = await categories.createCategory(db, 'Beta');
  assert.strictEqual(a.position, 0);
  assert.strictEqual(b.position, 1);
  assert.ok(b.id > a.id);
});

test('createCategory rechaza nombre vacío con 400', async () => {
  const db = await setupDb();
  await assert.rejects(categories.createCategory(db, '   '), (e) => e.status === 400);
});

test('createCategory rechaza nombre duplicado con 409', async () => {
  const db = await setupDb();
  await categories.createCategory(db, 'Alpha');
  await assert.rejects(categories.createCategory(db, 'Alpha'), (e) => e.status === 409);
});

test('ensureCategory añade la categoría que falta y es no-op si ya existe', async () => {
  const db = await setupDb();
  await categories.ensureCategory(db, 'New');
  await categories.ensureCategory(db, 'New');
  const list = await categories.listCategories(db);
  assert.deepStrictEqual(list.map((c) => c.name), ['New']);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend; npm test`
Expected: FAIL — `categories.createCategory is not a function`.

- [ ] **Step 3: Implementar**

En `backend/categories.js`, añadir antes de `module.exports`:

```js
// Inserta una categoría al final del orden. Devuelve la fila creada.
const createCategory = async (db, rawName) => {
  const name = (rawName || '').trim();
  if (!name) throw httpError(400, 'El nombre es obligatorio');
  const existing = await get(db, 'SELECT id FROM categories WHERE name = ?', [name]);
  if (existing) throw httpError(409, 'Ya existe una categoría con ese nombre');
  const { maxPos } = await get(db, 'SELECT MAX(position) as maxPos FROM categories');
  const position = (maxPos === null ? -1 : maxPos) + 1;
  const result = await run(db, 'INSERT INTO categories (name, position) VALUES (?, ?)', [name, position]);
  return { id: result.lastID, name, position };
};

// Asegura idempotentemente que existe una categoría (cuando un enlace introduce
// un nombre nuevo). No hace nada si ya existe o el nombre está vacío.
const ensureCategory = async (db, rawName) => {
  const name = (rawName || '').trim();
  if (!name) return;
  const existing = await get(db, 'SELECT id FROM categories WHERE name = ?', [name]);
  if (existing) return;
  const { maxPos } = await get(db, 'SELECT MAX(position) as maxPos FROM categories');
  const position = (maxPos === null ? -1 : maxPos) + 1;
  await run(db, 'INSERT INTO categories (name, position) VALUES (?, ?)', [name, position]);
};
```

Y actualizar `module.exports` para incluirlas:

```js
module.exports = {
  createCategoriesTable,
  seedCategoriesFromBookmarks,
  listCategories,
  createCategory,
  ensureCategory,
};
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/categories.js backend/test/categories.test.js
git commit -m "feat(categories): create and ensure category"
```

---

## Task 3: `renameCategory` (transacción que actualiza bookmarks)

**Files:**
- Modify: `backend/categories.js`
- Test: `backend/test/categories.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `backend/test/categories.test.js`:

```js
test('renameCategory actualiza el catálogo y los bookmarks que la usan', async () => {
  const db = await setupDb([
    { category: 'Dev', link: 'http://a' },
    { category: 'Dev', link: 'http://b' },
    { category: 'Ops', link: 'http://c' },
  ]);
  await categories.seedCategoriesFromBookmarks(db);
  const dev = (await categories.listCategories(db)).find((c) => c.name === 'Dev');
  await categories.renameCategory(db, dev.id, 'Development');
  const after = await categories.listCategories(db);
  assert.ok(after.find((c) => c.name === 'Development'));
  assert.ok(!after.find((c) => c.name === 'Dev'));
  const moved = await new Promise((res, rej) =>
    db.all('SELECT category FROM bookmarks WHERE category = ?', ['Development'],
      (e, r) => (e ? rej(e) : res(r))));
  assert.strictEqual(moved.length, 2);
});

test('renameCategory rechaza id inexistente con 404', async () => {
  const db = await setupDb();
  await assert.rejects(categories.renameCategory(db, 999, 'X'), (e) => e.status === 404);
});

test('renameCategory rechaza nombre que colisiona con 409', async () => {
  const db = await setupDb();
  const a = await categories.createCategory(db, 'Alpha');
  await categories.createCategory(db, 'Beta');
  await assert.rejects(categories.renameCategory(db, a.id, 'Beta'), (e) => e.status === 409);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend; npm test`
Expected: FAIL — `categories.renameCategory is not a function`.

- [ ] **Step 3: Implementar**

En `backend/categories.js`, añadir antes de `module.exports`:

```js
// Renombra una categoría actualizando, atómicamente, el catálogo y todos los
// bookmarks que usaban el nombre anterior.
const renameCategory = async (db, id, rawName) => {
  const name = (rawName || '').trim();
  if (!name) throw httpError(400, 'El nombre es obligatorio');
  const current = await get(db, 'SELECT id, name, position FROM categories WHERE id = ?', [id]);
  if (!current) throw httpError(404, 'Categoría no encontrada');
  if (name !== current.name) {
    const clash = await get(db, 'SELECT id FROM categories WHERE name = ?', [name]);
    if (clash) throw httpError(409, 'Ya existe una categoría con ese nombre');
  }
  await run(db, 'BEGIN');
  try {
    await run(db, 'UPDATE categories SET name = ? WHERE id = ?', [name, id]);
    await run(db, 'UPDATE bookmarks SET category = ? WHERE category = ?', [name, current.name]);
    await run(db, 'COMMIT');
  } catch (err) {
    await run(db, 'ROLLBACK');
    throw err;
  }
  return { id, name, position: current.position };
};
```

Añadir `renameCategory` a `module.exports`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/categories.js backend/test/categories.test.js
git commit -m "feat(categories): rename category (updates bookmarks transactionally)"
```

---

## Task 4: `deleteCategory` (bloquea si tiene enlaces)

**Files:**
- Modify: `backend/categories.js`
- Test: `backend/test/categories.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `backend/test/categories.test.js`:

```js
test('deleteCategory elimina una categoría vacía', async () => {
  const db = await setupDb();
  const a = await categories.createCategory(db, 'Alpha');
  await categories.deleteCategory(db, a.id);
  assert.strictEqual((await categories.listCategories(db)).length, 0);
});

test('deleteCategory bloquea (409) si hay bookmarks que la referencian', async () => {
  const db = await setupDb([{ category: 'Dev', link: 'http://a' }]);
  await categories.seedCategoriesFromBookmarks(db);
  const dev = (await categories.listCategories(db))[0];
  await assert.rejects(categories.deleteCategory(db, dev.id), (e) => e.status === 409);
});

test('deleteCategory rechaza id inexistente con 404', async () => {
  const db = await setupDb();
  await assert.rejects(categories.deleteCategory(db, 999), (e) => e.status === 404);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend; npm test`
Expected: FAIL — `categories.deleteCategory is not a function`.

- [ ] **Step 3: Implementar**

En `backend/categories.js`, añadir antes de `module.exports`:

```js
// Borra una categoría solo si ningún bookmark la referencia.
const deleteCategory = async (db, id) => {
  const current = await get(db, 'SELECT name FROM categories WHERE id = ?', [id]);
  if (!current) throw httpError(404, 'Categoría no encontrada');
  const { count } = await get(db,
    'SELECT COUNT(*) as count FROM bookmarks WHERE category = ?', [current.name]);
  if (count > 0) throw httpError(409, `No se puede borrar: la categoría tiene ${count} enlace(s)`);
  await run(db, 'DELETE FROM categories WHERE id = ?', [id]);
};
```

Añadir `deleteCategory` a `module.exports`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/categories.js backend/test/categories.test.js
git commit -m "feat(categories): delete category blocked when it has bookmarks"
```

---

## Task 5: `reorderCategories` (transacción)

**Files:**
- Modify: `backend/categories.js`
- Test: `backend/test/categories.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `backend/test/categories.test.js`:

```js
test('reorderCategories reescribe positions según el orden dado', async () => {
  const db = await setupDb();
  const a = await categories.createCategory(db, 'A');
  const b = await categories.createCategory(db, 'B');
  const c = await categories.createCategory(db, 'C');
  await categories.reorderCategories(db, [c.id, a.id, b.id]);
  const list = await categories.listCategories(db);
  assert.deepStrictEqual(list.map((x) => x.name), ['C', 'A', 'B']);
  assert.deepStrictEqual(list.map((x) => x.position), [0, 1, 2]);
});

test('reorderCategories rechaza payload no-array con 400', async () => {
  const db = await setupDb();
  await assert.rejects(categories.reorderCategories(db, null), (e) => e.status === 400);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend; npm test`
Expected: FAIL — `categories.reorderCategories is not a function`.

- [ ] **Step 3: Implementar**

En `backend/categories.js`, añadir antes de `module.exports`:

```js
// Persiste un orden nuevo. `ids` es la lista completa de ids en el orden deseado;
// la position de cada fila se reescribe a su índice.
const reorderCategories = async (db, ids) => {
  if (!Array.isArray(ids) || ids.length === 0) throw httpError(400, 'Se esperaba una lista de ids');
  await run(db, 'BEGIN');
  try {
    for (let i = 0; i < ids.length; i++) {
      await run(db, 'UPDATE categories SET position = ? WHERE id = ?', [i, ids[i]]);
    }
    await run(db, 'COMMIT');
  } catch (err) {
    await run(db, 'ROLLBACK');
    throw err;
  }
};
```

Añadir `reorderCategories` a `module.exports`. El bloque `module.exports` final debe ser:

```js
module.exports = {
  createCategoriesTable,
  seedCategoriesFromBookmarks,
  listCategories,
  createCategory,
  ensureCategory,
  renameCategory,
  deleteCategory,
  reorderCategories,
};
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend; npm test`
Expected: PASS (toda la batería de `categories.test.js` en verde).

- [ ] **Step 5: Commit**

```bash
git add backend/categories.js backend/test/categories.test.js
git commit -m "feat(categories): reorder categories transactionally"
```

---

## Task 6: Cableado en `server.js` (rutas, siembra al arrancar, ensureCategory)

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Importar el módulo de categorías**

En `backend/server.js`, justo debajo de `const { requireAuth } = require('./auth');` (línea 9), añadir:

```js
const categories = require('./categories');
```

- [ ] **Step 2: Permitir un callback en `initDbFromJson` y sembrar el catálogo al arrancar**

Reemplazar toda la función `initDbFromJson` (actual líneas 62–102) por:

```js
// Initialize database from JSON if it doesn't exist. Calls onDone() once the
// bookmarks seeding has finished, so the categories catalog can be derived from
// real data on first run.
const initDbFromJson = (onDone = () => {}) => {
  // Check if database is empty
  db.get('SELECT COUNT(*) as count FROM bookmarks', (err, row) => {
    if (err) {
      console.error('Error checking database:', err);
      return onDone();
    }

    // If database is empty, import from JSON
    if (row.count === 0) {
      const jsonPath = path.join(__dirname, '..', 'json', 'bookmarks.json');

      if (fs.existsSync(jsonPath)) {
        try {
          const bookmarksData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

          const stmt = db.prepare('INSERT INTO bookmarks (category, short_description, long_description, link, icon) VALUES (?, ?, ?, ?, ?)');

          bookmarksData.forEach(bookmark => {
            stmt.run(
              bookmark.category,
              bookmark.short_description,
              bookmark.long_description || '',
              bookmark.link,
              bookmark.icon || ''
            );
          });

          stmt.finalize(() => {
            console.log('Database initialized with data from JSON file.');
            onDone();
          });
        } catch (error) {
          console.error('Error importing from JSON:', error);
          onDone();
        }
      } else {
        console.log('JSON file not found. Created empty database.');
        onDone();
      }
    } else {
      console.log('Database already has data.');
      onDone();
    }
  });
};
```

Reemplazar la llamada actual (líneas 104–105):

```js
// Initialize database
initDbFromJson();
```

por:

```js
// Initialize database, then build the categories catalog from it.
initDbFromJson(() => {
  categories.createCategoriesTable(db)
    .then(() => categories.seedCategoriesFromBookmarks(db))
    .then(() => console.log('Categories catalog ready.'))
    .catch((err) => console.error('Error initializing categories catalog:', err));
});
```

- [ ] **Step 3: Reemplazar `GET /api/categories` y añadir las rutas de gestión**

Reemplazar todo el bloque actual de `GET /api/categories` (líneas 195–204) por:

```js
// Get all categories (ordered catalog: [{ id, name, position }])
app.get('/api/categories', async (req, res) => {
  try {
    res.json(await categories.listCategories(db));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Create a category (empty, appended at the end)
app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    res.status(201).json(await categories.createCategory(db, req.body.name));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Reorder categories — registered before :id so the path is unambiguous
app.put('/api/categories/reorder', requireAuth, async (req, res) => {
  try {
    await categories.reorderCategories(db, req.body.ids);
    res.json({ message: 'Orden actualizado' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Rename a category (also updates the bookmarks that use it)
app.put('/api/categories/:id(\\d+)', requireAuth, async (req, res) => {
  try {
    res.json(await categories.renameCategory(db, Number(req.params.id), req.body.name));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Delete a category (blocked if it still has bookmarks)
app.delete('/api/categories/:id(\\d+)', requireAuth, async (req, res) => {
  try {
    await categories.deleteCategory(db, Number(req.params.id));
    res.json({ message: 'Categoría borrada' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: `ensureCategory` al crear un enlace**

En `POST /api/bookmarks`, reemplazar el callback de `db.run` (el bloque que hoy es `function(err) { ... db.get(...) ... }`, actuales líneas 219–230) por:

```js
  db.run(sql, [category, short_description, long_description || '', link, icon || ''], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const newId = this.lastID;
    categories.ensureCategory(db, category)
      .then(() => db.get('SELECT * FROM bookmarks WHERE id = ?', [newId], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json(row);
      }))
      .catch((err) => res.status(500).json({ error: err.message }));
  });
```

- [ ] **Step 5: `ensureCategory` al editar un enlace**

En `PUT /api/bookmarks/:id`, reemplazar el callback de `db.run(sql, [...values, id], function(err) {...})` (el bloque que hoy hace `db.get` y devuelve la fila, actuales líneas 265–276) por:

```js
    db.run(sql, [...values, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      categories.ensureCategory(db, updates.category)
        .then(() => db.get('SELECT * FROM bookmarks WHERE id = ?', [id], (err, row) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json(row);
        }))
        .catch((err) => res.status(500).json({ error: err.message }));
    });
```

(`updates.category` puede ser `undefined` si la edición no tocó la categoría; `ensureCategory` lo trata como no-op.)

- [ ] **Step 6: Verificar tests y arranque**

Run: `cd backend; npm test`
Expected: PASS (los tests de `categories.test.js` siguen verdes; no se han roto los de `auth`).

Smoke test manual (con el backend arrancado y `ADMIN_KEY=secret` en `.env` de la raíz):

```powershell
cd backend; npm run dev   # en otra terminal
# lectura pública:
Invoke-RestMethod -Uri http://localhost:5000/api/categories
# crear (con clave):
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/categories -Headers @{ 'x-admin-key' = 'secret' } -ContentType 'application/json' -Body '{"name":"Pruebas"}'
# crear sin clave -> 401:
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/categories -ContentType 'application/json' -Body '{"name":"X"}'
```
Expected: el GET devuelve objetos `{id,name,position}` ordenados; el POST con clave devuelve 201 con la fila; el POST sin clave devuelve 401.

- [ ] **Step 7: Commit**

```bash
git add backend/server.js
git commit -m "feat(categories): wire category routes, startup seeding and ensureCategory"
```

---

## Task 7: API del frontend

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Añadir las funciones de categorías**

En `frontend/src/api.js`, justo debajo de la línea `export const getCategories = () => api.get('/api/categories');`, añadir:

```js
export const createCategory = (name) => api.post('/api/categories', { name });
export const renameCategory = (id, name) => api.put(`/api/categories/${id}`, { name });
export const deleteCategory = (id) => api.delete(`/api/categories/${id}`);
export const reorderCategories = (ids) => api.put('/api/categories/reorder', { ids });
```

- [ ] **Step 2: Verificar compilación de sintaxis**

Run: `cd frontend; npx eslint src/api.js`
Expected: sin errores (si eslint no está configurado standalone, basta con que el build del Task 11 compile).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(categories): frontend api helpers"
```

---

## Task 8: Componente `CategoryForm` (modal crear/renombrar)

**Files:**
- Create: `frontend/src/components/CategoryForm.js`

- [ ] **Step 1: Crear el componente**

Crear `frontend/src/components/CategoryForm.js`:

```jsx
import React, { useState } from 'react';
import Modal from './Modal';
import { createCategory, renameCategory } from '../api';
import { useEditMode } from '../EditModeContext';

// Alta/renombrado de categoría. `category` es el {id, name} a renombrar, o null para crear.
// Llama a onSaved() tras un guardado correcto para que el padre recargue desde la API.
function CategoryForm({ category, onClose, onSaved }) {
  const { lock } = useEditMode();
  const [name, setName] = useState(category ? category.name : '');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (category) {
        await renameCategory(category.id, trimmed);
      } else {
        await createCategory(trimmed);
      }
      onSaved();
    } catch (err) {
      if (err.response && err.response.status === 401) {
        lock();
        setError('Sesión de edición caducada. Vuelve a desbloquear.');
      } else {
        setError(err.response?.data?.error || 'No se pudo guardar.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal title={category ? 'Renombrar categoría' : 'Añadir categoría'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>Nombre</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {error && <div className="error-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={submitting}>{category ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default CategoryForm;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CategoryForm.js
git commit -m "feat(categories): CategoryForm modal for create/rename"
```

---

## Task 9: `CategoryNav` con controles de edición + estilos

**Files:**
- Modify: `frontend/src/components/CategoryNav.js`
- Modify: `frontend/src/components/CategoryNav.css`

- [ ] **Step 1: Reescribir `CategoryNav.js`**

Reemplazar todo el contenido de `frontend/src/components/CategoryNav.js` por:

```jsx
import React from 'react';
import './CategoryNav.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faTrash, faArrowUp, faArrowDown, faPlus } from '@fortawesome/free-solid-svg-icons';

// `categories` es ahora una lista de objetos { id, name, position }.
// `selectedCategory` sigue siendo el nombre (string). Los controles de edición
// solo aparecen en editMode.
function CategoryNav({
  categories, selectedCategory, onSelectCategory, editMode,
  onAddCategory, onEditCategory, onDeleteCategory, onMoveCategory,
}) {
  const scrollToCategory = (name) => {
    onSelectCategory(name);
    const element = document.getElementById(`category-${name}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="category-nav">
      <h2>Categories</h2>
      {editMode && (
        <button className="add-category-button" onClick={onAddCategory}>
          <FontAwesomeIcon icon={faPlus} /> Añadir categoría
        </button>
      )}
      <ul className="category-list">
        {categories.map((category, index) => (
          <li
            key={category.id}
            className={category.name === selectedCategory ? 'active' : ''}
            onClick={() => scrollToCategory(category.name)}
          >
            <span className="category-name">{category.name}</span>
            {editMode && (
              <span className="category-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-button"
                  title="Subir"
                  disabled={index === 0}
                  onClick={() => onMoveCategory(index, -1)}
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </button>
                <button
                  className="icon-button"
                  title="Bajar"
                  disabled={index === categories.length - 1}
                  onClick={() => onMoveCategory(index, 1)}
                >
                  <FontAwesomeIcon icon={faArrowDown} />
                </button>
                <button className="icon-button" title="Renombrar" onClick={() => onEditCategory(category)}>
                  <FontAwesomeIcon icon={faPenToSquare} />
                </button>
                <button className="icon-button" title="Borrar" onClick={() => onDeleteCategory(category)}>
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="category-footer">
        <p><a href="https://yuuu.es" target="_blank" rel="noopener noreferrer">Powered & Developed by Yuuu</a></p>
      </div>
    </nav>
  );
}

export default CategoryNav;
```

- [ ] **Step 2: Añadir estilos**

Añadir al final de `frontend/src/components/CategoryNav.css`:

```css
.add-category-button {
  width: 100%;
  margin: 8px 0 12px;
  padding: 8px 12px;
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.category-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.category-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.category-list li.active .icon-button {
  color: #fff;
}

.category-actions .icon-button:disabled {
  opacity: 0.35;
  cursor: default;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CategoryNav.js frontend/src/components/CategoryNav.css
git commit -m "feat(categories): edit-mode controls in CategoryNav"
```

---

## Task 10: `BookmarksView` — objetos, categoryNames, handlers y reselección

**Files:**
- Modify: `frontend/src/views/BookmarksView.js`

- [ ] **Step 1: Reescribir `BookmarksView.js`**

Reemplazar todo el contenido de `frontend/src/views/BookmarksView.js` por:

```jsx
import React, { useState, useEffect } from 'react';
import {
  getCategories, getBookmarks, deleteBookmark,
  deleteCategory, reorderCategories,
} from '../api';
import CategoryNav from '../components/CategoryNav';
import BookmarkList from '../components/BookmarkList';
import BookmarkForm from '../components/BookmarkForm';
import CategoryForm from '../components/CategoryForm';
import { useEditMode } from '../EditModeContext';

function BookmarksView() {
  const [categories, setCategories] = useState([]);      // [{ id, name, position }]
  const [bookmarks, setBookmarks] = useState([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);  // name string
  const [searchQuery, setSearchQuery] = useState('');

  const { editMode, lock } = useEditMode();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const categoryNames = categories.map((c) => c.name);

  const reload = () => { loadCategories(); loadBookmarks(); };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (bookmark) => { setEditing(bookmark); setFormOpen(true); };
  const handleSaved = () => { setFormOpen(false); setEditing(null); reload(); };

  const openAddCategory = () => { setEditingCategory(null); setCategoryFormOpen(true); };
  const openEditCategory = (category) => { setEditingCategory(category); setCategoryFormOpen(true); };
  const handleCategorySaved = () => { setCategoryFormOpen(false); setEditingCategory(null); reload(); };

  // Manejo común de errores de escritura: salir de editMode en 401, si no, alerta.
  const handleWriteError = (err, fallback) => {
    if (err.response && err.response.status === 401) {
      lock();
      alert('Sesión de edición caducada. Vuelve a desbloquear.');
    } else {
      alert(err.response?.data?.error || fallback);
    }
  };

  const handleDelete = async (bookmark) => {
    if (!window.confirm(`¿Borrar "${bookmark.short_description}"?`)) return;
    try {
      await deleteBookmark(bookmark.id);
      reload();
    } catch (err) {
      handleWriteError(err, 'No se pudo borrar.');
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`¿Borrar la categoría "${category.name}"?`)) return;
    try {
      await deleteCategory(category.id);
      reload();
    } catch (err) {
      handleWriteError(err, 'No se pudo borrar la categoría.');
    }
  };

  const handleMoveCategory = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const ids = categories.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderCategories(ids);
      reload();
    } catch (err) {
      handleWriteError(err, 'No se pudo reordenar.');
    }
  };

  const loadCategories = async () => {
    try {
      const response = await getCategories();
      setCategories(response.data);
      const names = response.data.map((c) => c.name);
      setSelectedCategory((prev) => (prev && names.includes(prev) ? prev : (names[0] || null)));
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
        {editMode && (
          <button className="add-button" onClick={openAdd}>+ Añadir enlace</button>
        )}
      </div>
      <div className="app-content">
        <CategoryNav
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          editMode={editMode}
          onAddCategory={openAddCategory}
          onEditCategory={openEditCategory}
          onDeleteCategory={handleDeleteCategory}
          onMoveCategory={handleMoveCategory}
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
              categories={categoryNames}
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
          categories={categoryNames}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
      {categoryFormOpen && (
        <CategoryForm
          category={editingCategory}
          onClose={() => { setCategoryFormOpen(false); setEditingCategory(null); }}
          onSaved={handleCategorySaved}
        />
      )}
    </>
  );
}

export default BookmarksView;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/BookmarksView.js
git commit -m "feat(categories): wire category management into BookmarksView"
```

---

## Task 11: Verificación de build y pruebas manuales

**Files:** ninguno (verificación).

- [ ] **Step 1: Tests del backend**

Run: `cd backend; npm test`
Expected: PASS (categorías + auth).

- [ ] **Step 2: Build del frontend**

Run: `cd frontend; $env:CI='true'; npm run build`
Expected: "Compiled successfully" / build generado en `frontend/build` sin errores ni warnings que rompan el build.

- [ ] **Step 3: Pruebas manuales (backend arrancado con `ADMIN_KEY` definida)**

Con el backend en marcha y la web abierta, desbloquear el modo edición y comprobar:
- [ ] "+ Añadir categoría" crea una categoría vacía y aparece al final de la barra lateral.
- [ ] Renombrar una categoría con enlaces: cambia el nombre en la barra y en la cabecera de la sección de enlaces; los enlaces siguen ahí.
- [ ] Las flechas ↑/↓ reordenan la categoría; el orden persiste tras recargar la página; las secciones de enlaces siguen ese mismo orden.
- [ ] Borrar una categoría vacía la elimina.
- [ ] Borrar una categoría con enlaces muestra la alerta "No se puede borrar: la categoría tiene N enlace(s)" y no la borra.
- [ ] Nombre duplicado al crear/renombrar muestra el error dentro del modal sin cerrarlo.
- [ ] Al bloquear (candado) desaparecen todos los controles de categoría.
- [ ] Crear un enlace con "+ Nueva categoría…" hace que esa categoría aparezca en la barra lateral.

- [ ] **Step 4: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -m "test(categories): verify build and manual flows"
```

---

## Auto-revisión del plan (hecha por el autor)

- **Cobertura del spec:** tabla (T1), siembra tras bookmarks (T1+T6), GET objetos (T1+T6), POST (T2+T6), rename transaccional que actualiza bookmarks (T3+T6), delete bloqueante (T4+T6), reorder (T5+T6), `:id(\d+)` antes de `/reorder` (T6), ensureCategory en crear/editar enlace (T2+T6), API frontend (T7), CategoryForm (T8), CategoryNav (T9), BookmarksView con objetos/categoryNames/reselección/handlers (T10), errores 409/401 y pruebas (T en general + T11). Sin huecos.
- **Sin placeholders:** cada paso de código incluye el código completo.
- **Consistencia de tipos/nombres:** funciones del módulo (`createCategoriesTable`, `seedCategoriesFromBookmarks`, `listCategories`, `createCategory`, `ensureCategory`, `renameCategory`, `deleteCategory`, `reorderCategories`) coinciden en definición, exports, rutas y tests. Las funciones de API del frontend (`createCategory`, `renameCategory`, `deleteCategory`, `reorderCategories`) coinciden con su uso en `CategoryForm` y `BookmarksView`.
