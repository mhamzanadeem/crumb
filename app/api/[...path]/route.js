import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { collection, db, rateLimit } from '@/lib/db.js';
import { products } from '@/lib/catalog.js';
import { AppError, hash, token, now, publicOrder, slots, branches } from '@/lib/domain.js';
import { sign, session, requireSession, demoIdentity, equal, sameOrigin } from '@/lib/auth.js';
import { settings, createOrder, authorizeOrder, getOrder, updateOrder, staffAction, checkout, capture, customBrief, withLock } from '@/lib/service.js';
import { paypal } from '@/lib/paypal.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const orderSchema=z.object({requestId:z.string().min(10).max(100),productId:z.string().regex(/^p\d+$/),quantity:z.number().int().min(1).max(20),occasion:z.string().min(1).max(80),date:z.string().max(10),slot:z.string().max(30),branch:z.string().max(60),message:z.string().max(40).default(''),custom:z.string().max(2000).default(''),ingredientConcern:z.string().max(500).default(''),customer:z.object({name:z.string().min(2).max(100),email:z.email().max(180),phone:z.string().max(30).default('')})});
const staffSchema=z.object({action:z.enum(['approve','clarify','decline','preparing','ready','collected','refund','resolveCancellation','rejectCancellation','resolveChange']),note:z.string().max(1000).optional(),amount:z.string().max(12).optional(),ingredientsConfirmed:z.boolean().optional()});
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function body(req) {if(Number(req.headers.get('content-length')||0)>8000000)throw new AppError('Request too large.',413);try{return await req.json();}catch{throw new AppError('Invalid JSON.');}}
function cookie(response,value){response.cookies.set('crumb_session',value,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:8*3600});return response;}
async function handler(req,{params}) {
  try {
    if(req.method!=='GET')sameOrigin(req);
    const {path=[]}=await params;const route=path.join('/');const actor=await session(req);
    const workspace=actor?.workspace||'bakery';const ip=hash(req.headers.get('x-forwarded-for')?.split(',')[0]||'local');
    if(route==='health'&&req.method==='GET')return json({ok:true,storage:process.env.MONGODB_URI?'mongodb':'unconfigured'});
    if(route==='config'&&req.method==='GET')return json({settings:await settings(workspace),products:await products(workspace),slots,branches,paypalConfigured:!!(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET),aiConfigured:!!process.env.OPENAI_API_KEY,demoEnabled:process.env.DEMO_ENABLED==='true',sandboxBuyer:process.env.DEMO_ENABLED==='true'&&process.env.SHOW_SANDBOX_BUYER_CREDENTIALS==='true'&&process.env.PAYPAL_SANDBOX_BUYER_EMAIL&&process.env.PAYPAL_SANDBOX_BUYER_PASSWORD?{email:process.env.PAYPAL_SANDBOX_BUYER_EMAIL,password:process.env.PAYPAL_SANDBOX_BUYER_PASSWORD}:null,session:actor?{role:actor.role,workspace:actor.workspace}:null});
    if(route==='auth/login'&&req.method==='POST') {
      await rateLimit(`login:${ip}`,8,900);const input=z.object({email:z.email(),password:z.string().max(200)}).parse(await body(req));
      if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12||process.env.ADMIN_PASSWORD.startsWith('replace-'))throw new AppError('Configure ADMIN_EMAIL and a strong ADMIN_PASSWORD first.',503);
      if(!equal(input.email.toLowerCase(),process.env.ADMIN_EMAIL?.toLowerCase())||!equal(input.password,process.env.ADMIN_PASSWORD))throw new AppError('Incorrect email or password.',401);
      return cookie(json({ok:true}),await sign({role:'owner',workspace:'bakery'}));
    }
    if(route==='auth/logout'&&req.method==='POST') {const r=json({ok:true});r.cookies.delete('crumb_session');return r;}
    if(route==='demo/start'&&req.method==='POST') {
      await rateLimit(`demo:${ip}`,10,3600);const identity=await demoIdentity();return cookie(json({ok:true,synthetic:true}),await sign(identity));
    }
    if(route==='demo/merchant-handoff'&&req.method==='POST') {
      if(process.env.DEMO_ENABLED!=='true')throw new AppError('Judge handoff is disabled.',404);
      await rateLimit(`judge-handoff:${ip}`,20,3600);
      const {orderId}=z.object({orderId:z.string().regex(/^CR-[A-Z0-9_-]{10}$/)}).parse(await body(req));
      // A customer must prove possession of this order's secure key. The issued
      // judge session grants access to this one order, never the whole bakery.
      const o=await authorizeOrder(req,orderId,null);
      if(actor?.workspace===o.workspace&&['owner','demo'].includes(actor.role))return json({ok:true});
      return cookie(json({ok:true}),await sign({role:'judge',workspace:o.workspace,orderId:o.id}));
    }
    if(route==='demo/scenario'&&req.method==='POST') {
      const a=await requireSession(req);if(a.role!=='demo'||!a.workspace.startsWith('demo_'))throw new AppError('Start a judge session first.',403);
      const {scenario}=z.object({scenario:z.enum(['standard','custom','paid','allergy','pending'])}).parse(await body(req));
      const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
      const created=await createOrder({requestId:token(),productId:'p12',quantity:1,occasion:'Birthday',date,slot:slots[2],branch:branches[0],message:'Happy Birthday, Ali!',custom:scenario==='custom'?'Cricket themed decoration; baker must approve.':'',ingredientConcern:scenario==='allergy'?'Nut allergy; staff confirmation needed.':'',customer:{name:'Judge Demo',email:'judge@example.com',phone:''}},a.workspace,`${ip}:${a.workspace}`);
      let o=await getOrder(created.order.id);
      if(['paid','pending'].includes(scenario))o=await staffAction(o.id,a.workspace,{action:'approve',amount:'12.00'});
      if(scenario==='paid')o=await updateOrder(o,{payment:{status:'completed',synthetic:true,captureId:`DEMO-${token()}`,amount:'12.00',currency:'USD',verifiedAt:now()}},'Synthetic payment fixture','Not a PayPal transaction.');
      return json({...created,order:publicOrder(o)});
    }
    if(route==='assistant/brief'&&req.method==='POST') {
      await rateLimit(`brief-ip:${ip}`,10,3600);const {text}=z.object({text:z.string().min(5).max(2000)}).parse(await body(req));
      return json({brief:await customBrief(text,workspace)});
    }
    if(route==='orders'&&req.method==='POST')return json(await createOrder(orderSchema.parse(await body(req)),workspace,ip),201);
    if(path[0]==='orders'&&path[1]) {
      const id=path[1];if(!/^CR-[A-Z0-9_-]{10}$/.test(id))throw new AppError('Invalid order reference.');
      const o=await authorizeOrder(req,id,actor);
      if(path.length===2&&req.method==='GET')return json({order:publicOrder(o)});
      if(path[2]==='checkout'&&req.method==='POST') {await rateLimit(`checkout:${id}`,10,600);const {quoteVersion}=z.object({quoteVersion:z.number().int()}).parse(await body(req));return json(await checkout(o,quoteVersion));}
      if(path[2]==='capture'&&req.method==='POST') {await rateLimit(`capture:${id}`,12,600);return json({order:await capture(o)});}
      if(path[2]==='request'&&req.method==='POST') {
        const input=z.object({kind:z.enum(['change','cancel','reply']),note:z.string().min(3).max(1000)}).parse(await body(req));
        if(['cancelled','declined'].includes(o.status))throw new AppError('This order is closed.',409);
        const updated=await withLock(`workspace:${o.workspace}`,async()=>{
          const fresh=await getOrder(id);
          if(input.kind==='cancel'&&fresh.payment.status==='unpaid'&&['pending','clarification'].includes(fresh.status))return updateOrder(fresh,{status:'cancelled'},'Unpaid request cancelled',input.note);
          return updateOrder(fresh,input.kind==='cancel'?{cancelRequested:true}:input.kind==='change'?{changeRequested:input.note}:{customerReply:input.note},`Customer ${input.kind} request`,input.note);
        });
        return json({order:publicOrder(updated)});
      }
    }
    if(route==='paypal/webhook'&&req.method==='POST') {
      if(!process.env.PAYPAL_WEBHOOK_ID)throw new AppError('Webhook is not configured.',503);
      const event=await body(req);
      const verification=await paypal('/v1/notifications/verify-webhook-signature','POST',{auth_algo:req.headers.get('paypal-auth-algo'),cert_url:req.headers.get('paypal-cert-url'),transmission_id:req.headers.get('paypal-transmission-id'),transmission_sig:req.headers.get('paypal-transmission-sig'),transmission_time:req.headers.get('paypal-transmission-time'),webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:event});
      if(verification.verification_status!=='SUCCESS')throw new AppError('Invalid webhook signature.',400);
      if(typeof event.id!=='string')throw new AppError('Missing event ID.');
      const events=await collection('webhooks');const done=await events.findOne({_id:event.id});if(done?.processed)return json({ok:true,duplicate:true});
      await events.updateOne({_id:event.id},{$set:{eventType:event.event_type,receivedAt:now()}},{upsert:true});
      if(event.event_type==='PAYMENT.CAPTURE.COMPLETED') {
        const paypalId=event.resource?.supplementary_data?.related_ids?.order_id;
        if(paypalId){const list=await (await collection('orders')).find({'payment.paypalOrderId':paypalId}).toArray();for(const o of list)await capture(o);}
      }
      await events.updateOne({_id:event.id},{$set:{processed:true}});return json({ok:true});
    }
    if(path[0]==='studio') {
      const a=await requireSession(req);
      if(a.role==='judge') {
        const allowed=(route==='studio/orders'&&req.method==='GET')||(route==='studio/audit'&&req.method==='GET')||(path[1]==='orders'&&path[2]===a.orderId&&req.method==='POST');
        if(!allowed)throw new AppError('Judge access is limited to the current demo order.',403);
      }
      if(route==='studio/report'&&req.method==='GET')return json({state:(await (await collection('reports')).findOne({_id:a.workspace}))?.state||null});
      if(route==='studio/report'&&req.method==='PUT') {
        const {state}=z.object({state:z.record(z.string(),z.unknown())}).parse(await body(req));
        if(JSON.stringify(state).length>200000)throw new AppError('Dashboard layout is too large.');
        await (await collection('reports')).updateOne({_id:a.workspace},{$set:{state,updatedAt:now()}},{upsert:true});return json({ok:true});
      }
      if(route==='studio/orders'&&req.method==='GET') {
        if(a.role==='judge') {const o=await getOrder(a.orderId);if(o.workspace!==a.workspace)throw new AppError('Order not found.',404);return json({orders:[publicOrder(o)]});}
        const orders=await (await collection('orders')).find({workspace:a.workspace}).sort({createdAt:-1}).limit(500).toArray();return json({orders:orders.map(publicOrder)});
      }
      if(route==='studio/audit'&&req.method==='GET')return json({events:await (await collection('audit')).find({workspace:a.workspace,...(a.role==='judge'?{orderId:a.orderId}:{})}).sort({createdAt:-1}).limit(200).toArray()});
      if(path[1]==='orders'&&path[2]&&req.method==='POST')return json({order:publicOrder(await staffAction(path[2],a.workspace,staffSchema.parse(await body(req))))});
      if(route==='studio/settings'&&req.method==='PUT') {
        const value=z.object({bakeryName:z.string().min(1).max(80),standardLeadHours:z.number().int().min(1).max(720),customLeadHours:z.number().int().min(1).max(1440),slotCapacity:z.number().int().min(1).max(100),cancellationPolicy:z.string().min(5).max(2000),supportEmail:z.union([z.email(),z.literal('')]),assistantEnabled:z.boolean()}).parse(await body(req));
        await (await collection('settings')).updateOne({_id:a.workspace},{$set:value},{upsert:true});return json({settings:value});
      }
      if(path[1]==='products'&&path[2]&&req.method==='PUT') {
        if(!/^p\d+$/.test(path[2]))throw new AppError('Invalid product.');
        const value=z.object({name:z.string().min(1).max(100),price:z.number().int().min(1).max(1000000),stock:z.number().int().min(0).max(10000),available:z.boolean(),description:z.string().max(2000),imageUrl:z.string().max(1000).refine(v=>!v||v.startsWith('/images/')||v.startsWith('https://res.cloudinary.com/'),'Use a bundled or Cloudinary image.')}).parse(await body(req));
        await (await collection('products')).updateOne({_id:`${a.workspace}:${path[2]}`},{$set:{...value,id:path[2],workspace:a.workspace}},{upsert:true});return json({ok:true});
      }
      if(route==='studio/upload'&&req.method==='POST') {
        if(a.role==='demo')throw new AppError('Uploads are disabled in judge sessions.',403);
        const {image}=z.object({image:z.string().max(7000000).regex(/^data:image\/(jpeg|png|webp);base64,/)}).parse(await body(req));
        const {CLOUDINARY_CLOUD_NAME:cloud,CLOUDINARY_API_KEY:key,CLOUDINARY_API_SECRET:secret}=process.env;
        if(!cloud||!key||!secret)throw new AppError('Cloudinary is optional. Configure its keys to enable uploads.',503);
        const timestamp=Math.floor(Date.now()/1000);const folder='crumb';const signature=createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest('hex');
        const form=new FormData();Object.entries({file:image,api_key:key,timestamp:String(timestamp),folder,signature}).forEach(([k,v])=>form.set(k,v));
        const result=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
        if(!result.ok)throw new AppError('Cloudinary upload failed.',502);return json({url:(await result.json()).secure_url});
      }
    }
    throw new AppError('Endpoint not found.',404);
  } catch(error) {
    if(error instanceof z.ZodError)return json({error:error.issues[0]?.message||'Invalid input.'},400);
    if(error instanceof AppError)return json({error:error.message},error.status);
    console.error('Crumb operation failed:',error.name);return json({error:'The operation could not be completed. Check configuration and try again.'},500);
  }
}
export {handler as GET,handler as POST,handler as PUT};
