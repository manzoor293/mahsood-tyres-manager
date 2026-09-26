const {CatalogError}=require('../services/validation.cjs');
const {returnKinds}=require('../repositories/returns.cjs');
function registerReturnIpc(ipcMain,services,isTrustedSender){
  for(const [resource,config] of Object.entries(returnKinds))for(const method of ['list',config.read,'create','getById']){
    ipcMain.handle(`${resource}:${method}`,(event,...args)=>{
      try{
        if(!isTrustedSender(event))throw new CatalogError('FORBIDDEN','Untrusted IPC sender.');
        if(args.length>1||(method!=='list'&&args.length!==1))throw new CatalogError('VALIDATION','Invalid argument count.');
        return {ok:true,data:services[resource][method](...args)};
      }catch(error){
        if(error instanceof CatalogError)return {ok:false,error:{code:error.code,message:error.message}};
        console.error(`Return operation failed (${resource}:${method}):`,error);
        return {ok:false,error:{code:'INTERNAL',message:'Return could not be completed. Refresh and check return history before trying again.'}};
      }
    });
  }
}
module.exports={registerReturnIpc};
