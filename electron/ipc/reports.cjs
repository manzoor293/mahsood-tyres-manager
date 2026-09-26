const {CatalogError}=require('../services/validation.cjs');
const {methods}=require('../services/reports.cjs');
function registerReportsIpc(ipcMain,service,isTrustedSender) {
  for(const method of methods)ipcMain.handle(`reports:${method}`,(event,...args)=>{
    try {
      if(!isTrustedSender(event))throw new CatalogError('FORBIDDEN','Untrusted IPC sender.');
      if(args.length>1)throw new CatalogError('VALIDATION','Invalid argument count.');
      return {ok:true,data:service[method](...args)};
    } catch(error) {
      if(error instanceof CatalogError)return {ok:false,error:{code:error.code,message:error.message}};
      console.error(`Report failed (${method}):`,error);
      return {ok:false,error:{code:'INTERNAL',message:'The report could not be loaded. Please retry.'}};
    }
  });
  return ()=>methods.forEach((method)=>ipcMain.removeHandler(`reports:${method}`));
}
module.exports={registerReportsIpc};
