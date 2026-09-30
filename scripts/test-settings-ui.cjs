const { app, ipcMain, dialog } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { seedPrinting } = require('./printing-fixtures.cjs');
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw Error('Temporary profile required');
app.setPath('userData', root); app.setPath('sessionData', root);
const timeout = setTimeout(() => { console.error('Settings UI timeout'); app.exit(1); }, 120000);
let failLoad = true, failSave = false, saves = 0, releaseSave;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, handler) => handle(name, async (...args) => {
  if (name === 'settings:getShopProfile') {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (failLoad) return { ok: false, error: { code: 'INTERNAL', message: 'Temporary profile failure' } };
  }
  if (name === 'settings:updateShopProfile') {
    saves++;
    await new Promise(resolve => { releaseSave = resolve; });
    if (failSave) return { ok: false, error: { code: 'INTERNAL', message: 'Temporary save failure' } };
  }
  return handler(...args);
});
const backupFile = path.join(root, 'profile.sqlite3');
dialog.showSaveDialog = async () => ({ canceled: false, filePath: backupFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [backupFile] });
dialog.showMessageBox = async () => ({ response: 1 });
let attached = false;
app.on('browser-window-created', (_, window) => {
  if (attached) return; attached = true;
  seedPrinting(initializeDatabase(app));
  window.webContents.once('did-finish-load', async () => {
    await require('./auth-test-helper.cjs').authenticate(window);
    const evaluate = code => window.webContents.executeJavaScript(code);
    const wait = async condition => { for (let i = 0; i < 200; i++) { if (await evaluate(condition)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error(`Timed out: ${condition}`); };
    const button = label => `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
    const click = async label => { await wait(`Boolean(${button(label)}) && !${button(label)}.disabled`); await evaluate(`${button(label)}.click()`); };
    const text = value => wait(`document.body.textContent.includes(${JSON.stringify(value)})`);
    const field = name => `document.querySelector('[name="shop-${name}"]')`;
    const edit = async (name, value) => {
      await evaluate(`(() => { const element = ${field(name)}; Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    };
    const save = async () => { releaseSave = null; await click('Save Changes'); for (let i = 0; !releaseSave && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(releaseSave); };
    try {
      await evaluate('location.hash="/settings"'); await text('Loading shop profile...'); await text('Temporary profile failure');
      failLoad = false; await click('Retry Profile'); await wait(`Boolean(${field('name')})`);
      await text('Data Backup & Restore'); await text('Database Status: Healthy'); await text('Pakistani Rupee (PKR)');
      assert.deepEqual(await evaluate('Object.keys(window.api.settings).sort()'), ['getPreferences', 'getShopProfile', 'updateShopProfile']);
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      assert.equal(await evaluate(`${field('name')}.value`), 'Mahsood Test Shop');
      assert.equal(await evaluate(`${button('Save Changes')}.disabled`), true);
      await edit('name', 'UI Configured Shop'); await edit('footer', 'Thank you from UI'); await text('You have unsaved changes.');
      await save(); await text('Saving shop settings...');
      assert.equal(await evaluate(`${button('Save Changes')}.disabled && ${button('Create Backup')}.disabled`), true);
      await evaluate(`document.querySelector('form[aria-label="Shop settings"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
      assert.equal(saves, 1); releaseSave(); await text('Shop settings saved.');
      assert.equal(await evaluate(`${button('Save Changes')}.disabled`), true);
      const preview = await evaluate("window.api.printing.preview('saleInvoice', 1)");
      assert.equal(preview.ok, true); assert.match(preview.data.html, /UI Configured Shop/); assert.match(preview.data.html, /Thank you from UI/); assert.doesNotMatch(preview.data.html, /Historical unit cost/);
      await edit('email', 'invalid'); await save(); releaseSave(); await text('Enter a valid email address.'); await click('Discard Changes');
      await edit('name', ''); await save(); releaseSave(); await text('Shop name is required'); await click('Discard Changes');
      failSave = true; await edit('name', 'Retry saved'); await save(); releaseSave(); await text('Temporary save failure');
      failSave = false; await save(); releaseSave(); await text('Shop settings saved.');
      await evaluate('location.hash="/"'); await wait(`!document.querySelector('form[aria-label="Shop settings"]')`);
      await evaluate('location.hash="/settings"'); await wait(`${field('name')}?.value === 'Retry saved'`);
      await click('Create Backup'); await text('Backup created: profile.sqlite3');
      await edit('name', 'After backup'); await save(); releaseSave(); await text('Shop settings saved.');
      await click('Restore Backup'); await text('Restore shop data?');
      await evaluate(`document.querySelector('input[type="checkbox"]').click()`); await click('Continue to Restore');
      await text('Sign in to Mahsood Tyre Manager'); await require('./auth-test-helper.cjs').authenticate(window); await wait(`${field('name')}?.value === 'Retry saved'`);
      const restored = await evaluate("window.api.printing.preview('saleInvoice', 1)"); assert.match(restored.data.html, /Retry saved/);
      window.setSize(640, 480); await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      console.log('PASS Settings UI: real renderer/preload/IPC, loading/retry, dirty/discard, save/duplicate prevention, validation/backend errors/retry, persisted navigation reload, print integration, backup/restore refresh and narrow layout.');
      clearTimeout(timeout); app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require('../electron/main.cjs');
