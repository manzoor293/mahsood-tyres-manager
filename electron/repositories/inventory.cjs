const stock = `SELECT p.id AS product_id,p.sku,p.model,p.size,p.brand_id,p.category_id,p.active,
    p.minimum_stock,p.default_selling_price,b.name AS brand_name,c.name AS category_name,i.quantity,
    CASE WHEN i.quantity=0 THEN 'out' WHEN i.quantity<=p.minimum_stock THEN 'low' ELSE 'in' END AS stock_status
    FROM inventory i JOIN products p ON p.id=i.product_id
    LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN categories c ON c.id=p.category_id`;
function createInventoryRepository(db) {
  const search = `(@search='' OR instr(lower(sku),lower(@search))>0 OR instr(lower(model),lower(@search))>0
    OR instr(lower(size),lower(@search))>0 OR instr(lower(coalesce(brand_name,'')),lower(@search))>0)`;
  const filters = `${search} AND (@active IS NULL OR active=@active)
    AND (@brand_id IS NULL OR brand_id=@brand_id) AND (@category_id IS NULL OR category_id=@category_id)`;
  const list = db.prepare(`SELECT * FROM (${stock}) WHERE ${filters}
    AND (@stock_status='all' OR stock_status=@stock_status) ORDER BY sku COLLATE NOCASE,product_id LIMIT @limit OFFSET @offset`);
  const get = db.prepare(`SELECT * FROM (${stock}) WHERE product_id=?`);
  // Calculate ledger balance before filtering/paging, in insertion order (not editable business dates).
  const movements = db.prepare(`WITH ledger AS (
    SELECT m.*, SUM(quantity_change) OVER (PARTITION BY product_id ORDER BY id ROWS UNBOUNDED PRECEDING) AS resulting_quantity
    FROM stock_movements m
  ), history AS (
    SELECT m.*,p.sku,p.model,p.size,p.active,p.brand_id,p.category_id,b.name AS brand_name,
      CASE WHEN m.purchase_item_id IS NOT NULL THEN 'Purchase' WHEN m.sale_item_id IS NOT NULL THEN 'Sale'
        WHEN m.movement_type='OPENING_STOCK' THEN 'Opening stock' ELSE 'Manual adjustment' END AS reference_type,
      coalesce(pu.invoice_number,sa.invoice_number) AS invoice_number
    FROM ledger m JOIN products p ON p.id=m.product_id LEFT JOIN brands b ON b.id=p.brand_id
    LEFT JOIN purchase_items pi ON pi.id=m.purchase_item_id LEFT JOIN purchases pu ON pu.id=pi.purchase_id
    LEFT JOIN sale_items si ON si.id=m.sale_item_id LEFT JOIN sales sa ON sa.id=si.sale_id
  ) SELECT * FROM history WHERE ${filters}
    AND (@product_id IS NULL OR product_id=@product_id)
    AND (@movement_type='all' OR movement_type=@movement_type)
    AND (@from_date IS NULL OR substr(created_at,1,10)>=@from_date)
    AND (@to_date IS NULL OR substr(created_at,1,10)<=@to_date)
    ORDER BY id DESC LIMIT @limit OFFSET @offset`);
  const insert = db.prepare(`INSERT INTO stock_movements(product_id,movement_type,quantity_change,unit_cost,notes)
    VALUES (@product_id,@movement_type,@quantity_change,@unit_cost,@notes)`);
  const cost = db.prepare(`SELECT unit_cost FROM purchase_items WHERE product_id=? ORDER BY id DESC LIMIT 1`);
  return {
    list: (filters) => list.all(filters), get: (id) => get.get(id),
    listMovements: (filters) => movements.all(filters),
    latestPurchaseCost: (id) => cost.get(id)?.unit_cost ?? 0,
    insert: (data) => insert.run(data).lastInsertRowid,
  };
}
module.exports = { createInventoryRepository, stock };
