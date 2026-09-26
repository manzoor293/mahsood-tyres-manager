const { CatalogError } = require('../services/validation.cjs');
function registerExpenseIpc(ipcMain,services,isTrustedSender) {
  const resources = { expenses: { list:[0,1],getById:[1,1],create:[1,1],update:[2,2] }, expenseCategories: { list:[0,1],create:[1,1],update:[2,2],deactivate:[1,1] } };
  const channels=[];
  for (const [resource,methods] of Object.entries(resources)) for (const [method,[min,max]] of Object.entries(methods)) {
    const channel=`${resource}:${method}`; channels.push(channel);
    ipcMain.handle(channel,(event,...args)=>{
      try {
        if (!isTrustedSender(event)) throw new CatalogError('FORBIDDEN','Untrusted IPC sender.');
        if (args.length<min || args.length>max) throw new CatalogError('VALIDATION','Invalid argument count.');
        return { ok:true,data:services[resource][method](...args) };
      } catch (error) {
        if (error instanceof CatalogError) return { ok:false,error:{ code:error.code,message:error.message } };
        console.error(`Expense operation failed (${channel}):`,error);
        return { ok:false,error:{ code:'INTERNAL',message:'The expense operation could not be completed.' } };
      }
    });
  }
  return ()=>{ for (const channel of channels) ipcMain.removeHandler(channel); };
}
module.exports = { registerExpenseIpc };
