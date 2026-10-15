// Exercise the real routes with the established isolated Supabase mock (no network).
const assert=require('node:assert/strict');
const {environment,tableWrites,rpcCalls,assertNoWrites,queuedSuccess,defaultOrder,AIRI_ID,SAI_ID}=require('./test-airi-queue.cjs');
const COMBO='談天說地＋簽繪拍立得';
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
(async()=>{
 for(const [service,price,photo] of [['談天說地',150000,false],['簽繪拍立得',300000,true],[COMBO,400000,true]]){
  await test(service+' uses the fixed price and correct pickup behavior',async()=>{
   const env=environment({onRPC:(name,args)=>{assert.equal(name,'enqueue_airi_service');assert.equal(args.p_service_name,service);assert.equal(Boolean(args.p_pickup_code),photo);assert.ok(!('p_price' in args));return queuedSuccess(args,2)}});
   const result=await env.call('combined-order','POST',{...defaultOrder,services:[service],price:1});
   assert.equal(result.status,200);assert.equal(result.body.price,price);assert.equal(result.body.service_name,service);
   assert.equal(result.body.original_price,service===COMBO?450000:price);
   assert.equal(result.body.pickup_items.length,photo?1:0);assert.equal(rpcCalls(env).length,1);assert.equal(tableWrites(env).length,0);
   assert.equal(result.body.queue_limit,5);assert.equal(result.body.queue_position,2);
   assert.doesNotMatch(JSON.stringify(result.body),/ends_at|starts_at|duration_minutes/);
  });
 }
 await test('The two single services normalize to one discounted bundle',async()=>{
  const env=environment({onRPC:(name,args)=>{assert.equal(args.p_service_name,COMBO);return queuedSuccess(args)}});
  const result=await env.call('combined-order','POST',{...defaultOrder,services:['談天說地','簽繪拍立得']});
  assert.equal(result.status,200);assert.equal(result.body.price,400000);assert.equal(rpcCalls(env).length,1);assert.equal(result.body.pickup_items.length,1);
 });
 await test('Bundle plus another service does not double-charge or double-enqueue',async()=>{
  const env=environment();const result=await env.call('combined-order','POST',{...defaultOrder,services:[COMBO,'簽繪拍立得']});
  assert.equal(result.status,400);assertNoWrites(env);
 });
 for(const paused of ['談天說地','簽繪拍立得',COMBO]){
  await test('Pausing '+paused+' also prevents the bundle',async()=>{
   const env=environment({tables:{staff_service_availability:[{staff_id:AIRI_ID,service_name:paused,enabled:false}]}});
   const result=await env.call('combined-order','POST',{...defaultOrder,services:[COMBO]});
   assert.equal(result.status,409);assertNoWrites(env);
   const publicResult=await env.call('booking-data','GET');
   assert.ok(!publicResult.body.staff.find(s=>s.id===AIRI_ID).available_services.includes(COMBO));
  });
 }
 await test('Pausing only the bundle leaves both individual products available',async()=>{
  const env=environment({tables:{staff_service_availability:[{staff_id:AIRI_ID,service_name:COMBO,enabled:false}]}});
  const result=await env.call('booking-data','GET');
  assert.deepEqual(result.body.staff.find(s=>s.id===AIRI_ID).available_services,['談天說地','簽繪拍立得']);
 });
 await test('Airi-only offers are unavailable for other staff',async()=>{
  for(const service of ['談天說地',COMBO]){
   const env=environment();const result=await env.call('combined-order','POST',{...defaultOrder,staff_id:SAI_ID,services:[service]});
   assert.equal(result.status,400);assertNoWrites(env);
  }
 });
 const base={guest_name:'本地點餐測試',guest_server:'伊弗利特',polaroid:false,yukinoji_polaroid:false};
 for(const [label,items,expected,count] of [
  ['single main only',[{name:'蛋包飯',qty:1}],7000,1],
  ['single drink only',[{name:'白桃汁',qty:2}],14000,1],
  ['two different mains',[{name:'蛋包飯',qty:3},{name:'犎牛牛排',qty:2}],51000,2],
  ['more than the old 99 cap',[{name:'蛋包飯',qty:1000}],7000000,1],
  ['duplicate rows aggregate',[{name:'白桃塔',qty:3},{name:'白桃塔',qty:2}],40000,1],
  ['client price ignored',[{name:'犎牛牛排',qty:2,price:1}],30000,1],
  ['random-style one each',[{name:'蛋包飯',qty:1},{name:'烏雞布丁',qty:1},{name:'抹茶',qty:1}],22000,3],
  ['two liquors plus food',[{name:'梅酒・金梅',qty:2},{name:'蛋包飯',qty:4}],58000,2],
  ['legacy default qty',[{name:'蛋包飯'}],7000,1],
 ]){
  await test('Food order: '+label,async()=>{
   const env=environment({tables:{orders:[]}});const result=await env.call('orders','POST',{...base,items});
   assert.equal(result.status,200,JSON.stringify(result));
   const writes=tableWrites(env);assert.equal(writes.length,1);assert.equal(writes[0].table,'orders');
   const order=writes[0].values;assert.equal(order.total,expected);assert.equal(order.items.length,count);
   assert.equal(order.total,order.items.reduce((s,x)=>s+x.qty*x.price,0));
  });
 }
 for(const [label,items] of [
  ['negative',[{name:'蛋包飯',qty:-1}]],['fraction',[{name:'蛋包飯',qty:1.5}]],
  ['numeric string',[{name:'蛋包飯',qty:'2'}]],['unsafe integer',[{name:'蛋包飯',qty:Number.MAX_SAFE_INTEGER}]],
  ['unknown item',[{name:'不存在',qty:1}]],['prototype name',[{name:'__proto__',qty:1}]],
  ['empty',[]],['zero only',[{name:'蛋包飯',qty:0}]],
  ['too many liquors',[{name:'梅酒・金梅',qty:2},{name:'生酒・夢紫',qty:1}]],
  ['duplicate liquors over cap',[{name:'梅酒・金梅',qty:2},{name:'梅酒・金梅',qty:1}]],
 ]){
  await test('Food order rejects '+label+' without saving anything',async()=>{
   const env=environment({tables:{orders:[]}});const result=await env.call('orders','POST',{...base,items});
   assert.equal(result.status,400,JSON.stringify(result));assertNoWrites(env);
  });
 }
 await test('High quantities still count toward existing polaroid gates, liquor does not',async()=>{
  const env=environment({tables:{orders:[]}});const r=await env.call('orders','POST',{...base,items:[{name:'犎牛牛排',qty:9},{name:'梅酒・金梅',qty:2}],polaroid:true});
  assert.equal(r.status,400);assert.match(r.body.error,/150,000/);assertNoWrites(env);
 });
 console.log(`${passed} new feature tests passed. No production data accessed.`);
})().catch(e=>{console.error(e);process.exitCode=1});
