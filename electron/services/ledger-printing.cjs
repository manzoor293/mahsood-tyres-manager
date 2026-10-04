const { createLedgerService } = require('./ledger.cjs');
const { createSettingsService } = require('./settings.cjs');
const { renderLedger } = require('../printing/ledger.cjs');
const { CatalogError } = require('./validation.cjs');
function createLedgerPrintingService(db,driver) {
  const ledger = createLedgerService(db), settings = createSettingsService(db), busy = new Set();
  const preview = input => db.transaction(()=>renderLedger(ledger.getFullStatement(input),settings.getShopProfile(),new Date().toISOString())).deferred();
  async function output(method,input,owner) {
    if (busy.has(owner)) throw new CatalogError('BUSY','A ledger output operation is already in progress.');
    busy.add(owner);
    try {
      const fresh = preview(input);
      const result = method === 'print' ? await driver.print(fresh.html,owner) : await driver.savePdf(fresh.html,fresh.filename,owner);
      return {...result,preview:fresh};
    } finally {busy.delete(owner);}
  }
  return {preview,print:(input,owner)=>output('print',input,owner),savePdf:(input,owner)=>output('savePdf',input,owner)};
}
module.exports = { createLedgerPrintingService };
