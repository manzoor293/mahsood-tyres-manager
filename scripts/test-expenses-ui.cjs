const {app,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {initializeDatabase}=require('../electron/database/index.cjs');
const {createExpenseServices}=require('../electron/services/expenses.cjs');
const {registerExpenseIpc}=require('../electron/ipc/expenses.cjs');
const {createSenderGuard}=require('../electron/ipc/catalog.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw new Error('Use npm run test:expenses:ui for temporary data.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const timeout=setTimeout(()=>{console.error('Expenses UI timeout');app.exit(1);},90000);
app.on('browser-window-created',(_,window)=>{
  window.webContents.once('did-finish-load',async()=>{
    const db=initializeDatabase(app);
    const service=createExpenseServices(db);
    const evaluate=(code)=>window.webContents.executeJavaScript(code);
    const wait=async(condition)=>{for(let i=0;i<160;i++){if(await evaluate(condition))return;await new Promise((r)=>setTimeout(r,50));}throw new Error(`Timed out: ${condition}`);};
    const click=async(label)=>{
      const selector=`Array.from(document.querySelectorAll('button')).find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&!b.disabled)`;
      await wait(`Boolean(${selector})`);await evaluate(`${selector}.click()`);
    };
    const input=async(name,value)=>{await evaluate(`(()=>{const e=document.querySelector('[name="${name}"]');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);};
    const noDialog=`!document.querySelector('[role="dialog"]')`;
    const row=`document.querySelector('[data-expense-id="1"]')?.textContent`;
    const url=process.argv.includes('--dev')?'http://127.0.0.1:5173/':pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
    const guard=createSenderGuard(new Set([window.webContents]),url);
    const restore=()=>{for(const [resource,methods]of Object.entries({expenses:['list','getById','create','update'],expenseCategories:['list','create','update','deactivate']}))for(const method of methods)ipcMain.removeHandler(`${resource}:${method}`);registerExpenseIpc(ipcMain,service,guard);};
    try{
      await evaluate('location.hash="/expenses"');await wait(`document.body.textContent.includes('No expenses found.')`);
      await click('Add Expense');await click('Create Expense');await wait(`document.body.textContent.includes('Select an expense category.')`);await click('Cancel');await wait(noDialog);
      await click('Manage Expense Categories');await wait(`document.body.textContent.includes('No expense categories found.')`);
      await click('Add Expense Category');await wait(`document.body.textContent.includes('Enter a name between 1 and 200 characters.')`);
      await input('lookup-name','Rent');await click('Add Expense Category');await wait(`document.querySelector('[data-lookup-id="1"]')?.textContent.includes('Rent')`);
      await input('lookup-name','rent');await click('Add Expense Category');await wait(`document.body.textContent.includes('This name is already used')`);
      await input('lookup-name','Electricity');await click('Add Expense Category');await wait(`document.querySelectorAll('[data-lookup-id]').length===2`);
      await click('Edit expense category Electricity');await input('lookup-name','Utilities');await click('Save Expense Category');await wait(`document.querySelector('[data-lookup-id="2"]')?.textContent.includes('Utilities')`);
      await click('Done');await wait(noDialog);
      await click('Add Expense');assert.ok(await evaluate(`document.querySelector('[name="expense-category"]').textContent.includes('Utilities')`));
      await input('expense-category',1);await input('expense-amount','0');await click('Create Expense');await wait(`document.body.textContent.includes('Amount must be greater than zero')`);
      await input('expense-amount','18500.50');await input('expense-date','2026-09-25');await click('Create Expense');await wait(`document.body.textContent.includes('Expense date and description are required.')`);
      await input('expense-description','Shop rent');await input('expense-method','Bank transfer');
      // Real backend validation: the category becomes inactive after the form loaded.
      service.expenseCategories.deactivate(1);await click('Create Expense');await wait(`document.body.textContent.includes('Select an active expense category.')`);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n,0);
      await input('expense-category',2);
      const handlers=new Map();registerExpenseIpc({handle:(name,fn)=>handlers.set(name,fn)},service,guard);let submissions=0;
      ipcMain.removeHandler('expenses:create');ipcMain.handle('expenses:create',async(...args)=>{submissions++;await new Promise((r)=>setTimeout(r,350));return handlers.get('expenses:create')(...args);});
      await click('Create Expense');await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Saving...'&&b.disabled)`);
      await evaluate(`document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
      await wait(`${noDialog}&&${row}?.includes('Rs. 18,500.50')`);assert.equal(submissions,1);restore();
      const created=service.expenses.getById(1);assert.equal(created.amount,1850050);assert.equal(created.expense_category_id,2);
      await click('Edit expense 1');await wait(`Boolean(document.querySelector('[name="expense-amount"]'))`);
      await input('expense-amount','19000');await input('expense-description','Electricity bill');await input('expense-date','2026-09-24');await click('Save Expense');
      await wait(`${noDialog}&&${row}?.includes('Rs. 19,000')`);assert.equal(service.expenses.getById(1).created_at,created.created_at);
      await input('expense-search','ELECTRICITY');await wait(`${row}?.includes('Electricity bill')`);
      await input('expense-search','missing');await wait(`document.body.textContent.includes('No expenses found.')`);await click('Reset filters');await wait(`Boolean(document.querySelector('[data-expense-id]'))`);
      for(const [name,value]of [['expense-filter-category',1],['expense-filter-method','Cash'],['expense-from','2026-09-25'],['expense-to','2026-09-23']]){
        await input(name,value);await wait(`document.body.textContent.includes('No expenses found.')`);await click('Reset filters');await wait(`Boolean(document.querySelector('[data-expense-id]'))`);
      }
      await click('Manage Expense Categories');await wait(`document.querySelector('[data-lookup-id="2"]')?.textContent.includes('Utilities')`);
      await click('Deactivate expense category Utilities');await click('Cancel');assert.equal(service.expenseCategories.list({active:true})[0].id,2);
      await click('Deactivate expense category Utilities');await click('Deactivate Expense Category');await wait(`document.querySelector('[data-lookup-id="2"]')?.textContent.includes('Inactive')`);
      await input('lookup-status','inactive');await wait(`document.querySelectorAll('[data-lookup-id]').length===2`);
      await click('Done');await wait(noDialog);await wait(`${row}?.includes('Inactive category')`);
      await click('Edit expense 1');await wait(`document.querySelector('[name="expense-category"]')?.textContent.includes('inactive')`);
      await input('expense-description','Corrected inactive-category record');await click('Save Expense');await wait(`${noDialog}&&${row}?.includes('Corrected')`);
      await click('Add Expense');assert.equal(await evaluate(`document.querySelector('[name="expense-category"]').options.length`),1);await click('Cancel');await wait(noDialog);
      ipcMain.removeHandler('expenses:list');ipcMain.handle('expenses:list',async()=>{await new Promise((r)=>setTimeout(r,300));return{ok:false,error:{code:'INTERNAL',message:'Temporary expense list failure'}};});
      await input('expense-search','Retry');await wait(`document.body.textContent.includes('Loading expenses...')`);await wait(`document.body.textContent.includes('Temporary expense list failure')`);
      restore();await click('Retry');await wait(`!document.querySelector('[role="alert"]')`);await click('Reset filters');await wait(`Boolean(document.querySelector('[data-expense-id]'))`);
      fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/expenses-ui.png'),(await window.webContents.capturePage()).toPNG());
      window.setSize(640,480);await new Promise((r)=>setTimeout(r,250));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      assert.equal(await evaluate('typeof window.require'),'undefined');assert.equal(window.webContents.getLastWebPreferences().contextIsolation,true);assert.equal(window.webContents.getLastWebPreferences().nodeIntegration,false);
      assert.deepEqual(db.pragma('foreign_key_check'),[]);
      console.log('PASS: Expenses UI/preload/IPC create/edit, validation, integer rupees conversion, duplicate-submit guard, category CRUD/deactivation/refresh, retained links, search/category/payment/date filters, empty/loading/error/retry and narrow layout.');
      clearTimeout(timeout);app.quit();
    }catch(error){console.error(error);fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/expenses-ui-failure.png'),(await window.webContents.capturePage()).toPNG());app.exit(1);}
  });
});
require('../electron/main.cjs');
