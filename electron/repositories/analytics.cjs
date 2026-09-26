// Date-only business records stay local; UTC timestamps use local-midnight UTC bounds.
// Keep bare date columns in the range predicates so existing date indexes remain usable.
function within(column) {
  return `((length(${column})=10 AND ${column}>=@from AND ${column}<@until)
    OR (length(${column})>10 AND ${column}>=@start AND ${column}<@end))`;
}
const localDate = (column) => `CASE WHEN length(${column})=10 THEN ${column} ELSE date(${column},'localtime') END`;

// Internal SQL fragments only: caller-controlled identifiers never reach these helpers.
const paymentTotal=(table,link,id)=>`COALESCE((SELECT SUM(amount) FROM ${table} WHERE ${link}=${id}),0)`;
const returnedQuantity=(kind,id)=>`COALESCE((SELECT SUM(quantity) FROM ${kind}_return_items WHERE ${kind}_item_id=${id}),0)`;
const returnTotal=(kind,id)=>`COALESCE((SELECT SUM(total) FROM ${kind}_returns WHERE ${kind}_id=${id}),0)`;
const effectiveTotal=(kind,id,total)=>`(${total}-${returnTotal(kind,id)})`;
const withBalance=(sql)=>`SELECT *,MAX(effective_total-paid_amount,0) AS balance,MAX(paid_amount-effective_total,0) AS credit_due,
  CASE WHEN paid_amount>effective_total THEN 'credit' WHEN paid_amount=effective_total THEN 'paid' WHEN paid_amount>0 THEN 'partial' ELSE 'unpaid' END AS payment_status FROM (${sql})`;
const historicalCost=`COALESCE(SUM((i.quantity-${returnedQuantity('sale','i.id')})*i.unit_cost),0)`;
const unknownCosts='COALESCE(SUM(CASE WHEN i.unit_cost=0 THEN 1 ELSE 0 END),0)';
const localTime=(column)=>`CASE WHEN length(${column})=10 THEN ${column}||' 00:00:00.000' ELSE strftime('%Y-%m-%d %H:%M:%f',${column},'localtime') END`;
module.exports={within,localDate,localTime,paymentTotal,historicalCost,unknownCosts,returnedQuantity,returnTotal,effectiveTotal,withBalance};
