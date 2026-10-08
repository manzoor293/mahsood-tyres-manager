const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { migrate, schemaVersion } = require('../database/migrate.cjs');
const { validateDatabase } = require('../database/backup-validation.cjs');
const { restorePaths, removeSidecars, writeMarker, recoverInterruptedRestore } = require('../database/restore-files.cjs');
const { CatalogError } = require('./validation.cjs');

function createBackupService({ app, dialogs, getDatabase, closeDatabase, reopen, gate, fileOps = fs, migrateDatabase = migrate }) {
  let busy = false;
  let unavailable = false;
  let lastBackup = null;
  const filename = getDatabase().name;
  const recoveryDirectory = path.join(app.getPath('userData'), 'recovery');
  const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  function protectPath(selected, restoring = false) {
    const target = path.resolve(fs.realpathSync(path.dirname(selected)), path.basename(selected)).toLowerCase();
    const live = fs.realpathSync(filename).toLowerCase();
    const internal = fs.realpathSync(path.dirname(filename)).toLowerCase() + path.sep;
    const recovery = path.resolve(recoveryDirectory).toLowerCase();
    if (target === live || target.startsWith(internal) || (!restoring && (target === recovery || target.startsWith(recovery + path.sep)))) {
      throw new CatalogError('PROTECTED_PATH', 'Choose a backup file outside the application database and recovery folders.');
    }
    if (fs.existsSync(selected)) {
      // Windows file IDs can exceed JavaScript's safe integer range.
      const stat = fs.lstatSync(selected, { bigint: true });
      const current = fs.statSync(filename, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.dev === current.dev && stat.ino === current.ino)) {
        throw new CatalogError('PROTECTED_PATH', 'Choose a regular backup file separate from the active database.');
      }
      if (fs.existsSync(selected + '-wal') || fs.existsSync(selected + '-shm')) {
        throw new CatalogError('ACTIVE_FILE', 'This file may be in use by SQLite. Choose a completed, standalone backup.');
      }
    }
  }
  async function snapshot(db, destination) {
    try {
      await db.backup(destination);
      // Convert the standalone snapshot to rollback-journal mode: no WAL dependency.
      const check = new Database(destination, { fileMustExist: true });
      try { check.pragma('journal_mode = DELETE'); validateDatabase(check); } finally { check.close(); }
      const fd = fs.openSync(destination, 'r+');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch (error) {
      try { fs.rmSync(destination, { force: true }); removeSidecars(destination); }
      catch (cleanupError) { console.error('Unable to remove incomplete snapshot:', cleanupError); }
      throw error;
    }
  }
  async function exclusive(operation) {
    if (unavailable) throw new CatalogError('RECOVERY_REQUIRED', 'Database recovery could not finish. Close and reopen the application. Your recovery backups have been retained.');
    if (busy || !gate.lock()) throw new CatalogError('BUSY', 'Another operation is running. Please wait and try again.');
    busy = true;
    try { return await operation(); }
    finally { busy = false; if (!unavailable) gate.unlock(); }
  }
  return {
    isBusy: () => busy,
    getInfo() {
      if (busy) throw new CatalogError('BUSY', 'Database maintenance is in progress. Please wait and refresh.');
      if (unavailable) throw new CatalogError('RECOVERY_REQUIRED', 'Close and reopen the application to finish database recovery.');
      const version = validateDatabase(getDatabase());
      const recoveryBackups = fs.existsSync(recoveryDirectory) ? fs.readdirSync(recoveryDirectory)
        .filter(name => /^pre-restore-backup-[0-9a-f-]+\.sqlite3$/.test(name))
        .map(name => { const stat = fs.statSync(path.join(recoveryDirectory, name)); return { name, createdAt: stat.mtime.toISOString(), size: stat.size }; })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
      return { status: 'Healthy', schemaVersion: version, location: filename, lastBackup, recoveryBackups };
    },
    create() {
      return exclusive(async () => {
        const result = await dialogs.showSaveDialog({ title: 'Create database backup', defaultPath: `mahsood-tyre-manager-backup-${timestamp()}.sqlite3`, filters: [{ name: 'SQLite backup', extensions: ['sqlite3'] }] });
        if (result.canceled || !result.filePath) return { canceled: true };
        protectPath(result.filePath);
        const stage = path.join(path.dirname(result.filePath), `.mahsood-backup-${randomUUID()}.sqlite3`);
        try {
          await snapshot(getDatabase(), stage);
          protectPath(result.filePath);
          fileOps.renameSync(stage, result.filePath);
          lastBackup = { name: path.basename(result.filePath), createdAt: new Date().toISOString() };
          return { canceled: false, ...lastBackup };
        } finally {
          try { fs.rmSync(stage, { force: true }); }
          catch (error) { console.error('Unable to clean temporary backup:', error); }
        }
      });
    },
    restore() {
      return exclusive(async () => {
        // Main-process confirmation cannot be bypassed by invoking preload directly.
        const confirmation = await dialogs.showMessageBox({ type: 'warning', title: 'Replace shop data?', message: 'Restoring a backup will replace the current shop data.', detail: 'A safety backup will be created first. Continue to choose a backup?', buttons: ['Cancel', 'Choose Backup'], defaultId: 0, cancelId: 0, noLink: true });
        if (confirmation.response !== 1) return { canceled: true };
        const result = await dialogs.showOpenDialog({ title: 'Restore database backup', properties: ['openFile'], filters: [{ name: 'SQLite backup', extensions: ['sqlite3', 'db', 'sqlite'] }] });
        if (result.canceled || !result.filePaths?.length) return { canceled: true };
        const selected = result.filePaths[0];
        protectPath(selected, true);
        const id = randomUUID();
        const files = restorePaths(filename, id);
        let source;
        let replacementStarted = false;
        try {
          source = new Database(selected, { readonly: true, fileMustExist: true });
          validateDatabase(source);
          await snapshot(source, files.stage);
          source.close(); source = null;
          const staged = new Database(files.stage, { fileMustExist: true });
          try { staged.pragma('foreign_keys = ON'); migrateDatabase(staged); validateDatabase(staged); } finally { staged.close(); }
          fs.mkdirSync(recoveryDirectory, { recursive: true });
          await snapshot(getDatabase(), files.safety);
          const checkpoint = getDatabase().pragma('wal_checkpoint(TRUNCATE)');
          if (checkpoint.some(row => row.busy)) throw new CatalogError('BUSY', 'Another database connection is active. Close it and try again.');
          writeMarker(filename, id);
          replacementStarted = true;
          closeDatabase();
          removeSidecars(filename);
          fileOps.renameSync(filename, files.previous);
          fileOps.renameSync(files.stage, filename);
          reopen();
          validateDatabase(getDatabase());
          fs.rmSync(files.marker);
          replacementStarted = false;
          // Retain the verified online safety backup; the checkpointed original is redundant.
          try { fs.rmSync(files.previous); } catch (error) { console.error('Unable to clean previous database:', error); }
          return { canceled: false, schemaVersion, safetyBackup: path.basename(files.safety) };
        } catch (error) {
          if (replacementStarted) {
            try { closeDatabase(); recoverInterruptedRestore(filename); reopen(); validateDatabase(getDatabase()); }
            catch (recoveryError) { unavailable = true; console.error('Restore recovery failed; files retained:', recoveryError); throw new CatalogError('RECOVERY_REQUIRED', 'Restore failed and recovery needs attention. Close and reopen the application. Recovery files have been retained.'); }
          }
          throw error;
        } finally {
          if (source) source.close();
          if (!unavailable) {
            try { fs.rmSync(files.stage, { force: true }); removeSidecars(files.stage); }
            catch (error) { console.error('Unable to clean temporary restore snapshot:', error); }
          }
        }
      });
    },
  };
}
module.exports = { createBackupService };
