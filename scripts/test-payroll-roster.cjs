// node scripts/test-payroll-roster.cjs — pure tests; no production reads or writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let ts;try{ts=require('typescript')}catch{ts=require('/usr/local/slides_js/node_modules/typescript')}
const path=require('node:path'),root=path.resolve(__dirname,'..'),exp={};
const source=fs.readFileSync(path.join(root,'lib/payroll-roster.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exp});
const {linkPayrollCompanions:link,isPayrollCompanionLocked:locked,hasPayrollSettlementActivity:activity,isSavedPayrollLocked:saved}=exp;
const staff=[{id:'o',slug:'riku'},{id:'a',slug:'airi'},{id:'z',slug:'zizishou'},{id:'c',slug:'ogino-chihiro'},{id:'h',slug:'kohakugawa-haku'}];
const normalize=x=>JSON.parse(JSON.stringify(x));let count=0;
function test(name,fn){fn();console.log('PASS '+name);count++}
test('selecting Airi includes photographer',()=>assert.deepEqual(normalize(link(['o','a'],staff)),['o','a','z']));
test('repeated linking has no duplicates',()=>assert.deepEqual(normalize(link(link(['o','a','z','a'],staff),staff)),['o','a','z']));
test('ordinary roster stays unchanged',()=>assert.deepEqual(normalize(link(['o','c'],staff)),['o','c']));
test('performers may be selected separately',()=>{assert.deepEqual(normalize(link(['c'],staff)),['c']);assert.deepEqual(normalize(link(['h'],staff)),['h'])});
test('photographer may work independently',()=>assert.deepEqual(normalize(link(['o','z'],staff)),['o','z']));
test('cannot deselect companion while Airi is selected',()=>assert.equal(locked('z',['a','z'],staff),true));
test('can deselect companion after deselecting Airi',()=>assert.equal(locked('z',['z'],staff),false));
test('other staff are not forced',()=>assert.equal(locked('c',['a','z'],staff),false));
test('missing profile never invents an ID',()=>assert.deepEqual(normalize(link(['a'],staff.filter(x=>x.id!=='z'))),['a']));
test('disabled profile not silently re-enabled',()=>assert.deepEqual(normalize(link(['a'],staff.map(x=>({...x,active:x.id!=='z'})))),['a']));
test('cached old roster gets companion before settlement',()=>assert.deepEqual(normalize(link(JSON.parse('["o","a"]'),staff)),['o','a','z']));
test('settled roster stays locked',()=>assert.equal(saved('{"settled":{"o":{"payout":150000}},"distributed_food":0}'),true));
test('distributed income locks roster',()=>assert.equal(activity({distributed_food:1}),true));
test('accrued shares lock roster',()=>assert.equal(activity({food_shares:{o:1}}),true));
test('empty or reset settlement is unlocked',()=>{assert.equal(saved(null),false);assert.equal(saved('{"settled":{},"food_shares":{},"distributed_food":0}'),false)});
test('corrupt saved settlement fails closed',()=>assert.equal(saved('{bad'),true));
test('three new people are separate payroll recipients',()=>{const roster=link(['o','a','c','h'],staff);assert.equal(roster.length,5);assert.equal(150000+900000/roster.length,330000)});
console.log(`${count} payroll tests passed; no live data was changed.`);
