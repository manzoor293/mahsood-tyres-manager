const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { openDatabase } = require('../electron/database/index.cjs');
const { createSupplierService } = require('../electron/services/suppliers.cjs');
const { registerSupplierIpc } = require('../electron/ipc/suppliers.cjs');
const { createSenderGuard } = require('../electron/ipc/catalog.cjs');

const timeout = setTimeout(() => { console.error('FAIL: Supplier tests timed out'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mahsood-suppliers-'));
  let database, window, unregister;
  let code = 0;
  try {
    const filename = path.join(directory, 'test.sqlite3');
    database = openDatabase(filename);
    const service = createSupplierService(database);
    const row = service.create({ name: ' Alpha Tyres ', phone: ' +92 (300) 123-4567 ', address: ' Lahore ', notes: ' Wholesale ' });
    assert.equal(row.name, 'Alpha Tyres');
    assert.equal(row.phone, '+923001234567');
    assert.equal(row.address, 'Lahore');
    assert.equal(row.notes, 'Wholesale');
    assert.equal(row.active, 1);
    assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.equal(service.getById(row.id).name, row.name);
    const other = service.create({ name: 'Beta' });
    assert.equal(other.phone, null);
    assert.equal(service.list({ limit: 1, offset: 1 })[0].id, other.id);
    for (const search of ['ALPHA', '300123', 'lahore']) assert.equal(service.list({ search })[0].id, row.id);
    for (const search of ["' OR 1=1 --", '%', '_']) assert.equal(service.list({ search }).length, 0);
    const rejects = (fn, code = 'VALIDATION') => assert.throws(fn, (error) => error.code === code);
    for (const data of [{}, { name: ' ' }, { name: 'a'.repeat(201) }, { name: 'X', phone: 'abc' }, { name: 'X', phone: '123' }, { name: 'X', phone: '+1234567890123456' }, { name: 'X', phone: '12+3456789' }, { name: 'X', email: 'invalid' }, { name: 'X', active: 0 }, { name: 'X', company_name: 'unsupported' }, { name: 'X', notes: 'x'.repeat(5001) }]) rejects(() => service.create(data));
    rejects(() => service.update(row.id, {}));
    rejects(() => service.update(row.id, { phone: 'invalid', name: 'Should roll back' }));
    assert.equal(service.getById(row.id).name, 'Alpha Tyres');
    rejects(() => service.getById('1'));
    rejects(() => service.getById(999), 'NOT_FOUND');
    rejects(() => service.update(999, { name: 'Missing' }), 'NOT_FOUND');
    rejects(() => service.deactivate(999), 'NOT_FOUND');
    for (const filters of [{ limit: 501 }, { offset: -1 }, { active: 1 }, { sql: 'SELECT 1' }, { search: 12 }]) rejects(() => service.list(filters));
    const updated = service.update(row.id, { name: 'Alpha Updated', phone: '' });
    assert.equal(updated.phone, null);
    assert.equal(updated.address, 'Lahore');
    assert.equal(updated.created_at, row.created_at);
    assert.equal(service.deactivate(row.id).active, 0);
    assert.equal(service.deactivate(row.id).active, 0);
    assert.equal(service.list().length, 1);
    assert.equal(service.list({ active: false })[0].id, row.id);
    assert.equal(service.list({ active: 'all' }).length, 2);
    assert.equal(service.update(row.id, { notes: 'Retained' }).active, 0);
    // Existing invoice foreign keys must remain valid when a supplier is deactivated.
    database.prepare('INSERT INTO purchases(invoice_number,supplier_id,subtotal,total) VALUES (?,?,0,0)').run('TEST-LINK', other.id);
    service.deactivate(other.id);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.equal(database.prepare('SELECT supplier_id FROM purchases').get().supplier_id, other.id);
    database.close();
    database = openDatabase(filename);
    assert.equal(createSupplierService(database).getById(row.id).notes, 'Retained');
    console.log('PASS: supplier repository/service CRUD, phone normalization, validation, search, pagination, deactivation, persistence and retained references.');

    const html = path.join(directory, 'ipc.html');
    fs.writeFileSync(html, '<!doctype html><title>Supplier IPC test</title>');
    window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const allowed = new Set([window.webContents]);
    const guard = createSenderGuard(allowed, pathToFileURL(html).href);
    const ipcService = createSupplierService(database);
    unregister = registerSupplierIpc(ipcMain, ipcService, guard);
    await window.loadFile(html);
    const result = await window.webContents.executeJavaScript(`(async () => {
      const created = await window.api.suppliers.create({name:'IPC supplier',phone:'0300 1234567'});
      const id=created.data.id;
      return {results:[created,await window.api.suppliers.getById(id),await window.api.suppliers.list({search:'IPC'}),await window.api.suppliers.update(id,{name:'IPC edited'}),await window.api.suppliers.deactivate(id)],
        invalid:await window.api.suppliers.create({name:' '}),missing:await window.api.suppliers.getById(999),unknown:await window.api.suppliers.list({sql:'SELECT 1'}),
        keys:Object.keys(window.api.suppliers),node:typeof window.require,invoke:typeof window.api.invoke};
    })()`);
    assert.ok(result.results.every((entry) => entry.ok));
    assert.equal(result.results[0].data.phone, '03001234567');
    assert.equal(result.results[4].data.active, 0);
    assert.equal(result.invalid.error.code, 'VALIDATION');
    assert.equal(result.unknown.error.code, 'VALIDATION');
    assert.equal(result.missing.error.code, 'NOT_FOUND');
    assert.deepEqual(result.keys.sort(), ['create', 'deactivate', 'getById', 'list', 'update']);
    assert.equal(result.node, 'undefined'); assert.equal(result.invoke, 'undefined');
    allowed.clear();
    assert.equal((await window.webContents.executeJavaScript('window.api.suppliers.list()')).error.code, 'FORBIDDEN');
    assert.equal(guard({ sender: window.webContents, senderFrame: { url: pathToFileURL(html).href } }), false);
    // Exercise argument-count validation and sanitization without touching production data.
    const handlers = new Map();
    registerSupplierIpc({ handle: (channel, handler) => handlers.set(channel, handler) }, { ...ipcService, create: () => { throw new Error('private SQL details'); } }, () => true);
    assert.equal(handlers.get('suppliers:getById')({}).error.code, 'VALIDATION');
    assert.equal(handlers.get('suppliers:list')({}, {}, {}).error.code, 'VALIDATION');
    const originalError = console.error;
    try {
      console.error = () => {};
      assert.deepEqual(handlers.get('suppliers:create')({}, { name: 'Test' }), { ok: false, error: { code: 'INTERNAL', message: 'The supplier operation could not be completed.' } });
    } finally { console.error = originalError; }
    console.log('PASS: all five supplier preload/IPC APIs, argument and input validation, sender rejection and sanitized internal errors.');
  } catch (error) { code = 1; console.error('FAIL:', error); }
  finally {
    unregister?.(); window?.destroy(); if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    clearTimeout(timeout); app.exit(code);
  }
}).catch((error) => { console.error(error); app.exit(1); });
