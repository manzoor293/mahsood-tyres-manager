const { BrowserWindow } = require('electron');
const { CatalogError } = require('../services/validation.cjs');
function registerLedgerIpc(ipcMain,ledger,printing,isTrustedSender) {
  const methods = {getStatement:ledger.getStatement,preview:printing.preview,print:printing.print,savePdf:printing.savePdf};
  for (const [method,run] of Object.entries(methods)) ipcMain.handle(`ledger:${method}`,async(event,...args)=>{
    try {
      if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN','Untrusted IPC sender.');
      if (args.length !== 1) throw new CatalogError('VALIDATION','Provide one ledger request.');
      return {ok:true,data:await run(args[0],BrowserWindow.fromWebContents(event.sender))};
    } catch(error) {
      if (error instanceof CatalogError) return {ok:false,error:{code:error.code,message:error.message}};
      console.error(`Ledger failed (${method}):`,error);
      return {ok:false,error:{code:'INTERNAL',message:'Unable to load or output this ledger. Please retry.'}};
    }
  });
  return ()=>Object.keys(methods).forEach(method=>ipcMain.removeHandler(`ledger:${method}`));
}
module.exports = { registerLedgerIpc };
