function seedReturns(db){
  db.exec(`
    INSERT INTO suppliers(id,name) VALUES(1,'Return Supplier');
    INSERT INTO customers(id,name) VALUES(1,'Return Customer');
    INSERT INTO products(id,sku,model,size,default_selling_price) VALUES(1,'RET-1','Original tyre','195/65',99000),(2,'RET-2','Second tyre','205/55',88000);
    INSERT INTO purchases(id,invoice_number,supplier_id,subtotal,discount,total,purchased_at) VALUES(1,'PUR-RETURN',1,120000,1,119999,'2026-09-01');
    INSERT INTO purchase_items(id,purchase_id,product_id,quantity,unit_cost) VALUES(1,1,1,10,6000),(2,1,2,10,6000);
    INSERT INTO stock_movements(product_id,movement_type,quantity_change,purchase_item_id,unit_cost) VALUES(1,'PURCHASE',10,1,6000),(2,'PURCHASE',10,2,6000);
    INSERT INTO sales(id,invoice_number,customer_id,subtotal,discount,total,sold_at) VALUES(1,'SALE-RETURN',1,80000,1,79999,'2026-09-01'),(2,'SALE-WALKIN',NULL,10000,0,10000,'2026-09-01');
    INSERT INTO sale_items(id,sale_id,product_id,quantity,unit_price,unit_cost) VALUES(1,1,1,4,10000,6000),(2,1,2,4,10000,0),(3,2,1,1,10000,6000);
    INSERT INTO stock_movements(product_id,movement_type,quantity_change,sale_item_id,unit_cost) VALUES(1,'SALE',-4,1,6000),(2,'SALE',-4,2,0),(1,'SALE',-1,3,6000);
    INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,paid_at) VALUES(1,1,79999,'Cash','2026-09-01'),(NULL,2,10000,'Cash','2026-09-01');
    INSERT INTO supplier_payments(supplier_id,purchase_id,amount,payment_method,paid_at) VALUES(1,1,119999,'Cash','2026-09-01');
  `);
}
module.exports={seedReturns};
