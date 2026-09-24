const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase, initializeDatabase } = require('../electron/database/index.cjs');
const { migrate, schemaVersion } = require('../electron/database/migrate.cjs');

const expectedTables = [
  'brands', 'categories', 'products', 'suppliers', 'customers', 'purchases',
  'purchase_items', 'sales', 'sale_items', 'inventory', 'stock_movements',
  'supplier_payments', 'customer_payments', 'expense_categories', 'expenses', 'settings',
].sort();

function verifySchema(database) {
  assert.deepEqual(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name), expectedTables);
  assert.equal(database.pragma('user_version', { simple: true }), schemaVersion);
  assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(database.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(database.pragma('foreign_key_check'), []);
}

function verifyDatabase(app) {
  const applicationDatabase = initializeDatabase(app);
  verifySchema(applicationDatabase);
  assert.equal(applicationDatabase.name, path.join(app.getPath('userData'), 'database', 'mahsood-tyre-manager.sqlite3'));
  // Exercise writes only in an isolated temporary database, never in shop data.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mahsood-database-test-'));
  const filename = path.join(directory, 'verification.sqlite3');
  let database;
  try {
    database = openDatabase(filename);
    verifySchema(database);
    database.exec(`
      INSERT INTO products (sku, model, size, default_selling_price) VALUES ('TEST-1', 'Test', '195/65 R15', 12000);
      INSERT INTO suppliers (name) VALUES ('Test supplier');
      INSERT INTO customers (name) VALUES ('Test customer'), ('Other customer');
      INSERT INTO purchases (invoice_number, supplier_id, subtotal, total) VALUES ('P-1', 1, 18000, 18000);
      INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (1, 1, 2, 9000);
      INSERT INTO stock_movements (product_id, movement_type, quantity_change, purchase_item_id, unit_cost) VALUES (1, 'PURCHASE', 2, 1, 9000);
      INSERT INTO sales (invoice_number, customer_id, subtotal, total) VALUES ('S-1', 1, 12000, 12000);
      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost) VALUES (1, 1, 1, 12000, 9000);
      INSERT INTO stock_movements (product_id, movement_type, quantity_change, sale_item_id, unit_cost) VALUES (1, 'SALE', -1, 1, 9000);
      INSERT INTO customer_payments (customer_id, sale_id, amount, payment_method) VALUES (1, 1, 5000, 'CASH'), (1, 1, 7000, 'CASH');
      INSERT INTO supplier_payments (supplier_id, purchase_id, amount, payment_method) VALUES (1, 1, 8000, 'CASH');
    `);
    assert.equal(database.prepare('SELECT quantity FROM inventory').get().quantity, 1);
    assert.equal(database.prepare('SELECT SUM(amount) AS paid FROM customer_payments').get().paid, 12000);
    const rejected = [
      "INSERT INTO products (sku, model, size) VALUES ('test-1', 'Duplicate', 'x')",
      "INSERT INTO sales (invoice_number, subtotal, total) VALUES ('s-1', 0, 0)",
      "INSERT INTO products (sku, model, size, brand_id) VALUES ('BAD-FK', 'x', 'x', 999)",
      'UPDATE products SET default_selling_price = 1.5',
      'UPDATE products SET minimum_stock = -1',
      "INSERT INTO stock_movements (product_id, movement_type, quantity_change, unit_cost) VALUES (1, 'ADJUSTMENT_OUT', -2, 9000)",
      "INSERT INTO stock_movements (product_id, movement_type, quantity_change, unit_cost) VALUES (1, 'ADJUSTMENT_IN', -1, 9000)",
      'UPDATE inventory SET quantity = 99',
      'DELETE FROM stock_movements',
      'UPDATE stock_movements SET unit_cost = 0',
      "INSERT INTO customer_payments (customer_id, sale_id, amount, payment_method) VALUES (2, 1, 1, 'CASH')",
      "INSERT INTO customer_payments (sale_id, amount, payment_method) VALUES (1, 1, 'CASH')",
    ];
    for (const sql of rejected) assert.throws(() => database.exec(sql), (error) => error.code?.startsWith('SQLITE_CONSTRAINT'), sql);
    assert.equal(database.prepare('SELECT quantity FROM inventory').get().quantity, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM stock_movements').get().count, 2);
    database.exec('UPDATE products SET default_selling_price = 15000');
    assert.deepEqual(database.prepare('SELECT unit_price, unit_cost FROM sale_items').get(), { unit_price: 12000, unit_cost: 9000 });
    assert.equal(database.prepare('SELECT unit_cost FROM purchase_items').get().unit_cost, 9000);
    assert.match(database.prepare('SELECT created_at FROM products').get().created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    database.close();
    database = openDatabase(filename);
    verifySchema(database);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM products').get().count, 1);
    assert.equal(database.prepare('SELECT quantity FROM inventory').get().quantity, 1);
    database.pragma('user_version = 99');
    assert.throws(() => migrate(database), /newer than supported/);
    assert.equal(database.pragma('user_version', { simple: true }), 99);
    database.close();
    // Deliberate collision proves a failed migration rolls back preceding DDL.
    database = openDatabase(path.join(directory, 'rollback.sqlite3'));
    database.exec('DROP TRIGGER products_create_inventory; DROP TABLE brands; PRAGMA user_version = 0;');
    assert.throws(() => migrate(database), /already exists/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'brands'").get().count, 0);
    assert.equal(database.pragma('user_version', { simple: true }), 0);
    console.log(`PASS database: 16 tables, constraints, stock ledger, historical costs, payments, reopen, migration rollback and newer-version rejection. Application database: ${applicationDatabase.name}`);
  } finally {
    if (database?.open) database.close();
    // Only the unique directory created above is removed.
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { verifyDatabase };
