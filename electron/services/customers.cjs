const { createCustomerRepository } = require('../repositories/customers.cjs');
const { customerData, customerFilters } = require('./customer-validation.cjs');
const { id, CatalogError } = require('./validation.cjs');

function createCustomerService(database) {
  const repository = createCustomerRepository(database);
  function required(value) {
    const row = repository.get(id(value));
    if (!row) throw new CatalogError('NOT_FOUND', 'Customer not found.');
    return row;
  }
  return {
    list: (filters) => repository.list(customerFilters(filters)),
    getById: required,
    create: (data) => database.transaction(() => repository.create(customerData(data))).immediate(),
    update: (value, data) => database.transaction(() => repository.update(value, customerData(data, required(value)))).immediate(),
    deactivate: (value) => database.transaction(() => { required(value); return repository.deactivate(value); }).immediate(),
  };
}
module.exports = { createCustomerService };
