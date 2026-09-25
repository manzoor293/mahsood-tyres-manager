function createCustomerRepository(database) {
  const get = database.prepare('SELECT * FROM customers WHERE id = ?');
  const insert = database.prepare('INSERT INTO customers(name, phone, address, notes, updated_at) VALUES (@name, @phone, @address, @notes, @updated_at)');
  const update = database.prepare('UPDATE customers SET name=@name, phone=@phone, address=@address, notes=@notes, updated_at=@updated_at WHERE id=@id');
  const deactivate = database.prepare('UPDATE customers SET active=0, updated_at=? WHERE id=?');
  const list = database.prepare(`SELECT * FROM customers WHERE (@active IS NULL OR active=@active)
    AND (@search='' OR instr(lower(name),lower(@search))>0 OR instr(coalesce(phone,''),@search)>0
      OR instr(lower(coalesce(address,'')),lower(@search))>0)
    ORDER BY name COLLATE NOCASE, id LIMIT @limit OFFSET @offset`);
  return {
    get: (id) => get.get(id),
    list: (filters) => list.all(filters),
    create(data) { return get.get(insert.run({ ...data, updated_at: new Date().toISOString() }).lastInsertRowid); },
    update(id, data) { update.run({ ...data, id, updated_at: new Date().toISOString() }); return get.get(id); },
    deactivate(id) { deactivate.run(new Date().toISOString(), id); return get.get(id); },
  };
}
module.exports = { createCustomerRepository };
