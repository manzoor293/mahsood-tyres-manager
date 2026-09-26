const fs = require('node:fs');
const path = require('node:path');

const migrations = ['001-initial.sql', '002-catalog-status.sql', '003-expense-category-status.sql', '004-returns.sql'];
const schemaVersion = migrations.length;

function migrate(database) {
  // One write lock covers version inspection, schema changes and version updates.
  database.transaction(() => {
    const version = database.pragma('user_version', { simple: true });
    if (version > migrations.length) {
      throw new Error(`Database version ${version} is newer than supported version ${migrations.length}.`);
    }
    for (let index = version; index < migrations.length; index += 1) {
      database.exec(fs.readFileSync(path.join(__dirname, 'migrations', migrations[index]), 'utf8'));
      database.pragma(`user_version = ${index + 1}`);
    }
  }).immediate();
}

module.exports = { migrate, schemaVersion };
