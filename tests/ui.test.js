import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript');}catch{if(process.env.CRUMB_TYPESCRIPT_PATH)ts=require(process.env.CRUMB_TYPESCRIPT_PATH);}

test('customer chatbot keeps selected photo and selection across Back; Exit stays in options',{skip:!ts},()=>{
  const state=[];let cursor=0;const navigated=[];let pathname='/order';
  const react={useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useMemo:fn=>fn(),useEffect:()=>{}};
  const jsx=(type,props)=>({type,props:props||{}});
  const Photo=props=>jsx('photo',props);
  const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'next/navigation':{useRouter:()=>({push:p=>navigated.push(p),replace:p=>navigated.push(p)}),usePathname:()=>pathname},'next/link':{__esModule:true,default:props=>jsx('a',props)},'next/dynamic':{__esModule:true,default:()=>()=>null},'@/data/menu.json':JSON.parse(readFileSync(new URL('../data/menu.json',import.meta.url),'utf8')),'./Photo':{__esModule:true,default:Photo}};
  const source=readFileSync(new URL('../components/CrumbApp.js',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{fileName:'CrumbApp.jsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};vm.runInNewContext(compiled,{require:id=>{if(!(id in mocks))throw Error('Unexpected UI dependency '+id);return mocks[id];},module:mod,exports:mod.exports,console,setTimeout:()=>{},Date});
  const App=mod.exports.default;
  function flatten(node,out=[]) {if(node===null||node===undefined||typeof node==='boolean')return out;if(Array.isArray(node)){node.forEach(n=>flatten(n,out));return out;}if(typeof node!=='object'){out.push(node);return out;}if(typeof node.type==='function')return flatten(node.type(node.props),out);out.push(node);flatten(node.props.children,out);return out;}
  const text=node=>flatten(node).filter(x=>typeof x!=='object').join('');
  function render(){cursor=0;return flatten(App());}
  function button(label){const found=render().find(n=>n?.type==='button'&&text(n)===label);assert.ok(found,'button exists: '+label);return found;}
  button('Order a cake').props.onClick();button('Birthday').props.onClick();
  const productButton=render().find(n=>n?.type==='button'&&n.props.className==='photo-choice'&&text(n).includes('Belgian Malt Cake'));
  assert.ok(productButton);productButton.props.onClick();
  assert.ok(render().some(n=>n?.type==='div'&&n.props.className==='chat-product'));
  assert.ok(render().some(n=>n?.type==='photo'&&n.props.product.id==='p12'));
  button('2 items').props.onClick();button('← Back').props.onClick();
  assert.equal(state[8].productId,'p12');assert.equal(state[8].quantity,2);assert.equal(state[9],'quantity');
  button('Exit').props.onClick();assert.equal(state[14],'exit');
  assert.ok(render().some(n=>n?.props?.role==='dialog'));
  button('Keep ordering').props.onClick();assert.equal(state[14],null);assert.equal(state[8].productId,'p12');
  pathname='/orders/CR-TESTORDER1';state[0]={...state[0],demoEnabled:true};
  state[15]={id:'CR-TESTORDER1',productId:'p12',productName:'Belgian Malt Cake',productSize:'2 Lbs',quantity:1,referenceTotal:2700,occasion:'Birthday',date:'2026-12-01',slot:'17:00–18:00',branch:'Demo',message:'',status:'pending',payment:{status:'unpaid'},history:[]};
  const handoff=render().find(n=>n?.type==='a'&&text(n)==='Switch to Merchant Studio ↗');
  assert.ok(handoff);assert.equal(handoff.props.target,'_blank');assert.equal(handoff.props.href,'/demo/merchant/CR-TESTORDER1');assert.ok(handoff.props.rel.includes('noopener'));
});
