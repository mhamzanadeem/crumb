import test from 'node:test';
import assert from 'node:assert/strict';
import {mongoConnectionOptions} from '../lib/mongo-https-dns.js';
test('HTTPS discovery preserves credentials and explicit options, applies real TXT configuration, and never transmits secrets',async()=>{
  process.env.MONGODB_DNS_TRANSPORT='https';const requested=[];
  const fake=async url=>{requested.push(String(url));const type=Number(url.searchParams.get('type'));return Response.json({Status:0,Answer:type===33?[{type:33,data:'0 0 27017 node-00.cluster.mongodb.net.'}]:type===16?[{type:16,data:'"authSource=admin&replicaSet=actual-set"'}]:[{type:1,data:'192.0.2.1'}]});};
  try{
    const r=await mongoConnectionOptions('mongodb+srv://user:p%40ss@host.cluster.mongodb.net/crumb?retryWrites=true&w=majority',fake);
    assert.ok(r.uri.startsWith('mongodb://user:p%40ss@node-00.cluster.mongodb.net:27017/crumb?'));
    assert.ok(r.uri.includes('authSource=admin'));assert.ok(r.uri.includes('replicaSet=actual-set'));assert.ok(r.uri.includes('tls=true'));assert.ok(r.uri.includes('retryWrites=true'));
    const address=await new Promise((resolve,reject)=>r.options.lookup('node-00.cluster.mongodb.net',{all:true},(e,a)=>e?reject(e):resolve(a)));
    assert.deepEqual(address,[{address:'192.0.2.1',family:4}]);
    assert.ok(requested.every(u=>!u.includes('p%40ss')&&!u.includes('user:')));
    await assert.rejects(()=>mongoConnectionOptions('mongodb+srv://user:secret@host.cluster.mongodb.net/',async()=>Response.json({Status:3})),/DNS status 3/);
    await assert.rejects(()=>mongoConnectionOptions('mongodb+srv://u:p@host.cluster.mongodb.net/',async url=>Response.json({Status:0,Answer:Number(url.searchParams.get('type'))===33?[{type:33,data:'0 0 27017 attacker.example.com.'}]:[]})),/invalid Atlas SRV node/);
  }finally{delete process.env.MONGODB_DNS_TRANSPORT;}
});
