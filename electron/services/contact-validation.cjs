const v = require('./validation.cjs');
const fields = ['name', 'phone', 'address', 'notes'];

function contactData(data, current) {
  v.object(data, fields);
  if (current && !Object.keys(data).length) v.invalid('Provide at least one contact field.');
  const result = {};
  for (const field of fields) {
    const value = Object.hasOwn(data, field) ? data[field] : current?.[field];
    result[field] = v.text(value, field, field === 'notes' ? 5000 : field === 'address' ? 1000 : field === 'phone' ? 40 : 200, field !== 'name');
  }
  if (result.phone !== null) {
    if (!/^\+?[\d ()-]+$/.test(result.phone)) v.invalid('Phone must contain digits with an optional leading +, spaces, parentheses or hyphens.');
    result.phone = result.phone.replace(/[ ()-]/g, '');
    if (!/^\+?\d{7,15}$/.test(result.phone)) v.invalid('Phone must contain 7 to 15 digits.');
  }
  return result;
}

function contactFilters(data = {}) {
  v.object(data, ['search', 'active', 'limit', 'offset']);
  const { search, ...paging } = data;
  return { ...v.filters(paging), search: search === undefined ? '' : v.text(search, 'search', 200, true) || '' };
}
module.exports = { contactData, contactFilters };
