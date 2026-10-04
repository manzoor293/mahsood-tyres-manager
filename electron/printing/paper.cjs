// Main-process owned media settings; future custom pad dimensions belong here.
const invoicePaper = Object.freeze({ name: 'A5', kind: 'invoice', widthMm: 148, heightMm: 210, marginMm: 7 });
const standardPaper = Object.freeze({ name: 'A4', widthMm: 210, heightMm: 297, marginMm: 12 });
const paperFor = type => ['saleInvoice', 'purchaseInvoice'].includes(type) ? invoicePaper : standardPaper;
const electronPageSize = paper => ['A4', 'A5'].includes(paper.name) ? paper.name : { width: Math.round(paper.widthMm * 1000), height: Math.round(paper.heightMm * 1000) };
module.exports = { invoicePaper, standardPaper, paperFor, electronPageSize };
