import test from 'node:test';
import assert from 'node:assert/strict';
import {configureMongoDns,mongoConnectionMessage} from '../lib/mongo-config.js';
test('DNS configuration rejects malformed addresses without leaking credentials',()=>{
  assert.deepEqual(configureMongoDns(''),[]);
  assert.throws(()=>configureMongoDns('not-a-dns-server'),/IP addresses/);
});
test('MongoDB troubleshooting distinguishes DNS, authentication and connectivity',()=>{
  assert.match(mongoConnectionMessage({code:'ECONNREFUSED',syscall:'querySrv',message:'querySrv ECONNREFUSED'}),/before authentication/);
  assert.match(mongoConnectionMessage({code:'ETIMEOUT',syscall:'querySrv',message:'querySrv ETIMEOUT'}),/ETIMEOUT \/ querySrv/);
  assert.match(mongoConnectionMessage({code:'ECONNREFUSED',syscall:'connect',message:'connect ECONNREFUSED'}),/TCP/);
  assert.ok(!mongoConnectionMessage({code:'ECONNREFUSED',syscall:'connect',message:'connect ECONNREFUSED'}).includes('before authentication'));
  assert.match(mongoConnectionMessage({code:18,message:'bad auth'}),/authentication failed/);
  assert.match(mongoConnectionMessage({message:'server selection timed out'}),/Network Access/);
  const text=mongoConnectionMessage({message:'mongodb://secret-user:secret-password@example.test'});
  assert.ok(!text.includes('secret-password'));assert.ok(!text.includes('secret-user'));
});
