const {createDocumentService}=require('./print-documents.cjs');
const {renderDocument}=require('../printing/template.cjs');
const {CatalogError}=require('./validation.cjs');
function createPrintingService(db,driver) {
  const documents=createDocumentService(db),busy=new Set();
  function preview(type,id) {
    const document=documents.getDocument(type,id);
    return {title:document.title,reference:document.reference,filename:document.filename,html:renderDocument(document)};
  }
  async function output(action,type,id,owner) {
    if(busy.has(owner))throw new CatalogError('BUSY','A document output operation is already in progress.');
    busy.add(owner);
    try {
      const fresh=preview(type,id);
      const result=action==='print'?await driver.print(fresh.html,owner):await driver.savePdf(fresh.html,fresh.filename,owner);
      return {...result,preview:fresh};
    }finally{busy.delete(owner);}
  }
  return {preview,print:(type,id,owner)=>output('print',type,id,owner),savePdf:(type,id,owner)=>output('savePdf',type,id,owner)};
}
module.exports={createPrintingService};
