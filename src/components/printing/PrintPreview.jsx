import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle} from '@mui/material';
import {catalogRequest} from '../../utils/catalog.js';

export default function PrintPreview({type,documentId,onClose}) {
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
  const submitting=useRef(false);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');setPreview(null);
    catalogRequest(()=>window.api.printing.preview(type,documentId)).then((data)=>{if(live)setPreview(data);})
      .catch((e)=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[type,documentId,revision]);
  async function output(method) {
    if(submitting.current||loading)return;
    submitting.current=true;setBusy(true);setError('');setNotice('');
    try {
      const result=await catalogRequest(()=>window.api.printing[method](type,documentId));
      setPreview(result.preview);
      setNotice(result.status==='cancelled'?'Operation cancelled.':result.status==='saved'?`PDF saved: ${result.filename}`:'Print job submitted.');
    }catch(e){setError(e.message);}
    finally{submitting.current=false;setBusy(false);}
  }
  return <Dialog open fullWidth maxWidth="lg" onClose={busy?undefined:onClose} aria-labelledby="print-preview-title">
    <DialogTitle id="print-preview-title">Print Preview{preview?` — ${preview.reference}`:''}</DialogTitle>
    <DialogContent dividers sx={{minWidth:0,p:{xs:1,sm:2}}}>
      <p className="mb-3 text-sm text-slate-600">A4 document. Each print or PDF export reloads the saved record. Use Refresh Preview to check the latest position.</p>
      {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
      {notice&&<Alert severity="info" sx={{mb:2}}>{notice}</Alert>}
      {loading?<p role="status">Loading print preview...</p>:preview&&<iframe title="Business document preview" sandbox="" srcDoc={preview.html} style={{display:'block',width:'100%',height:'65vh',minHeight:240,border:'1px solid #d1d5db',background:'#fff'}}/>}
    </DialogContent>
    <DialogActions sx={{flexWrap:'wrap',gap:1}}>
      <Button disabled={busy} onClick={onClose}>Close Preview</Button>
      <Button disabled={busy||loading} onClick={()=>{setNotice('');setRevision(r=>r+1);}}>{preview?'Refresh Preview':'Retry Preview'}</Button>
      <Button disabled={busy||loading||!preview} onClick={()=>output('savePdf')}>Save as PDF</Button>
      <Button variant="contained" disabled={busy||loading||!preview} onClick={()=>output('print')}>{busy?'Preparing document...':'Print'}</Button>
    </DialogActions>
  </Dialog>;
}
