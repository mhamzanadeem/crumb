import { promises as dns } from 'node:dns';
import { MongoClient } from 'mongodb';
import { configureMongoDns, mongoConnectionMessage } from '../mongo-config.js';
import { mongoConnectionOptions } from '../mongo-https-dns.js';

let client;
async function lookup(host,servers) {
  const resolver=new dns.Resolver({timeout:3000,tries:1});
  if(servers?.length)resolver.setServers(servers);
  try {
    const records=await resolver.resolveSrv(`_mongodb._tcp.${host}`);
    return {ok:true,records};
  }catch(error){return {ok:false,error,code:error.code,syscall:error.syscall};}
}
try {
  const uri=process.env.MONGODB_URI;
  if(!uri)throw new Error('missing');
  const srv=uri.startsWith('mongodb+srv://');
  const host=srv?new URL(uri).hostname:null;
  const override=process.env.MONGODB_DNS_SERVERS?.trim();
  const servers=override?override.split(',').map(x=>x.trim()).filter(Boolean):[];
  console.log('MongoDB diagnostic (credentials are hidden)');
  console.log(`Connection format: ${srv?'SRV discovery':'Standard host list'}`);
  console.log(`Database: ${process.env.MONGODB_DB||'crumb'}`);
  console.log(`Configured DNS: ${servers.length?servers.join(', '):'system default (no override)'}`);
  const https=process.env.MONGODB_DNS_TRANSPORT==='https';
  console.log(`Discovery transport: ${https?'HTTPS DNS (opt-in)':'native DNS'}`);
  console.log('Stored URI and credentials are not modified.');
  if(host&&!https) {
    console.log(`Cluster hostname: ${host}`);
    const system=await lookup(host);
    console.log(`System DNS: ${system.ok?`PASS (${system.records.length} nodes)`:`FAIL (${system.code}; ${system.syscall})`}`);
    let active=system;
    if(servers.length){active=await lookup(host,servers);console.log(`Custom DNS: ${active.ok?`PASS (${active.records.length} nodes)`:`FAIL (${active.code}; ${active.syscall})`}`);}
    if(!active.ok){
      if(servers.length&&system.ok)console.error('The custom DNS override fails while system DNS works. Clear MONGODB_DNS_SERVERS and restart the app.');
      throw active.error;
    }
  }
  configureMongoDns();
  const resolved=await mongoConnectionOptions(uri);
  if(resolved.transport==='https')console.log(`HTTPS SRV/TXT discovery passed: ${resolved.nodeCount} node(s). TLS remains enabled; credentials are preserved.`);
  client=new MongoClient(resolved.uri,{maxPoolSize:1,serverSelectionTimeoutMS:8000,connectTimeoutMS:8000,...resolved.options});
  await client.connect();await client.db(process.env.MONGODB_DB||'crumb').command({ping:1});
  console.log('Atlas connection and authenticated ping passed. Run npm run seed next.');
}catch(error) {
  console.error('FAILED: '+(error.message==='missing'?'Set MONGODB_URI in .env.local.':mongoConnectionMessage(error)));
  console.error('Keep the known working URI. Compare this command on the same machine/network as your working project. If SRV fails, check Windows DNS/VPN/firewall or Atlas cluster status; use an Atlas-provided standard URI only if needed.');
  process.exitCode=1;
}finally{await client?.close().catch(()=>{});}
