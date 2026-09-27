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
  result.phone = normalizePhone(result.phone);
  return result;
}

function normalizePhone(value, label = 'Phone') {
  if (value === null) return null;
  if (!/^\+?[\d ()-]+$/.test(value)) v.invalid(`${label} must contain digits with an optional leading +, spaces, parentheses or hyphens.`);
  const normalized = value.replace(/[ ()-]/g, '');
  if (!/^\+?\d{7,15}$/.test(normalized)) v.invalid(`${label} must contain 7 to 15 digits.`);
  return normalized;
}

function contactFilters(data = {}) {
  v.object(data, ['search', 'active', 'limit', 'offset']);
  const { search, ...paging } = data;
  return { ...v.filters(paging), search: search === undefined ? '' : v.text(search, 'search', 200, true) || '' };
}
module.exports = { contactData, contactFilters, normalizePhone };
