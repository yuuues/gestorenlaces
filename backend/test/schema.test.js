const { test } = require('node:test');
const assert = require('node:assert');
const sqlite3 = require('sqlite3');
const { ensureColumns } = require('../schema');

const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
const run = (db, sql) => new Promise((res, rej) => db.run(sql, (e) => (e ? rej(e) : res())));

const newDb = () => new sqlite3.Database(':memory:');

test('ensureColumns adds a missing column', async () => {
  const db = newDb();
  await run(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT)');
  await ensureColumns(db, 't', [{ name: 'a', definition: 'TEXT' }, { name: 'b', definition: 'TEXT' }]);
  const cols = (await all(db, 'PRAGMA table_info(t)')).map((c) => c.name).sort();
  assert.deepStrictEqual(cols, ['a', 'b', 'id']);
});

test('ensureColumns is idempotent across runs', async () => {
  const db = newDb();
  await run(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY)');
  await ensureColumns(db, 't', [{ name: 'b', definition: 'TEXT' }]);
  await ensureColumns(db, 't', [{ name: 'b', definition: 'TEXT' }]);
  const cols = (await all(db, 'PRAGMA table_info(t)')).map((c) => c.name).sort();
  assert.deepStrictEqual(cols, ['b', 'id']);
});

test('ensureColumns preserves existing rows and backfills NULL', async () => {
  const db = newDb();
  await run(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT)');
  await run(db, "INSERT INTO t (a) VALUES ('x')");
  await ensureColumns(db, 't', [{ name: 'icon', definition: 'TEXT' }]);
  const rows = await all(db, 'SELECT a, icon FROM t');
  assert.strictEqual(rows[0].a, 'x');
  assert.strictEqual(rows[0].icon, null);
});

test('ensureColumns rejects an invalid table name', async () => {
  const db = newDb();
  await assert.rejects(ensureColumns(db, 'bad name; DROP TABLE x', [{ name: 'a', definition: 'TEXT' }]));
});
