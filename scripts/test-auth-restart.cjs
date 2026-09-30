const { app } = require('electron');
const assert = require('node:assert/strict');
if (!process.env.MAHSOOD_UI_TEST_DATA || !process.env.MAHSOOD_AUTH_TEST_PASSWORD) throw new Error('Isolated parent auth test required.');
app.setPath('userData', process.env.MAHSOOD_UI_TEST_DATA);
app.setPath('sessionData', process.env.MAHSOOD_UI_TEST_DATA);
const timeout = setTimeout(() => app.exit(1), 30000);
app.on('browser-window-created', (_, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const evaluate = code => window.webContents.executeJavaScript(code);
      const restarting = process.argv.includes('restart');
      const status = await evaluate('window.api.auth.getStatus()');
      assert.deepEqual(status.data, { hasAdministrator: restarting, authenticated: false });
      assert.equal((await evaluate('window.api.products.list()')).error.code, 'UNAUTHENTICATED');
      const input = { email: 'restart@example.test', password: process.env.MAHSOOD_AUTH_TEST_PASSWORD };
      if (!restarting) input.confirmPassword = input.password;
      assert.equal((await evaluate(`window.api.auth.${restarting ? 'login' : 'setup'}(${JSON.stringify(input)})`)).ok, true);
      console.log(`PASS: full Electron ${restarting ? 'restart requires login with persisted account' : 'initial setup'}.`);
      clearTimeout(timeout); app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require('../electron/main.cjs');
