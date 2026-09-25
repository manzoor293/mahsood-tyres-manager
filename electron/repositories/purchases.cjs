function createPurchaseRepository(db) {
  const summary = `SELECT p.*, s.name AS supplier_name,
    (SELECT COUNT(*) FROM purchase_items WHERE purchase_id=p.id) AS item_count,
    COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE purchase_id=p.id),0) AS paid_amount
    FROM purchases p JOIN suppliers s ON s.id=p.supplier_id`;
  const projection = `SELECT *, total-paid_amount AS balance,
    CASE WHEN paid_amount>=total THEN 'paid' WHEN paid_amount>0 THEN 'partial' ELSE 'unpaid' END AS payment_status FROM (${summary})`;
  const get = db.prepare(`${projection} WHERE id=?`);
  const items = db.prepare(`SELECT i.*, p.sku, p.model, p.size, i.quantity*i.unit_cost AS line_total
    FROM purchase_items i JOIN products p ON p.id=i.product_id WHERE purchase_id=? ORDER BY i.id`);
  const payments = db.prepare('SELECT * FROM supplier_payments WHERE purchase_id=? ORDER BY id');
  const list = db.prepare(`SELECT * FROM (${projection}) WHERE
    (@search='' OR instr(lower(invoice_number),lower(@search))>0 OR instr(lower(supplier_name),lower(@search))>0)
    AND (@supplier_id IS NULL OR supplier_id=@supplier_id)
    AND (@from_date IS NULL OR substr(purchased_at,1,10)>=@from_date)
    AND (@to_date IS NULL OR substr(purchased_at,1,10)<=@to_date)
    AND (@payment_status='all' OR payment_status=@payment_status)
    ORDER BY purchased_at DESC,id DESC LIMIT @limit OFFSET @offset`);
  return {
    list: (filters) => list.all(filters),
    get(id) { const row = get.get(id); return row ? { ...row, items: items.all(id), payments: payments.all(id) } : undefined; },
    supplier: (id) => db.prepare('SELECT active FROM suppliers WHERE id=?').get(id),
    product: (id) => db.prepare('SELECT p.active,i.quantity FROM products p LEFT JOIN inventory i ON i.product_id=p.id WHERE p.id=?').get(id),
    invoiceExists: (invoice) => Boolean(db.prepare('SELECT id FROM purchases WHERE invoice_number=?').get(invoice)),
    insert: (data) => db.prepare(`INSERT INTO purchases(invoice_number,supplier_id,purchased_at,notes,subtotal,discount,total)
      VALUES (@invoice_number,@supplier_id,@purchased_at,@notes,@subtotal,@discount,@total)`).run(data).lastInsertRowid,
    insertItem(purchaseId, item) {
      const result = db.prepare('INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost) VALUES (?,?,?,?)').run(purchaseId,item.product_id,item.quantity,item.unit_cost);
      // The ledger trigger is the only writer of current inventory quantity.
      db.prepare(`INSERT INTO stock_movements(product_id,movement_type,quantity_change,purchase_item_id,unit_cost)
        VALUES (?,'PURCHASE',?,?,?)`).run(item.product_id,item.quantity,result.lastInsertRowid,item.unit_cost);
    },
    pay: (purchaseId, data) => db.prepare(`INSERT INTO supplier_payments(supplier_id,purchase_id,amount,payment_method,paid_at)
      VALUES (?,?,?,?,?)`).run(data.supplier_id,purchaseId,data.paid_amount,data.payment_method,data.purchased_at),
  };
}
module.exports = { createPurchaseRepository };
