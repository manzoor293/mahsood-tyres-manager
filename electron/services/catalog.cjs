const v = require('./validation.cjs');
const { createLookupRepository, createProductRepository, productFields } = require('../repositories/catalog.cjs');

function createCatalogServices(database) {
  const brands = createLookupRepository(database, 'brands');
  const categories = createLookupRepository(database, 'categories');
  const products = createProductRepository(database);
  function required(repository, id) {
    const row = repository.get(v.id(id));
    if (!row) throw new v.CatalogError('NOT_FOUND', 'Record not found.');
    return row;
  }
  function write(action) {
    try { return database.transaction(action).immediate(); }
    catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new v.CatalogError('CONFLICT', 'This name or SKU already exists, including inactive records.');
      throw error;
    }
  }
  function lookup(repository) {
    return {
      list: (filters) => repository.list(v.filters(filters)),
      create(data) {
        v.object(data, ['name']);
        const name = v.text(data.name, 'name');
        return write(() => repository.create(name));
      },
      update(id, data) {
        v.object(data, ['name']);
        const name = v.text(data.name, 'name');
        return write(() => { required(repository, id); return repository.update(id, name); });
      },
      deactivate(id) { return write(() => { required(repository, id); return repository.deactivate(id); }); },
    };
  }
  function productData(data, current) {
    v.object(data, productFields);
    if (current && Object.keys(data).length === 0) v.invalid('Provide at least one product field.');
    const result = {};
    for (const field of productFields) {
      const value = Object.hasOwn(data, field) ? data[field] : current?.[field];
      if (['sku', 'model', 'size'].includes(field)) result[field] = v.text(value, field);
      else if (['brand_id', 'category_id'].includes(field)) {
        // Keep optional legacy links when an unrelated field is edited.
        if (current && !Object.hasOwn(data, field) && value === null) result[field] = null;
        else result[field] = v.id(value);
      } else if (['default_selling_price', 'minimum_stock'].includes(field)) {
        result[field] = v.integer(value === undefined && !current ? 0 : value, field);
      } else result[field] = v.text(value, field, field === 'notes' ? 5000 : 200, true);
    }
    for (const [field, repository] of [['brand_id', brands], ['category_id', categories]]) {
      if (result[field] === null) continue;
      const linked = required(repository, result[field]);
      if (!linked.active && (!current || current[field] !== result[field])) v.invalid(`${field} must reference an active record.`);
    }
    return result;
  }
  return {
    brands: lookup(brands),
    categories: lookup(categories),
    products: {
      getById: (id) => required(products, id),
      list: (filters) => products.list(v.filters(filters, true)),
      create: (data) => write(() => products.create(productData(data))),
      update: (id, data) => write(() => products.update(id, productData(data, required(products, id)))),
      deactivate: (id) => write(() => { required(products, id); return products.deactivate(id); }),
    },
  };
}

module.exports = { createCatalogServices };
