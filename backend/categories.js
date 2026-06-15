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

// Borra una categoría solo si ningún bookmark la referencia.
const deleteCategory = async (db, id) => {
  const current = await get(db, 'SELECT name FROM categories WHERE id = ?', [id]);
  if (!current) throw httpError(404, 'Categoría no encontrada');
  const { count } = await get(db,
    'SELECT COUNT(*) as count FROM bookmarks WHERE category = ?', [current.name]);
  if (count > 0) throw httpError(409, `No se puede borrar: la categoría tiene ${count} enlace(s)`);
  await run(db, 'DELETE FROM categories WHERE id = ?', [id]);
};

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
