import { MongoClient } from 'mongodb';
import { AppError } from './domain.js';
import { configureMongoDns, mongoConnectionMessage } from './mongo-config.js';
const g = globalThis;
export async function db() {
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('YOUR-CLUSTER')) {
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_MEMORY_DB === 'true') return null;
    throw new AppError('MongoDB is not configured. Add MONGODB_URI to .env.local or Vercel settings.', 503);
  }
  if (!g.crumbMongo) {
    try{configureMongoDns();}catch(error){throw new AppError(error.message,503);}
    const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    g.crumbMongo = client.connect().catch(e => { g.crumbMongo = null; throw new AppError(mongoConnectionMessage(e),503); });
  }
  const database=(await g.crumbMongo).db(process.env.MONGODB_DB || 'crumb');
  g.crumbIndexes ??= {};
  g.crumbIndexes[database.databaseName] ??= Promise.all([
    database.collection('orders').createIndex({requestKey:1},{unique:true}),
    database.collection('orders').createIndex({workspace:1,createdAt:-1}),
    database.collection('orders').createIndex({'payment.paypalOrderId':1},{sparse:true}),
    database.collection('orders').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    database.collection('limits').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    database.collection('locks').createIndex({expiresAt:1},{expireAfterSeconds:0})
  ]).catch(e=>{delete g.crumbIndexes[database.databaseName];throw e;});
  await g.crumbIndexes[database.databaseName];return database;
}
const matches = (o, q) => Object.entries(q).every(([k,v]) => k.split('.').reduce((value,key)=>value?.[key],o) === v);
export async function collection(name) {
  const database = await db();
  if (database) return database.collection(name);
  g.crumbMemory ??= {};
  const rows = g.crumbMemory[name] ??= [];
  return {
    findOne: async q => structuredClone(rows.find(x => matches(x,q)) || null),
    find: q => ({ sort: () => ({ limit: n => ({ toArray: async () => structuredClone(rows.filter(x => matches(x,q)).slice(-n).reverse()) }) }), toArray: async () => structuredClone(rows.filter(x=>matches(x,q))) }),
    insertOne: async o => { if(rows.some(x => x._id && x._id === o._id)) { const e = new Error('Duplicate'); e.code=11000; throw e; } rows.push(structuredClone(o)); },
    updateOne: async (q, op, options = {}) => { let o=rows.find(x=>matches(x,q)); if(!o && options.upsert) { o={...q,...op.$setOnInsert};rows.push(o); } if(!o) return {matchedCount:0}; Object.assign(o, op.$set || {}); for(const [k,v] of Object.entries(op.$inc||{}))o[k]=(o[k]||0)+v;return {matchedCount:1}; },
    deleteMany: async q => {for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],q))rows.splice(i,1);},
    deleteOne: async q => {const i=rows.findIndex(x=>matches(x,q));if(i>=0)rows.splice(i,1);},
    countDocuments: async q => rows.filter(x=>matches(x,q)).length,
    createIndex: async () => {}
  };
}
export async function rateLimit(key, limit, seconds = 60) {
  const c = await collection('limits');
  const id = `${key}:${Math.floor(Date.now() / (seconds * 1000))}`;
  await c.updateOne({_id:id}, {$inc:{count:1},$setOnInsert:{expiresAt:new Date(Date.now()+(seconds+60)*1000)}}, {upsert:true});
  const entry=await c.findOne({_id:id});
  if(entry.count>limit)throw new AppError('Too many requests. Please try again later.',429);
}
