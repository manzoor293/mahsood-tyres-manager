const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabasePath, openDatabase } = require('../electron/database/index.cjs');
const { schemaVersion } = require('../electron/database/migrate.cjs');

app.setName('Mahsood Tyre Manager');
if (process.env.MAHSOOD_UI_TEST_DATA) {
  app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
  app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
}

const tables = [
  'brands', 'categories', 'products', 'suppliers', 'customers', 'purchases',
  'purchase_items', 'sales', 'sale_items', 'inventory', 'stock_movements',
  'supplier_payments', 'customer_payments', 'expense_categories', 'expenses', 'settings',
];

// Each entry describes one complete FK, including composite column order.
const foreignKeys = {
  products: [['brands', 'brand_id', 'id'], ['categories', 'category_id', 'id']],
  purchases: [['suppliers', 'supplier_id', 'id']],
  purchase_items: [['purchases', 'purchase_id', 'id'], ['products', 'product_id', 'id']],
  sales: [['customers', 'customer_id', 'id']],
  sale_items: [['sales', 'sale_id', 'id'], ['products', 'product_id', 'id']],
  inventory: [['products', 'product_id', 'id']],
  stock_movements: [
    ['products', 'product_id', 'id'],
    ['purchase_items', 'purchase_item_id,product_id', 'id,product_id'],
    ['sale_items', 'sale_item_id,product_id', 'id,product_id'],
  ],
  supplier_payments: [['suppliers', 'supplier_id', 'id'], ['purchases', 'purchase_id,supplier_id', 'id,supplier_id']],
  customer_payments: [
    ['customers', 'customer_id', 'id'], ['sales', 'sale_id', 'id'],
    ['sales', 'sale_id,customer_id', 'id,customer_id'],
  ],
  expenses: [['expense_categories', 'expense_category_id', 'id']],
};

app.whenReady().then(() => {
  let database;
  let failures = 0;
  const check = (label, verify) => {
    try {
      verify();
      console.log(`PASS: ${label}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL: ${label}\n  ${error.message}`);
    }
  };
  try {
    const filename = getDatabasePath(app);
    // Automated tests create only a temporary fixture; direct --db remains read-only against existing data.
    if (process.env.MAHSOOD_UI_TEST_DATA) openDatabase(filename).close();
    console.log(`Database: ${filename}`);
    database = openDatabase(filename, { readonly: true });
    const existingTables = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name));
    check(`Schema version is ${schemaVersion}`, () => assert.equal(database.pragma('user_version', { simple: true }), schemaVersion));
    check('All 16 expected tables exist', () => {
      for (const table of tables) assert.ok(existingTables.has(table), `Missing table: ${table}`);
    });
    // foreign_keys is a connection setting, not a persistent database property.
    check('Foreign keys enabled on the connection', () => assert.equal(database.pragma('foreign_keys', { simple: true }), 1));
    check('WAL mode enabled', () => assert.equal(database.pragma('journal_mode', { simple: true }), 'wal'));
    check('All expected foreign keys exist (including composite keys)', () => {
      for (const [table, expected] of Object.entries(foreignKeys)) {
        const groups = new Map();
        for (const row of database.prepare('SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq').all(table)) {
          if (!groups.has(row.id)) groups.set(row.id, []);
          groups.get(row.id).push(row);
        }
        for (const [target, from, to] of expected) {
          assert.ok([...groups.values()].some((rows) => rows[0].table === target
            && rows.map((row) => row.from).join(',') === from
            && rows.map((row) => row.to).join(',') === to
            && rows.every((row) => row.on_delete === 'RESTRICT')),
          `Missing FK: ${table}(${from}) -> ${target}(${to}) ON DELETE RESTRICT`);
        }
      }
    });
    check('SKU and purchase/sale invoice numbers have UNIQUE constraints', () => {
      for (const [table, column] of [['products', 'sku'], ['purchases', 'invoice_number'], ['sales', 'invoice_number']]) {
        const indexes = database.prepare('SELECT * FROM pragma_index_list(?)').all(table);
        assert.ok(indexes.some((index) => {
          if (!index.unique || index.partial || index.origin !== 'u') return false;
          const columns = database.prepare('SELECT * FROM pragma_index_info(?) ORDER BY seqno').all(index.name);
          return columns.length === 1 && columns[0].name === column;
        }), `Missing UNIQUE constraint: ${table}.${column}`);
      }
    });
    const checkMoneyColumns = (table, names) => {
      const columns = database.prepare('SELECT * FROM pragma_table_info(?)').all(table);
      for (const name of names) assert.ok(columns.some((column) => column.name === name
        && column.type === 'INTEGER' && column.notnull === 1), `Missing INTEGER NOT NULL column: ${table}.${name}`);
    };
    check('Purchase items contain unit_cost', () => checkMoneyColumns('purchase_items', ['unit_cost']));
    check('Sale items contain unit_price and unit_cost', () => checkMoneyColumns('sale_items', ['unit_price', 'unit_cost']));
    check('Inventory and stock_movements tables exist', () => {
      assert.ok(existingTables.has('inventory'));
      assert.ok(existingTables.has('stock_movements'));
    });
    check('Database is under Electron userData (resolved filesystem path)', () => {
      const relative = path.relative(fs.realpathSync(app.getPath('userData')), fs.realpathSync(database.name));
      assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    });
    console.log(`${failures === 0 ? 'PASS' : 'FAIL'}: ${10 - failures}/10 database checks passed. No data or schema changes performed.`);
  } catch (error) {
    failures += 1;
    console.error('FAIL: Cannot verify existing database:', error.message);
    console.error('Run the application once to initialize it if the database does not exist.');
  } finally {
    database?.close();
    app.exit(failures ? 1 : 0);
  }
}).catch((error) => {
  console.error('FAIL: Electron startup:', error);
  app.exit(1);
});
