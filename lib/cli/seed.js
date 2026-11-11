import { db } from '../db.js';
try {
const database=await db();
if(!database)throw new Error('Seed requires MongoDB. Configure MONGODB_URI.');
await database.collection('orders').createIndex({requestKey:1},{unique:true});
await database.collection('orders').createIndex({workspace:1,createdAt:-1});
await database.collection('orders').createIndex({'payment.paypalOrderId':1},{sparse:true});
await database.collection('orders').createIndex({expiresAt:1},{expireAfterSeconds:0});
await database.collection('products').createIndex({workspace:1,id:1},{unique:true});
await database.collection('audit').createIndex({workspace:1,createdAt:-1});
await database.collection('limits').createIndex({expiresAt:1},{expireAfterSeconds:0});
await database.collection('locks').createIndex({expiresAt:1},{expireAfterSeconds:0});
console.log('MongoDB indexes created. The 102 reference products are loaded from data/menu.json; merchant overrides are stored in MongoDB.');
process.exit(0);
} catch(error) {
  console.error(`Database setup failed: ${error.status ? error.message : 'Check Atlas connectivity and database permissions.'}`);
  console.error('Next step: npm run db:check');
  process.exit(1);
}
