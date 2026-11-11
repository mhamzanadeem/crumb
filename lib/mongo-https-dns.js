import { isIP } from 'node:net';

// Explicit opt-in for networks blocking DNS SRV/TXT traffic. Public hostname
// queries go to Google DNS over HTTPS; MongoDB credentials never leave the URI.
export async function dnsOverHttps(name,type,fetcher=fetch) {
  const url=new URL('https://dns.google/resolve');
  url.searchParams.set('name',name);url.searchParams.set('type',String(type));url.searchParams.set('edns_client_subnet','0.0.0.0/0');
  let response;
  try{response=await fetcher(url,{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(8000)});}catch{
    throw new Error('HTTPS DNS lookup could not reach dns.google. Check HTTPS access, VPN or proxy settings. No MongoDB credentials were sent.');
  }
  if(!response.ok)throw new Error(`HTTPS DNS lookup failed (HTTP ${response.status}).`);
  const result=await response.json();
  if(result.Status!==0)throw new Error(`HTTPS DNS lookup returned DNS status ${result.Status}. Confirm the Atlas cluster hostname and that the cluster is active.`);
  return (result.Answer||[]).filter(a=>a.type===type);
}

export async function mongoConnectionOptions(uri,fetcher=fetch) {
  if(process.env.MONGODB_DNS_TRANSPORT!=='https')return {uri,options:{},transport:'system'};
  if(!uri.startsWith('mongodb+srv://'))return {uri,options:{},transport:'standard'};
  const parsed=new URL(uri);const host=parsed.hostname;
  if(!host.endsWith('.mongodb.net'))throw new Error('HTTPS DNS fallback is restricted to MongoDB Atlas hostnames.');
  const parent=host.split('.').slice(1).join('.');
  const [srv,txt]=await Promise.all([dnsOverHttps(`_mongodb._tcp.${host}`,33,fetcher),dnsOverHttps(host,16,fetcher)]);
  if(!srv.length)throw new Error('No Atlas SRV nodes were returned over HTTPS. Confirm the cluster is active.');
  const nodes=srv.map(record=>{
    const fields=record.data.trim().split(/\s+/);const name=fields[3]?.replace(/\.$/,'').toLowerCase();const port=Number(fields[2]);
    if(fields.length!==4||!name?.endsWith(`.${parent}`)||!/^[a-z0-9.-]+$/.test(name)||!Number.isInteger(port)||port<1||port>65535)throw new Error('HTTPS DNS returned an invalid Atlas SRV node.');
    return `${name}:${port}`;
  });
  if(txt.length>1)throw new Error('Atlas returned multiple TXT configuration records.');
  const options=new URLSearchParams(parsed.search);
  const has=name=>[...options.keys()].some(k=>k.toLowerCase()===name.toLowerCase());
  if(txt.length){
    const chunks=txt[0].data.match(/"(?:\\.|[^"\\])*"/g);
    const content=chunks?chunks.map(c=>JSON.parse(c)).join(''):txt[0].data;
    for(const [key,value] of new URLSearchParams(content)) {
      if(!['authsource','replicaset','loadbalanced'].includes(key.toLowerCase()))throw new Error('Unsupported option in Atlas TXT record.');
      if(!has(key))options.set(key,value);
    }
  }
  if(!has('tls')&&!has('ssl'))options.set('tls','true');
  // These only apply to SRV URIs; seed hostnames above replace SRV discovery.
  for(const key of [...options.keys()])if(['srvservicename','srvmaxhosts'].includes(key.toLowerCase()))throw new Error('Custom SRV service/host limits are not supported by the HTTPS fallback.');
  const authority=uri.slice('mongodb+srv://'.length).split('/')[0].split('?')[0];
  const credentials=authority.includes('@')?authority.slice(0,authority.lastIndexOf('@')+1):'';
  const standard=`mongodb://${credentials}${nodes.join(',')}${parsed.pathname||'/'}?${options.toString()}`;
  // MongoDB's topology may return additional node names. Resolve those names
  // over HTTPS too, while retaining names for TLS certificate validation.
  const cache=new Map();
  const lookup=(hostname,lookupOptions,callback)=>{
    if(typeof lookupOptions==='function'){callback=lookupOptions;lookupOptions={};}
    if(typeof lookupOptions==='number')lookupOptions={family:lookupOptions};
    const family=lookupOptions?.family===6?6:4;
    if(isIP(hostname)){callback(null,...(lookupOptions?.all?[[{address:hostname,family:isIP(hostname)}]]:[hostname,isIP(hostname)]));return;}
    if(!hostname.endsWith(`.${parent}`)){callback(new Error('Unexpected Atlas node hostname.'));return;}
    const key=`${hostname}:${family}`;const cached=cache.get(key);
    const promise=cached&&cached.until>Date.now()?cached.value:dnsOverHttps(hostname,family===6?28:1,fetcher).then(records=>{
      const addresses=records.map(r=>({address:r.data,family})).filter(r=>isIP(r.address)===family);
      if(!addresses.length)throw new Error('No address records returned for the Atlas node.');
      return addresses;
    });
    cache.set(key,{until:Date.now()+60000,value:promise});
    promise.then(addresses=>lookupOptions?.all?callback(null,addresses):callback(null,addresses[0].address,family),error=>{cache.delete(key);callback(error);});
  };
  return {uri:standard,options:{lookup},transport:'https',nodeCount:nodes.length};
}
