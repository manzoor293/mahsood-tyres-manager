const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { openDatabase } = require('../electron/database/index.cjs');
const { migrate } = require('../electron/database/migrate.cjs');
const { createCatalogServices } = require('../electron/services/catalog.cjs');
const { registerCatalogIpc, createSenderGuard } = require('../electron/ipc/catalog.cjs');

const timeout = setTimeout(() => { console.error('FAIL: Catalog tests timed out.'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mahsood-catalog-'));
  let database;
  let window;
  let unregister;
  let code = 0;
  try {
    // Test the real v1 -> v2 migration against existing catalog rows.
    const Database = require('better-sqlite3');
    database = new Database(path.join(directory, 'catalog.sqlite3'));
    database.exec(fs.readFileSync(path.join(__dirname, '../electron/database/migrations/001-initial.sql'), 'utf8'));
    database.exec("PRAGMA user_version = 1; INSERT INTO brands(name) VALUES ('Legacy'); INSERT INTO categories(name) VALUES ('Legacy');");
    database.close();
    database = openDatabase(path.join(directory, 'catalog.sqlite3'));
    assert.equal(database.pragma('user_version', { simple: true }), 2);
    assert.equal(database.prepare('SELECT active FROM brands WHERE id=1').get().active, 1);
    assert.equal(database.prepare('SELECT updated_at = created_at AS same FROM categories WHERE id=1').get().same, 1);
    migrate(database);
    const services = createCatalogServices(database);
    const brand = services.brands.create({ name: ' Michelin ' });
    const category = services.categories.create({ name: 'Passenger' });
    const data = { sku: 'TYRE-01', brand_id: brand.id, category_id: category.id, model: 'Primacy', size: '195/65 R15', default_selling_price: 1250050, minimum_stock: 2 };
    const product = services.products.create(data);
    assert.equal(product.stock_quantity, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM inventory WHERE product_id=?').get(product.id).n, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n, 0);
    const rejects = (action, code) => assert.throws(action, (error) => error.code === code);
    rejects(() => services.products.create({ ...data, sku: 'tyre-01' }), 'CONFLICT');
    for (const invalid of [
      { sku: '' }, { model: ' ' }, { size: '' }, { brand_id: null }, { category_id: '2' },
      { default_selling_price: -1 }, { default_selling_price: 1.5 }, { minimum_stock: -1 },
      { minimum_stock: Number.MAX_SAFE_INTEGER + 1 }, { stock_quantity: 10 }, { active: 0 },
    ]) rejects(() => services.products.create({ ...data, ...invalid }), 'VALIDATION');
    for (const field of ['brand_id', 'category_id']) rejects(() => services.products.create({ ...data, [field]: 999 }), 'NOT_FOUND');
    rejects(() => services.products.getById(999), 'NOT_FOUND');
    rejects(() => services.products.update(product.id, {}), 'VALIDATION');
    rejects(() => services.products.list({ limit: 501 }), 'VALIDATION');
    rejects(() => services.products.list({ active: 1 }), 'VALIDATION');
    for (const resource of ['brands', 'categories']) {
      rejects(() => services[resource].create({ name: ' ' }), 'VALIDATION');
      rejects(() => services[resource].update(999, { name: 'Missing' }), 'NOT_FOUND');
      rejects(() => services[resource].deactivate(-1), 'VALIDATION');
      rejects(() => services[resource].create({ name: 'legacy' }), 'CONFLICT');
    }
    for (const search of ['tyre-01', 'MICHELIN', 'primacy', '195/65']) assert.equal(services.products.list({ search }).length, 1);
    for (const [field, term] of [['sku', 'TYRE'], ['brand', 'Michelin'], ['model', 'Prim'], ['size', 'R15']]) assert.equal(services.products.list({ [field]: term }).length, 1);
    assert.equal(services.products.list({ search: "' OR 1=1 --" }).length, 0);
    assert.equal(services.products.list({ search: '%' }).length, 0);
    const second = services.products.create({ ...data, sku: 'TYRE-02' });
    assert.equal(services.products.list({ limit: 1, offset: 1 })[0].id, second.id);
    rejects(() => services.products.update(second.id, { sku: 'TYRE-01' }), 'CONFLICT');
    assert.equal(services.products.getById(second.id).sku, 'TYRE-02');
    assert.equal(services.products.update(product.id, { model: 'Updated', default_selling_price: 0 }).model, 'Updated');
    assert.equal(services.brands.update(brand.id, { name: 'Michelin updated' }).name, 'Michelin updated');
    assert.equal(services.categories.update(category.id, { name: 'Passenger updated' }).name, 'Passenger updated');
    services.brands.deactivate(brand.id);
    services.categories.deactivate(category.id);
    assert.equal(services.brands.list({ active: false })[0].id, brand.id);
    assert.equal(services.categories.list({ active: false })[0].id, category.id);
    rejects(() => services.products.create({ ...data, sku: 'INACTIVE' }), 'VALIDATION');
    assert.equal(services.products.update(product.id, { notes: 'Preserved inactive links' }).brand_id, brand.id);
    services.products.deactivate(product.id);
    services.products.deactivate(product.id);
    assert.equal(services.products.list().length, 1);
    assert.equal(services.products.list({ active: false })[0].id, product.id);
    assert.equal(services.products.list({ active: 'all' }).length, 2);
    assert.equal(services.products.getById(product.id).stock_quantity, 0);
    const activeBrand = services.brands.create({ name: 'Rollback brand' });
    const activeCategory = services.categories.create({ name: 'Rollback category' });
    database.exec("CREATE TRIGGER test_inventory_failure BEFORE INSERT ON inventory BEGIN SELECT RAISE(ABORT, 'Simulated failure'); END;");
    assert.throws(() => services.products.create({ ...data, sku: 'ROLLBACK', brand_id: activeBrand.id, category_id: activeCategory.id }), /Simulated failure/);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM products WHERE sku='ROLLBACK'").get().n, 0);
    database.exec('DROP TRIGGER test_inventory_failure');
    console.log('PASS: migration preservation, catalog CRUD/deactivation, validation, search/pagination, zero inventory, transaction rollback.');

    const html = path.join(directory, 'ipc.html');
    fs.writeFileSync(html, '<!doctype html><title>Catalog IPC test</title>');
    window = new BrowserWindow({ show: false, webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
    } });
    const allowed = new Set([window.webContents]);
    const guard = createSenderGuard(allowed, pathToFileURL(html).href);
    unregister = registerCatalogIpc(ipcMain, services, guard);
    await window.loadFile(html);
    assert.equal(guard({ sender: window.webContents, senderFrame: window.webContents.mainFrame }), true);
    assert.equal(guard({ sender: window.webContents, senderFrame: { url: pathToFileURL(html).href } }), false);
    assert.equal(createSenderGuard(new Set(), pathToFileURL(html).href)({ sender: window.webContents, senderFrame: window.webContents.mainFrame }), false);
    const result = await window.webContents.executeJavaScript(`(async () => {
      const b = await window.api.brands.create({name:'IPC brand'});
      const c = await window.api.categories.create({name:'IPC category'});
      const p = await window.api.products.create({sku:'IPC-01', brand_id:b.data.id, category_id:c.data.id, model:'IPC model', size:'R16'});
      const results = [b,c,p,
        await window.api.brands.list(), await window.api.categories.list(),
        await window.api.brands.update(b.data.id,{name:'IPC brand updated'}),
        await window.api.categories.update(c.data.id,{name:'IPC category updated'}),
        await window.api.products.update(p.data.id,{notes:'IPC edit'}),
        await window.api.products.getById(p.data.id), await window.api.products.list({search:'IPC-01'}),
        await window.api.products.deactivate(p.data.id),
        await window.api.brands.deactivate(b.data.id), await window.api.categories.deactivate(c.data.id)];
      return {results, invalid:await window.api.products.create({sku:'INVALID'}),
        unknown:await window.api.products.list({sql:'SELECT * FROM products'}),
        node:typeof window.require, invoke:typeof window.api.invoke,
        methods:Object.fromEntries(Object.entries(window.api).map(([key,value])=>[key,Object.keys(value)]))};
    })()`);
    assert.ok(result.results.every((entry) => entry.ok), JSON.stringify(result));
    assert.equal(result.results[2].data.stock_quantity, 0);
    assert.equal(result.invalid.error.code, 'VALIDATION');
    assert.equal(result.unknown.error.code, 'VALIDATION');
    assert.equal(result.node, 'undefined');
    assert.equal(result.invoke, 'undefined');
    assert.equal(Object.values(result.methods).flat().length, 13);
    allowed.clear();
    const forbidden = await window.webContents.executeJavaScript('window.api.products.list()');
    assert.equal(forbidden.error.code, 'FORBIDDEN');
    allowed.add(window.webContents);
    await window.loadURL('data:text/html,<title>Untrusted</title>');
    assert.equal(guard({ sender: window.webContents, senderFrame: window.webContents.mainFrame }), false);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    console.log('PASS: all 13 preload APIs over real IPC, validation errors, untrusted sender/frame rejection, no renderer Node or generic invoke API.');
  } catch (error) {
    code = 1;
    console.error('FAIL:', error);
  } finally {
    unregister?.();
    window?.destroy();
    if (database?.open) database.close();
    // The deletion target is the unique temporary directory created by this test.
    fs.rmSync(directory, { recursive: true, force: true });
    clearTimeout(timeout);
    app.exit(code);
  }
}).catch((error) => { console.error(error); app.exit(1); });
