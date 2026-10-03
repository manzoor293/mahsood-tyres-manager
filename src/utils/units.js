export const unitName = (factor) => factor === 2 ? 'Pair' : 'Tyre';
export const quantityLabel = (quantity, factor) => `${quantity} ${unitName(factor).toLowerCase()}${quantity === 1 ? '' : 's'}`;
export function movementLabel(tyres) {
  const pairs = stockLabel(Math.abs(tyres)).replace(/ \([^)]*\)$/, '');
  return `${tyres > 0 ? '+' : ''}${tyres} tyres (${pairs})`;
}
export function stockLabel(tyres) {
  if (!Number.isSafeInteger(tyres)) return 'Unavailable';
  const absolute = Math.abs(tyres), pairs = Math.floor(absolute / 2), remainder = absolute % 2;
  const parts = [];
  if (pairs || !remainder) parts.push(`${pairs} pair${pairs === 1 ? '' : 's'}`);
  if (remainder) parts.push('1 tyre');
  return `${tyres < 0 ? '-' : ''}${parts.join(' + ')} (${absolute} tyre${absolute === 1 ? '' : 's'})`;
}
export function pairPrice(product) {
  const result = product.default_selling_price * (product.price_units_per_unit === 2 ? 1 : 2);
  return Number.isSafeInteger(result) ? result : null;
}
export function parseWholeQuantity(value, minimum = 1, factor = 2) {
  if (!/^\d+$/.test(String(value).trim())) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= minimum && Number.isSafeInteger(result * factor) ? result : null;
}
