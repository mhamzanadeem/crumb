import { AppError } from './domain.js';
import { apimaticPaypal } from './paypal-apimatic.js';
const base='https://api-m.sandbox.paypal.com';
export async function paypal(path,method='GET',body,requestId) {
  const transport=process.env.PAYPAL_TRANSPORT||'apimatic';
  if(!['rest','apimatic'].includes(transport))throw new AppError('Invalid PAYPAL_TRANSPORT configuration.',503);
  // The SDK does not provide Notifications signature verification.
  if(transport==='apimatic'&&!(method==='POST'&&path==='/v1/notifications/verify-webhook-signature'))return apimaticPaypal(path,method,body,requestId);
  const {PAYPAL_CLIENT_ID:id,PAYPAL_CLIENT_SECRET:secret}=process.env;
  if(!id||!secret)throw new AppError('Add PayPal sandbox keys before using checkout.',503);
  const auth=await fetch(`${base}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
  if(!auth.ok)throw new AppError('PayPal authentication failed. Check the sandbox keys.',502);
  const {access_token}=await auth.json();
  const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await r.json();
  if(!r.ok)throw new AppError(`PayPal could not complete this operation (${data.name||r.status}). Check payment status before retrying.`,502);
  return data;
}
