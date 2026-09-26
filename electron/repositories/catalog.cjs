// Table/column names below are internal constants; all caller values are bound.
function createLookupRepository(database, table) {
  if (!['brands', 'categories', 'expense_categories'].includes(table)) throw new Error('Unsupported lookup repository');
  const get = database.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const insert = database.prepare(`INSERT INTO ${table}(name, updated_at) VALUES (?, ?)`);
  const update = database.prepare(`UPDATE ${table} SET name = ?, updated_at = ? WHERE id = ?`);
  const deactivate = database.prepare(`UPDATE ${table} SET active = 0, updated_at = ? WHERE id = ?`);
  const list = database.prepare(`SELECT * FROM ${table} WHERE (@active IS NULL OR active = @active) ORDER BY name, id LIMIT @limit OFFSET @offset`);
  return {
    get: (id) => get.get(id),
    list: (filters) => list.all(filters),
    create(name) { return get.get(insert.run(name, new Date().toISOString()).lastInsertRowid); },
    update(id, name) { update.run(name, new Date().toISOString(), id); return get.get(id); },
    deactivate(id) { deactivate.run(new Date().toISOString(), id); return get.get(id); },
  };
}

const productFields = ['sku', 'brand_id', 'category_id', 'model', 'size', 'pattern', 'tyre_type', 'default_selling_price', 'minimum_stock', 'notes'];

function createProductRepository(database) {
  const select = `SELECT p.*, b.name AS brand_name, c.name AS category_name, i.quantity AS stock_quantity
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN inventory i ON i.product_id = p.id`;
  const get = database.prepare(`${select} WHERE p.id = ?`);
  const insert = database.prepare(`INSERT INTO products (${productFields.join(',')}, updated_at)
    VALUES (${productFields.map((field) => `@${field}`).join(',')}, @updated_at)`);
  const update = database.prepare(`UPDATE products SET ${productFields.map((field) => `${field} = @${field}`).join(',')}, updated_at = @updated_at WHERE id = @id`);
  const deactivate = database.prepare('UPDATE products SET active = 0, updated_at = ? WHERE id = ?');
  // instr implements literal substring searches: SQL wildcards have no special meaning.
  const list = database.prepare(`${select} WHERE (@active IS NULL OR p.active = @active)
    AND (@brand_id IS NULL OR p.brand_id = @brand_id) AND (@category_id IS NULL OR p.category_id = @category_id)
    AND instr(lower(p.sku), lower(@sku)) > 0 AND instr(lower(p.model), lower(@model)) > 0
    AND instr(lower(p.size), lower(@size)) > 0 AND instr(lower(coalesce(b.name, '')), lower(@brand)) > 0
    AND (@search = '' OR instr(lower(p.sku), lower(@search)) > 0
      OR instr(lower(p.model), lower(@search)) > 0 OR instr(lower(p.size), lower(@search)) > 0
      OR instr(lower(coalesce(b.name, '')), lower(@search)) > 0)
    ORDER BY p.sku, p.id LIMIT @limit OFFSET @offset`);
  return {
    get: (id) => get.get(id),
    list: (filters) => list.all(filters),
    create(data) {
      const result = insert.run({ ...data, updated_at: new Date().toISOString() });
      const row = get.get(result.lastInsertRowid);
      if (row.stock_quantity !== 0) throw new Error('Product inventory was not initialized to zero');
      return row;
    },
    update(id, data) { update.run({ ...data, id, updated_at: new Date().toISOString() }); return get.get(id); },
    deactivate(id) { deactivate.run(new Date().toISOString(), id); return get.get(id); },
  };
}

module.exports = { createLookupRepository, createProductRepository, productFields };
