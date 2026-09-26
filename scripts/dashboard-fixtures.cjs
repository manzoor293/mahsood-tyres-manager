const {createPurchaseService}=require('../electron/services/purchases.cjs');
const {createSaleService}=require('../electron/services/sales.cjs');
const {createExpenseServices}=require('../electron/services/expenses.cjs');
const localTime=(day,hour=12)=>new Date(`${day}T${String(hour).padStart(2,'0')}:00:00`).toISOString();
function seedDashboard(db) {
  db.exec(`INSERT INTO suppliers(name) VALUES ('Fixture supplier'); INSERT INTO customers(name) VALUES ('Fixture customer');
    INSERT INTO brands(name) VALUES ('Fixture brand');
    INSERT INTO products(sku,model,size,minimum_stock,brand_id) VALUES ('A','Touring','R15',8,1),('B','Cargo','R20',1,1),('C','Unknown cost','R16',1,1),('D','Empty','R14',0,1);
    INSERT INTO products(sku,model,size,active) VALUES ('INACTIVE','Inactive stock','R14',0);`);
  const purchases=createPurchaseService(db),sales=createSaleService(db);
  purchases.create({supplier_id:1,invoice_number:'PUR-SEP',purchased_at:'2026-09-01',items:[{product_id:1,quantity:10,unit_cost:1001},{product_id:2,quantity:5,unit_cost:2000}],discount:10,paid_amount:5000});
  // Opening/adjustment cost must not be mistaken for a known sale cost without a purchase.
  db.prepare("INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost,created_at) VALUES (3,'ADJUSTMENT_IN',2,0,?)").run(localTime('2026-09-01'));
  // Fixture-only timestamps are supplied on insert; the ledger remains append-only.
  db.prepare("INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost,created_at) VALUES (5,'OPENING_STOCK',9,0,?)").run(localTime('2026-09-01'));
  sales.create({customer_id:1,invoice_number:'SALE-SEP',sold_at:localTime('2026-09-02'),items:[{product_id:1,quantity:2,unit_price:1501},{product_id:2,quantity:1,unit_price:3000}],discount:102,paid_amount:2000});
  // Change both current price and latest cost after the sale: historical profit stays 1,898.
  db.exec('UPDATE products SET default_selling_price=99999 WHERE id=1');
  purchases.create({supplier_id:1,invoice_number:'PUR-OCT',purchased_at:'2026-10-01',items:[{product_id:1,quantity:1,unit_cost:9000}],paid_amount:9000});
  sales.create({invoice_number:'SALE-UNKNOWN',sold_at:localTime('2026-10-02'),items:[{product_id:3,quantity:1,unit_price:701}],paid_amount:201});
  const {expenses,expenseCategories}=createExpenseServices(db);
  const category=expenseCategories.create({name:'Rent'});
  expenses.create({expense_category_id:category.id,amount:303,description:'September rent',spent_at:'2026-09-03'});
  expenses.create({expense_category_id:category.id,amount:407,description:'October rent',spent_at:'2026-10-03'});
  db.prepare("INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost,created_at) VALUES (1,'ADJUSTMENT_OUT',-1,9000,?)").run(localTime('2026-09-04'));
}
module.exports={seedDashboard,localTime};
