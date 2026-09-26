const expenseFields = ['expense_category_id','amount','description','payment_method','spent_at'];
function createExpenseRepository(db) {
  const select = `SELECT e.*, c.name AS category_name, c.active AS category_active
    FROM expenses e JOIN expense_categories c ON c.id=e.expense_category_id`;
  const get = db.prepare(`${select} WHERE e.id=?`);
  const list = db.prepare(`${select} WHERE
    (@search='' OR instr(lower(e.description),lower(@search))>0 OR instr(lower(c.name),lower(@search))>0)
    AND (@expense_category_id IS NULL OR e.expense_category_id=@expense_category_id)
    AND (@payment_method='all' OR e.payment_method=@payment_method)
    AND (@from_date IS NULL OR substr(e.spent_at,1,10)>=@from_date)
    AND (@to_date IS NULL OR substr(e.spent_at,1,10)<=@to_date)
    ORDER BY e.spent_at DESC,e.id DESC LIMIT @limit OFFSET @offset`);
  const insert = db.prepare(`INSERT INTO expenses(${expenseFields.join(',')}) VALUES (${expenseFields.map((f)=>`@${f}`).join(',')})`);
  const update = db.prepare(`UPDATE expenses SET ${expenseFields.map((f)=>`${f}=@${f}`).join(',')} WHERE id=@id`);
  return {
    get: (id) => get.get(id), list: (filters) => list.all(filters),
    create(data) { return get.get(insert.run(data).lastInsertRowid); },
    update(id,data) { update.run({ ...data,id }); return get.get(id); },
  };
}
module.exports = { createExpenseRepository, expenseFields };
