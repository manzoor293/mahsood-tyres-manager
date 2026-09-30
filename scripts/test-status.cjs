const { app } = require('electron');
const path = require('node:path');
const { openDatabase } = require('../electron/database/index.cjs');
const { statusFixtures, verifyStatusBackend } = require('./status-fixtures.cjs');
if (!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use the isolated status test runner.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
app.whenReady().then(() => {
  let db, code = 0;
  try {
    db = openDatabase(path.join(process.env.MAHSOOD_UI_TEST_DATA, 'status.sqlite3'));
    verifyStatusBackend(db, statusFixtures(db));
  } catch (error) { console.error(error); code = 1; }
  finally { db?.close(); app.exit(code); }
});
