const v = require('./validation.cjs');
const { createInventoryRepository } = require('../repositories/inventory.cjs');
const movementTypes = ['PURCHASE','SALE','SALE_RETURN','PURCHASE_RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT','OPENING_STOCK'];
function date(value, field) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().slice(0,10) !== value) v.invalid(`${field} must be a valid date (YYYY-MM-DD).`);
  return value;
}
function filters(data = {}, history = false) {
  v.object(data, ['search','brand_id','category_id','active','limit','offset',
    ...(history ? ['product_id','movement_type','from_date','to_date'] : ['stock_status'])]);
  const result = {
    ...v.filters({ active: data.active ?? (history ? 'all' : true), limit: data.limit, offset: data.offset }),
    search: v.text(data.search ?? '', 'Search', 200, true) || '',
    brand_id: data.brand_id === undefined ? null : v.id(data.brand_id),
    category_id: data.category_id === undefined ? null : v.id(data.category_id),
  };
  if (history) {
    result.product_id = data.product_id === undefined ? null : v.id(data.product_id);
    result.movement_type = data.movement_type ?? 'all';
    if (!['all',...movementTypes].includes(result.movement_type)) v.invalid('Invalid movement type.');
    result.from_date = date(data.from_date, 'From date'); result.to_date = date(data.to_date, 'To date');
    if (result.from_date && result.to_date && result.from_date > result.to_date) v.invalid('From date must not follow To date.');
  } else {
    result.stock_status = data.stock_status ?? 'all';
    if (!['all','in','low','out'].includes(result.stock_status)) v.invalid('Invalid stock status.');
  }
  return result;
}
function createInventoryService(db) {
  const repository = createInventoryRepository(db);
  function getProductStock(value) {
    const row = repository.get(v.id(value));
    if (!row) throw new v.CatalogError('NOT_FOUND', 'Product stock not found.');
    return row;
  }
  return {
    list: (data) => repository.list(filters(data)),
    getProductStock,
    listMovements: (data) => repository.listMovements(filters(data, true)),
    adjust: (data) => db.transaction(() => {
      v.object(data, ['product_id','movement_type','quantity','notes','expected_quantity']);
      const product = getProductStock(data.product_id);
      if (!product.active) v.invalid('Only active products can be adjusted.');
      if (!['ADJUSTMENT_IN','ADJUSTMENT_OUT'].includes(data.movement_type)) v.invalid('Choose ADJUSTMENT_IN or ADJUSTMENT_OUT.');
      const quantity = v.integer(data.quantity, 'Quantity', 1);
      const notes = v.text(data.notes, 'Reason', 5000);
      const current = v.integer(product.quantity, 'Current stock');
      if (data.expected_quantity !== undefined && v.integer(data.expected_quantity, 'Expected current stock') !== current)
        throw new v.CatalogError('CONFLICT', 'Stock changed since your review. Close and reopen the adjustment to review the latest quantity.');
      const change = data.movement_type === 'ADJUSTMENT_IN' ? quantity : -quantity;
      if (current + change < 0) v.invalid(`Insufficient stock. Only ${current} units are available.`);
      v.integer(current + change, 'Resulting stock');
      // Required schema cost is a reference only, not a stock valuation: last received cost, or zero if unknown.
      const movementId = repository.insert({ product_id: product.product_id, movement_type: data.movement_type,
        quantity_change: change, notes, unit_cost: repository.latestPurchaseCost(product.product_id) });
      // The existing stock_movements trigger performs the sole inventory mutation.
      return { movement_id: movementId, stock: getProductStock(product.product_id) };
    }).immediate(),
  };
}
module.exports = { createInventoryService };
