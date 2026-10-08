import assert from 'node:assert/strict';
import { formatPrice, parsePrice, priceInput } from '../src/utils/catalog.js';

assert.equal(formatPrice(0), 'Rs. 0');
assert.equal(formatPrice(1), 'Rs. 0.01');
assert.equal(formatPrice(101), 'Rs. 1.01');
assert.equal(formatPrice(-101), 'Rs. -1.01');
assert.equal(formatPrice(12500000000), 'Rs. 125,000,000');
assert.equal(formatPrice(Number.MAX_SAFE_INTEGER), 'Rs. 90,071,992,547,409.91');
assert.equal(formatPrice(-Number.MAX_SAFE_INTEGER), 'Rs. -90,071,992,547,409.91');
for (let amount = Number.MAX_SAFE_INTEGER - 200; amount <= Number.MAX_SAFE_INTEGER; amount++) {
  assert.equal(parsePrice(priceInput(amount)), amount, `Exact paise input roundtrip: ${amount}`);
  if (amount === Number.MAX_SAFE_INTEGER) break;
}
for (const value of ['NaN', 'Infinity', '-1', '1.001', '1e4', '1,000', '', '90071992547409.92']) {
  assert.equal(parsePrice(value), null, `Reject malformed or unsafe price: ${value}`);
}
console.log('PASS money: exact signed paise formatting, maximum safe values, input roundtrips and malformed/overflow rejection');
