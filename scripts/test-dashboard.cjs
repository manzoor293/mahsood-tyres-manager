const {app}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const {openDatabase}=require('../electron/database/index.cjs');
const {createDashboardService,range}=require('../electron/services/dashboard.cjs');
const {registerDashboardIpc}=require('../electron/ipc/dashboard.cjs');
const {createSaleService}=require('../electron/services/sales.cjs');
const {seedDashboard,localTime}=require('./dashboard-fixtures.cjs');
if(!process.env.MAHSOOD_UI_TEST_DATA)throw new Error('Temporary test profile required.');
app.setPath('userData',process.env.MAHSOOD_UI_TEST_DATA);app.setPath('sessionData',process.env.MAHSOOD_UI_TEST_DATA);
app.whenReady().then(()=>{
  let db,code=0;
  try {
    const filename=path.join(process.env.MAHSOOD_UI_TEST_DATA,'dashboard.sqlite3');
    db=openDatabase(filename);
    const clock=()=>new Date('2026-09-26T12:00:00');
    let service=createDashboardService(db,clock);
    const empty=service.getOverview();
    assert.ok(Object.values(empty.summary).every((v)=>v===0));
    assert.equal(empty.salesTrend.length,26);assert.ok(empty.salesTrend.every((r)=>r.revenue===0&&r.count===0));
    for(const key of ['topProducts','stockAlerts','recentActivity'])assert.deepEqual(empty[key],[]);
    seedDashboard(db);
    const filters={period:'custom',from_date:'2026-09-01',to_date:'2026-09-30'};
    const snapshot=()=>db.serialize();const before=snapshot();
    const result=service.getOverview(filters),s=result.summary;
    assert.deepEqual(s,{saleCount:1,salesRevenue:5900,purchaseCount:1,purchaseTotal:20000,expenses:303,amountReceived:2000,supplierAmountPaid:5000,customerReceivables:4400,supplierPayables:15000,historicalCost:4002,unknownCostItemCount:0,activeProducts:4,stockUnits:13,lowStockCount:2,outOfStockCount:1,grossProfit:1898});
    assert.equal(result.salesTrend.length,30);assert.deepEqual(result.salesTrend[1],{bucket:'2026-09-02',revenue:5900,count:1});
    assert.equal(result.salesTrend[0].revenue,0);assert.equal(result.salesTrend.at(-1).revenue,0);
    assert.deepEqual(result.topProducts.map((p)=>[p.sku,p.quantitySold,p.itemRevenue]),[['A',2,3002],['B',1,3000]]);
    assert.equal(result.topProducts[0].brand_name,'Fixture brand');
    assert.deepEqual(result.stockAlerts.map((p)=>[p.sku,p.stock_status]),[['D','out'],['A','low'],['C','low']]);
    assert.equal(result.recentActivity.find((a)=>a.type==='Sale').reference,'SALE-SEP');
    const order=(r)=>r.occurredAt.length===10?new Date(`${r.occurredAt}T00:00:00`).getTime():Date.parse(r.occurredAt);
    assert.ok(result.recentActivity.every((r,i,rows)=>!i||order(rows[i-1])>=order(r)));
    assert.deepEqual(snapshot(),before,'Dashboard must not write to the database');
    const october=service.getOverview({period:'custom',from_date:'2026-10-01',to_date:'2026-10-31'});
    assert.equal(october.summary.unknownCostItemCount,1);assert.equal(october.summary.grossProfit,null);
    assert.equal(october.summary.salesRevenue,701);assert.equal(october.summary.amountReceived,201);assert.equal(october.summary.expenses,407);
    assert.equal(service.getOverview({period:'today'}).summary.salesRevenue,0);
    assert.equal(service.getOverview({period:'week'}).range.from,'2026-09-20');
    assert.equal(service.getOverview({period:'month'}).range.from,'2026-09-01');
    const annual=service.getOverview({period:'year'});assert.equal(annual.range.grouping,'month');assert.equal(annual.salesTrend.length,9);assert.equal(annual.salesTrend[8].revenue,5900);
    assert.equal(service.getOverview({period:'custom',from_date:'2026-02-01',to_date:'2026-03-01'}).salesTrend.length,29);
    for(const input of [null,[],{period:'bad'},{period:'today',from_date:'2026-09-01'},{period:'custom',from_date:'2026-02-30',to_date:'2026-03-01'},{period:'custom',from_date:'2026-09-02',to_date:'2026-09-01'},{period:'custom',from_date:'1900-01-01',to_date:'2026-09-01'},{sql:'DROP TABLE sales'}])assert.throws(()=>service.getOverview(input),(e)=>e.code==='VALIDATION');
    // Exact local-midnight boundaries: inclusive start, inclusive end day, exclusive next midnight.
    const sales=createSaleService(db);
    for(const [name,date]of [['BEFORE',new Date(Date.parse(localTime('2026-09-10',0))-1).toISOString()],['START',localTime('2026-09-10',0)],['LAST',new Date(Date.parse(localTime('2026-09-11',0))-1).toISOString()],['AFTER',localTime('2026-09-11',0)]])sales.create({invoice_number:name,sold_at:date,items:[{product_id:1,quantity:1,unit_price:10001}],paid_amount:1});
    const boundary=service.getOverview({period:'custom',from_date:'2026-09-10',to_date:'2026-09-10'});
    assert.equal(boundary.summary.saleCount,2);assert.equal(boundary.summary.salesRevenue,20002);assert.equal(boundary.summary.amountReceived,2);assert.equal(boundary.salesTrend.length,1);
    // Legacy UTC expense/purchase/payment values must also map to their local business day.
    db.prepare("INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES (1,17,'Legacy','CASH',?)").run(localTime('2026-09-10',0));
    db.prepare("INSERT INTO purchases(invoice_number,supplier_id,subtotal,total,purchased_at) VALUES ('LEGACY',1,19,19,?)").run(localTime('2026-09-10',0));
    db.prepare("INSERT INTO supplier_payments(supplier_id,purchase_id,amount,payment_method,paid_at) VALUES (1,3,7,'Cash',?)").run(localTime('2026-09-10',0));
    const legacy=service.getOverview({period:'custom',from_date:'2026-09-10',to_date:'2026-09-10'});
    assert.equal(legacy.summary.expenses,17);assert.equal(legacy.summary.purchaseTotal,19);assert.equal(legacy.summary.supplierAmountPaid,7);
    // Millisecond ordering must win over insertion order for two sales in the same second.
    for(const [invoice_number,ms] of [['MILLI-LATER',900],['MILLI-EARLIER',100]])sales.create({invoice_number,sold_at:new Date(Date.parse(localTime('2026-11-01'))+ms).toISOString(),items:[{product_id:2,quantity:1,unit_price:10}]});
    const milliseconds=service.getOverview({period:'custom',from_date:'2026-11-01',to_date:'2026-11-01'});
    assert.deepEqual(milliseconds.recentActivity.map((r)=>r.reference),['MILLI-LATER','MILLI-EARLIER']);
    // Payment date drives receipts, not the invoice date; unlinked payments do not offset invoices.
    db.exec("INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,paid_at) VALUES (1,1,100,'Cash','2026-10-04'),(1,NULL,999,'Cash','2026-10-04');");
    assert.equal(service.getOverview(filters).summary.amountReceived,2004);
    assert.equal(service.getOverview({period:'custom',from_date:'2026-10-04',to_date:'2026-10-04'}).summary.amountReceived,100);
    const handlers=new Map();registerDashboardIpc({handle:(name,fn)=>handlers.set(name,fn)},service,(event)=>event.trusted);
    const handler=handlers.get('dashboard:getOverview');
    assert.equal(handler({trusted:false}).error.code,'FORBIDDEN');assert.equal(handler({trusted:true},{},{}).error.code,'VALIDATION');assert.equal(handler({trusted:true},{sql:'select 1'}).error.code,'VALIDATION');assert.equal(handler({trusted:true},filters).ok,true);
    assert.equal(db.pragma('user_version',{simple:true}),3);assert.deepEqual(db.pragma('foreign_key_check'),[]);
    db.close();db=openDatabase(filename,{readonly:true});service=createDashboardService(db,clock);assert.equal(service.getOverview(filters).summary.purchaseTotal,20019);
    db.close();db=openDatabase(filename);service=createDashboardService(db,clock);
    // More than JS-safe integer totals must fail explicitly rather than returning rounded money.
    db.prepare("INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES (1,?,'Large','Cash','2026-09-03')").run(Number.MAX_SAFE_INTEGER);
    assert.throws(()=>service.getOverview(filters),(e)=>e.code==='RANGE');
    assert.equal(range({period:'week'},new Date('2026-01-02T12:00:00')).from,'2025-12-27');
    console.log('PASS: Dashboard empty/date boundaries, revenue/receipts/balances, purchases/payments/expenses, inventory/alerts, ranking, daily/monthly zero-filled trends, recent ordering, historical/unknown costs, integer overflow, read-only persistence and IPC validation.');
  } catch(error){code=1;console.error(error);}finally{if(db?.open)db.close();app.exit(code);}
});
