const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { schemaVersion } = require('./migrate.cjs');
const { CatalogError } = require('../services/validation.cjs');
const schemas = new Map();
function schema(db) {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
}
function expectedSchema(version) {
  if (!schemas.has(version)) {
    const db = new Database(':memory:');
    try {
      const files = fs.readdirSync(path.join(__dirname, 'migrations')).filter(name => /^\d{3}.*\.sql$/.test(name)).sort();
      for (const file of files.slice(0, version)) db.exec(fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8'));
      schemas.set(version, JSON.stringify(schema(db)));
    } finally { db.close(); }
  }
  return schemas.get(version);
}
function validateDatabase(db) {
  const version = db.pragma('user_version', { simple: true });
  if (version > schemaVersion) throw new CatalogError('NEWER_SCHEMA', `This backup uses schema ${version}. This app supports schema ${schemaVersion}. Update the application before restoring it.`);
  if (version < 1 || JSON.stringify(schema(db)) !== expectedSchema(version)) {
    throw new CatalogError('INVALID_BACKUP', 'This file is not a recognized Mahsood Tyre Manager database.');
  }
  const integrity = db.pragma('integrity_check');
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || db.pragma('foreign_key_check').length) {
    throw new CatalogError('INVALID_BACKUP', 'The database failed its integrity check. Choose another backup.');
  }
  return version;
}
function inspectFile(filename) {
  let db;
  try {
    db = new Database(filename, { readonly: true, fileMustExist: true });
    return validateDatabase(db);
  } finally { if (db) db.close(); }
}
module.exports = { validateDatabase, inspectFile };
