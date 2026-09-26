const {app,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {initializeDatabase}=require('../electron/database/index.cjs');
const {createDashboardService}=require('../electron/services/dashboard.cjs');
const {registerDashboardIpc}=require('../electron/ipc/dashboard.cjs');
const {createSenderGuard}=require('../electron/ipc/catalog.cjs');
const {seedDashboard}=require('./dashboard-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw new Error('Temporary profile required.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const timeout=setTimeout(()=>{console.error('Dashboard UI timeout');app.exit(1);},90000);
app.on('browser-window-created',(_,window)=>{
  // Install a delayed real handler before the page invokes it, to verify initial loading.
  const db=initializeDatabase(app);
  const service=createDashboardService(db,()=>new Date('2026-09-26T12:00:00'));
  const url=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
  const guard=createSenderGuard(new Set([window.webContents]),url);
  const handlers=new Map();registerDashboardIpc({handle:(name,fn)=>handlers.set(name,fn)},service,guard);
  let fail=false,calls=0;
  ipcMain.removeHandler('dashboard:getOverview');
  ipcMain.handle('dashboard:getOverview',async(...args)=>{
    calls++;await new Promise((resolve)=>setTimeout(resolve,350));
    return fail?{ok:false,error:{code:'INTERNAL',message:'Temporary dashboard failure'}}:handlers.get('dashboard:getOverview')(...args);
  });
  window.webContents.once('did-finish-load',async()=>{
    const evaluate=(code)=>window.webContents.executeJavaScript(code);
    const wait=async(condition)=>{for(let i=0;i<160;i++){if(await evaluate(condition))return;await new Promise((r)=>setTimeout(r,50));}throw new Error(`Timed out: ${condition}`);};
    const click=async(label)=>{const selector=`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;await wait(`Boolean(${selector})`);await evaluate(`${selector}.click()`);};
    const input=async(name,value)=>{await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);};
    const metric=(label,value)=>`document.querySelector('[data-metric="${label}"]')?.textContent.includes(${JSON.stringify(value)})`;
    try {
      await wait(`document.body.textContent.includes('Loading dashboard...')`);
      await wait(`document.body.textContent.includes('No business activity in this period.')`);
      assert.ok(await evaluate(metric('Sales Revenue','Rs. 0')));
      assert.ok(await evaluate(`document.body.textContent.includes('No products sold in this period.')&&document.body.textContent.includes('No active products need replenishment.')`));
      seedDashboard(db);const snapshot=db.serialize();await click('Refresh');
      await wait(metric('Sales Revenue','Rs. 59'));assert.ok(await evaluate(metric('Amount Received','Rs. 20')));
      assert.ok(await evaluate(metric('Gross Profit','Rs. 18.98')));assert.ok(await evaluate(metric('Customer Receivables','Rs. 44')));
      assert.ok(await evaluate(metric('Supplier Payables','Rs. 150')));assert.ok(await evaluate(metric('Stock Units','13')));
      assert.equal(await evaluate(`document.querySelectorAll('[data-top-product]').length`),2);
      assert.equal(await evaluate(`document.querySelector('[data-top-product]')?.getAttribute('data-top-product')`),'1');
      assert.equal(await evaluate(`document.querySelectorAll('[data-stock-alert]').length`),3);
      assert.equal(await evaluate(`document.querySelector('[data-stock-alert]')?.getAttribute('data-stock-alert')`),'4');
      assert.equal(await evaluate(`document.querySelector('[data-activity]')?.getAttribute('data-activity')`),'Stock adjustment-9');
      await evaluate(`document.querySelector('summary').click()`);
      assert.equal(await evaluate(`document.querySelectorAll('table[aria-label="Sales trend values"] tbody tr').length`),26);
      assert.ok(await evaluate(`document.querySelector('svg[aria-label="Daily sales revenue trend"]')!==null`));
      await input('dashboard-period','today');await wait(`document.querySelector('[data-dashboard-range]')?.textContent.includes('2026-09-26 – 2026-09-26')`);assert.ok(await evaluate(metric('Sales Revenue','Rs. 0')));
      await input('dashboard-period','week');await wait(`document.querySelector('[data-dashboard-range]')?.textContent.includes('2026-09-20')`);
      await input('dashboard-period','year');await wait(`Boolean(document.querySelector('svg[aria-label="Monthly sales revenue trend"]'))`);
      await input('dashboard-period','custom');await wait(`Boolean(document.querySelector('[name="dashboard-from_date"]'))`);
      await input('dashboard-from_date','2026-10-01');await input('dashboard-to_date','2026-10-31');await click('Apply dates');
      await wait(metric('Gross Profit','Incomplete'));assert.ok(await evaluate(metric('Sales Revenue','Rs. 7.01')));
      assert.ok(await evaluate(`document.body.textContent.includes('1 historical sale item(s) have zero cost')`));
      await input('dashboard-from_date','2026-11-01');await click('Apply dates');await wait(`document.body.textContent.includes('From date must not follow To date.')`);
      await input('dashboard-period','month');await wait(metric('Sales Revenue','Rs. 59'));
      fail=true;await click('Refresh');await wait(`document.body.textContent.includes('Temporary dashboard failure')`);
      fail=false;await click('Retry');await wait(metric('Sales Revenue','Rs. 59'));
      assert.ok(calls>=10);assert.deepEqual(db.serialize(),snapshot,'UI analytics must be read-only');
      assert.deepEqual(await evaluate('Object.keys(window.api.dashboard)'),['getOverview']);
      assert.equal(await evaluate('typeof window.require'),'undefined');
      assert.equal(window.webContents.getLastWebPreferences().contextIsolation,true);assert.equal(window.webContents.getLastWebPreferences().nodeIntegration,false);
      // DOM assertions can precede the compositor's next frame, especially after retry.
      await new Promise((resolve)=>setTimeout(resolve,250));
      fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
      fs.writeFileSync(path.join(__dirname,'../artifacts/dashboard-ui.png'),(await window.webContents.capturePage()).toPNG());
      window.setSize(640,480);await new Promise((r)=>setTimeout(r,250));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      fs.writeFileSync(path.join(__dirname,'../artifacts/dashboard-narrow.png'),(await window.webContents.capturePage()).toPNG());
      await evaluate(`document.querySelector('a[href="#/inventory"]:not(nav a)').click()`);await wait(`document.querySelector('h1')?.textContent==='Inventory'`);
      console.log('PASS: Dashboard real renderer/preload/IPC loading, summaries, periods/custom validation, trends, top products, alerts/navigation, recent activity, unknown costs, empty/error/retry, narrow layout and read-only data.');
      clearTimeout(timeout);app.quit();
    } catch(error){console.error(error);app.exit(1);}
  });
});
require('../electron/main.cjs');
