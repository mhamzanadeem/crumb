'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { studioTheme } from 'ag-studio';
export default function Analytics({orders}) {
  const ref=useRef(null);const [mode,setMode]=useState('view');const [message,setMessage]=useState('');const [saved,setSaved]=useState(null);
  const data=useMemo(()=>({sources:[{id:'orders',data:orders.map(o=>({order:o.id,product:o.productName,occasion:o.occasion,status:o.status,payment:o.payment.synthetic?'synthetic fixture':o.payment.status,quantity:o.quantity,referencePKR:o.referenceTotal,paidUSD:o.payment.status==='completed'&&!o.payment.synthetic?Number(o.payment.amount):0,pickup:o.date,branch:o.branch}))}]}),[orders]);
  const initialState=useMemo(()=>({pages:[{id:'overview',widgets:{
    orders:{type:'grid',dataMapping:{cols:['order','product','status','payment','quantity','pickup','branch'].map(id=>({id:`orders.${id}`}))},format:{title:{enabled:true,text:'Order readiness'}}},
    volume:{type:'column-chart-grouped',dataMapping:{categoryKey:[{id:'orders.status'}],valueKey:[{id:'orders.quantity',aggregation:'sum'}]},format:{title:{enabled:true,text:'Items by fulfillment stage'}}}
  },widgetLayout:{orders:{xTrack:0,yTrack:0,xSpan:24,ySpan:18},volume:{xTrack:0,yTrack:18,xSpan:24,ySpan:14}}}],selectedPageId:'overview'}),[]);
  const theme=useMemo(()=>studioTheme.withParams({backgroundColor:'#17191b',foregroundColor:'#f5f2ed',browserColorScheme:'dark'}),[]);
  useEffect(()=>{fetch('/api/studio/report').then(r=>r.json()).then(x=>{if(x.state)setSaved(x.state);}).catch(()=>{});},[]);
  async function save(){setMessage('Saving…');try{const response=await fetch('/api/studio/report',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:ref.current.api.getState()})});if(!response.ok)throw new Error();setMessage('Report saved to MongoDB.');}catch{setMessage('Could not save report.');}}
  return <div className="ag-theme-mode" data-ag-theme-mode="dark"><p className="muted">AG Studio uses this workspace’s order records. PKR reference values and USD test payments remain separate measures.</p><div className="row space"><button onClick={()=>setMode(mode==='view'?'edit':'view')}>{mode==='view'?'Edit dashboard':'View dashboard'}</button><button onClick={save}>Save dashboard</button><span role="status">{message}</span></div><div style={{height:720,marginTop:20}}><AgStudioProvider licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY||undefined}><AgStudio ref={ref} key={saved?'saved':'default'} data={data} theme={theme} mode={mode} initialState={saved||initialState}/></AgStudioProvider></div></div>;
}
