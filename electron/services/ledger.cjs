const v = require('./validation.cjs');
const { parseDate, safeNumbers } = require('../utils/analytics.cjs');
const { createLedgerRepository } = require('../repositories/ledger.cjs');

function normalizeLedger(input, full = false) {
  v.object(input,['party_type','party_id','from_date','to_date',...(full ? [] : ['limit','offset'])]);
  if (!['customer','supplier'].includes(input.party_type)) v.invalid('Choose a customer or supplier ledger.');
  const query = {party_type:input.party_type,party_id:v.id(input.party_id),from_date:input.from_date ?? null,to_date:input.to_date ?? null};
  for (const key of ['from_date','to_date']) if (query[key] !== null) parseDate(query[key]);
  if (query.from_date && query.to_date && query.from_date > query.to_date) v.invalid('From date must not follow To date.');
  if (!full) Object.assign(query,{limit:v.integer(input.limit ?? 25,'limit',1,100),offset:v.integer(input.offset ?? 0,'offset')});
  return query;
}
function createLedgerService(db) {
  const repositories = Object.fromEntries(['customer','supplier'].map(type => [type,createLedgerRepository(db,type)]));
  function read(input, full = false) {
    const q = normalizeLedger(input,full), repository = repositories[q.party_type];
    return db.transaction(() => {
      const party = repository.party(q.party_id);
      if (!party) throw new v.CatalogError('NOT_FOUND','Account not found.');
      const entries = [], totals = {invoices:0n,payments:0n,returns:0n,increase:0n,decrease:0n};
      let openingBalance = 0n, balance = 0n;
      for (const row of repository.entries(q.party_id)) {
        const day = row.local_time.slice(0,10), change = row.increase-row.decrease;
        if (q.from_date && day < q.from_date) { openingBalance += change; balance += change; continue; }
        if (q.to_date && day > q.to_date) continue;
        balance += change;
        totals.increase += row.increase; totals.decrease += row.decrease;
        totals[row.type === 'payment' ? 'payments' : row.type.endsWith('Return') ? 'returns' : 'invoices'] += row.increase + row.decrease;
        entries.push({...row,serial:entries.length+1,balance});
      }
      const account = repository.account(q.party_id), unallocated = repository.unallocated(q.party_id);
      const reconciliation = {outstanding:account.outstanding,creditDue:account.credit_due,unallocatedPayments:unallocated,
        currentNetBalance:account.outstanding-account.credit_due-unallocated};
      const result = {party,partyType:q.party_type,period:{from:q.from_date,to:q.to_date},openingBalance,closingBalance:balance,totals,reconciliation,
        totalRows:entries.length,limit:full ? entries.length : q.limit,offset:full ? 0 : q.offset,
        entries:full ? entries : entries.slice(q.offset,q.offset+q.limit)};
      return safeNumbers(result);
    }).deferred();
  }
  return {getStatement: input => read(input),getFullStatement:input => read(input,true)};
}
module.exports = { createLedgerService, normalizeLedger };
