const {localTime}=require('./dashboard-fixtures.cjs');
function seedReports(db) {
  db.exec(`INSERT INTO suppliers(name,phone) VALUES ('Supplier One','111'),('Supplier Two','222');
    INSERT INTO customers(name,phone) VALUES ('Customer One','333'),('Paid Customer','444');
    INSERT INTO brands(name) VALUES ('Brand One'); INSERT INTO categories(name) VALUES ('Car');
    INSERT INTO expense_categories(name) VALUES ('Rent'),('Utilities');
    INSERT INTO products(sku,model,size,brand_id,category_id,minimum_stock) VALUES ('A','Touring','R15',1,1,71),('B','Cargo','R20',1,1,1),('C','Unknown','R16',1,1,1),('D','Empty','R14',1,1,0);
    INSERT INTO products(sku,model,size,active) VALUES ('OLD','Inactive','R14',0);
    INSERT INTO purchases(invoice_number,supplier_id,subtotal,discount,total,purchased_at) VALUES ('PUR-OPEN',1,110100,100,110000,'2026-09-01'),('PUR-PAID',2,9000,0,9000,'2026-10-01');
    INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost) VALUES (1,1,100,1001),(1,2,5,2000),(2,1,1,9000);
    INSERT INTO supplier_payments(supplier_id,purchase_id,amount,payment_method,paid_at) VALUES (1,1,5000,'Cash','2026-09-01'),(2,2,9000,'Cash','2026-10-01');
    INSERT INTO expenses(expense_category_id,amount,description,payment_method,spent_at) VALUES (1,303,'September rent','Cash','2026-09-03'),(2,407,'October power','Bank transfer','2026-10-03');`);
  const move=db.prepare('INSERT INTO stock_movements(product_id,movement_type,quantity_change,purchase_item_id,sale_item_id,unit_cost,created_at) VALUES (?,?,?,?,?,?,?)');
  move.run(1,'PURCHASE',100,1,null,1001,localTime('2026-09-01'));
  move.run(2,'PURCHASE',5,2,null,2000,localTime('2026-09-01'));
  move.run(1,'PURCHASE',1,3,null,9000,localTime('2026-10-01'));
  move.run(3,'ADJUSTMENT_IN',2,null,null,0,localTime('2026-09-01'));
  move.run(5,'OPENING_STOCK',9,null,null,0,localTime('2026-09-01'));
  const sale=db.prepare('INSERT INTO sales(invoice_number,customer_id,subtotal,discount,total,sold_at) VALUES (?,?,?,?,?,?)');
  const item=db.prepare('INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,unit_cost) VALUES (?,?,?,?,?)');
  const payment=db.prepare('INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,paid_at) VALUES (?,?,?,?,?)');
  function addInvoice(reference,customer,day,lines,discount,paid,method='Cash') {
    const subtotal=lines.reduce((sum,line)=>sum+line[1]*line[2],0);
    const time=localTime(day);
    const id=sale.run(reference,customer,subtotal,discount,subtotal-discount,time).lastInsertRowid;
    for(const [product,quantity,price,cost] of lines) {
      const itemId=item.run(id,product,quantity,price,cost).lastInsertRowid;
      move.run(product,'SALE',-quantity,null,itemId,cost,time);
    }
    if(paid)payment.run(customer,id,paid,method,time);
    return id;
  }
  addInvoice('SALE-OPEN',1,'2026-09-02',[[1,2,1501,1001],[2,1,3000,2000]],102,2000);
  for(let i=0;i<27;i++)addInvoice(`SALE-PAID-${String(i).padStart(2,'0')}`,2,'2026-09-05',[[1,1,1001,1001]],0,1001,'Bank transfer');
  addInvoice('SALE-UNKNOWN',null,'2026-10-02',[[3,1,701,0]],0,201);
  move.run(1,'ADJUSTMENT_OUT',-1,null,null,9000,localTime('2026-09-04'));
  // Current catalog values differ deliberately from historical invoice facts.
  db.exec('UPDATE products SET default_selling_price=99999 WHERE id=1');
}
module.exports={seedReports};
