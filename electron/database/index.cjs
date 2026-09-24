const fs = require('node:fs');
const path = require('node:path');
const { migrate } = require('./migrate.cjs');

let connection;

function openDatabase(filename, { readonly = false } = {}) {
  if (process.type !== 'browser') {
    throw new Error('The database may only be opened in the Electron main process.');
  }
  const Database = require('better-sqlite3');
  if (!readonly) fs.mkdirSync(path.dirname(filename), { recursive: true });
  const database = new Database(filename, { readonly, fileMustExist: readonly });
  try {
    database.pragma('foreign_keys = ON');
    if (!readonly) {
      database.pragma('journal_mode = WAL');
      database.pragma('synchronous = FULL');
      migrate(database);
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function getDatabasePath(app) {
  return path.join(app.getPath('userData'), 'database', 'mahsood-tyre-manager.sqlite3');
}

function initializeDatabase(app) {
  if (!app.isReady()) throw new Error('Initialize the database after Electron is ready.');
  if (!connection) {
    connection = openDatabase(getDatabasePath(app));
  }
  return connection;
}

function closeDatabase() {
  if (connection) {
    connection.close();
    connection = undefined;
  }
}

module.exports = { initializeDatabase, closeDatabase, openDatabase, getDatabasePath };
