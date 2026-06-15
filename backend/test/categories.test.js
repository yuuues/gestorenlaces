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

// --- Task 1: siembra y listado ---

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

// --- Task 2: createCategory y ensureCategory ---

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

// --- Task 3: renameCategory ---

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

// --- Task 4: deleteCategory ---

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

// --- Task 5: reorderCategories ---

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
