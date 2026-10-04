const v = require('./validation.cjs');
function multiply(left, right, field) {
  v.integer(left, field); v.integer(right, field);
  const result = BigInt(left) * BigInt(right);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) v.invalid(`${field} exceeds the supported integer range.`);
  return Number(result);
}
function physicalQuantity(quantity, factor = 2) {
  v.integer(quantity, 'Quantity', 1);
  if (![1, 2].includes(factor)) v.invalid('Invalid original transaction unit.');
  return multiply(quantity, factor, 'Physical tyre quantity');
}
function pairCost(cost, factor) {
  if (![1, 2].includes(factor)) v.invalid('Invalid purchase cost unit.');
  return multiply(cost, factor === 1 ? 2 : 1, 'Historical pair cost');
}
module.exports = { multiply, physicalQuantity, pairCost };
