const {seedReturns}=require('./returns-fixtures.cjs');
const {createReturnServices}=require('../electron/services/returns.cjs');
function seedPrinting(db) {
  seedReturns(db);
  db.exec(`
    INSERT INTO brands(id,name) VALUES(1,'Historical Brand');
    UPDATE products SET brand_id=1 WHERE id=1;
    UPDATE suppliers SET phone='0300-1234567',address='Supplier Road' WHERE id=1;
    UPDATE customers SET phone='0311-1234567',address='Customer Road' WHERE id=1;
    INSERT INTO settings(key,value) VALUES('shop.name','Mahsood Test Shop'),('shop.address','Shop Road'),('shop.phone','0322-1234567'),('shop.email','shop@example.test'),('shop.ntn','TEST-NTN');
    INSERT INTO sales(id,invoice_number,customer_id,subtotal,discount,total,sold_at,notes) VALUES(3,'SALE-PARTIAL',1,40000,0,40000,'2026-09-26T12:00:00.000Z','Saved invoice note');
    INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,unit_cost) VALUES(3,1,2,20000,6123);
    INSERT INTO stock_movements(product_id,movement_type,quantity_change,sale_item_id,unit_cost) VALUES(1,'SALE',-2,4,6123);
    INSERT INTO customer_payments(id,customer_id,sale_id,amount,payment_method,paid_at,notes) VALUES(3,1,3,5000,'Cash','2026-09-26','Initial partial'),(4,1,3,7501,'Bank transfer','2026-09-01','Backdated later payment');
    INSERT INTO customer_payments(id,customer_id,amount,payment_method,paid_at,notes) VALUES(5,1,2000,'Cash','2026-09-01','Unlinked legacy receipt');
  `);
  const services=createReturnServices(db);
  services.saleReturns.create({sale_id:1,returned_at:'2026-09-26',notes:'Saved sale return',items:[{sale_item_id:1,quantity:1}]});
  services.purchaseReturns.create({purchase_id:1,returned_at:'2026-09-26',notes:'Saved purchase return',items:[{purchase_item_id:2,quantity:1}]});
}
module.exports={seedPrinting};
