const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
const {openDatabase}=require('../electron/database/index.cjs');
const {migrate}=require('../electron/database/migrate.cjs');
const {createReturnServices}=require('../electron/services/returns.cjs');
const {createPaymentServices}=require('../electron/services/payments.cjs');
const {createSaleService}=require('../electron/services/sales.cjs');
const {createPurchaseService}=require('../electron/services/purchases.cjs');
const {createDashboardService}=require('../electron/services/dashboard.cjs');
const {createReportsService}=require('../electron/services/reports.cjs');
const {createInventoryService}=require('../electron/services/inventory.cjs');
const {registerReturnIpc}=require('../electron/ipc/returns.cjs');
const {seedReturns}=require('./returns-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw Error('Temporary profile required');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
const purchase=process.argv.includes('--purchase-returns'),kind=purchase?'purchase':'sale',resource=purchase?'purchaseReturns':'saleReturns';
app.whenReady().then(()=>{
  let db,other,legacy;let code=0;
  try{
    // Upgrade a real schema-3 fixture, preserving every original table row.
    const filename=path.join(process.env.MAHSOOD_UI_TEST_DATA,'returns.sqlite3');
    legacy=new Database(filename);legacy.pragma('foreign_keys=ON');
    for(const name of ['001-initial.sql','002-catalog-status.sql','003-expense-category-status.sql'])legacy.exec(fs.readFileSync(path.join(__dirname,'../electron/database/migrations',name),'utf8'));
    legacy.pragma('user_version=3');seedReturns(legacy);
    const protectedTables=['sales','sale_items','purchases','purchase_items','customer_payments','supplier_payments'];
    const snapshot=(conn,tables)=>Object.fromEntries(tables.map((table)=>[table,conn.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
    const before=snapshot(legacy,protectedTables);legacy.close();legacy=null;db=openDatabase(filename);
    assert.equal(db.pragma('user_version',{simple:true}),4);assert.deepEqual(snapshot(db,protectedTables),before);
    const services=createReturnServices(db),service=services[resource],read=()=>service[purchase?'getReturnablePurchase':'getReturnableSale'](1);
    const data={ [`${kind}_id`]:1,returned_at:'2026-09-26',notes:'Return test',items:[{[`${kind}_item_id`]:1,quantity:1}]};
    assert.equal(service.list().totalRows,0);assert.throws(()=>service.getById(999));
    const initial=read(),stock=db.prepare('SELECT quantity FROM inventory WHERE product_id=1').get().quantity;
    const partial=service.create(data);assert.equal(partial.invoice.items[0].returnable_quantity,initial.items[0].quantity-1);
    assert.equal(partial.document.items[0].unit_price,purchase?6000:10000);assert.equal(partial.document.items[0].unit_cost,6000);
    assert.equal(partial.invoice.credit_due,partial.document.total);assert.equal(partial.invoice.balance,0);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE product_id=1').get().quantity,stock+(purchase?-1:1));
    assert.equal(createInventoryService(db).getProductStock(1).quantity,stock+(purchase?-1:1));
    assert.equal(createReportsService(db).getInventory({search:'RET-1'}).rows[0].quantity,stock+(purchase?-1:1));
    const movement=db.prepare('SELECT * FROM stock_movements ORDER BY id DESC LIMIT 1').get();assert.equal(movement.movement_type,purchase?'PURCHASE_RETURN':'SALE_RETURN');
    const tables=[`${kind}_returns`,`${kind}_return_items`,'stock_movements','inventory'];
    const rejects=(patch,expected)=>{const snap=snapshot(db,tables);assert.throws(()=>service.create({...data,...patch}),e=>!expected||e.code===expected);assert.deepEqual(snapshot(db,tables),snap);};
    for(const qty of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1])rejects({items:[{[`${kind}_item_id`]:1,quantity:qty}]},'VALIDATION');
    rejects({items:[{[`${kind}_item_id`]:1,quantity:initial.items[0].quantity}]},'OVER_RETURN');
    rejects({items:[{[`${kind}_item_id`]:999,quantity:1}]},'VALIDATION');
    rejects({items:[...data.items,...data.items]},'VALIDATION');rejects({returned_at:'2026-02-30'},'VALIDATION');rejects({total:1},'VALIDATION');
    if(purchase)rejects({items:[{purchase_item_id:1,quantity:5}]},'INSUFFICIENT_STOCK');
    const snap=snapshot(db,tables);db.exec(`CREATE TRIGGER fail_return AFTER INSERT ON ${kind}_return_items WHEN NEW.${kind}_item_id=2 BEGIN SELECT RAISE(ABORT,'forced second item failure'); END;`);
    rejects({items:[{[`${kind}_item_id`]:1,quantity:1},{[`${kind}_item_id`]:2,quantity:1}]});assert.deepEqual(snapshot(db,tables),snap);db.exec('DROP TRIGGER fail_return');
    // A separate connection consumes returnable quantity after the first reader's snapshot.
    other=openDatabase(filename);createReturnServices(other)[resource].create(data);other.close();other=null;
    assert.equal(read().items[0].returned_quantity,2);
    rejects({items:[{[`${kind}_item_id`]:1,quantity:initial.items[0].quantity-1}]},'OVER_RETURN');
    if(purchase){
      // Explicit stock fixture replenishment allows full purchase return without bypassing the ledger.
      db.exec("INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost) VALUES(1,'ADJUSTMENT_IN',5,6000),(2,'ADJUSTMENT_IN',4,6000)");
    }
    service.create({...data,items:read().items.filter(i=>i.returnable_quantity).map(i=>({[`${kind}_item_id`]:i.id,quantity:i.returnable_quantity}))});
    const final=read();assert.equal(final.effective_total,0);assert.equal(final.returned_value,initial.total);assert.equal(final.credit_due,initial.total);assert.ok(final.items.every(i=>i.returnable_quantity===0));
    rejects(data,'OVER_RETURN');
    for(const table of [`${kind}_returns`,`${kind}_return_items`]){assert.throws(()=>db.exec(`UPDATE ${table} SET id=id`),/immutable/);assert.throws(()=>db.exec(`DELETE FROM ${table}`),/immutable/);}
    const details=(purchase?createPurchaseService(db):createSaleService(db)).getById(1);assert.equal(details.total,initial.total);assert.equal(details.effective_total,0);assert.equal(details.credit_due,initial.total);
    const payments=createPaymentServices(db)[purchase?'supplierPayments':'customerPayments'];assert.equal(payments.getOutstanding(1).credit_due,initial.total);assert.equal(payments.list().totalRows,0);assert.equal(payments.getAccountSummary(1).credit_due,initial.total);
    assert.throws(()=>payments.create({[purchase?'supplier_id':'customer_id']:1,[`${kind}_id`]:1,amount:1,payment_method:'Cash',paid_at:'2026-09-26'}),e=>e.code==='ALREADY_PAID');
    const clock=()=>new Date('2026-09-26T12:00:00'),filters={period:'custom',from_date:'2026-09-01',to_date:'2026-09-30'};
    const dashboard=createDashboardService(db,clock).getOverview(filters),reports=createReportsService(db,clock);
    assert.equal(dashboard.summary[purchase?'supplierCreditDue':'customerCreditDue'],initial.total);
    assert.equal(dashboard.summary[purchase?'purchaseTotal':'salesRevenue'],purchase?0:10000);
    const accountReport=reports[purchase?'getPayables':'getReceivables']();assert.equal(accountReport.summary.credit_due,initial.total);assert.equal(accountReport.summary.outstanding,0);
    if(!purchase){
      const profit=reports.getProfit(filters);assert.equal(profit.summary.salesRevenue,10000);assert.equal(profit.summary.historicalCost,6000);assert.equal(profit.summary.grossProfit,null);
      service.create({sale_id:2,returned_at:'2026-09-26',items:[{sale_item_id:3,quantity:1}]});assert.equal(service.getReturnableSale(2).credit_due,10000);
    }
    assert.deepEqual(snapshot(db,protectedTables),before);assert.deepEqual(db.pragma('foreign_key_check'),[]);
    const handlers=new Map();registerReturnIpc({handle:(name,fn)=>handlers.set(name,fn)},services,event=>event.trusted);
    assert.equal(handlers.size,8);for(const fn of handlers.values()){assert.equal(fn({trusted:false}).error.code,'FORBIDDEN');assert.equal(fn({trusted:true},{},{}).error.code,'VALIDATION');}
    const count=service.list().totalRows;db.close();db=openDatabase(filename);assert.equal(createReturnServices(db)[resource].list().totalRows,count);
    // Forward migration DDL is atomic on failure.
    legacy=new Database(path.join(process.env.MAHSOOD_UI_TEST_DATA,'migration-fail.sqlite3'));for(const name of ['001-initial.sql','002-catalog-status.sql','003-expense-category-status.sql'])legacy.exec(fs.readFileSync(path.join(__dirname,'../electron/database/migrations',name),'utf8'));legacy.exec('PRAGMA user_version=3; CREATE TABLE purchase_returns(id INTEGER);');assert.throws(()=>migrate(legacy));assert.equal(legacy.pragma('user_version',{simple:true}),3);assert.equal(legacy.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name='sale_returns'").get().n,0);
    const unpaidDb=openDatabase(path.join(process.env.MAHSOOD_UI_TEST_DATA,'unpaid.sqlite3'));
    try{
      seedReturns(unpaidDb);unpaidDb.exec('DELETE FROM customer_payments; DELETE FROM supplier_payments;');
      const unpaid=createReturnServices(unpaidDb)[resource],paymentService=createPaymentServices(unpaidDb)[purchase?'supplierPayments':'customerPayments'];
      const returned=unpaid.create(data);assert.equal(returned.invoice.balance,initial.total-returned.document.total);assert.equal(returned.invoice.credit_due,0);
      const balance=returned.invoice.balance;
      assert.equal(paymentService.list().rows.find(r=>r.id===1).balance,balance);
      assert.equal(createReportsService(unpaidDb,clock)[purchase?'getPayables':'getReceivables']().summary.outstanding,balance);
      assert.equal(createDashboardService(unpaidDb,clock).getOverview(filters).summary[purchase?'supplierPayables':'customerReceivables'],balance+(purchase?0:10000));
      paymentService.create({[purchase?'supplier_id':'customer_id']:1,[`${kind}_id`]:1,amount:balance,payment_method:'Cash',paid_at:'2026-09-26'});
      assert.equal(paymentService.getOutstanding(1).balance,0);
      assert.equal(unpaid.create(data).invoice.credit_due,unpaid.list().rows[0].total);
    }finally{unpaidDb.close();}
    console.log(`PASS ${resource}: schema-3 preservation/rollback, partial/full/multiple returns, over-return, stale connection, historical prices/costs, stock, credits, discount paise rounding, protected history, transaction rollback, unpaid balance/payment settlement/dashboard/reports/profit integration, IPC and persistence.`);
  }catch(error){console.error(error);code=1;}finally{for(const conn of [other,db,legacy])if(conn?.open)conn.close();app.exit(code);}
});
