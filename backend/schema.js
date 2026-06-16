// Idempotent schema reconciliation. SQLite's `CREATE TABLE IF NOT EXISTS` does
// not evolve an existing table, so a database created by an older version is
// missing any columns added in later versions and queries then fail with
// "no such column". ensureColumns() adds those missing columns on startup.
//
// IMPORTANT: only ALTER-safe column definitions are allowed — SQLite cannot
// ADD COLUMN that is NOT NULL without a DEFAULT, nor UNIQUE / PRIMARY KEY. Use a
// nullable type (e.g. 'TEXT') or include a DEFAULT (e.g. "TEXT NOT NULL DEFAULT ''").

// Table/column names are interpolated into SQL, so restrict them to plain
// identifiers. Names come from code constants, never user input; this is a guard
// against accidental misuse, not a user-facing input path.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const all = (db, sql) =>
  new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));

const run = (db, sql) =>
  new Promise((resolve, reject) =>
    db.run(sql, (err) => (err ? reject(err) : resolve())));

// Add any columns the table is missing. `columns` is [{ name, definition }].
const ensureColumns = async (db, table, columns) => {
  if (!IDENT.test(table)) throw new Error(`Invalid table name: ${table}`);
  const existing = new Set((await all(db, `PRAGMA table_info(${table})`)).map((c) => c.name));
  for (const col of columns) {
    if (!IDENT.test(col.name)) throw new Error(`Invalid column name: ${col.name}`);
    if (!existing.has(col.name)) {
      await run(db, `ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.definition}`);
      console.log(`Schema: added missing column ${table}.${col.name}`);
    }
  }
};

module.exports = { ensureColumns };
