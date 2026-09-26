// Date-only business records stay local; UTC timestamps use local-midnight UTC bounds.
// Keep bare date columns in the range predicates so existing date indexes remain usable.
function within(column) {
  return `((length(${column})=10 AND ${column}>=@from AND ${column}<@until)
    OR (length(${column})>10 AND ${column}>=@start AND ${column}<@end))`;
}
const localDate = (column) => `CASE WHEN length(${column})=10 THEN ${column} ELSE date(${column},'localtime') END`;

// Internal SQL fragments only: caller-controlled identifiers never reach these helpers.
const paymentTotal=(table,link,id)=>`COALESCE((SELECT SUM(amount) FROM ${table} WHERE ${link}=${id}),0)`;
const historicalCost='COALESCE(SUM(i.quantity*i.unit_cost),0)';
const unknownCosts='COALESCE(SUM(CASE WHEN i.unit_cost=0 THEN 1 ELSE 0 END),0)';
const localTime=(column)=>`CASE WHEN length(${column})=10 THEN ${column}||' 00:00:00.000' ELSE strftime('%Y-%m-%d %H:%M:%f',${column},'localtime') END`;
module.exports={within,localDate,localTime,paymentTotal,historicalCost,unknownCosts};
