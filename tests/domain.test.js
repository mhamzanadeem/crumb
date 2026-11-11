import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDate,canTransition,verifyCapture,publicOrder,hash,token} from '../lib/domain.js';
test('a completed matching capture is required; approval alone does not grant paid status',()=>{
  const order={id:'CR-TEST',payment:{paypalOrderId:'PP1',amount:'12.00'}};
  const provider={id:'PP1',status:'COMPLETED',purchase_units:[{custom_id:'CR-TEST',payments:{captures:[{id:'CAP1',status:'COMPLETED',amount:{currency_code:'USD',value:'12.00'}}]}}]};
  assert.equal(verifyCapture(order,provider).captureId,'CAP1');
  assert.throws(()=>verifyCapture(order,{...provider,status:'APPROVED'}));
  for(const change of [{currency_code:'EUR',value:'12.00'},{currency_code:'USD',value:'1.00'}]) {
    const copy=structuredClone(provider);copy.purchase_units[0].payments.captures[0].amount=change;assert.throws(()=>verifyCapture(order,copy));
  }
  const wrong=structuredClone(provider);wrong.purchase_units[0].custom_id='OTHER';assert.throws(()=>verifyCapture(order,wrong));
});
test('unpaid and cancelled orders cannot enter production',()=>{
  assert.throws(()=>canTransition({status:'accepted',payment:{status:'unpaid'}},'preparing'));
  assert.throws(()=>canTransition({status:'cancelled',payment:{status:'completed'}},'preparing'));
  assert.throws(()=>canTransition({status:'accepted',payment:{status:'completed'},cancelRequested:true},'preparing'));
  assert.doesNotThrow(()=>canTransition({status:'accepted',payment:{status:'completed'}},'preparing'));
});
test('pickup time uses Pakistan timezone and enforces custom lead time',()=>{
  const clock=new Date('2026-11-11T00:00:00Z').getTime();
  assert.throws(()=>validateDate('2026-11-11','17:00–18:00',false,undefined,clock));
  assert.doesNotThrow(()=>validateDate('2026-11-13','17:00–18:00',false,undefined,clock));
  assert.throws(()=>validateDate('2026-11-13','17:00–18:00',true,undefined,clock));
  assert.throws(()=>validateDate('nonsense','17:00–18:00',false,undefined,clock));
});
test('public records do not expose access-token hashes or workspace IDs',()=>{
  assert.deepEqual(publicOrder({_id:'private',accessHash:'secret',workspace:'demo_a',requestKey:'demo_a:internal',id:'CR1',status:'pending'}),{id:'CR1',status:'pending'});
  assert.notEqual(token(),token());assert.equal(hash('a').length,64);
});
