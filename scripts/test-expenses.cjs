const { app, BrowserWindow, ipcMain } = require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { pathToFileURL }=require('node:url');
const { openDatabase }=require('../electron/database/index.cjs');
const { migrate }=require('../electron/database/migrate.cjs');
const { createExpenseServices }=require('../electron/services/expenses.cjs');
const { registerExpenseIpc }=require('../electron/ipc/expenses.cjs');
const { createSenderGuard }=require('../electron/ipc/catalog.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA) throw new Error('Use npm run test:expenses for temporary data.');
const directory=process.env.MAHSOOD_UI_TEST_DATA;
app.setPath('userData',directory);app.setPath('sessionData',directory);
const timeout=setTimeout(()=>{console.error('Expense tests timed out');app.exit(1);},60000);
app.whenReady().then(async()=>{
  let db,window,unregister,code=0;
  try {
    const Database=require('better-sqlite3');
    const filename=path.join(directory,'expenses.sqlite3');
    db=new Database(filename);
    for(const file of ['001-initial.sql','002-catalog-status.sql']) db.exec(fs.readFileSync(path.join(__dirname,'../electron/database/migrations',file),'utf8'));
    db.exec(`PRAGMA user_version=2; INSERT INTO expense_categories(name) VALUES ('Legacy');
      INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES (1,1850050,'Existing record','CASH','2026-09-01T10:00:00.000Z');`);
    const legacy=db.prepare('SELECT * FROM expenses').get();
    db.close();db=openDatabase(filename);
    assert.equal(db.pragma('user_version',{simple:true}),3);
    assert.deepEqual(db.prepare('SELECT * FROM expenses').get(),legacy);
    assert.equal(db.prepare('SELECT active FROM expense_categories').get().active,1);
    assert.equal(db.prepare('SELECT created_at=updated_at AS same FROM expense_categories').get().same,1);
    migrate(db); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expense_categories').get().n,1);
    // Failed v3 migration must restore v2 columns/version and existing rows.
    const broken=new Database(path.join(directory,'rollback.sqlite3'));
    try {
      for(const file of ['001-initial.sql','002-catalog-status.sql']) broken.exec(fs.readFileSync(path.join(__dirname,'../electron/database/migrations',file),'utf8'));
      broken.exec("PRAGMA user_version=2; INSERT INTO expense_categories(name) VALUES ('Keep'); CREATE INDEX idx_expense_categories_active_name ON expense_categories(name);");
      assert.throws(()=>migrate(broken));assert.equal(broken.pragma('user_version',{simple:true}),2);
      assert.equal(broken.prepare('PRAGMA table_info(expense_categories)').all().some((c)=>c.name==='active'),false);
      assert.equal(broken.prepare('SELECT name FROM expense_categories').get().name,'Keep');
    } finally {broken.close();}
    const {expenses,expenseCategories:categories}=createExpenseServices(db);
    const rent=categories.create({name:' Rent '});assert.equal(rent.name,'Rent');assert.equal(rent.active,1);
    const transport=categories.create({name:'Transport'});
    assert.equal(categories.update(transport.id,{name:'Delivery'}).name,'Delivery');
    const data={expense_category_id:rent.id,amount:1850050,description:' September shop rent ',payment_method:'Bank transfer',spent_at:'2026-09-25'};
    const row=expenses.create(data);assert.equal(row.amount,1850050);assert.equal(row.description,'September shop rent');
    assert.equal(db.prepare('SELECT typeof(amount) AS type FROM expenses WHERE id=?').get(row.id).type,'integer');
    assert.equal(expenses.getById(row.id).category_name,'Rent');
    assert.equal(expenses.list({expense_category_id:rent.id}).length,1);
    assert.equal(expenses.list({from_date:'2026-09-25',to_date:'2026-09-25'})[0].id,row.id);
    assert.equal(expenses.list({from_date:'2026-09-26'}).length,0);
    for(const search of ['SEPTEMBER','rent']) assert.equal(expenses.list({search})[0].id,row.id);
    assert.equal(expenses.list({search:"' OR 1=1 --"}).length,0);
    assert.equal(expenses.list({payment_method:'Bank transfer'}).length,1);
    assert.equal(expenses.list({limit:1,offset:1})[0].id,legacy.id);
    const changed=expenses.update(row.id,{amount:2000000,description:'Updated rent'});
    assert.equal(changed.amount,2000000);assert.equal(changed.created_at,row.created_at);assert.equal(changed.spent_at,row.spent_at);
    const snapshot=()=>db.prepare('SELECT * FROM expenses ORDER BY id').all();
    const before=snapshot();
    for(const patch of [{amount:0},{amount:-1},{amount:1.5},{amount:'100'},{amount:NaN},{amount:Number.MAX_SAFE_INTEGER+1},{expense_category_id:999},{expense_category_id:'1'},{spent_at:'2026-02-30'},{spent_at:'invalid'},{payment_method:'Credit'},{payment_method:null},{description:' '},{description:'x'.repeat(5001)},{created_at:'bad'},{active:0},{notes:'unsupported'}]) {
      assert.throws(()=>expenses.create({...data,...patch}));assert.deepEqual(snapshot(),before);
    }
    assert.throws(()=>expenses.update(row.id,{}));assert.throws(()=>expenses.update(row.id,{amount:0}));assert.deepEqual(snapshot(),before);
    assert.throws(()=>expenses.getById(999),(e)=>e.code==='NOT_FOUND');assert.throws(()=>expenses.getById('1'));
    for(const filters of [{limit:501},{offset:-1},{payment_method:'bad'},{from_date:'2026-10-01',to_date:'2026-09-01'},{sql:'SELECT 1'}]) assert.throws(()=>expenses.list(filters));
    for(const input of [{name:''},{name:'x'.repeat(201)},{name:'X',active:0}]) assert.throws(()=>categories.create(input));
    categories.deactivate(rent.id);assert.equal(categories.list({active:false})[0].id,rent.id);
    assert.throws(()=>categories.create({name:'rent'}),(e)=>e.code==='CONFLICT');
    assert.throws(()=>expenses.create(data),(e)=>e.code==='VALIDATION');
    assert.equal(expenses.update(row.id,{description:'Retain inactive category'}).expense_category_id,rent.id);
    assert.equal(expenses.update(row.id,{expense_category_id:transport.id}).expense_category_id,transport.id);
    assert.throws(()=>expenses.update(row.id,{expense_category_id:rent.id}));
    assert.equal(categories.update(rent.id,{name:'Old rent'}).active,0);
    assert.equal(categories.list({active:'all'}).length,3);
    assert.equal(categories.list({limit:1,offset:1}).length,1);
    // Untouched legacy values are preserved even if not accepted for new records.
    const preserved=expenses.update(legacy.id,{description:'Legacy corrected'});
    assert.equal(preserved.payment_method,'CASH');assert.equal(preserved.spent_at,legacy.spent_at);assert.equal(preserved.created_at,legacy.created_at);
    const rollbackBefore=snapshot();
    db.exec("CREATE TRIGGER test_expense_failure AFTER UPDATE ON expenses BEGIN SELECT RAISE(ABORT,'Forced failure'); END;");
    assert.throws(()=>expenses.update(row.id,{amount:1}));assert.deepEqual(snapshot(),rollbackBefore);db.exec('DROP TRIGGER test_expense_failure');
    for(const table of ['inventory','stock_movements','sales','purchases','customer_payments','supplier_payments']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
    db.close();db=openDatabase(filename);assert.equal(createExpenseServices(db).expenses.getById(row.id).amount,2000000);
    const html=path.join(directory,'ipc.html');fs.writeFileSync(html,'<!doctype html><title>Expense IPC test</title>');
    window=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    const allowed=new Set([window.webContents]);unregister=registerExpenseIpc(ipcMain,createExpenseServices(db),createSenderGuard(allowed,pathToFileURL(html).href));
    await window.loadFile(html);
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const c=await window.api.expenseCategories.create({name:'IPC category'});
      const e=await window.api.expenses.create({expense_category_id:c.data.id,amount:12345,description:'IPC expense',spent_at:'2026-09-25',payment_method:'Cash'});
      return {results:[c,e,await window.api.expenses.getById(e.data.id),await window.api.expenses.list(),await window.api.expenses.update(e.data.id,{amount:15000}),await window.api.expenseCategories.list(),await window.api.expenseCategories.update(c.data.id,{name:'IPC renamed'}),await window.api.expenseCategories.deactivate(c.data.id)],
        invalid:await window.api.expenses.create({amount:0}),keys:Object.keys(window.api.expenses).sort(),categoryKeys:Object.keys(window.api.expenseCategories).sort(),node:typeof window.require,sql:typeof window.api.invoke};})()`);
    assert.ok(result.results.every((r)=>r.ok));assert.equal(result.invalid.error.code,'VALIDATION');
    assert.deepEqual(result.keys,['create','getById','list','update']);assert.deepEqual(result.categoryKeys,['create','deactivate','list','update']);assert.equal(result.node,'undefined');assert.equal(result.sql,'undefined');
    allowed.clear();assert.equal((await window.webContents.executeJavaScript('window.api.expenses.list()')).error.code,'FORBIDDEN');
    assert.deepEqual(db.pragma('foreign_key_check'),[]);
    console.log('PASS: v2-to-v3 preservation/rollback, expense CRUD/filtering/validation/integer money, inactive categories/legacy retention, no stock/payment effects, persistence and all eight real preload/IPC APIs.');
  } catch(error){code=1;console.error(error);}
  finally{unregister?.();window?.destroy();if(db?.open)db.close();clearTimeout(timeout);app.exit(code);}
}).catch((error)=>{console.error(error);app.exit(1);});
