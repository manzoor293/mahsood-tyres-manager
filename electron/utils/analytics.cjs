const v = require('../services/validation.cjs');
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'1900-01-01' || value>'9998-12-31') v.invalid('Use a valid date between 1900 and 9998.');
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime()) || dateKey(date)!==value) v.invalid('Use a valid date (YYYY-MM-DD).');
  return date;
}
function range(input = {}, now = new Date()) {
  v.object(input,['period','from_date','to_date']);
  const period = input.period ?? 'month';
  let from = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  let to = new Date(from);
  if (period==='custom') { from=parseDate(input.from_date);to=parseDate(input.to_date); }
  else {
    if (input.from_date!==undefined || input.to_date!==undefined) v.invalid('Dates require a custom period.');
    if (period==='week') from.setDate(from.getDate()-6);
    else if (period==='month') from.setDate(1);
    else if (period==='year') from=new Date(now.getFullYear(),0,1);
    else if (period!=='today') v.invalid('Invalid analytics period.');
  }
  if (from>to) v.invalid('From date must not follow To date.');
  if (to-from>366*10*86400000) v.invalid('Choose a date range of at most ten years.');
  const end = new Date(to);end.setDate(end.getDate()+1);
  const monthly = (to-from)/86400000>92;
  return { period,from:dateKey(from),to:dateKey(to),until:dateKey(end),start:from.toISOString(),end:end.toISOString(),bucketLength:monthly?7:10 };
}
// better-sqlite3 returns exact SQLite integers as BigInt. Reject unsafe totals, never round money.
function safeNumbers(value) {
  if (typeof value==='bigint') {
    if (value>BigInt(Number.MAX_SAFE_INTEGER) || value<BigInt(Number.MIN_SAFE_INTEGER)) throw new v.CatalogError('RANGE','Analytics totals exceed the supported integer range. Choose a smaller period.');
    return Number(value);
  }
  if (typeof value==='number' && !Number.isSafeInteger(value)) throw new v.CatalogError('RANGE','Analytics totals exceed the supported integer range.');
  if (Array.isArray(value)) return value.map(safeNumbers);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,safeNumbers(item)]));
  return value;
}

function profitAmounts(revenue,cost,unknown,expenses=0) {
  const grossProfit=unknown?null:safeNumbers(BigInt(revenue)-BigInt(cost));
  return {grossProfit,operatingResult:grossProfit===null?null:safeNumbers(BigInt(grossProfit)-BigInt(expenses))};
}
module.exports={dateKey,parseDate,range,safeNumbers,profitAmounts};
