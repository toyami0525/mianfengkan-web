// Run with: node scripts/test-venue-closures.cjs. All network and session data are mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const root=require('node:path').resolve(__dirname,'..');
const source=fs.readFileSync(root+'/lib/venue-closures.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
let handler;
const exportsObject={};
vm.runInNewContext(js,{exports:exportsObject,Date,Intl,fetch:(...args)=>handler(...args),Error});
const {validClosureDate:valid,fixedClosureDate:fixed,taipeiClosureDate:today,readVenueClosure:read,saveVenueClosure:save}=exportsObject;
const db={auth:{getSession:async()=>({data:{session:{access_token:'local-test-only'}},error:null})}};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
function response(data,ok=true){return {ok,json:async()=>data}}
(async()=>{
 await test('Taipei date before midnight',()=>assert.equal(today(new Date('2026-09-29T15:59:59Z')),'2026-09-29'));
 await test('Taipei date after midnight',()=>assert.equal(today(new Date('2026-09-29T16:00:00Z')),'2026-09-30'));
 await test('Taipei year rollover',()=>assert.equal(today(new Date('2026-12-31T16:00:00Z')),'2027-01-01'));
 await test('Valid future and leap dates',()=>{assert.equal(valid('2026-10-03'),true);assert.equal(valid('2028-02-29'),true)});
 await test('Invalid, empty and impossible dates rejected',()=>{for(const date of ['', 'today','2026-2-01','2026-02-29','2026-04-31','2026-13-01','0000-01-01','2026-09-29T00:00:00Z'])assert.equal(valid(date),false,date)});
 await test('Monday remains fixed closure',()=>{assert.equal(fixed('2026-10-05'),true);assert.equal(fixed('2026-10-03'),false);assert.equal(fixed(''),false)});
 const stored=new Map([['2026-09-29',{id:'today',work_date:'2026-09-29'}],['2026-10-09',{id:'other',work_date:'2026-10-09'}]]);
 let writes=0,lastBody,lastMonth;
 handler=async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer local-test-only');
  if(options.method==='POST'){
   writes++;lastBody=JSON.parse(options.body);
   assert.equal(url,'/api/staff/calendar/closure');
   const{work_date,closed}=lastBody;
   if(closed)stored.set(work_date,{id:'test-future',work_date,reason:'臨時休館',updated_at:'2026-09-29T00:00:00Z'});else stored.delete(work_date);
   return response({ok:true,work_date,closed,row:stored.get(work_date)||null});
  }
  lastMonth=new URL(url,'https://test.invalid').searchParams.get('month');
  assert.equal(options.cache,'no-store');
  return response({closures:[...stored.values()].filter(row=>row.work_date.startsWith(lastMonth))});
 };
 await test('Cross-month selection reads October not today',async()=>{const state=await read(db,'2026-10-03');assert.equal(lastMonth,'2026-10');assert.equal(state.closed,false);assert.equal(state.work_date,'2026-10-03')});
 await test('Future closure saves exact chosen date',async()=>{const result=await save(db,'2026-10-03',true);assert.equal(result.closed,true);assert.equal(lastBody.work_date,'2026-10-03');assert.equal(lastBody.closed,true)});
 await test('Read-back sees persisted future closure',async()=>assert.equal((await read(db,'2026-10-03')).closed,true));
 await test('Future closure does not change today or other dates',()=>{assert.equal(stored.get('2026-09-29').id,'today');assert.equal(stored.get('2026-10-09').id,'other')});
 await test('Cancel deletes only selected date',async()=>{const result=await save(db,'2026-10-03',false);assert.equal(result.closed,false);assert.equal(result.row,null);assert.equal(stored.has('2026-10-03'),false);assert.equal(stored.size,2)});
 await test('Cancelled day reads normal again',async()=>assert.equal((await read(db,'2026-10-03')).closed,false));
 await test('Year-end future closure uses next-year month',async()=>{await save(db,'2027-01-02',true);assert.equal((await read(db,'2027-01-02')).closed,true);assert.equal(lastMonth,'2027-01');await save(db,'2027-01-02',false)});
 const beforeWrites=writes;
 await test('Monday cannot be closed or reopened via control',async()=>{await assert.rejects(()=>save(db,'2026-10-05',true),/固定休館/);await assert.rejects(()=>save(db,'2026-10-05',false),/固定休館/);assert.equal(writes,beforeWrites)});
 await test('Empty date never falls back to today',async()=>{await assert.rejects(()=>save(db,'',true),/有效/);assert.equal(writes,beforeWrites)});
 await test('Non-boolean closure state cannot trigger accidental cancellation',async()=>{await assert.rejects(()=>save(db,'2026-10-03','false'),/格式/);assert.equal(writes,beforeWrites)});
 await test('Missing session does not send a request',async()=>{let sent=false;handler=async()=>{sent=true};await assert.rejects(()=>read({auth:{getSession:async()=>({data:{session:null}})}},'2026-10-03'),/登入/);assert.equal(sent,false)});
 await test('Read failure is not treated as open',async()=>{handler=async()=>response({error:'讀取失敗'},false);await assert.rejects(()=>read(db,'2026-10-03'),/讀取失敗/)});
 await test('Incomplete read response is not treated as open',async()=>{handler=async()=>response({});await assert.rejects(()=>read(db,'2026-10-03'),/無法確認/)});
 await test('Forbidden mutation cannot report success',async()=>{handler=async()=>response({error:'只有館主可以設定臨時休館'},false);await assert.rejects(()=>save(db,'2026-10-03',true),/館主/)});
 await test('Wrong saved date cannot report success',async()=>{handler=async()=>response({ok:true,closed:true,work_date:'2026-09-29',row:{work_date:'2026-09-29'}});await assert.rejects(()=>save(db,'2026-10-03',true),/無法確認/)});
 await test('Wrong saved status cannot report success',async()=>{handler=async()=>response({ok:true,closed:false,work_date:'2026-10-03'});await assert.rejects(()=>save(db,'2026-10-03',true),/無法確認/)});
 console.log(`\n${passed} tests passed; no production data accessed or modified.`);
})().catch(error=>{console.error(error);process.exitCode=1});
