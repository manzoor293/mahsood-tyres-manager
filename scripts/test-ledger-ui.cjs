const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const { initializeDatabase } = require('../electron/database/index.cjs');
const { seedPrinting } = require('./printing-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA) throw Error('Temporary profile required');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const timeout=setTimeout(()=>{console.error('Ledger UI timeout');app.exit(1);},120000);
app.on('browser-window-created',(_,window)=>{
  const db=initializeDatabase(app);seedPrinting(db);
  db.exec("UPDATE customers SET active=0 WHERE id=1; INSERT INTO customers(id,name) VALUES(2,'Empty customer');");
  let fail=false;
  const service=require('../electron/services/ledger.cjs').createLedgerService(db);
  const authorized=require('../electron/ipc/auth.cjs').createAuthorizedIpc(ipcMain,{isAuthenticated:()=>true},()=>true);
  ipcMain.removeHandler('ledger:getStatement');
  authorized.handle('ledger:getStatement',async(_,input)=>{
    await new Promise(resolve=>setTimeout(resolve,200));
    return fail?{ok:false,error:{code:'INTERNAL',message:'Temporary ledger failure'}}:{ok:true,data:service.getStatement(input)};
  });
  window.webContents.once('did-finish-load',async()=>{
    const evaluate=code=>window.webContents.executeJavaScript(code);
    async function wait(condition){for(let i=0;i<160;i++){if(await evaluate(condition))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error(`Timed out: ${condition}`);}
    async function click(label){const selector=`Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled)`;await wait(`Boolean(${selector})`);await evaluate(`${selector}.click()`);}
    async function input(name,value){await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
    async function lookup(field,label){await input(`report-${field}`,label);await evaluate(`document.querySelector('[name="report-${field}"]').focus()`);await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(e=>e.textContent.includes(${JSON.stringify(label)}))`);await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.includes(${JSON.stringify(label)})).click()`);}
    const ready=()=>wait("Boolean(document.querySelector('[data-ledger-metric]'))");
    try {
      await require('./auth-test-helper.cjs').authenticate(window);
      await evaluate("location.hash='/ledger'");await wait("Boolean(document.querySelector('[data-ledger-page]'))");
      assert.ok(await evaluate("document.body.textContent.includes('Select a customer or supplier')"));
      await lookup('customer_id','Return Customer');await wait("document.body.textContent.includes('Loading ledger...')");await ready();
      assert.equal(await evaluate("document.querySelector('table th').textContent"),'S.NO');
      assert.ok(await evaluate("document.body.textContent.includes('Inactive account')"));
      assert.ok(await evaluate("document.querySelector('[data-ledger-metric=\"Closing Balance\"]').textContent.includes('155')"));
      await input('ledger-from','2026-09-26');await input('ledger-to','2026-09-26');await click('Apply filters');await ready();
      await wait("document.body.textContent.includes('2026-09-26 to 2026-09-26')");
      assert.ok(await evaluate("document.querySelector('[data-ledger-metric=\"Opening Balance\"]').textContent.includes('-95.01')"));
      await click('Preview / Print / Save as PDF');await wait("Boolean(document.querySelector('iframe'))");
      const html=await evaluate("document.querySelector('iframe').srcdoc");assert.ok(html.includes('CUSTOMER LEDGER STATEMENT'));assert.ok(html.includes('S.NO'));assert.ok(html.includes('<h1>Mahsood Tyres</h1>'));
      await click('Close Preview');
      await input('ledger-from','2026-09-27');await click('Apply filters');await wait("document.body.textContent.includes('From date must not follow To date.')");
      await click('Reset filters');await wait("document.body.textContent.includes('Select a customer or supplier')");
      await lookup('customer_id','Empty customer');await ready();assert.ok(await evaluate("document.body.textContent.includes('This account has no transactions.')"));
      await click('Supplier Ledger');await lookup('supplier_id','Return Supplier');await ready();
      assert.ok(await evaluate("document.querySelector('[data-ledger-metric=\"Closing Balance\"]').textContent.includes('-60')"));
      await click('Preview / Print / Save as PDF');await wait("Boolean(document.querySelector('iframe'))");assert.ok((await evaluate("document.querySelector('iframe').srcdoc")).includes('SUPPLIER LEDGER STATEMENT'));await click('Close Preview');
      await input('ledger-from','2027-01-01');await click('Apply filters');await wait("document.body.textContent.includes('No transactions in the selected date range.')");
      fail=true;await click('Apply filters');await wait("document.body.textContent.includes('Temporary ledger failure')");fail=false;await click('Retry');await ready();
      for(let i=0;i<30;i++)db.prepare("INSERT INTO purchases(invoice_number,supplier_id,subtotal,total,purchased_at) VALUES(?,1,100,100,'2026-10-01')").run(`UI-PUR-${i}`);
      await input('ledger-from','');await click('Apply filters');await wait("document.querySelector('table tbody')?.rows.length===25");
      const closing=await evaluate("document.querySelector('[data-ledger-metric=\"Closing Balance\"]').textContent");
      await click('Go to next page');await wait("document.querySelector('table tbody tr td')?.textContent==='26'");
      assert.equal(await evaluate("document.querySelector('[data-ledger-metric=\"Closing Balance\"]').textContent"),closing);
      await click('Preview / Print / Save as PDF');await wait("Boolean(document.querySelector('iframe'))");
      assert.equal(((await evaluate("document.querySelector('iframe').srcdoc")).match(/data-ledger-row=/g)||[]).length,33);await click('Close Preview');
      window.setSize(640,480);await new Promise(resolve=>setTimeout(resolve,250));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      assert.equal(await evaluate('typeof window.require'),'undefined');
      console.log('PASS Ledger UI: route, both tabs, searchable/inactive accounts, S.NO first, loading/empty/error/retry, dates/reset/validation, opening/closing balances, customer/supplier PDF previews and 640px layout.');
      clearTimeout(timeout);app.quit();
    } catch(error){console.error(error);app.exit(1);}
  });
});
require('../electron/main.cjs');
