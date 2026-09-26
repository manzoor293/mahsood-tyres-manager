const v = require('./validation.cjs');
const { createLookupRepository } = require('../repositories/catalog.cjs');
const { createExpenseRepository, expenseFields } = require('../repositories/expenses.cjs');
const paymentMethods = ['Cash','Bank transfer','Cheque'];
function date(value,field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().slice(0,10) !== value) v.invalid(`${field} must be a valid date (YYYY-MM-DD).`);
  return value;
}
function createExpenseServices(db) {
  const categories = createLookupRepository(db,'expense_categories');
  const expenses = createExpenseRepository(db);
  function required(repository,value) {
    const row = repository.get(v.id(value));
    if (!row) throw new v.CatalogError('NOT_FOUND','Record not found.');
    return row;
  }
  function write(action) {
    try { return db.transaction(action).immediate(); }
    catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new v.CatalogError('CONFLICT','This category name already exists, including inactive records.');
      throw error;
    }
  }
  function data(input,current) {
    v.object(input,expenseFields);
    if (current && !Object.keys(input).length) v.invalid('Provide at least one expense field.');
    const merged = { ...current,...input };
    const result = {
      expense_category_id: v.id(merged.expense_category_id), amount: v.integer(merged.amount,'Amount',1),
      description: v.text(merged.description,'Description',5000),
      payment_method: Object.hasOwn(merged,'payment_method') ? merged.payment_method : 'Cash',
      spent_at: merged.spent_at,
    };
    // Preserve untouched legacy timestamps and methods; new/edited values use the current rules.
    if (!current || Object.hasOwn(input,'spent_at')) result.spent_at = date(result.spent_at,'Expense date');
    if ((!current || Object.hasOwn(input,'payment_method')) && !paymentMethods.includes(result.payment_method)) v.invalid('Payment method must be Cash, Bank transfer or Cheque.');
    const category = required(categories,result.expense_category_id);
    if (!category.active && (!current || current.expense_category_id !== category.id)) v.invalid('Select an active expense category.');
    return result;
  }
  return {
    expenseCategories: {
      list: (filters) => categories.list(v.filters(filters)),
      create(input) { v.object(input,['name']); const name=v.text(input.name,'Category name'); return write(()=>categories.create(name)); },
      update(id,input) { v.object(input,['name']); const name=v.text(input.name,'Category name'); return write(()=>{ required(categories,id); return categories.update(id,name); }); },
      deactivate: (id) => write(()=>{ required(categories,id); return categories.deactivate(id); }),
    },
    expenses: {
      getById: (id) => required(expenses,id),
      list(input = {}) {
        v.object(input,['search','expense_category_id','payment_method','from_date','to_date','limit','offset']);
        const filters = {
          search: v.text(input.search ?? '', 'Search',200,true) || '',
          expense_category_id: input.expense_category_id === undefined ? null : v.id(input.expense_category_id),
          payment_method: input.payment_method ?? 'all',
          from_date: input.from_date === undefined ? null : date(input.from_date,'From date'),
          to_date: input.to_date === undefined ? null : date(input.to_date,'To date'),
          limit: v.integer(input.limit ?? 100,'limit',1,500), offset: v.integer(input.offset ?? 0,'offset'),
        };
        if (!['all',...paymentMethods].includes(filters.payment_method)) v.invalid('Invalid payment method filter.');
        if (filters.from_date && filters.to_date && filters.from_date>filters.to_date) v.invalid('From date must not follow To date.');
        return expenses.list(filters);
      },
      create: (input) => write(()=>expenses.create(data(input))),
      update: (id,input) => write(()=>expenses.update(id,data(input,required(expenses,id)))),
    },
  };
}
module.exports = { createExpenseServices };
