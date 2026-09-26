const { CatalogError } = require('../services/validation.cjs');
function registerDashboardIpc(ipcMain,service,isTrustedSender) {
  const channel='dashboard:getOverview';
  ipcMain.handle(channel,(event,...args)=>{
    try {
      if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN','Untrusted IPC sender.');
      if (args.length>1) throw new CatalogError('VALIDATION','Invalid argument count.');
      return {ok:true,data:service.getOverview(...args)};
    } catch (error) {
      if (error instanceof CatalogError) return {ok:false,error:{code:error.code,message:error.message}};
      console.error('Dashboard query failed:',error);
      return {ok:false,error:{code:'INTERNAL',message:'The dashboard could not be loaded. Please retry.'}};
    }
  });
  return ()=>ipcMain.removeHandler(channel);
}
module.exports = { registerDashboardIpc };
