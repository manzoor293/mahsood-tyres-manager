const { localTime } = require('./analytics.cjs');
const { paymentKinds, createPaymentRepository } = require('./payments.cjs');

function createLedgerRepository(db, partyType) {
  const kind = partyType === 'customer' ? 'customerPayments' : 'supplierPayments';
  const c = paymentKinds[kind], k = partyType === 'customer' ? 'sale' : 'purchase';
  const document = k === 'purchase' ? "COALESCE(NULLIF(i.supplier_invoice_number,''),i.invoice_number)" : 'i.invoice_number';
  const prepare = sql => db.prepare(sql).safeIntegers();
  const source = `SELECT i.id,i.${c.date} AS occurred_at,i.created_at,0 AS priority,'${k}' AS type,
    i.invoice_number AS reference,${document} AS document_number,i.total AS increase,0 AS decrease,
    '${k === 'sale' ? 'Sale' : 'Purchase'} Invoice '||i.invoice_number AS description
    FROM ${c.invoices} i WHERE i.${c.contact}=@party_id
    UNION ALL SELECT p.id,p.paid_at,p.created_at,1,'payment',
    COALESCE(NULLIF(p.reference,''),'${k === 'sale' ? 'CP' : 'SP'}-'||printf('%06d',p.id)),
    ${document},0,p.amount,
    '${k === 'sale' ? 'Customer payment received' : 'Supplier payment'}'||CASE WHEN i.id IS NULL THEN ' (unallocated legacy payment)' ELSE ' against '||i.invoice_number END
    FROM ${c.table} p LEFT JOIN ${c.invoices} i ON i.id=p.${c.invoice} WHERE p.${c.contact}=@party_id
    UNION ALL SELECT r.id,r.returned_at,r.created_at,2,'${k}Return',r.reference,${document},0,r.total,
    '${k === 'sale' ? 'Sale' : 'Purchase'} return against '||i.invoice_number
    FROM ${k}_returns r JOIN ${c.invoices} i ON i.id=r.${k}_id WHERE i.${c.contact}=@party_id`;
  return {
    party: id => prepare(`SELECT id,name,phone,address,active FROM ${c.contacts} WHERE id=?`).get(id),
    entries: id => prepare(`SELECT *,${localTime('occurred_at')} AS local_time FROM (${source}) ORDER BY local_time,${localTime('created_at')},priority,id`).all({party_id:id}),
    account: id => createPaymentRepository(db,kind).account(id),
    unallocated: id => prepare(`SELECT COALESCE(SUM(amount),0) AS amount FROM ${c.table} WHERE ${c.contact}=? AND ${c.invoice} IS NULL`).get(id).amount,
  };
}
module.exports = { createLedgerRepository };
