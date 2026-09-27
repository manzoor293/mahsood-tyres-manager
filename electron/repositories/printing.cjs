const {paymentTotal, returnTotal, withBalance} = require('./analytics.cjs');

// All SQL identifiers are application-owned constants, never renderer input.
const kinds = {
  sale: {invoices:'sales', items:'sale_items', contact:'customer_id', contacts:'customers', payments:'customer_payments', date:'sold_at'},
  purchase: {invoices:'purchases', items:'purchase_items', contact:'supplier_id', contacts:'suppliers', payments:'supplier_payments', date:'purchased_at'},
};

function createPrintingRepository(db) {
  const prepare = (sql) => db.prepare(sql).safeIntegers();
  function invoice(kind, id) {
    const c = kinds[kind];
    return prepare(withBalance(`SELECT i.id,i.invoice_number,i.subtotal,i.discount,i.total,i.notes,i.${c.date} AS date,
      a.name AS contact_name,a.phone AS contact_phone,a.address AS contact_address,
      ${paymentTotal(c.payments,`${kind}_id`,'i.id')} AS paid_amount,
      ${returnTotal(kind,'i.id')} AS returned_value,i.total-${returnTotal(kind,'i.id')} AS effective_total,
      (SELECT group_concat(DISTINCT payment_method) FROM ${c.payments} WHERE ${kind}_id=i.id) AS payment_methods
      FROM ${c.invoices} i LEFT JOIN ${c.contacts} a ON a.id=i.${c.contact}`) + ' WHERE id=?').get(id);
  }
  return {
    invoice,
    invoiceItems(kind,id) {
      const c=kinds[kind], price=kind==='sale'?'unit_price':'unit_cost';
      // Customer-facing selection never includes internal sale cost.
      return prepare(`SELECT i.id,p.sku,p.model,p.size,b.name AS brand,i.quantity,i.${price} AS unit_value,
        i.quantity*i.${price} AS line_total
        FROM ${c.items} i JOIN products p ON p.id=i.product_id LEFT JOIN brands b ON b.id=p.brand_id
        WHERE i.${kind}_id=? ORDER BY i.id`).all(id);
    },
    references: (kind,id) => prepare(`SELECT reference,returned_at,total FROM ${kind}_returns WHERE ${kind}_id=? ORDER BY id`).all(id),
    payment(kind,id) {
      const c=kinds[kind];
      return prepare(`SELECT p.id,p.${kind}_id AS invoice_id,p.amount,p.payment_method,p.reference,p.notes,p.paid_at AS date,
        a.name AS contact_name,a.phone AS contact_phone,a.address AS contact_address,
        COALESCE((SELECT SUM(prior.amount) FROM ${c.payments} prior WHERE prior.${kind}_id=p.${kind}_id AND prior.id<p.id),0) AS previously_paid
        FROM ${c.payments} p LEFT JOIN ${c.contacts} a ON a.id=p.${c.contact} WHERE p.id=?`).get(id);
    },
    returnDocument: (kind,id) => prepare(`SELECT id,reference,${kind}_id AS invoice_id,returned_at AS date,notes,total FROM ${kind}_returns WHERE id=?`).get(id),
    returnItems(kind,id) {
      return prepare(`SELECT r.id,p.sku,p.model,p.size,b.name AS brand,r.quantity,r.unit_price AS unit_value,
        r.gross_value,r.return_value AS line_total
        FROM ${kind}_return_items r JOIN ${kind}_items i ON i.id=r.${kind}_item_id
        JOIN products p ON p.id=i.product_id LEFT JOIN brands b ON b.id=p.brand_id WHERE r.return_id=? ORDER BY r.id`).all(id);
    },
  };
}
module.exports = {createPrintingRepository};
