const { createSupplierRepository } = require('../repositories/suppliers.cjs');
const { supplierData, supplierFilters } = require('./supplier-validation.cjs');
const { id, CatalogError } = require('./validation.cjs');

function createSupplierService(database) {
  const repository = createSupplierRepository(database);
  function required(value) {
    const row = repository.get(id(value));
    if (!row) throw new CatalogError('NOT_FOUND', 'Supplier not found.');
    return row;
  }
  return {
    list: (filters) => repository.list(supplierFilters(filters)),
    getById: required,
    create: (data) => database.transaction(() => repository.create(supplierData(data))).immediate(),
    update: (value, data) => database.transaction(() => repository.update(value, supplierData(data, required(value)))).immediate(),
    deactivate: (value) => database.transaction(() => { required(value); return repository.deactivate(value); }).immediate(),
  };
}
module.exports = { createSupplierService };
