function createSaleRepository(db) {
  const summary = `SELECT s.*,c.name AS customer_name,c.phone AS customer_phone,c.address AS customer_address,
    (SELECT COUNT(*) FROM sale_items WHERE sale_id=s.id) AS item_count,
    COALESCE((SELECT SUM(amount) FROM customer_payments WHERE sale_id=s.id),0) AS paid_amount,
    (SELECT group_concat(payment_method, ', ') FROM customer_payments WHERE sale_id=s.id) AS payment_method
    FROM sales s LEFT JOIN customers c ON c.id=s.customer_id`;
  const projection = `SELECT *,total-paid_amount AS balance,
    CASE WHEN paid_amount>=total THEN 'paid' WHEN paid_amount>0 THEN 'partial' ELSE 'unpaid' END AS payment_status FROM (${summary})`;
  const get = db.prepare(`${projection} WHERE id=?`);
  const items = db.prepare(`SELECT i.*,p.sku,p.model,p.size,i.quantity*i.unit_price AS line_total
    FROM sale_items i JOIN products p ON p.id=i.product_id WHERE sale_id=? ORDER BY i.id`);
  const payments = db.prepare('SELECT * FROM customer_payments WHERE sale_id=? ORDER BY id');
  const list = db.prepare(`SELECT * FROM (${projection}) WHERE
    (@search='' OR instr(lower(invoice_number),lower(@search))>0 OR instr(lower(coalesce(customer_name,'')),lower(@search))>0)
    AND (@customer_id IS NULL OR customer_id=@customer_id) AND (@walk_in=0 OR customer_id IS NULL)
    AND (@from_date IS NULL OR substr(sold_at,1,10)>=@from_date) AND (@to_date IS NULL OR substr(sold_at,1,10)<=@to_date)
    AND (@payment_status='all' OR payment_status=@payment_status)
    ORDER BY sold_at DESC,id DESC LIMIT @limit OFFSET @offset`);
  const product = db.prepare(`SELECT p.id,p.sku,p.active,i.quantity,
    COALESCE((SELECT unit_cost FROM purchase_items WHERE product_id=p.id ORDER BY id DESC LIMIT 1),0) AS unit_cost
    FROM products p LEFT JOIN inventory i ON i.product_id=p.id WHERE p.id=?`);
  const invoice = db.prepare('SELECT id FROM sales WHERE invoice_number=?');
  const insert = db.prepare(`INSERT INTO sales(invoice_number,customer_id,subtotal,discount,total,sold_at,notes)
    VALUES (@invoice_number,@customer_id,@subtotal,@discount,@total,@sold_at,@notes)`);
  const insertItem = db.prepare('INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,unit_cost) VALUES (?,?,?,?,?)');
  const movement = db.prepare(`INSERT INTO stock_movements(product_id,movement_type,quantity_change,sale_item_id,unit_cost)
    VALUES (?,'SALE',?,?,?)`);
  return {
    list: (filters) => list.all(filters),
    get(id) { const row = get.get(id); return row ? { ...row, items: items.all(id), payments: payments.all(id) } : undefined; },
    customer: (id) => db.prepare('SELECT active FROM customers WHERE id=?').get(id),
    product: (id) => product.get(id),
    invoiceExists: (value) => Boolean(invoice.get(value)),
    nextInvoice() {
      // Called only under BEGIN IMMEDIATE: other writers cannot allocate the same number.
      let number = db.prepare('SELECT COALESCE(MAX(id),0)+1 AS next FROM sales').get().next;
      while (Number.isSafeInteger(number)) {
        const value = `SALE-${String(number).padStart(6,'0')}`;
        if (!invoice.get(value)) return value;
        number++;
      }
      throw new Error('Invoice number range exhausted');
    },
    insert: (data) => insert.run(data).lastInsertRowid,
    insertItem(saleId, item) {
      const id = insertItem.run(saleId,item.product_id,item.quantity,item.unit_price,item.unit_cost).lastInsertRowid;
      // The existing trigger applies the negative movement to inventory.
      movement.run(item.product_id,-item.quantity,id,item.unit_cost);
    },
    pay: (saleId, data) => db.prepare(`INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,paid_at)
      VALUES (?,?,?,?,?)`).run(data.customer_id,saleId,data.paid_amount,data.payment_method,data.sold_at),
  };
}
module.exports = { createSaleRepository };
