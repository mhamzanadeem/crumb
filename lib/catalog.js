import reference from '../data/menu.json' with {type:'json'};
import { collection } from './db.js';
export const baseProducts=reference.products.map(p=>({...p,available:true,stock:50,imageUrl:'',description:'Menu supplied as reference. Ingredients and allergy suitability require staff confirmation.'}));
export async function products(workspace='bakery') {
  const overrides=await (await collection('products')).find({workspace}).toArray();
  return baseProducts.map(p=>({...p,...overrides.find(x=>x.id===p.id),_id:undefined,workspace:undefined}));
}
export function photoCell(p) {
  const category={Cupcakes:6,Donuts:7,Desserts:8,Sundaes:9,Cookies:10,Brownies:11};
  if(category[p.category]!==undefined)return category[p.category];
  if(/Pistachio/.test(p.name))return 2;if(/Red Velvet/.test(p.name))return 3;
  if(/Milk|Raffaello|Cheesecake/.test(p.name))return 1;return 0;
}
