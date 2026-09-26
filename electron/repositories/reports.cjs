const {stock}=require('./inventory.cjs');
const {within,localTime,paymentTotal,historicalCost,unknownCosts}=require('./analytics.cjs');

const saleFacts=`SELECT s.*,c.name AS contact_name,c.phone,
  (SELECT COUNT(*) FROM sale_items WHERE sale_id=s.id) AS item_count,
  ${paymentTotal('customer_payments','sale_id','s.id')} AS paid_amount,
  (SELECT group_concat(DISTINCT payment_method) FROM customer_payments WHERE sale_id=s.id) AS payment_method,
  (SELECT ${historicalCost} FROM sale_items i WHERE i.sale_id=s.id) AS historicalCost,
  (SELECT ${unknownCosts} FROM sale_items i WHERE i.sale_id=s.id) AS unknownCostItemCount
  FROM sales s LEFT JOIN customers c ON c.id=s.customer_id`;
const purchaseFacts=`SELECT p.*,s.name AS contact_name,s.phone,
  (SELECT COUNT(*) FROM purchase_items WHERE purchase_id=p.id) AS item_count,
  ${paymentTotal('supplier_payments','purchase_id','p.id')} AS paid_amount
  FROM purchases p JOIN suppliers s ON s.id=p.supplier_id`;
const withBalance=(sql)=>`SELECT *,total-paid_amount AS balance,
  CASE WHEN paid_amount>=total THEN 'paid' WHEN paid_amount>0 THEN 'partial' ELSE 'unpaid' END AS payment_status FROM (${sql})`;
const invoiceSummary=`COUNT(*) AS rowCount,COALESCE(SUM(total),0) AS total,
  COALESCE(SUM(paid_amount),0) AS paid,COALESCE(SUM(balance),0) AS outstanding`;
const movements=`SELECT m.*,p.sku,p.model,p.size,
  CASE WHEN m.purchase_item_id IS NOT NULL THEN 'Purchase' WHEN m.sale_item_id IS NOT NULL THEN 'Sale'
    WHEN m.movement_type='OPENING_STOCK' THEN 'Opening stock' ELSE 'Manual adjustment' END AS reference_type,
  COALESCE(pu.invoice_number,s.invoice_number) AS invoice_number
  FROM stock_movements m JOIN products p ON p.id=m.product_id
  LEFT JOIN purchase_items pi ON pi.id=m.purchase_item_id LEFT JOIN purchases pu ON pu.id=pi.purchase_id
  LEFT JOIN sale_items si ON si.id=m.sale_item_id LEFT JOIN sales s ON s.id=si.sale_id`;
const sum=(field,alias=field)=>`COALESCE(SUM(${field}),0) AS ${alias}`;

function createReportsRepository(db) {
  const prepare=(sql)=>db.prepare(sql).safeIntegers();
  function report(source,where,summary,order) {
    const filtered=`SELECT * FROM (${source}) AS report_rows WHERE ${where}`;
    const totals=prepare(`SELECT ${summary} FROM (${filtered})`);
    const rows=prepare(`${filtered} ORDER BY ${order} LIMIT @limit OFFSET @offset`);
    return (filters)=>({summary:totals.get(filters),rows:rows.all(filters)});
  }
  const invoiceWhere=(date,contact)=>`${within(date)} AND (@search='' OR instr(lower(invoice_number),lower(@search))>0)
    AND (@${contact} IS NULL OR ${contact}=@${contact}) AND (@payment_status='all' OR payment_status=@payment_status)`;
  const sales=report(withBalance(saleFacts),`${invoiceWhere('sold_at','customer_id')}
    AND (@walk_in=0 OR customer_id IS NULL)
    AND (@payment_method='all' OR EXISTS (SELECT 1 FROM customer_payments cp WHERE cp.sale_id=report_rows.id AND cp.payment_method=@payment_method))`,invoiceSummary,`${localTime('sold_at')} DESC,id DESC`);
  const purchases=report(withBalance(purchaseFacts),invoiceWhere('purchased_at','supplier_id'),invoiceSummary,`${localTime('purchased_at')} DESC,id DESC`);
  const inventory=report(stock,`(@search='' OR instr(lower(sku||' '||model||' '||size),lower(@search))>0)
    AND (@brand_id IS NULL OR brand_id=@brand_id) AND (@category_id IS NULL OR category_id=@category_id)
    AND (@active IS NULL OR active=@active) AND (@stock_status='all' OR stock_status=@stock_status)`,
    `COUNT(*) AS rowCount,${sum('active=1','activeProducts')},${sum('quantity','stockUnits')},${sum("stock_status='low'",'lowStockCount')},${sum("stock_status='out'",'outOfStockCount')}`,'sku COLLATE NOCASE,product_id');
  const stockMovements=report(movements,`${within('created_at')} AND (@product_id IS NULL OR product_id=@product_id)
    AND (@movement_type='all' OR movement_type=@movement_type)`,
    `COUNT(*) AS rowCount,${sum('CASE WHEN quantity_change>0 THEN quantity_change ELSE 0 END','unitsIn')},${sum('CASE WHEN quantity_change<0 THEN -quantity_change ELSE 0 END','unitsOut')}`,`${localTime('created_at')} DESC,id DESC`);
  const expenses=report(`SELECT e.*,c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id=e.expense_category_id`,
    `${within('spent_at')} AND (@expense_category_id IS NULL OR expense_category_id=@expense_category_id)
    AND (@payment_method='all' OR payment_method=@payment_method)
    AND (@search='' OR instr(lower(description||' '||category_name),lower(@search))>0)`,
    `COUNT(*) AS rowCount,${sum('amount','expenses')}`,`${localTime('spent_at')} DESC,id DESC`);
  const profit=report(saleFacts,within('sold_at'),`COUNT(*) AS rowCount,${sum('total','salesRevenue')},${sum('discount','discount')},
    ${sum('historicalCost')},${sum('unknownCostItemCount')},${sum('unknownCostItemCount>0','affectedSaleCount')}`,`${localTime('sold_at')} DESC,id DESC`);
  const periodExpenses=prepare(`SELECT ${sum('amount','expenses')} FROM expenses WHERE ${within('spent_at')}`);
  function accounts(source,contact) {
    // Aggregate only open invoices. Fully paid invoices cannot inflate open-invoice totals/counts.
    return report(`SELECT ${contact} AS id,contact_name,phone,COUNT(*) AS invoiceCount,
      SUM(total) AS total,SUM(paid_amount) AS paid,SUM(balance) AS outstanding
      FROM (${withBalance(source)}) WHERE ${contact} IS NOT NULL AND balance>0 GROUP BY ${contact}`,
      `(@search='' OR instr(lower(contact_name||' '||COALESCE(phone,'')),lower(@search))>0)`,
      `COUNT(*) AS rowCount,${sum('invoiceCount')},${sum('total')},${sum('paid')},${sum('outstanding')}`,'outstanding DESC,contact_name COLLATE NOCASE,id');
  }
  const receivables=accounts(saleFacts,'customer_id'),payables=accounts(purchaseFacts,'supplier_id');
  const walkIn=prepare(`SELECT ${sum('balance','excludedWalkInBalance')} FROM (${withBalance(saleFacts)}) WHERE customer_id IS NULL AND balance>0`);
  return {
    getSales:sales,getPurchases:purchases,getInventory:inventory,getStockMovements:stockMovements,getExpenses:expenses,
    getProfit(filters) { const result=profit(filters);Object.assign(result.summary,periodExpenses.get(filters));return result; },
    getReceivables(filters) {const result=receivables(filters);Object.assign(result.summary,walkIn.get());return result;},
    getPayables:payables,
  };
}
module.exports={createReportsRepository};
