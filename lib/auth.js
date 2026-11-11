import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { AppError, hash, token } from './domain.js';
export function equal(a,b) { const x=Buffer.from(hash(a||'')),y=Buffer.from(hash(b||''));return timingSafeEqual(x,y); }
function secret() {
  const s=process.env.SESSION_SECRET;
  if(!s || s.length<32 || s.startsWith('replace-'))throw new AppError('Configure a random SESSION_SECRET of at least 32 characters.',503);
  return new TextEncoder().encode(s);
}
export async function sign(payload) {return new SignJWT(payload).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(secret());}
export async function session(request) {
  const value=request.cookies.get('crumb_session')?.value;
  if(!value)return null;
  try{return (await jwtVerify(value,secret(),{algorithms:['HS256']})).payload;}catch{return null;}
}
export async function requireSession(request) {
  const s=await session(request);if(!s)throw new AppError('Sign in to the merchant studio.',401);return s;
}
export async function demoIdentity() {if(process.env.DEMO_ENABLED!=='true')throw new AppError('Judge demo is disabled.',404);return {workspace:`demo_${token()}`,role:'demo'};}
export function sameOrigin(request) {
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)throw new AppError('Cross-origin request denied.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Cross-site request denied.',403);
}
