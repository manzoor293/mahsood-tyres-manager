const v = require('./validation.cjs');
const { createPurchaseRepository } = require('../repositories/purchases.cjs');

function date(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) v.invalid(`${field} must be a valid date (YYYY-MM-DD).`);
  return value;
}
function createPurchaseService(database) {
  const repository = createPurchaseRepository(database);
  function getById(value) {
    const row = repository.get(v.id(value));
    if (!row) throw new v.CatalogError('NOT_FOUND', 'Purchase not found.');
    return row;
  }
  return {
    getById,
    list(data = {}) {
      v.object(data, ['search','supplier_id','from_date','to_date','payment_status','limit','offset']);
      const filters = {
        search: v.text(data.search ?? '', 'search', 200, true) || '',
        supplier_id: data.supplier_id === undefined ? null : v.id(data.supplier_id),
        from_date: data.from_date === undefined ? null : date(data.from_date, 'From date'),
        to_date: data.to_date === undefined ? null : date(data.to_date, 'To date'),
        payment_status: data.payment_status ?? 'all',
        limit: v.integer(data.limit ?? 100, 'limit', 1, 500), offset: v.integer(data.offset ?? 0, 'offset'),
      };
      if (!['all','paid','partial','unpaid','credit'].includes(filters.payment_status)) v.invalid('Invalid payment status.');
      if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) v.invalid('From date must not follow To date.');
      return repository.list(filters);
    },
    create: (input) => database.transaction(() => {
      v.object(input, ['supplier_id','invoice_number','purchased_at','notes','items','discount','paid_amount','payment_method']);
      const data = {
        supplier_id: v.id(input.supplier_id), invoice_number: v.text(input.invoice_number, 'Invoice number'),
        purchased_at: date(input.purchased_at, 'Purchase date'), notes: v.text(input.notes, 'Notes', 5000, true),
        discount: v.integer(input.discount ?? 0, 'Discount'), paid_amount: v.integer(input.paid_amount ?? 0, 'Paid amount'),
        payment_method: v.text(input.payment_method ?? 'Cash', 'Payment method', 80),
      };
      if (!repository.supplier(data.supplier_id)?.active) v.invalid('Select an existing active supplier.');
      if (repository.invoiceExists(data.invoice_number)) throw new v.CatalogError('CONFLICT', 'Invoice number already exists.');
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500) v.invalid('A purchase must contain between 1 and 500 items.');
      const seen = new Set();
      data.subtotal = 0;
      const items = input.items.map((item) => {
        v.object(item, ['product_id','quantity','unit_cost']);
        const result = { product_id: v.id(item.product_id), quantity: v.integer(item.quantity, 'Quantity', 1), unit_cost: v.integer(item.unit_cost, 'Unit cost', 1) };
        if (seen.has(result.product_id)) v.invalid('Each product may appear only once per purchase.');
        seen.add(result.product_id);
        const product = repository.product(result.product_id);
        if (!product?.active) v.invalid('Select existing active products only.');
        v.integer(product.quantity, 'Current inventory quantity');
        v.integer(product.quantity + result.quantity, 'Resulting stock');
        const lineTotal = v.integer(result.quantity * result.unit_cost, 'Line total', 1);
        data.subtotal = v.integer(data.subtotal + lineTotal, 'Subtotal');
        return result;
      });
      if (data.discount > data.subtotal) v.invalid('Discount cannot exceed subtotal.');
      data.total = data.subtotal - data.discount;
      if (data.paid_amount > data.total) v.invalid('Paid amount cannot exceed the purchase total.');
      const purchaseId = repository.insert(data);
      for (const item of items) repository.insertItem(purchaseId, item);
      if (data.paid_amount > 0) repository.pay(purchaseId, data);
      return getById(purchaseId);
    }).immediate(),
  };
}
module.exports = { createPurchaseService };
