import {useEffect,useState} from 'react';
import {Autocomplete,TextField} from '@mui/material';
import {catalogRequest} from '../../utils/catalog.js';
const resources={customer_id:['customers','Customer'],supplier_id:['suppliers','Supplier'],product_id:['products','Product'],brand_id:['brands','Brand'],category_id:['categories','Category'],expense_category_id:['expenseCategories','Expense category']};
export default function ReportLookup({field,value,onChange}) {
  const [resource,label]=resources[field];
  const [search,setSearch]=useState('');
  const [state,setState]=useState({rows:[],loading:false,error:''});
  const searchable=['customers','suppliers','products'].includes(resource);
  useEffect(()=>{
    let live=true;
    const timer=setTimeout(async()=>{
      if(live)setState((s)=>({...s,loading:true}));
      try {
        const rows=[];
        for(let offset=0;;offset+=500) {
          const batch=await catalogRequest(()=>window.api[resource].list({active:'all',limit:searchable?100:500,offset,...(searchable?{search}:{})}));
          rows.push(...batch);if(searchable||batch.length<500)break;
        }
        if(live)setState({rows,loading:false,error:''});
      }catch(error){if(live)setState({rows:[],loading:false,error:error.message});}
    },200);
    return()=>{live=false;clearTimeout(timer);};
  },[resource,search,searchable]);
  return <Autocomplete sx={{minWidth:220,flex:'1 1 220px',maxWidth:400}} size="small" value={value} onChange={(_,row)=>onChange(row)} options={state.rows} loading={state.loading}
    onInputChange={(_,text)=>setSearch(text)} isOptionEqualToValue={(a,b)=>a.id===b.id} {...(searchable?{filterOptions:(rows)=>rows}:{})}
    getOptionLabel={(row)=>`${resource==='products'?`${row.sku} · ${row.model}`:row.name}${row.active===0?' (inactive)':''}`}
    renderInput={(params)=><TextField {...params} label={label} name={`report-${field}`} error={Boolean(state.error)} helperText={state.error||(searchable?'Type to search; includes inactive records.':'')}/>}/>;
}
