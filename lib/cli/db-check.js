import { promises as dns } from 'node:dns';
import { MongoClient } from 'mongodb';
import { configureMongoDns, mongoConnectionMessage } from '../mongo-config.js';

let client;
try {
  const uri=process.env.MONGODB_URI;
  if(!uri)throw new Error('missing');
  const srv=uri.startsWith('mongodb+srv://');
  const host=srv?new URL(uri).hostname:null;
  const servers=configureMongoDns();
  console.log('MongoDB diagnostic (credentials are hidden)');
  console.log(`Connection format: ${srv?'SRV discovery':'Standard host list'}`);
  console.log(`Database: ${process.env.MONGODB_DB||'crumb'}`);
  console.log(`DNS: ${servers.length?servers.join(', '):'system default'}`);
  if(host) {
    console.log(`Cluster hostname: ${host}`);
    const resolver=new dns.Resolver({timeout:3000,tries:1});
    if(servers.length)resolver.setServers(servers);
    const records=await resolver.resolveSrv(`_mongodb._tcp.${host}`);
    console.log(`SRV discovery passed: ${records.length} server(s).`);
    const hosts=[...new Set(records.map(r=>r.name))];
    await Promise.all(hosts.map(h=>resolver.resolve4(h)));
    console.log('Node hostname resolution passed.');
  }
  client=new MongoClient(uri,{maxPoolSize:1,serverSelectionTimeoutMS:8000,connectTimeoutMS:8000});
  await client.connect();await client.db(process.env.MONGODB_DB||'crumb').command({ping:1});
  console.log('Atlas connection and authenticated ping passed. Run npm run seed next.');
}catch(error) {
  console.error('FAILED: '+(error.message==='missing'?'Set MONGODB_URI in .env.local.':mongoConnectionMessage(error)));
  console.error('If DNS still fails: Atlas > Connect > Drivers > disable SRV Connection String, then replace MONGODB_URI with the exact standard URI Atlas supplies. Keep its TLS/replicaSet/authSource options.');
  process.exitCode=1;
}finally{await client?.close().catch(()=>{});}
