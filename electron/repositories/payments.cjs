const {paymentTotal,within,localTime}=require('./analytics.cjs');
// Only these application-owned identifiers are used to construct SQL.
const paymentKinds={
  customerPayments:{table:'customer_payments',invoices:'sales',contacts:'customers',contact:'customer_id',invoice:'sale_id',date:'sold_at'},
  supplierPayments:{table:'supplier_payments',invoices:'purchases',contacts:'suppliers',contact:'supplier_id',invoice:'purchase_id',date:'purchased_at'},
};
function createPaymentRepository(db,kind) {
  const c=paymentKinds[kind];
  if(!c)throw new Error('Invalid payment repository kind');
  const prepare=(sql)=>db.prepare(sql).safeIntegers();
  const base=`SELECT i.id,i.invoice_number,i.${c.contact} AS contact_id,i.${c.date} AS invoice_date,i.total,
    a.name AS contact_name,a.phone,a.active,${paymentTotal(c.table,c.invoice,'i.id')} AS paid_amount
    FROM ${c.invoices} i LEFT JOIN ${c.contacts} a ON a.id=i.${c.contact}`;
  const invoices=`SELECT *,total-paid_amount AS balance,
    CASE WHEN paid_amount>=total THEN 'paid' WHEN paid_amount>0 THEN 'partial' ELSE 'unpaid' END AS payment_status FROM (${base})`;
  const get=prepare(`SELECT * FROM (${invoices}) WHERE id=?`);
  const matching=`SELECT * FROM (${invoices}) WHERE contact_id IS NOT NULL AND balance>0
    AND (@contact_id IS NULL OR contact_id=@contact_id)
    AND (@search='' OR instr(lower(invoice_number||' '||contact_name||' '||COALESCE(phone,'')),lower(@search))>0)`;
  const rows=prepare(`${matching} ORDER BY ${localTime('invoice_date')} DESC,id DESC LIMIT @limit OFFSET @offset`);
  const totals=prepare(`SELECT COUNT(*) AS totalRows,COALESCE(SUM(total),0) AS total,
    COALESCE(SUM(paid_amount),0) AS paid,COALESCE(SUM(balance),0) AS outstanding FROM (${matching})`);
  const account=prepare(`SELECT a.id,a.name,a.phone,a.active,
    COALESCE(SUM(i.total),0) AS total,COALESCE(SUM(i.paid_amount),0) AS paid,COALESCE(SUM(i.balance),0) AS outstanding,
    COALESCE(SUM(i.balance>0),0) AS openInvoices
    FROM ${c.contacts} a LEFT JOIN (${invoices}) i ON i.contact_id=a.id WHERE a.id=? GROUP BY a.id`);
  const historySource=`SELECT p.id,p.${c.contact} AS contact_id,p.${c.invoice} AS invoice_id,p.amount,p.payment_method,p.paid_at,p.notes,p.reference,p.created_at,
    a.name AS contact_name,i.invoice_number FROM ${c.table} p JOIN ${c.invoices} i ON i.id=p.${c.invoice}
    JOIN ${c.contacts} a ON a.id=p.${c.contact}
    WHERE (@contact_id IS NULL OR p.${c.contact}=@contact_id) AND (@invoice_id IS NULL OR p.${c.invoice}=@invoice_id)
    AND (@search='' OR instr(lower(i.invoice_number||' '||a.name||' '||COALESCE(p.notes,'')),lower(@search))>0)
    AND (@payment_method='all' OR p.payment_method=@payment_method) AND (@all_dates=1 OR ${within('p.paid_at')})`;
  const history=prepare(`${historySource} ORDER BY ${localTime('p.paid_at')} DESC,p.id DESC LIMIT @limit OFFSET @offset`);
  const historyTotals=prepare(`SELECT COUNT(*) AS totalRows,COALESCE(SUM(amount),0) AS amount FROM (${historySource})`);
  const insert=prepare(`INSERT INTO ${c.table}(${c.contact},${c.invoice},amount,payment_method,paid_at,notes)
    VALUES (@contact_id,@invoice_id,@amount,@payment_method,@paid_at,@notes)`);
  const payment=prepare(`SELECT * FROM ${c.table} WHERE id=?`);
  return {
    get:(id)=>get.get(id),account:(id)=>account.get(id),
    list:(filters)=>({rows:rows.all(filters),summary:totals.get(filters)}),
    history:(filters)=>({rows:history.all(filters),summary:historyTotals.get(filters)}),
    insert(data){return payment.get(insert.run(data).lastInsertRowid);},
  };
}
module.exports={createPaymentRepository,paymentKinds};
