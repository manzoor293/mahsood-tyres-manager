const fs = require('node:fs');
const path = require('node:path');
const { escapeHtml:e, money } = require('./template.cjs');
const { suggestedFilename } = require('../services/print-documents.cjs');
const css = fs.readFileSync(path.join(__dirname,'document.css'),'utf8');
const labels = {sale:'Sale',purchase:'Purchase',payment:'Payment',saleReturn:'Sale Return',purchaseReturn:'Purchase Return'};
function renderLedger(statement,shop,generatedAt) {
  const s = statement, customer = s.partyType === 'customer', title = `${customer ? 'CUSTOMER' : 'SUPPLIER'} LEDGER STATEMENT`;
  const period = !s.period.from && !s.period.to ? 'Complete Account History' : `${s.period.from || 'Beginning'} to ${s.period.to || 'Latest'}`;
  const filename = suggestedFilename(`${customer ? 'Customer' : 'Supplier'}-Ledger-${s.party.name}-${period}`);
  const summary = [['Opening Balance',s.openingBalance],[customer?'Total Sales':'Total Purchases',s.totals.invoices],['Total Payments',s.totals.payments],[customer?'Total Sale Returns':'Total Purchase Returns',s.totals.returns],['Closing Balance',s.closingBalance]];
  const p = values => values.filter(Boolean).map(value=>`<p>${e(value)}</p>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(title)}</title><style>${css}
    .ledger-table {font-size:9px} .ledger-table td,.ledger-table th {padding:4px} .ledger-table .money {font-size:9px}
    </style></head><body><main class="document"><header><h1>${e(shop.name)}</h1>${p([shop.address,shop.phone,shop.alternatePhone,shop.email,shop.ntn && `NTN / registration: ${shop.ntn}`])}</header>
    <h2>${title}</h2><div class="meta"><div>${p([period,`Status: ${s.party.active ? 'Active' : 'Inactive'}`])}</div><div>${p([s.party.name,s.party.phone,s.party.address])}</div></div>
    <div class="totals"><dl>${summary.map(([label,value])=>`<dt>${e(label)}</dt><dd>${e(money(value))}</dd>`).join('')}</dl></div>
    <p class="explanation">Increase: invoices. Decrease: payments and returns. Positive balance: ${customer?'customer owes shop':'shop owes supplier'}. Negative balance: ${customer?'customer credit / refund due':'supplier credit due to shop'}. Returns record adjustments, not cash refunds.</p>
    ${s.reconciliation.unallocatedPayments ? '<p class="explanation">Includes legacy unallocated payments omitted from existing invoice-based reports.</p>' : ''}
    <table class="ledger-table" aria-label="Ledger statement"><colgroup>${[4,11,8,11,11,16,12,12,15].map(width=>`<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${['S.NO','Date / Time','Type','Reference','Document No.','Description','Increase','Decrease','Running Balance'].map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${s.entries.map(row=>`<tr data-ledger-row="${row.serial}"><td>${row.serial}</td><td>${e(row.occurred_at.length===10 ? row.occurred_at : row.local_time)}</td><td>${labels[row.type]}</td><td>${e(row.reference)}</td><td>${e(row.document_number || '—')}</td><td>${e(row.description)}</td>${[row.increase,row.decrease,row.balance].map(value=>`<td class="money">${e(money(value))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${!s.entries.length?'<p>No transactions in this statement.</p>':''}<div class="totals"><dl><dt>Closing Balance</dt><dd>${e(money(s.closingBalance))}</dd></dl></div><footer>${p([shop.footer,`Generated: ${new Date(generatedAt).toLocaleString('en-PK')}`])}</footer></main></body></html>`;
  return {title,reference:s.party.name,filename,html};
}
module.exports = { renderLedger };
