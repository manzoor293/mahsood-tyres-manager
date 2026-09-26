const {returnedQuantity,returnTotal,paymentTotal,withBalance,localTime}=require('./analytics.cjs');
const returnKinds={
  saleReturns:{kind:'sale',invoices:'sales',contacts:'customers',contact:'customer_id',payments:'customer_payments',price:'unit_price',prefix:'SR',movement:'SALE_RETURN',sign:1,read:'getReturnableSale'},
  purchaseReturns:{kind:'purchase',invoices:'purchases',contacts:'suppliers',contact:'supplier_id',payments:'supplier_payments',price:'unit_cost',prefix:'PR',movement:'PURCHASE_RETURN',sign:-1,read:'getReturnablePurchase'},
};
function createReturnRepository(db,c) {
  const k=c.kind,prepare=(sql)=>db.prepare(sql).safeIntegers();
  const invoice=prepare(withBalance(`SELECT i.*,a.name AS contact_name,
    ${returnTotal(k,'i.id')} AS returned_value,i.total-${returnTotal(k,'i.id')} AS effective_total,
    ${paymentTotal(c.payments,`${k}_id`,'i.id')} AS paid_amount
    FROM ${c.invoices} i LEFT JOIN ${c.contacts} a ON a.id=i.${c.contact}`)+' WHERE id=?');
  const items=prepare(`SELECT i.*,p.sku,p.model,p.size,v.quantity AS current_stock,
    ${returnedQuantity(k,'i.id')} AS returned_quantity
    FROM ${k}_items i JOIN products p ON p.id=i.product_id JOIN inventory v ON v.product_id=p.id
    WHERE i.${k}_id=? ORDER BY i.id`);
  const source=`SELECT r.*,i.invoice_number,a.name AS contact_name,
    (SELECT COUNT(*) FROM ${k}_return_items WHERE return_id=r.id) AS item_count
    FROM ${k}_returns r JOIN ${c.invoices} i ON i.id=r.${k}_id LEFT JOIN ${c.contacts} a ON a.id=i.${c.contact}`;
  const filter=`(@search='' OR instr(lower(reference||' '||invoice_number||' '||COALESCE(contact_name,'Walk-in')),lower(@search))>0)
    AND (@invoice_id IS NULL OR ${k}_id=@invoice_id)`;
  return {
    invoice(id){const row=invoice.get(id);return row?{...row,items:items.all(id)}:undefined;},
    get(id){const row=prepare(`${source} WHERE r.id=?`).get(id);return row?{...row,items:prepare(`SELECT ri.*,p.sku,p.model,p.size FROM ${k}_return_items ri JOIN ${k}_items i ON i.id=ri.${k}_item_id JOIN products p ON p.id=i.product_id WHERE ri.return_id=? ORDER BY ri.id`).all(id)}:undefined;},
    list(filters){return {rows:prepare(`SELECT * FROM (${source}) WHERE ${filter} ORDER BY ${localTime('returned_at')} DESC,id DESC LIMIT @limit OFFSET @offset`).all(filters),...prepare(`SELECT COUNT(*) AS totalRows,COALESCE(SUM(total),0) AS total FROM (${source}) WHERE ${filter}`).get(filters)};},
    insert(data){
      const next=prepare(`SELECT COALESCE(MAX(id),0)+1 AS id FROM ${k}_returns`).get().id;
      return prepare(`INSERT INTO ${k}_returns(reference,${k}_id,returned_at,notes,total) VALUES (?,?,?,?,?)`).run(`${c.prefix}-${String(next).padStart(6,'0')}`,data.invoice_id,data.returned_at,data.notes,data.total).lastInsertRowid;
    },
    insertItem(returnId,item,data){
      const movement=prepare(`INSERT INTO stock_movements(product_id,movement_type,quantity_change,${k}_item_id,unit_cost,notes,created_at) VALUES (?,?,?,?,?,?,?)`).run(item.product_id,c.movement,c.sign*item.quantity,item.id,item.unit_cost,data.notes,data.returned_at).lastInsertRowid;
      prepare(`INSERT INTO ${k}_return_items(return_id,${k}_item_id,quantity,unit_price,unit_cost,gross_value,return_value,movement_id) VALUES (?,?,?,?,?,?,?,?)`).run(returnId,item.id,item.quantity,item[c.price],item.unit_cost,item.gross_value,item.return_value,movement);
    },
  };
}
module.exports={createReturnRepository,returnKinds};
