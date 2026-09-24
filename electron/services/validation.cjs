class CatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function invalid(message) { throw new CatalogError('VALIDATION', message); }

function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) invalid('Expected a plain object.');
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) invalid(`Unknown field: ${key}`);
  }
  return value;
}

function text(value, field, max = 200, optional = false) {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || value.includes('\0')) invalid(`${field} must be text.`);
  const result = value.trim();
  if ((!optional && !result) || result.length > max) invalid(`${field} is required and must be at most ${max} characters.`);
  return result || null;
}

function integer(value, field, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(`${field} must be an integer between ${minimum} and ${maximum}.`);
  return value;
}

function id(value) { return integer(value, 'id', 1); }

function filters(value = {}, product = false) {
  object(value, ['active', 'limit', 'offset', ...(product ? ['search', 'sku', 'brand', 'model', 'size', 'brand_id', 'category_id'] : [])]);
  const result = { active: 1, limit: 100, offset: 0 };
  if (value.active !== undefined) {
    if (![true, false, 'all'].includes(value.active)) invalid('active must be true, false, or "all".');
    result.active = value.active === 'all' ? null : Number(value.active);
  }
  if (value.limit !== undefined) result.limit = integer(value.limit, 'limit', 1, 500);
  if (value.offset !== undefined) result.offset = integer(value.offset, 'offset');
  if (product) {
    for (const field of ['search', 'sku', 'brand', 'model', 'size']) {
      result[field] = value[field] === undefined ? '' : text(value[field], field, 200, true) || '';
    }
    for (const field of ['brand_id', 'category_id']) result[field] = value[field] === undefined ? null : id(value[field]);
  }
  return result;
}

module.exports = { CatalogError, invalid, object, text, integer, id, filters };
