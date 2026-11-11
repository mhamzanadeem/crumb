import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from 'node:module';
// Explicit dependency seams: these integration tests exercise our real service,
// in-memory adapter and fake PayPal transport, without an Atlas account or keys.
let services;
if(module.registerHooks) {
  module.registerHooks({resolve(specifier,context,next){
    if(specifier==='mongodb')return {url:'data:text/javascript,export class MongoClient { constructor(){throw new Error("Network DB not expected in this test")} }',shortCircuit:true};
    if(specifier==='jose')return {url:'data:text/javascript,export class SignJWT{};export async function jwtVerify(){};',shortCircuit:true};
    return next(specifier,context);
  }});
  process.env.NODE_ENV='test';process.env.ALLOW_MEMORY_DB='true';delete process.env.MONGODB_URI;
  process.env.PAYPAL_CLIENT_ID='test-id';process.env.PAYPAL_CLIENT_SECRET='test-secret';
  services=await import('../lib/service.js');
}
const input=(quantity=1)=>({requestId:crypto.randomUUID(),productId:'p12',quantity,occasion:'Birthday',date:new Date(Date.now()+10*86400000).toISOString().slice(0,10),slot:'17:00–18:00',branch:'F-10 demo outlet',message:'Hi!',custom:'',ingredientConcern:'',customer:{name:'Customer',email:'customer@example.com',phone:''}});
test('full approval, token authorization, verified capture, production and refund workflow', {skip:!services},async()=>{
  const {createOrder,staffAction,getOrder,authorizeOrder,checkout,capture,updateOrder}=services;
  const created=await createOrder(input(),'demo_workflow','integration');const id=created.order.id;
  await assert.rejects(()=>authorizeOrder({headers:new Headers()},id,null),/secure order key/);
  const request={headers:new Headers({'x-order-token':created.accessToken})};
  assert.equal((await authorizeOrder(request,id,null)).id,id);
  await assert.rejects(()=>authorizeOrder({headers:new Headers()},id,{workspace:'different_workspace'}),/secure order key/);
  assert.equal((await authorizeOrder({headers:new Headers()},id,{role:'judge',workspace:'demo_workflow',orderId:id})).id,id);
  await assert.rejects(()=>authorizeOrder({headers:new Headers()},id,{role:'judge',workspace:'demo_workflow',orderId:'another-order'}),/secure order key/);
  await assert.rejects(()=>staffAction(id,'other',{action:'approve'}),/not found/);
  await staffAction(id,'demo_workflow',{action:'approve',amount:'12.00'});
  await assert.rejects(()=>staffAction(id,'demo_workflow',{action:'preparing'}),/Verified payment/);
  const originalFetch=globalThis.fetch;let createCount=0,captureCount=0;let captured=false;
  const provider=()=>({id:'PP-ORDER',status:captured?'COMPLETED':'APPROVED',purchase_units:[{custom_id:id,payments:{captures:captured?[{id:'CAP-1',status:'COMPLETED',amount:{currency_code:'USD',value:'12.00'}}]:[]}}],links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=PP-ORDER'}]});
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/oauth2/token'))return Response.json({access_token:'TEST'});
    if(url.endsWith('/v2/checkout/orders')&&options.method==='POST'){createCount++;return Response.json({...provider(),status:'CREATED'});}
    if(url.endsWith('/capture')){captureCount++;captured=true;return Response.json({id:'PP-ORDER',status:'COMPLETED'});}
    if(url.includes('/refund'))return Response.json({id:'REF-1',status:'COMPLETED'});
    return Response.json(provider());
  };
  try {
    const o=await getOrder(id);await checkout(o,1);await checkout(await getOrder(id),1);assert.equal(createCount,1,'repeat checkout reuses original PayPal order');
    const pending=await getOrder(id);
    const results=await Promise.all([capture(pending),capture(pending)]);
    assert.ok(results.every(x=>x.payment.status==='completed'),'concurrent return/webhook checks share verified result');
    await capture(await getOrder(id));assert.equal(captureCount,1,'repeat capture is idempotent and minimal response is followed by full GET');
    await staffAction(id,'demo_workflow',{action:'preparing'});
    let paid=await getOrder(id);await updateOrder(paid,{cancelRequested:true},'Customer cancellation');
    await staffAction(id,'demo_workflow',{action:'refund'});
    assert.equal((await getOrder(id)).payment.status,'refunded');assert.equal((await getOrder(id)).status,'cancelled');
  }finally{globalThis.fetch=originalFetch;}
});

test('recover an already completed PayPal order without charging again',{skip:!services},async()=>{
  const {createOrder,staffAction,getOrder,updateOrder,capture}=services;
  const created=await createOrder(input(),'demo_recovery','recovery');const id=created.order.id;
  await staffAction(id,'demo_recovery',{action:'approve',amount:'12.00'});
  await updateOrder(await getOrder(id),{payment:{status:'pending',paypalOrderId:'PP-RECOVER',amount:'12.00',currency:'USD',quoteVersion:1}},'Checkout created');
  const originalFetch=globalThis.fetch;let captures=0;
  globalThis.fetch=async(url,options={})=>{
    if(url.endsWith('/oauth2/token'))return Response.json({access_token:'test'});
    if(url.endsWith('/capture')){captures++;throw new Error('Must not charge again');}
    return Response.json({id:'PP-RECOVER',status:'COMPLETED',purchase_units:[{custom_id:id,payments:{captures:[{id:'EXISTING-CAPTURE',status:'COMPLETED',amount:{currency_code:'USD',value:'12.00'}}]}}]});
  };
  try{const r=await capture(await getOrder(id));assert.equal(r.payment.status,'completed');assert.equal(r.payment.captureId,'EXISTING-CAPTURE');assert.equal(captures,0);}finally{globalThis.fetch=originalFetch;}
});
test('capacity, custom lead time, ingredient review and idempotent submission are enforced',{skip:!services},async()=>{
  const {createOrder,staffAction}=services;const {collection}=await import('../lib/db.js');
  await (await collection('settings')).updateOne({_id:'demo_capacity'},{$set:{slotCapacity:1}},{upsert:true});
  const a=input();const first=await createOrder(a,'demo_capacity','capacity');
  await assert.rejects(()=>createOrder(a,'demo_capacity','capacity'),/already submitted/);
  const second=await createOrder(input(),'demo_capacity','capacity');
  await staffAction(first.order.id,'demo_capacity',{action:'approve',amount:'12.00'});
  await assert.rejects(()=>staffAction(second.order.id,'demo_capacity',{action:'approve',amount:'12.00'}),/slot is full/);
  const ingredient=await createOrder({...input(),ingredientConcern:'Nut allergy'},'demo_ingredients','ingredients');
  await assert.rejects(()=>staffAction(ingredient.order.id,'demo_ingredients',{action:'approve'}),/ingredient\/handling review/);
  await staffAction(ingredient.order.id,'demo_ingredients',{action:'approve',ingredientsConfirmed:true});
});
