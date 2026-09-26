const { stock } = require('./inventory.cjs');

const {within,localDate,historicalCost,unknownCosts,paymentTotal}=require('./analytics.cjs');
function createDashboardRepository(db) {
  const one = (sql) => db.prepare(sql).safeIntegers();
  const sales = one(`SELECT COUNT(*) AS saleCount,COALESCE(SUM(total),0) AS salesRevenue FROM sales WHERE ${within('sold_at')}`);
  const purchases = one(`SELECT COUNT(*) AS purchaseCount,COALESCE(SUM(total),0) AS purchaseTotal FROM purchases WHERE ${within('purchased_at')}`);
  const expenses = one(`SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE ${within('spent_at')}`);
  const received = one(`SELECT COALESCE(SUM(amount),0) AS amountReceived FROM customer_payments WHERE sale_id IS NOT NULL AND ${within('paid_at')}`);
  const paid = one(`SELECT COALESCE(SUM(amount),0) AS supplierAmountPaid FROM supplier_payments WHERE purchase_id IS NOT NULL AND ${within('paid_at')}`);
  const balances = one(`SELECT
    (SELECT COALESCE(SUM(total-${paymentTotal('customer_payments','sale_id','s.id')}),0) FROM sales s) AS customerReceivables,
    (SELECT COALESCE(SUM(total-${paymentTotal('supplier_payments','purchase_id','p.id')}),0) FROM purchases p) AS supplierPayables`);
  const cost = one(`SELECT ${historicalCost} AS historicalCost,
    ${unknownCosts} AS unknownCostItemCount
    FROM sales s JOIN sale_items i ON i.sale_id=s.id WHERE ${within('s.sold_at')}`);
  const inventory = one(`SELECT COUNT(*) AS activeProducts,COALESCE(SUM(quantity),0) AS stockUnits,
    COALESCE(SUM(stock_status='low'),0) AS lowStockCount,COALESCE(SUM(stock_status='out'),0) AS outOfStockCount
    FROM (${stock}) WHERE active=1`);
  const alerts = one(`SELECT * FROM (${stock}) WHERE active=1 AND stock_status IN ('low','out')
    ORDER BY CASE stock_status WHEN 'out' THEN 0 ELSE 1 END,sku COLLATE NOCASE,product_id LIMIT 10`);
  const trend = one(`SELECT substr(${localDate('sold_at')},1,@bucketLength) AS bucket,
    SUM(total) AS revenue,COUNT(*) AS count FROM sales WHERE ${within('sold_at')} GROUP BY bucket ORDER BY bucket`);
  const top = one(`SELECT p.id AS product_id,p.sku,p.model,p.size,b.name AS brand_name,
    SUM(i.quantity) AS quantitySold,SUM(i.quantity*i.unit_price) AS itemRevenue
    FROM sales s JOIN sale_items i ON i.sale_id=s.id JOIN products p ON p.id=i.product_id
    LEFT JOIN brands b ON b.id=p.brand_id WHERE ${within('s.sold_at')}
    GROUP BY p.id ORDER BY quantitySold DESC,itemRevenue DESC,p.id LIMIT 5`);
  const activity = one(`SELECT * FROM (
    SELECT 'Sale' AS type,id,invoice_number AS reference,sold_at AS occurredAt,total AS amount,NULL AS quantity FROM sales WHERE ${within('sold_at')}
    UNION ALL SELECT 'Purchase',id,invoice_number,purchased_at,total,NULL FROM purchases WHERE ${within('purchased_at')}
    UNION ALL SELECT 'Expense',id,description,spent_at,amount,NULL FROM expenses WHERE ${within('spent_at')}
    UNION ALL SELECT 'Stock adjustment',m.id,p.sku,m.created_at,NULL,m.quantity_change
      FROM stock_movements m JOIN products p ON p.id=m.product_id
      WHERE m.movement_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','OPENING_STOCK') AND ${within('m.created_at')}
    ) ORDER BY CASE WHEN length(occurredAt)=10 THEN occurredAt||' 00:00:00.000' ELSE strftime('%Y-%m-%d %H:%M:%f',occurredAt,'localtime') END DESC,type,id DESC LIMIT 10`);
  return {
    overview(filters) {
      return {
        summary: { ...sales.get(filters),...purchases.get(filters),...expenses.get(filters),...received.get(filters),
          ...paid.get(filters),...balances.get(),...cost.get(filters),...inventory.get() },
        salesTrend: trend.all(filters),topProducts: top.all(filters),stockAlerts: alerts.all(),recentActivity: activity.all(filters),
      };
    },
  };
}
module.exports = { createDashboardRepository };
