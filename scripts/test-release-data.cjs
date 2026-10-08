const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const Database = require('better-sqlite3');
const { openDatabase } = require('../electron/database/index.cjs');
const { migrate, schemaVersion } = require('../electron/database/migrate.cjs');
const { validateDatabase } = require('../electron/database/backup-validation.cjs');
const { allData, seedBackup } = require('./backup-fixtures.cjs');
const { seedReturns } = require('./returns-fixtures.cjs');
const { createAuthService } = require('../electron/services/auth.cjs');
const { createCatalogServices } = require('../electron/services/catalog.cjs');
const { createPurchaseService } = require('../electron/services/purchases.cjs');
const { createSaleService } = require('../electron/services/sales.cjs');
const { createInventoryService } = require('../electron/services/inventory.cjs');
const { createDashboardService } = require('../electron/services/dashboard.cjs');
const { createReportsService } = require('../electron/services/reports.cjs');
const { createLedgerService } = require('../electron/services/ledger.cjs');
const { createBackupService } = require('../electron/services/backup.cjs');
const { createMaintenanceGate } = require('../electron/ipc/maintenance.cjs');

const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root || !path.basename(root).startsWith('mahsood-release-data-')) throw Error('Isolated release audit profile required');
app.setPath('userData', root);
app.setPath('sessionData', root);
const timeout = setTimeout(() => { console.error('Release data audit timeout'); app.exit(1); }, 180000);
const credentials = { email: 'release@example.test', password: 'Isolated-Audit-2026!' };
const period = { period: 'custom', from_date: '2026-09-01', to_date: '2026-09-30' };
const results = { schema: schemaVersion, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, migrations: [], upgrade: null, fresh: null, timings: {} };
function healthy(db) {
  assert.equal(validateDatabase(db), schemaVersion);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
}
function preserved(before, db) {
  const after = allData(db);
  for (const [table, rows] of Object.entries(before)) {
    assert.deepEqual(after[table].map(row => Object.fromEntries(Object.keys(rows[0] ?? {}).map(key => [key, row[key]]))), rows, `Preserve ${table}`);
  }
}
async function upgrade(filename, before, original) {
  const db = openDatabase(filename);
  try {
    healthy(db);
    preserved(before, db);
    for (const item of db.prepare('SELECT units_per_transaction_unit,allocated_shipment_cost FROM purchase_items').all()) {
      assert.equal(item.units_per_transaction_unit, 1);
      assert.equal(item.allocated_shipment_cost, 0);
    }
    assert.ok(db.prepare('SELECT shipment_cost FROM purchases').all().every(row => row.shipment_cost === 0));
    const snapshot = allData(db);
    migrate(db);
    assert.deepEqual(allData(db), snapshot, 'Reapplying migrations is idempotent');
    if (original >= 5) await createAuthService(() => db).login(credentials);
  } finally { db.close(); }
  const reopened = openDatabase(filename);
  try { healthy(reopened); preserved(before, reopened); } finally { reopened.close(); }
}
app.whenReady().then(async () => {
  let db;
  try {
    require('./test-profile.cjs').verifyProfiles(root);
    const legacyMain = execFileSync('git', ['show', 'v0.1.0:electron/main.cjs'], { encoding: 'utf8', windowsHide: true });
    const probe = name => {
      const output = execFileSync(process.execPath, [path.join(__dirname, 'probe-profile-name.cjs'), name], { encoding: 'utf8', windowsHide: true });
      return JSON.parse(output.trim());
    };
    const legacyProfile = probe(legacyMain.match(/app\.setName\("([^"]+)"\)/)[1]), currentProfile = probe('--current');
    assert.equal(currentProfile.userData, legacyProfile.userData, 'Upgrade must preserve the default profile path');
    results.profilePath = { legacy: legacyProfile.name, current: currentProfile.name, result: 'PASS' };
    const directory = path.join(__dirname, '../electron/database/migrations');
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
    for (let version = 1; version <= schemaVersion; version++) {
      const filename = path.join(root, `schema-${version}.sqlite3`);
      const old = new Database(filename);
      old.pragma('foreign_keys=ON');
      for (const file of files.slice(0, version)) old.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
      old.pragma(`user_version=${version}`);
      old.exec("INSERT INTO suppliers(name) VALUES('Legacy supplier'); INSERT INTO products(sku,model,size) VALUES('LEGACY','Legacy tyre','R16'); INSERT INTO purchases(invoice_number,supplier_id,subtotal,discount,total) VALUES('LEGACY',1,1000,0,1000); INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost) VALUES(1,1,10,100); INSERT INTO stock_movements(product_id,movement_type,quantity_change,purchase_item_id,unit_cost) VALUES(1,'PURCHASE',10,1,100)");
      if (version >= 5) await createAuthService(() => old).setup({ ...credentials, confirmPassword: credentials.password });
      const before = allData(old);
      old.close();
      await upgrade(filename, before, version);
      results.migrations.push({ from: version, to: schemaVersion, result: 'PASS' });
    }
    // Build a populated v0.1.0 fixture from the actual tagged migration sources,
    // then migrate a COPY, never a real shop profile or the sole original.
    const taggedFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'v0.1.0', 'electron/database/migrations'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
    const original = path.join(root, 'v010-original.sqlite3');
    const old = new Database(original);
    old.pragma('foreign_keys=ON');
    for (const file of taggedFiles) old.exec(execFileSync('git', ['show', `v0.1.0:${file}`], { encoding: 'utf8', windowsHide: true }));
    old.pragma(`user_version=${taggedFiles.length}`);
    seedReturns(old);
    old.exec("INSERT INTO brands(name) VALUES('Legacy brand'); INSERT INTO categories(name) VALUES('Legacy category'); UPDATE products SET brand_id=1,category_id=1,minimum_stock=5; INSERT INTO expense_categories(name) VALUES('Rent'); INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES(1,12345,'Legacy rent','Cash','2026-09-01'); INSERT INTO settings(key,value) VALUES('shop.name','Legacy release shop')");
    old.exec("INSERT INTO sale_returns(id,reference,sale_id,returned_at,total) VALUES(1,'LEGACY-SR',1,'2026-09-02',9999); INSERT INTO stock_movements(id,product_id,movement_type,quantity_change,sale_item_id,unit_cost) VALUES(6,1,'SALE_RETURN',1,1,6000); INSERT INTO sale_return_items(return_id,sale_item_id,quantity,unit_price,unit_cost,gross_value,return_value,movement_id) VALUES(1,1,1,10000,6000,10000,9999,6); INSERT INTO purchase_returns(id,reference,purchase_id,returned_at,total) VALUES(1,'LEGACY-PR',1,'2026-09-02',5999); INSERT INTO stock_movements(id,product_id,movement_type,quantity_change,purchase_item_id,unit_cost) VALUES(7,1,'PURCHASE_RETURN',-1,1,6000); INSERT INTO purchase_return_items(return_id,purchase_item_id,quantity,unit_price,unit_cost,gross_value,return_value,movement_id) VALUES(1,1,1,6000,6000,6000,5999,7)");
    await createAuthService(() => old).setup({ ...credentials, confirmPassword: credentials.password });
    const before = allData(old);
    const copy = path.join(root, 'v010-upgrade-copy.sqlite3');
    await old.backup(copy);
    const profileDatabase = path.join(root, 'tagged-profile', 'database', 'mahsood-tyre-manager.sqlite3');
    fs.mkdirSync(path.dirname(profileDatabase), { recursive: true });
    await old.backup(profileDatabase);
    old.close();
    const applicationResult = execFileSync(process.execPath, [path.join(__dirname, 'test-upgrade-profile.cjs')], { encoding: 'utf8', windowsHide: true, timeout: 40000 });
    console.log(applicationResult.trim());
    const upgradedProfile = openDatabase(profileDatabase);
    try { healthy(upgradedProfile); preserved(before, upgradedProfile); } finally { upgradedProfile.close(); }
    const originalBytes = fs.readFileSync(original);
    await upgrade(copy, before, taggedFiles.length);
    assert.deepEqual(fs.readFileSync(original), originalBytes, 'Original upgrade fixture untouched');
    results.upgrade = { tag: 'v0.1.0', from: taggedFiles.length, to: schemaVersion, result: 'PASS', applicationLaunch: 'PASS', preservedTables: Object.keys(before) };

    // Fresh-profile service workflow, credential preservation and real backup restore.
    const fresh = path.join(root, 'database', 'fresh.sqlite3');
    db = openDatabase(fresh);
    const auth = createAuthService(() => db);
    assert.deepEqual(auth.getStatus(), { hasAdministrator: false, authenticated: false });
    await auth.setup({ ...credentials, confirmPassword: credentials.password });
    seedBackup(db);
    const purchase = createPurchaseService(db).create({ supplier_id: 1, invoice_number: 'FRESH-SHIPMENT', purchased_at: '2026-09-26', items: [{ product_id: 1, quantity: 3, unit_cost: 10001 }], shipment_cost: 101 });
    assert.equal(purchase.total, 30003);
    assert.equal(purchase.landed_total, 30104);
    assert.equal(purchase.balance, 30003);
    const summary = createDashboardService(db).getOverview(period).summary;
    assert.equal(createReportsService(db).getProfit(period).summary.grossProfit, summary.grossProfit);
    const expected = allData(db);
    const backupFile = path.join(root, 'fresh-backup.sqlite3');
    const backup = createBackupService({ app, getDatabase: () => db, closeDatabase: () => db.close(), reopen: () => { db = openDatabase(fresh); }, gate: createMaintenanceGate({ handle() {}, removeHandler() {} }), dialogs: { showSaveDialog: async () => ({ filePath: backupFile }), showMessageBox: async () => ({ response: 1 }), showOpenDialog: async () => ({ filePaths: [backupFile] }) } });
    await backup.create();
    await backup.restore();
    assert.deepEqual(allData(db), expected);
    await createAuthService(() => db).login(credentials);
    healthy(db);
    results.fresh = { result: 'PASS', backupRestored: true, credentialLogin: true };
    db.close();

    // Realistic volume through authoritative services, with hand-computed totals.
    db = openDatabase(path.join(root, 'volume.sqlite3'));
    const catalog = createCatalogServices(db);
    const brand = catalog.brands.create({ name: 'Volume' });
    const category = catalog.categories.create({ name: 'Volume' });
    db.exec("INSERT INTO suppliers(name) VALUES('Volume supplier'); INSERT INTO customers(name) VALUES('Volume customer')");
    const purchases = createPurchaseService(db), sales = createSaleService(db), inventory = createInventoryService(db);
    const started = performance.now();
    db.transaction(() => {
      for (let index = 0; index < 1000; index++) {
        const product = catalog.products.create({ sku: `VOL-${index}`, model: 'Volume tyre', size: 'R16', brand_id: brand.id, category_id: category.id, default_selling_price: 15001, minimum_stock: 2 });
        purchases.create({ supplier_id: 1, invoice_number: `VOL-P-${index}`, purchased_at: '2026-09-01', items: [{ product_id: product.id, quantity: 10, unit_cost: 10001 }], discount: 1, paid_amount: 500, shipment_cost: 101 });
        for (let item = 0; item < 2; item++) sales.create({ customer_id: 1, items: [{ product_id: product.id, quantity: 1, unit_price: 15001 }], discount: 1, paid_amount: 5000, sold_at: '2026-09-02T10:00:00.000Z' });
        inventory.adjust({ product_id: product.id, movement_type: 'ADJUSTMENT_IN', quantity: 1, notes: 'Isolated volume fixture' });
      }
    })();
    results.seedMilliseconds = Math.round(performance.now() - started);
    results.volume = { products: 1000, purchases: 1000, sales: 2000, movements: 4000, payments: 3000 };
    const dashboard = createDashboardService(db), reports = createReportsService(db), ledger = createLedgerService(db);
    const operations = {
      dashboard: () => dashboard.getOverview(period),
      salesReport: () => reports.getSales({ ...period, limit: 25 }),
      purchasesReport: () => reports.getPurchases({ ...period, limit: 25 }),
      profitReport: () => reports.getProfit({ ...period, limit: 25 }),
      inventory: () => inventory.list({ limit: 100 }),
      salesHistory: () => sales.list({ limit: 100 }),
      purchaseHistory: () => purchases.list({ limit: 100 }),
      movements: () => inventory.listMovements({ limit: 100 }),
      customerLedger: () => ledger.getStatement({ party_type: 'customer', party_id: 1 }),
      supplierLedger: () => ledger.getStatement({ party_type: 'supplier', party_id: 1 }),
    };
    for (const [name, operation] of Object.entries(operations)) {
      const times = [];
      for (let repeat = 0; repeat < 3; repeat++) { const start = performance.now(); operation(); times.push(Number((performance.now() - start).toFixed(2))); }
      results.timings[name] = times;
    }
    const s = dashboard.getOverview(period).summary;
    for (const [key, expected] of Object.entries({ salesRevenue: 30000000, amountReceived: 10000000, historicalCost: 20022000, grossProfit: 9978000, purchaseTotal: 100009000, supplierAmountPaid: 500000, customerReceivables: 20000000, supplierPayables: 99509000, expenses: 0, stockUnits: 17000, saleCount: 2000, purchaseCount: 1000, activeProducts: 1000, lowStockCount: 0, outOfStockCount: 0, customerCreditDue: 0, supplierCreditDue: 0 })) assert.equal(s[key], expected, key);
    assert.equal(reports.getSales({ ...period, limit: 1, offset: 100 }).summary.total, 30000000);
    assert.equal(reports.getPurchases({ ...period, limit: 1, offset: 100 }).summary.total, 100009000);
    assert.equal(ledger.getStatement({ party_type: 'supplier', party_id: 1, limit: 1 }).closingBalance, 99509000);
    healthy(db);
    fs.mkdirSync(path.join(__dirname, '../artifacts/release-audit'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '../artifacts/release-audit/data-integrity.json'), JSON.stringify(results, null, 2));
    console.log('PASS release data: populated schema 1–7 upgrades/reopen/integrity, copied tagged v0.1.0 preservation/login, fresh workflow/backup, 1000 products/2000 sales and exact volume accounting');
    console.log(JSON.stringify(results.timings));
    clearTimeout(timeout);
    db.close();
    app.quit();
  } catch (error) {
    console.error(error);
    if (db?.open) db.close();
    app.exit(1);
  }
});
