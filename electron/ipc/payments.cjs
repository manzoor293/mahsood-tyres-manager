const {CatalogError}=require('../services/validation.cjs');
const paymentResources=['customerPayments','supplierPayments'];
const paymentApiMethods={list:0,history:0,getOutstanding:1,getAccountSummary:1,create:1};
function registerPaymentIpc(ipcMain,services,isTrustedSender) {
  const channels=[];
  for(const resource of paymentResources)for(const [method,min]of Object.entries(paymentApiMethods)) {
    const channel=`${resource}:${method}`;channels.push(channel);
    ipcMain.handle(channel,(event,...args)=>{
      try {
        if(!isTrustedSender(event))throw new CatalogError('FORBIDDEN','Untrusted IPC sender.');
        if(args.length<min||args.length>1)throw new CatalogError('VALIDATION','Invalid argument count.');
        return {ok:true,data:services[resource][method](...args)};
      }catch(error){
        if(error instanceof CatalogError)return {ok:false,error:{code:error.code,message:error.message}};
        console.error(`Payment operation failed (${channel}):`,error);
        return {ok:false,error:{code:'INTERNAL',message:'The payment operation could not be completed. Refresh and check payment history before trying again.'}};
      }
    });
  }
  return ()=>channels.forEach((channel)=>ipcMain.removeHandler(channel));
}
module.exports={registerPaymentIpc,paymentResources,paymentApiMethods};
