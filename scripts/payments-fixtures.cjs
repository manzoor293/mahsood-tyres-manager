const {seedReports}=require('./reports-fixtures.cjs');
const {localTime}=require('./dashboard-fixtures.cjs');
const {createSaleService}=require('../electron/services/sales.cjs');
const {createPurchaseService}=require('../electron/services/purchases.cjs');
function seedPayments(db) {
  seedReports(db);
  const sale=createSaleService(db).create({invoice_number:'SALE-UNPAID',customer_id:1,sold_at:localTime('2026-09-08'),items:[{product_id:1,quantity:1,unit_price:10000}]});
  const purchase=createPurchaseService(db).create({invoice_number:'PUR-UNPAID',supplier_id:1,purchased_at:'2026-09-08',items:[{product_id:1,quantity:1,unit_cost:10000}]});
  return {sale:sale.id,purchase:purchase.id};
}
module.exports={seedPayments};
