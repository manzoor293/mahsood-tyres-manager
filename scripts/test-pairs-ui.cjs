const { app } = require('electron');
const assert = require('node:assert/strict');
const { initializeDatabase } = require('../electron/database/index.cjs');
const root = process.env.MAHSOOD_UI_TEST_DATA;
if (!root) throw Error('Temporary profile required');
app.setPath('userData', root);
app.setPath('sessionData', root);
const timeout = setTimeout(() => { console.error('Pair UI timeout'); app.exit(1); }, 60000);
app.on('browser-window-created', (_, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      await require('./auth-test-helper.cjs').authenticate(window);
      const db = initializeDatabase(app);
      db.exec("INSERT INTO products(sku,model,size,default_selling_price,minimum_stock) VALUES('LEGACY-PAIR-UI','Legacy model','R15',6500000,5)");
      const evaluate = async code => {
        try { return await window.webContents.executeJavaScript(code); }
        catch (error) { console.error('Renderer expression:', code); throw error; }
      };
      const wait = async condition => {
        for (let i = 0; i < 160; i++) {
          if (await evaluate(condition)) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error(`Timed out: ${condition}`);
      };
      const click = async label => {
        const selector = `Array.from(document.querySelectorAll('button')).find(b => (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)}) && !b.disabled)`;
        await wait(`Boolean(${selector})`); await evaluate(`${selector}.click()`);
      };
      const input = async (name, value) => evaluate(`(() => {const e=document.querySelector('[name="${name}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await evaluate('location.hash="/products"');
      await wait('document.querySelector("tbody")?.textContent.includes("LEGACY-PAIR-UI")');
      await evaluate('document.querySelector("tbody button[aria-label^=Edit]").click()');
      await wait('Boolean(document.querySelector("[name=price]"))');
      assert.equal(await evaluate('document.querySelector("[name=price]").value'), '130000.00');
      assert.equal(await evaluate('document.querySelector("[name=minimum_stock]").value'), '');
      assert.ok(await evaluate('document.querySelector("[role=dialog]").textContent.includes("1 tyre")'));
      await input('model', 'Unrelated UI edit');
      await click('Save Changes');
      await wait('!document.querySelector("[role=dialog]")');
      const original = db.prepare('SELECT * FROM products WHERE sku=?').get('LEGACY-PAIR-UI');
      assert.equal(original.model, 'Unrelated UI edit');
      assert.equal(original.default_selling_price, 6500000);
      assert.equal(original.minimum_stock, 5);
      assert.equal(original.price_units_per_unit, 1);
      await wait('Boolean(document.querySelector("tbody button[aria-label^=Edit]"))');
      await evaluate('document.querySelector("tbody button[aria-label^=Edit]").click()');
      await wait('Boolean(document.querySelector("[name=price]"))');
      await input('price', '130000.01');
      await input('minimum_stock', '3');
      await click('Save Changes');
      await wait('!document.querySelector("[role=dialog]")');
      const updated = db.prepare('SELECT * FROM products WHERE id=?').get(original.id);
      assert.equal(updated.default_selling_price, 13000001);
      assert.equal(updated.minimum_stock, 6);
      assert.equal(updated.price_units_per_unit, 2);
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      console.log('PASS focused pair UI: legacy pair display, odd threshold, unrelated edit preservation and explicit pair price/minimum conversion');
      clearTimeout(timeout); app.quit();
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require('../electron/main.cjs');
