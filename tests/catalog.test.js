import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {products}=JSON.parse(readFileSync(new URL('../data/menu.json',import.meta.url),'utf8'));
test('all 102 supplied items and seven categories are retained without invented cookies',()=>{
  assert.equal(products.length,102);assert.equal(new Set(products.map(p=>p.id)).size,102);
  assert.equal(products.filter(p=>p.category==='Cakes').length,26);
  assert.equal(products.filter(p=>p.category==='Cupcakes').length,21);
  assert.equal(products.filter(p=>p.category==='Donuts').length,22);
  assert.equal(products.filter(p=>p.category==='Cookies').length,6);
  assert.equal(products.find(p=>p.name==='Belgian Malt Cake').price,2700);
  assert.equal(products.find(p=>p.name==='Ferrero Rocher Cake').size,'2.5 LBS Approx');
});
