const v = require('./validation.cjs');
const { createSaleRepository } = require('../repositories/sales.cjs');
function date(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().slice(0,10) !== value) v.invalid(`${field} must be a valid date (YYYY-MM-DD).`);
  return value;
}
function saleTime(value = new Date().toISOString()) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    v.invalid('Sale date must be a valid UTC ISO timestamp.');
  return value;
}
function createSaleService(db) {
  const repository = createSaleRepository(db);
  function getById(value) {
    const row = repository.get(v.id(value));
    if (!row) throw new v.CatalogError('NOT_FOUND', 'Sale not found.');
    return row;
  }
  function stock(productId, quantity) {
    const product = repository.product(productId);
    if (!product?.active) v.invalid('Select existing active products only.');
    v.integer(product.quantity, 'Current stock');
    if (quantity > product.quantity) throw new v.CatalogError('INSUFFICIENT_STOCK', `Insufficient stock for ${product.sku}. Only ${product.quantity} available; requested ${quantity}. Stock may have changed since selection.`);
    return product;
  }
  return {
    getById,
    list(data = {}) {
      v.object(data, ['search','customer_id','walk_in','from_date','to_date','payment_status','limit','offset']);
      if (data.walk_in !== undefined && typeof data.walk_in !== 'boolean') v.invalid('walk_in must be true or false.');
      const filters = {
        search: v.text(data.search ?? '', 'Search', 200, true) || '',
        customer_id: data.customer_id === undefined ? null : v.id(data.customer_id), walk_in: Number(data.walk_in ?? false),
        from_date: data.from_date === undefined ? null : date(data.from_date,'From date'),
        to_date: data.to_date === undefined ? null : date(data.to_date,'To date'),
        payment_status: data.payment_status ?? 'all', limit: v.integer(data.limit ?? 100,'limit',1,500), offset: v.integer(data.offset ?? 0,'offset'),
      };
      if (filters.walk_in && filters.customer_id) v.invalid('Choose a customer or walk-in, not both.');
      if (!['all','paid','partial','unpaid'].includes(filters.payment_status)) v.invalid('Invalid payment status.');
      if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) v.invalid('From date must not follow To date.');
      return repository.list(filters);
    },
    create: (input) => db.transaction(() => {
      v.object(input, ['invoice_number','customer_id','items','discount','paid_amount','payment_method','notes','sold_at']);
      const data = {
        customer_id: input.customer_id == null ? null : v.id(input.customer_id),
        invoice_number: input.invoice_number === undefined ? repository.nextInvoice() : v.text(input.invoice_number,'Invoice number'),
        discount: v.integer(input.discount ?? 0,'Discount'), paid_amount: v.integer(input.paid_amount ?? 0,'Paid amount'),
        payment_method: input.payment_method ?? 'Cash', sold_at: saleTime(input.sold_at), notes: v.text(input.notes,'Notes',5000,true), subtotal: 0,
      };
      if (!['Cash','Bank transfer','Cheque'].includes(data.payment_method)) v.invalid('Payment method must be Cash, Bank transfer or Cheque.');
      if (data.customer_id !== null && !repository.customer(data.customer_id)?.active) v.invalid('Select an existing active customer or choose Walk-in.');
      if (repository.invoiceExists(data.invoice_number)) throw new v.CatalogError('CONFLICT','Invoice number already exists.');
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500) v.invalid('A sale must contain between 1 and 500 items.');
      const seen = new Set();
      const items = input.items.map((item) => {
        v.object(item, ['product_id','quantity','unit_price']);
        const result = { product_id: v.id(item.product_id), quantity: v.integer(item.quantity,'Quantity',1), unit_price: v.integer(item.unit_price,'Unit price') };
        if (seen.has(result.product_id)) v.invalid('Each product may appear only once per sale.');
        seen.add(result.product_id);
        result.unit_cost = v.integer(stock(result.product_id,result.quantity).unit_cost,'Historical unit cost');
        const lineTotal = v.integer(result.quantity * result.unit_price,'Line total');
        data.subtotal = v.integer(data.subtotal + lineTotal,'Subtotal');
        return result;
      });
      if (data.discount > data.subtotal) v.invalid('Discount cannot exceed subtotal.');
      data.total = data.subtotal - data.discount;
      if (data.paid_amount > data.total) v.invalid('Paid amount cannot exceed the sale total.');
      const saleId = repository.insert(data);
      for (const item of items) {
        stock(item.product_id,item.quantity); // Re-read immediately before each trigger-driven reduction.
        repository.insertItem(saleId,item);
      }
      if (data.paid_amount > 0) repository.pay(saleId,data);
      // BEGIN IMMEDIATE holds the write lock through commit; verify the final stock inside that lock.
      for (const item of items) v.integer(repository.product(item.product_id).quantity,'Resulting stock');
      return getById(saleId);
    }).immediate(),
  };
}
module.exports = { createSaleService };
