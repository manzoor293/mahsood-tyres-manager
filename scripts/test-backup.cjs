const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { openDatabase } = require('../electron/database/index.cjs');
const { createBackupService } = require('../electron/services/backup.cjs');
const { createMaintenanceGate } = require('../electron/ipc/maintenance.cjs');
const { registerBackupIpc } = require('../electron/ipc/backup.cjs');
const { inspectFile } = require('../electron/database/backup-validation.cjs');
const { restorePaths, writeMarker, recoverInterruptedRestore } = require('../electron/database/restore-files.cjs');
const { seedBackup, allData } = require('./backup-fixtures.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw Error('Temporary profile required');
const root = process.env.MAHSOOD_UI_TEST_DATA;
app.setPath('userData', root); app.setPath('sessionData', root);
app.whenReady().then(async () => {
  let db, code = 0;
  try {
    const filename = path.join(root, 'database', 'test.sqlite3');
    db = openDatabase(filename);
    seedBackup(db);
    const expected = allData(db);
    assert.equal(Object.keys(expected).filter(name => !name.startsWith('sqlite_')).length, 20);
    let selected = path.join(root, 'backup.sqlite3'), canceled = false, confirm = true, pause = null, failRename = false, failReopen = false, failMigration = false;
    const handlers = new Map();
    const gate = createMaintenanceGate({ handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) });
    gate.ipc.handle('business:test', () => ({ ok: true }));
    const service = createBackupService({ app, gate, getDatabase: () => db,
      closeDatabase: () => { if (db?.open) db.close(); },
      reopen: () => { if (failReopen) { failReopen = false; throw Error('Injected reopen failure'); } db = openDatabase(filename); },
      fileOps: { renameSync: (...args) => { if (failRename && args[0].includes('.restore-')) throw Object.assign(Error('Injected replacement failure'), { code: 'EPERM' }); fs.renameSync(...args); } },
      migrateDatabase: staged => { if (failMigration) throw Error('Injected migration failure'); require('../electron/database/migrate.cjs').migrate(staged); },
      dialogs: {
        showSaveDialog: async options => { assert.match(options.defaultPath, /^mahsood-tyre-manager-backup-[\w-]+\.sqlite3$/); if (pause) await pause; return { canceled, filePath: selected }; },
        showOpenDialog: async () => ({ canceled, filePaths: [selected] }),
        showMessageBox: async options => { assert.equal(options.defaultId, 0); return { response: confirm ? 1 : 0 }; },
      },
    });
    assert.equal(service.getInfo().schemaVersion, 4);
    assert.equal((await service.create()).canceled, false);
    assert.deepEqual(allData(db), expected); assert.equal(inspectFile(selected), 4);
    let backup = new Database(selected, { readonly: true }); assert.deepEqual(allData(backup), expected); backup.close();
    assert.equal(fs.existsSync(selected + '-wal'), false);
    db.prepare('UPDATE products SET model=?').run('Changed after backup');
    const changed = allData(db);
    assert.ok(fs.statSync(filename + '-wal').size > 0);
    const restored = await service.restore();
    assert.deepEqual(allData(db), expected);
    backup = new Database(path.join(root, 'recovery', restored.safetyBackup), { readonly: true }); assert.deepEqual(allData(backup), changed); backup.close();
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal'); assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal((await handlers.get('business:test')()).ok, true);
    console.log('PASS Backup roundtrip: service-created purchases, inventory, sales, both payments, expenses, both returns, contacts, catalog and settings exactly restored; verified safety snapshot.');
    // User cancellations and mutual exclusion while a native dialog is pending.
    canceled = true; assert.equal((await service.create()).canceled, true); assert.equal((await service.restore()).canceled, true); canceled = false;
    confirm = false; assert.equal((await service.restore()).canceled, true); confirm = true;
    let release; pause = new Promise(resolve => { release = resolve; });
    const pending = service.create();
    await assert.rejects(service.create(), error => error.code === 'BUSY'); await assert.rejects(service.restore(), error => error.code === 'BUSY');
    assert.equal((await handlers.get('business:test')()).error.code, 'MAINTENANCE');
    release(); await pending; pause = null;
    for (const protectedFile of [filename, filename + '-wal', path.join(root, 'database', 'other.sqlite3')]) {
      selected = protectedFile; await assert.rejects(service.create(), error => error.code === 'PROTECTED_PATH');
    }
    selected = path.join(root, 'hardlink.sqlite3'); fs.linkSync(filename, selected);
    await assert.rejects(service.create(), error => error.code === 'PROTECTED_PATH'); fs.rmSync(selected);
    const validFile = path.join(root, 'backup.sqlite3');
    selected = validFile;
    const published = fs.readFileSync(selected);
    const originalBackup = db.backup;
    for (const failure of ['verification', 'disk-full', 'permission']) {
      db.backup = async destination => {
        if (failure === 'verification') { fs.writeFileSync(destination, 'invalid snapshot'); return; }
        throw Object.assign(Error('Injected snapshot failure'), { code: failure === 'disk-full' ? 'ENOSPC' : 'EACCES' });
      };
      await assert.rejects(service.create());
      assert.deepEqual(fs.readFileSync(selected), published, 'A failed backup must not overwrite an existing valid backup');
      assert.deepEqual(allData(db), expected);
    }
    db.backup = originalBackup;
    const restoring = service.restore();
    await assert.rejects(service.restore(), error => error.code === 'BUSY');
    await assert.rejects(service.create(), error => error.code === 'BUSY');
    await restoring;
    let finishBusiness;
    gate.ipc.handle('business:pending', () => new Promise(resolve => { finishBusiness = resolve; }));
    const business = handlers.get('business:pending')();
    await assert.rejects(service.create(), error => error.code === 'BUSY');
    finishBusiness({ ok: true }); await business;
    // Invalid headers, corrupt pages, unrelated SQLite and newer metadata are rejected without changing live data.
    for (const kind of ['text', 'corrupt', 'unrelated', 'newer', 'foreign-key', 'unexpected-trigger']) {
      selected = path.join(root, `${kind}.sqlite3`);
      if (kind === 'text') fs.writeFileSync(selected, 'not SQLite');
      else if (kind === 'unrelated') { const file = new Database(selected); file.exec('CREATE TABLE unrelated(id); PRAGMA user_version=4'); file.close(); }
      else {
        fs.copyFileSync(validFile, selected);
        if (kind === 'corrupt') fs.truncateSync(selected, 300);
        else { const file = new Database(selected); if (kind === 'newer') file.pragma('user_version=5');
          if (kind === 'foreign-key') { file.pragma('foreign_keys=OFF'); file.exec('UPDATE products SET brand_id=999'); }
          if (kind === 'unexpected-trigger') file.exec('CREATE TRIGGER unexpected AFTER INSERT ON settings BEGIN DELETE FROM products; END');
          file.close(); }
      }
      await assert.rejects(service.restore()); assert.deepEqual(allData(db), expected);
    }
    selected = path.join(root, 'missing.sqlite3'); await assert.rejects(service.restore()); assert.deepEqual(allData(db), expected);
    // Migration/replacement/reopen failure leaves the original data available to services.
    selected = validFile; db.exec("UPDATE products SET model='Preserve on failure'"); const preserved = allData(db);
    failMigration = true; await assert.rejects(service.restore(), /migration failure/); failMigration = false; assert.deepEqual(allData(db), preserved);
    failRename = true; await assert.rejects(service.restore(), /replacement failure/); failRename = false; assert.deepEqual(allData(db), preserved);
    failReopen = true; await assert.rejects(service.restore(), /reopen failure/); assert.deepEqual(allData(db), preserved);
    // Test each supported older schema through the actual forward migrations.
    const migrationFiles = fs.readdirSync(path.join(__dirname, '../electron/database/migrations')).sort();
    for (const version of [1, 2, 3]) {
      selected = path.join(root, `old-${version}.sqlite3`); const old = new Database(selected);
      for (const file of migrationFiles.slice(0, version)) old.exec(fs.readFileSync(path.join(__dirname, '../electron/database/migrations', file), 'utf8'));
      old.pragma(`user_version=${version}`); old.exec("INSERT INTO settings(key,value) VALUES('old','preserved')"); old.close();
      await service.restore(); assert.equal(db.pragma('user_version', { simple: true }), 4); assert.equal(db.prepare("SELECT value FROM settings WHERE key='old'").get().value, 'preserved');
    }
    // Simulate process interruption after each rename, including stale sidecars for the replacement.
    selected = validFile; await service.restore();
    for (const afterReplacement of [false, true]) {
      const id = randomUUID(), files = restorePaths(filename, id); await db.backup(files.safety); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();
      writeMarker(filename, id); fs.renameSync(filename, files.previous);
      if (afterReplacement) { fs.copyFileSync(validFile, filename); fs.writeFileSync(filename + '-wal', 'stale WAL'); fs.writeFileSync(filename + '-shm', 'stale SHM'); }
      assert.equal(recoverInterruptedRestore(filename), true); assert.equal(fs.existsSync(filename + '-wal'), false); assert.equal(fs.existsSync(filename + '-shm'), false);
      db = openDatabase(filename); assert.deepEqual(allData(db), expected);
    }
    for (const fallback of ['missing-original', 'corrupt-original', 'before-replacement']) {
      const id = randomUUID(), files = restorePaths(filename, id);
      await db.backup(files.safety); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();
      writeMarker(filename, id);
      if (fallback !== 'before-replacement') fs.renameSync(filename, files.previous);
      if (fallback === 'missing-original') fs.rmSync(files.previous);
      if (fallback === 'corrupt-original') fs.writeFileSync(files.previous, 'damaged original');
      assert.equal(recoverInterruptedRestore(filename), true);
      db = openDatabase(filename); assert.deepEqual(allData(db), expected);
    }
    const ipc = new Map(); registerBackupIpc({ handle: (name, fn) => ipc.set(name, fn) }, service, event => event.trusted);
    for (const handler of ipc.values()) { assert.equal((await handler({ trusted: false })).error.code, 'FORBIDDEN'); assert.equal((await handler({ trusted: true }, 'arbitrary/path')).error.code, 'VALIDATION'); }
    assert.equal(service.getInfo().status, 'Healthy');
    console.log('PASS Backup backend: integrity/schema, unchanged live WAL data, safety backups, cancellations, concurrency/business lock, protected paths/hardlinks, invalid/corrupt/unrelated/newer/FK/trigger rejection, migrations 1–3 → 4, migration/replacement/reopen failures, interrupted replacement and stale sidecar recovery, IPC guards.');
  } catch (error) { code = 1; console.error(error); }
  finally { if (db?.open) db.close(); app.exit(code); }
});
