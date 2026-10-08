const v = require('./validation.cjs');

function money(value, field = 'Landed cost') {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    v.invalid(`${field} exceeds the supported integer range.`);
  return Number(value);
}

// Largest remainder; stable incoming item order breaks ties before IDs exist.
function allocateShipment(items, shipment) {
  v.integer(shipment, 'Shipment / Delivery Cost');
  const weights = items.map(item => {
    v.integer(item.quantity, 'Quantity', 1);
    v.integer(item.unit_cost, 'Supplier unit cost');
    const value = BigInt(item.quantity) * BigInt(item.unit_cost);
    money(value, 'Item value');
    return value;
  });
  const total = weights.reduce((sum, value) => sum + value, 0n);
  money(total, 'Items subtotal');
  if (!total && shipment) v.invalid('Shipment cost requires a positive total purchase item value.');
  const rows = weights.map((weight, index) => {
    const numerator = weight * BigInt(shipment);
    return { index, amount: total ? numerator / total : 0n, remainder: total ? numerator % total : 0n };
  });
  let remaining = BigInt(shipment) - rows.reduce((sum, row) => sum + row.amount, 0n);
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; remaining > 0n; index++, remaining--) ranked[index].amount++;
  const allocations = rows.map((row, index) => {
    money(weights[index] + row.amount, 'Landed line cost');
    return money(row.amount, 'Shipment allocation');
  });
  if (allocations.reduce((sum, amount) => sum + BigInt(amount), 0n) !== BigInt(shipment))
    throw new Error('Shipment allocation consistency failure');
  return allocations;
}

// Latest-purchase valuation: cumulative floor differences preserve every paise
// across one source quantity, even when sales split it into several invoices.
function freightForQuantity(freight, sourcePhysicalQuantity, offset, physicalQuantity) {
  v.integer(freight, 'Allocated shipment');
  v.integer(sourcePhysicalQuantity, 'Source physical quantity', 1);
  v.integer(offset, 'Shipment offset');
  v.integer(physicalQuantity, 'Sale physical quantity', 1);
  const amount = BigInt(freight), denominator = BigInt(sourcePhysicalQuantity), start = BigInt(offset);
  return money((start + BigInt(physicalQuantity)) * amount / denominator - start * amount / denominator, 'Historical shipment cost');
}
module.exports = { allocateShipment, freightForQuantity, money };
