const FALLBACK_DELIVERY_STAFF=[{id:'riku',slug:'riku',name:'羽鶴璃久',role:'館主'},{id:'wei',slug:'wei',name:'微',role:'館員'},{id:'musufiru',slug:'musufiru',name:'慕斯菲露',role:'館員'},{id:'yukinoji-hakari',slug:'yukinoji-hakari',name:'雪之寺羽狩',role:'館員'},{id:'hong-hong-hong-taidafeng',slug:'hong-hong-hong-taidafeng',name:'轟轟轟太大風',role:'館員'},{id:'grin',slug:'grin',name:'格林',role:'館員'},{id:'shenaixue',slug:'shenaixue',name:'神噯雪',role:'館員'},{id:'zixuan',slug:'zixuan',name:'子瑄',role:'館員'},{id:'feitong',slug:'feitong',name:'緋瞳',role:'館員'}];
const FALLBACK_STAFF=[{id:'wei',slug:'wei',name:'微',role:'館員'},{id:'musufiru',slug:'musufiru',name:'慕斯菲露',role:'館員'},{id:'yukinoji-hakari',slug:'yukinoji-hakari',name:'雪之寺羽狩',role:'館員',services:['耳語陪伴']},{id:'hong-hong-hong-taidafeng',slug:'hong-hong-hong-taidafeng',name:'轟轟轟太大風',role:'館員'},{id:'grin',slug:'grin',name:'格林',role:'館員'},{id:'shenaixue',slug:'shenaixue',name:'神噯雪',role:'館員',services:['耳語陪伴']},{id:'zixuan',slug:'zixuan',name:'子瑄',role:'館員',services:['泡湯洗浴','按摩服務','耳語陪伴']},{id:'feitong',slug:'feitong',name:'緋瞳',role:'館員',services:['泡湯洗浴','按摩服務','耳語陪伴']},{id:'lina',slug:'lina',name:'Lina',role:'館員',services:['簽繪拍立得']}];
const SERVICE_INFO={'泡湯洗浴':{price:150000,duration:15},'按摩服務':{price:100000,duration:15},'耳語陪伴':{price:100000,duration:15},'Q版繪圖(公版)':{price:350000,duration:15},'簽繪拍立得':{price:150000,duration:15},'眠楓套席':{price:300000,duration:45}};
const POLAROID_PRICE=80000;const YUKINOJI_POLAROID_PRICE=100000;
const foods=[['主食','蛋包飯',7000],['主食','扇貝咖哩',9000],['主食','加雷馬披薩',9000],['主食','醬炒飯',7000],['主食','懸掛番茄沙拉',9000],['主食','羊駝奶油麵',7000],['甜點','圓扇刺刺梨蛋糕',6000],['甜點','巧克力奶油蛋糕',6000],['甜點','白桃塔',8000],['甜點','蜂蜜牛角麵包',8000],['甜點','烏雞布丁',8000],['飲品','奶油熱巧克力',5000],['飲品','蜜瓜果汁',7000],['飲品','白桃汁',7000],['飲品','抹茶',7000],['飲品','路易波士紅茶',7000]].map((x,i)=>({id:i+1,category:x[0],name:x[1],price:x[2]}));
let staff=[],deliveryStaff=[],blocks=[],selected='',confirmedPolaroid=false,orderMode='booking',bookingTestMode=false,yukinojiChibiAccepting=true,linaSignedRemaining=3;const OPEN_HOUR=21,CLOSE_HOUR=24,$=id=>document.getElementById(id);
const staffBox=$('staffSelect'),availabilityMessage=$('availabilityMessage'),bookingSummary=$('bookingSummary'),bookingServiceSummary=$('bookingServiceSummary'),bookingSubmit=$('bookingSubmit'),diningSubmit=$('diningSubmit'),packageBox=$('packageService'),polaroid=$('polaroid'),polaroidSection=$('polaroidSection'),polaroidHint=$('polaroidHint'),yukinojiPolaroid=$('yukinojiPolaroid'),yukinojiPolaroidSection=$('yukinojiPolaroidSection'),yukinojiPolaroidHint=$('yukinojiPolaroidHint'),diningPolaroidStatus=$('diningPolaroidStatus'),diningOnlyPolaroids=$('diningOnlyPolaroids'),diningPolaroid=$('diningPolaroid'),diningPolaroidHint=$('diningPolaroidHint'),diningYukinojiPolaroid=$('diningYukinojiPolaroid'),diningYukinojiPolaroidHint=$('diningYukinojiPolaroidHint'),deliveryPreference=$('deliveryPreference'),yukinojiChibiService=$('yukinojiChibiService'),yukinojiChibiServiceRow=$('yukinojiChibiServiceRow'),linaSignedPolaroid=$('linaSignedPolaroid'),linaSignedPolaroidRow=$('linaSignedPolaroidRow'),linaSignedPolaroidHint=$('linaSignedPolaroidHint');
const serviceBoxes=()=>[...document.querySelectorAll('input[name="service"]')];
let lastRandomMeal='';
function randomMealPackage(){
 const categories=['主食','甜點','飲品'];
 let picks=[];
 for(let attempt=0;attempt<12;attempt++){
  picks=categories.map(category=>{const pool=foods.filter(f=>f.category===category);return pool[Math.floor(Math.random()*pool.length)]});
  const signature=picks.map(x=>x.id).join('-');
  if(signature!==lastRandomMeal||attempt===11){lastRandomMeal=signature;break}
 }
 document.querySelectorAll('.food-choice').forEach(x=>x.checked=false);
 picks.forEach(food=>{const input=document.querySelector(`.food-choice[data-id="${food.id}"]`);if(input)input.checked=true});
 updateAll();
 toast(`🎲 聽天由命：${picks.map(x=>x.name).join('＋')}`);
}
$('foodChoices').innerHTML=['主食','甜點','飲品'].map(c=>`<h3 class="food-category-title">${c}</h3>`+foods.filter(f=>f.category===c).map(f=>`<label class="food-row package-choice"><span><small>${f.category}</small><b>${f.name}</b></span><span>${f.price.toLocaleString('zh-TW')} Gil</span><input class="food-choice" type="radio" name="food-${c}" value="${f.id}" data-id="${f.id}" aria-label="${f.name}"></label>`).join('')).join('');
const fmt=d=>new Date(d).toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}),fmtTime=d=>new Date(d).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false}),pad=n=>String(n).padStart(2,'0');
const localDate=d=>{const x=new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`};
function chosenServices(){return serviceBoxes().filter(x=>x.checked).map(x=>x.value)}
function serviceTotals(){if(orderMode==='dining')return {price:0,duration:0,names:[]};if(packageBox.checked)return {price:300000,duration:45,names:['眠楓套席']};const names=chosenServices();return {price:names.reduce((n,x)=>n+SERVICE_INFO[x].price,0),duration:names.reduce((n,x)=>n+SERVICE_INFO[x].duration,0),names}}
function selectedItems(){return [...document.querySelectorAll('.food-choice:checked')].map(x=>({food:foods.find(f=>f.id===Number(x.dataset.id)),qty:1}))}
function foodTotal(){return selectedItems().reduce((n,x)=>n+x.food.price*x.qty,0)}
function eligibleSubtotal(){return orderMode==='booking'?serviceTotals().price:foodTotal()}
function orderTotal(){return eligibleSubtotal()+(orderMode==='booking'&&polaroid.checked?POLAROID_PRICE:0)+(orderMode==='booking'&&yukinojiPolaroid.checked?YUKINOJI_POLAROID_PRICE:0)+(orderMode==='dining'&&diningPolaroid.checked?POLAROID_PRICE:0)+(orderMode==='dining'&&diningYukinojiPolaroid.checked?YUKINOJI_POLAROID_PRICE:0)}
function selectedStaffSlug(){return staff.find(x=>x.id===selected)?.slug||selected}
function syncPackage(){
 const slug=selectedStaffSlug(),boxes=serviceBoxes(),special=new Set([yukinojiChibiService,linaSignedPolaroid]),children=boxes.filter(x=>x!==packageBox&&!special.has(x));
 if(orderMode==='dining')return;
 boxes.forEach(x=>{const row=x.closest('.service-check');row.title='';if(!special.has(x))row.hidden=false});

 // 特殊服務只能在對應館員時顯示；不要在每次 updateAll() 時先把目前館員的勾選清掉。
 if(slug!=='yukinoji-hakari'&&yukinojiChibiServiceRow){
  yukinojiChibiServiceRow.hidden=true;yukinojiChibiService.checked=false;yukinojiChibiService.disabled=true;yukinojiChibiServiceRow.classList.remove('locked');
 }
 if(slug!=='lina'&&linaSignedPolaroidRow){
  linaSignedPolaroidRow.hidden=true;linaSignedPolaroid.checked=false;linaSignedPolaroid.disabled=true;linaSignedPolaroidRow.classList.remove('locked');
 }

 if(slug==='shenaixue'){
  packageBox.checked=false;boxes.forEach(x=>{const allowed=x.value==='耳語陪伴';if(!allowed)x.checked=false;x.disabled=!allowed;const row=x.closest('.service-check');if(!allowed&&special.has(x))row.hidden=true;row.classList.toggle('locked',!allowed);row.title=allowed?'':'神噯雪目前僅提供耳語陪伴'});return
 }
 if(slug==='yukinoji-hakari'){
  packageBox.checked=false;
  boxes.forEach(x=>{
   const isChibi=x.value==='Q版繪圖(公版)',allowed=x.value==='耳語陪伴'||(isChibi&&yukinojiChibiAccepting),row=x.closest('.service-check');
   if(!allowed)x.checked=false;
   x.disabled=!allowed;
   if(isChibi){row.hidden=!yukinojiChibiAccepting;row.title=yukinojiChibiAccepting?'':'Q版繪圖目前暫停接單'}
   else if(x.value!=='耳語陪伴')row.hidden=true;
   row.classList.toggle('locked',!allowed);
  });
  return
 }
 if(slug==='lina'){
  packageBox.checked=false;
  boxes.forEach(x=>{
   const isSigned=x.value==='簽繪拍立得',allowed=isSigned&&linaSignedRemaining>0,row=x.closest('.service-check');
   if(!allowed)x.checked=false;
   x.disabled=!allowed;
   row.hidden=!isSigned;
   if(isSigned){row.hidden=false;row.classList.toggle('locked',!allowed);row.title=allowed?`今日剩餘 ${linaSignedRemaining} 張`:'Lina 簽繪拍立得今日已額滿';if(linaSignedPolaroidHint)linaSignedPolaroidHint.textContent=allowed?`150,000 Gil｜今日剩餘 ${linaSignedRemaining}／3 張`:'150,000 Gil｜今日 3 張已額滿'}
  });
  return
 }
 if(packageBox.checked){children.forEach(x=>{x.checked=true;x.disabled=true;x.closest('.service-check').classList.add('locked')});packageBox.disabled=false;packageBox.closest('.service-check').classList.remove('locked')}
 else{boxes.forEach(x=>{if(special.has(x))return;x.disabled=false;x.closest('.service-check').classList.remove('locked')})}
}
function updatePolaroid(){
 if(orderMode==='dining'){polaroid.checked=false;polaroid.disabled=true;polaroidSection.hidden=true;yukinojiPolaroid.checked=false;yukinojiPolaroid.disabled=true;yukinojiPolaroidSection.hidden=true;updateDiningOnlyPolaroids();return}
 const slug=selectedStaffSlug(),total=eligibleSubtotal();
 const isMusu=slug==='musufiru',musuMissing=Math.max(0,150000-total);polaroidSection.hidden=!isMusu;
 if(!isMusu){polaroid.checked=false;polaroid.disabled=true}else{polaroid.disabled=musuMissing>0;if(musuMissing>0){polaroid.checked=false;polaroidHint.textContent=`目前 ${total.toLocaleString('zh-TW')} Gil，再消費 ${musuMissing.toLocaleString('zh-TW')} Gil 即可解鎖（僅計服務費）`}else polaroidHint.textContent=`已達 ${total.toLocaleString('zh-TW')} Gil，可加購紀念拍立得（80,000 Gil）`}
 const isYukinoji=slug==='yukinoji-hakari',yMissing=Math.max(0,200000-total);yukinojiPolaroidSection.hidden=!isYukinoji;
 if(!isYukinoji){yukinojiPolaroid.checked=false;yukinojiPolaroid.disabled=true}else{yukinojiPolaroid.disabled=yMissing>0;if(yMissing>0){yukinojiPolaroid.checked=false;yukinojiPolaroidHint.textContent=`目前 ${total.toLocaleString('zh-TW')} Gil，再消費 ${yMissing.toLocaleString('zh-TW')} Gil 即可解鎖（僅計服務費）`}else yukinojiPolaroidHint.textContent=`已達 ${total.toLocaleString('zh-TW')} Gil，可加購紀念拍立得（100,000 Gil）`}
}
function updateDiningOnlyPolaroids(){
 const total=foodTotal(),musuMissing=Math.max(0,150000-total),yukiMissing=Math.max(0,200000-total);
 diningOnlyPolaroids.hidden=orderMode!=='dining';
 if(orderMode!=='dining'){diningPolaroid.checked=false;diningYukinojiPolaroid.checked=false;return}
 diningPolaroid.disabled=musuMissing>0;if(musuMissing>0){diningPolaroid.checked=false;diningPolaroidHint.textContent=`目前餐點 ${total.toLocaleString('zh-TW')} Gil，再消費 ${musuMissing.toLocaleString('zh-TW')} Gil 即可解鎖`}else diningPolaroidHint.textContent=`餐點已達 ${total.toLocaleString('zh-TW')} Gil，可加購慕斯菲露紀念拍立得（80,000 Gil）`;
 diningYukinojiPolaroid.disabled=yukiMissing>0;if(yukiMissing>0){diningYukinojiPolaroid.checked=false;diningYukinojiPolaroidHint.textContent=`目前餐點 ${total.toLocaleString('zh-TW')} Gil，再消費 ${yukiMissing.toLocaleString('zh-TW')} Gil 即可解鎖`}else diningYukinojiPolaroidHint.textContent=`餐點已達 ${total.toLocaleString('zh-TW')} Gil，可加購雪之寺羽狩紀念拍立得（100,000 Gil）`;
}
function deliveryPreferenceName(){const id=deliveryPreference?.value||'';return deliveryStaff.find(x=>x.id===id)?.name||''}
function deliveryStaffIsBusy(staffId){return blocks.some(b=>b.staff_id===staffId&&b.block_type==='reservation')}
function availableDeliveryStaff(){return deliveryStaff.filter(s=>!deliveryStaffIsBusy(s.id))}
function renderDeliveryStaff(){if(!deliveryPreference)return;const previous=deliveryPreference.value,available=availableDeliveryStaff();deliveryPreference.innerHTML='<option value="">不指定／由館內安排</option>'+available.map(s=>`<option value="${s.id}">${s.name}${s.role?`（${s.role}）`:''}</option>`).join('');if(previous&&available.some(x=>x.id===previous))deliveryPreference.value=previous;else if(previous)deliveryPreference.value=''}
async function fetchDeliveryStaff(){const r=await fetch('/api/delivery-staff',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'讀取送餐館員失敗');return j}
async function loadDeliveryStaff(){if(deliveryStaff.length)return;try{const d=await fetchDeliveryStaff();deliveryStaff=d.staff||[]}catch(e){console.warn(e);deliveryStaff=FALLBACK_DELIVERY_STAFF}if(!deliveryStaff.length)deliveryStaff=FALLBACK_DELIVERY_STAFF;renderDeliveryStaff()}
function activeReservationsFor(staffId){return blocks.filter(b=>b.staff_id===staffId&&b.block_type==='reservation')}
function closingTime(now=new Date()){const close=new Date(now);close.setHours(24,0,0,0);return close}
function staffStatus(staffId){const now=new Date(),h=now.getHours(),slug=staff.find(x=>x.id===staffId)?.slug;if(slug==='lina'&&linaSignedRemaining<=0)return {kind:'off',text:'今日簽繪已額滿｜3／3 張'};if(!bookingTestMode&&h<OPEN_HOUR)return {kind:'off',text:'尚未開放｜21:00 開始指名'};const active=activeReservationsFor(staffId);if(active.length){const latest=active[active.length-1],end=new Date(latest.end_at);return {kind:'busy',text:end.getTime()>now.getTime()?`服務中｜原預計約 ${fmtTime(end)} 結束`:'服務中｜可能正在續時',end};}if(!bookingTestMode){const close=closingTime(now),minimumEnd=new Date(now.getTime()+15*60000);if(now>=close||minimumEnd>close)return {kind:'off',text:'今日剩餘時間不足｜無法再接受指名'}}return {kind:'now',text:bookingTestMode?'測試模式｜可立即指名':'可立即指名'}}
function renderStaff(){staffBox.innerHTML=staff.map(s=>{const st=staffStatus(s.id);return `<button type="button" class="staff-choice ${selected===s.id?'selected':''}" data-id="${s.id}"><b>${s.name}</b><br><small class="status-${st.kind}">${s.role}・${st.text}</small></button>`}).join('');staffBox.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.id;renderStaff();updateAll()})}
function mealPackageOk(){const items=selectedItems();return ['主食','甜點','飲品'].every(c=>items.some(x=>x.food.category===c))}
function check(){
 if(orderMode==='dining'){const ok=mealPackageOk();availabilityMessage.textContent=ok?'套餐已完成，可送出點餐。':'請完成一份套餐：主食、甜點、飲品各選一項。';availabilityMessage.className='availability-message '+(ok?'available':'unavailable');diningSubmit.disabled=!ok;return ok}
 if(selectedStaffSlug()==='lina'&&linaSignedRemaining<=0){availabilityMessage.textContent='Lina 的簽繪拍立得今日 3 張已額滿。';availabilityMessage.className='availability-message unavailable';bookingSubmit.disabled=true;return false}
 if(!chosenServices().length){availabilityMessage.textContent='請至少選擇一項服務。';availabilityMessage.className='availability-message unavailable';bookingSubmit.disabled=true;return false}
 const now=new Date();if(!bookingTestMode&&now.getHours()<OPEN_HOUR){availabilityMessage.textContent='目前非指名時間。每日 21:00 起開放即時指名。';availabilityMessage.className='availability-message unavailable';bookingSubmit.disabled=true;return false}
 const st=staffStatus(selected);if(st.kind==='off'||st.kind==='busy'){availabilityMessage.textContent=st.text;availabilityMessage.className='availability-message unavailable';bookingSubmit.disabled=true;return false}
 const s=serviceTotals(),start=new Date(now),end=new Date(start.getTime()+s.duration*60000),close=closingTime(now);if(!bookingTestMode&&(start>=close||end>close)){availabilityMessage.textContent=`此服務約需 ${s.duration} 分鐘，若現在開始預計 ${fmtTime(end)} 結束，將超過 24:00，今晚無法指名。`;availabilityMessage.className='availability-message unavailable';bookingSubmit.disabled=true;return false}
 const msg=bookingTestMode?`⚠ 指名測試模式啟用中｜此館員目前可立即指名，預計約 ${fmtTime(end)} 結束。`:`此館員目前可立即指名｜預計約 ${fmtTime(end)} 結束。`;availabilityMessage.textContent=msg;availabilityMessage.className='availability-message available';bookingSubmit.disabled=false;return true}
function updateSummary(){syncPackage();updatePolaroid();const s=serviceTotals(),items=selectedItems(),staffName=staff.find(x=>x.id===selected)?.name||'';let services=packageBox.checked?'眠楓套席（包含泡湯洗浴、按摩服務、耳語陪伴）':s.names.join('、');if(orderMode==='booking'){const photo=(polaroid.checked?POLAROID_PRICE:0)+(yukinojiPolaroid.checked?YUKINOJI_POLAROID_PRICE:0);bookingServiceSummary.innerHTML=`<div class="summary-title"><b>${staffName||'尚未選擇館員'}</b></div><div class="summary-group"><span>服務項目</span><b>${s.price.toLocaleString('zh-TW')} Gil</b><small>${services||'尚未選擇'}</small></div>${polaroid.checked?`<div class="summary-group photo-line selected"><span>慕斯菲露紀念拍立得</span><b>${POLAROID_PRICE.toLocaleString('zh-TW')} Gil</b></div>`:''}${yukinojiPolaroid.checked?`<div class="summary-group photo-line selected"><span>雪之寺羽狩紀念拍立得</span><b>${YUKINOJI_POLAROID_PRICE.toLocaleString('zh-TW')} Gil</b></div>`:''}<div class="summary-total"><span>服務總金額</span><strong>${(s.price+photo).toLocaleString('zh-TW')} Gil</strong></div>`;}else{const mealPrice=foodTotal(),foodLines=items.length?items.map(x=>`${x.food.name} × ${x.qty}`).join('、'):'尚未完成套餐';bookingSummary.innerHTML=`<div class="summary-title"><b>餐食套餐</b></div><div class="summary-group"><span>套餐內容</span><b>${mealPrice.toLocaleString('zh-TW')} Gil</b><small>${foodLines}</small></div><div class="summary-group delivery-line"><span>希望送餐館員</span><b>${deliveryPreferenceName()||'不指定／由館內安排'}</b><small>此為送餐希望，實際依現場狀況安排。</small></div>${diningPolaroid.checked?`<div class="summary-group photo-line selected"><span>慕斯菲露紀念拍立得</span><b>${POLAROID_PRICE.toLocaleString('zh-TW')} Gil</b></div>`:''}${diningYukinojiPolaroid.checked?`<div class="summary-group photo-line selected"><span>雪之寺羽狩紀念拍立得</span><b>${YUKINOJI_POLAROID_PRICE.toLocaleString('zh-TW')} Gil</b></div>`:''}<div class="summary-total"><span>餐食訂單總金額</span><strong>${orderTotal().toLocaleString('zh-TW')} Gil</strong></div>`;}updateDiningPolaroidStatus();check()}
function updateDiningPolaroidStatus(){if(orderMode==='dining'){const selectedPhotos=[diningPolaroid.checked?'慕斯菲露拍立得':'',diningYukinojiPolaroid.checked?'雪之寺羽狩拍立得':''].filter(Boolean);diningPolaroidStatus.innerHTML=selectedPhotos.length?`<span>只點餐＋拍立得</span><b>已選：${selectedPhotos.join('、')}</b>`:'<span>只點餐模式</span><b>餐點達指定門檻後，也可以直接加購拍立得</b>';diningPolaroidStatus.className=selectedPhotos.length?'dining-polaroid-status selected':'dining-polaroid-status available';return}const slug=selectedStaffSlug(),total=eligibleSubtotal();if(slug==='musufiru'){const missing=Math.max(0,150000-total);if(polaroid.checked){diningPolaroidStatus.innerHTML='<span>慕斯菲露紀念拍立得</span><b>已加購｜80,000 Gil 已計入總金額</b>';diningPolaroidStatus.className='dining-polaroid-status selected'}else if(missing>0){diningPolaroidStatus.innerHTML=`<span>慕斯菲露紀念拍立得</span><b>尚差 ${missing.toLocaleString('zh-TW')} Gil 解鎖</b><small>拍立得門檻僅以本次服務費計算。</small>`;diningPolaroidStatus.className='dining-polaroid-status locked'}else{diningPolaroidStatus.innerHTML='<span>慕斯菲露紀念拍立得</span><b>已達門檻，可勾選加購</b>';diningPolaroidStatus.className='dining-polaroid-status available'}return}if(slug==='yukinoji-hakari'){const missing=Math.max(0,200000-total);if(yukinojiPolaroid.checked){diningPolaroidStatus.innerHTML='<span>雪之寺羽狩紀念拍立得</span><b>已加購｜100,000 Gil 已計入總金額</b>';diningPolaroidStatus.className='dining-polaroid-status selected'}else if(missing>0){diningPolaroidStatus.innerHTML=`<span>雪之寺羽狩紀念拍立得</span><b>尚差 ${missing.toLocaleString('zh-TW')} Gil 解鎖</b><small>拍立得門檻僅以本次服務費計算。</small>`;diningPolaroidStatus.className='dining-polaroid-status locked'}else{diningPolaroidStatus.innerHTML='<span>雪之寺羽狩紀念拍立得</span><b>已達門檻，可勾選加購</b>';diningPolaroidStatus.className='dining-polaroid-status available'}return}diningPolaroidStatus.innerHTML='<span>館員專屬服務</span><b>目前指名館員沒有拍立得加購</b>';diningPolaroidStatus.className='dining-polaroid-status locked'}
function setMode(mode){if(mode===orderMode)return;if(mode==='dining'&&(chosenServices().length||polaroid.checked||yukinojiPolaroid.checked)){if(!confirm('切換成「只點餐」後，會清除已選擇的館員服務；已選餐點會保留，拍立得可在點餐頁重新選擇。是否繼續？'))return;serviceBoxes().forEach(x=>{x.checked=false;x.disabled=false;x.closest('.service-check').classList.remove('locked')});polaroid.checked=false;yukinojiPolaroid.checked=false}orderMode=mode;document.body.classList.toggle('dining-only-mode',mode==='dining');document.querySelectorAll('.booking-mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));document.querySelector('.booking-note').hidden=mode==='dining';document.querySelector('.booking-tabs').hidden=true;document.querySelector('.dining-only-note').hidden=mode!=='dining';diningOnlyPolaroids.hidden=mode!=='dining';bookingSubmit.hidden=mode!=='booking';diningSubmit.hidden=mode!=='dining';if(mode==='dining')switchTab('dining');else switchTab('booking');updateAll()}
function updateAll(){updateSummary()}
let realtimeClient=null,realtimeChannel=null,realtimeRefreshTimer=null;
function scheduleRealtimeRefresh(){clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(()=>{if(document.visibilityState==='visible')load()},120)}
async function setupRealtime(){
 try{
  if(!window.supabase)return;
  const r=await fetch('/api/realtime-config',{cache:'no-store'}),cfg=await r.json();
  if(!r.ok||!cfg.supabaseUrl||!cfg.supabaseKey)throw new Error(cfg.error||'Realtime 設定讀取失敗');
  realtimeClient=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}});
  realtimeChannel=realtimeClient.channel('public-booking-live')
   .on('broadcast',{event:'booking_changed'},scheduleRealtimeRefresh)
   .on('broadcast',{event:'availability_changed'},scheduleRealtimeRefresh)
   .on('broadcast',{event:'settings_changed'},scheduleRealtimeRefresh)
   .subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('Supabase Realtime 暫時未連線，保留 10 秒輪詢備援。')});
 }catch(e){console.warn('Supabase Realtime 初始化失敗，改用 10 秒輪詢備援。',e)}
}
async function broadcastBookingChange(event='booking_changed'){
 try{if(realtimeChannel)await realtimeChannel.send({type:'broadcast',event,payload:{at:new Date().toISOString()}})}catch(e){console.warn('Realtime 廣播失敗，輪詢仍會補上。',e)}
}
async function fetchBookingData(){const r=await fetch('/api/booking-data',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'讀取指名資料失敗');return j}
async function load(){await loadDeliveryStaff();try{const d=await fetchBookingData();staff=(d.staff||[]).filter(x=>['wei','musufiru','yukinoji-hakari','hong-hong-hong-taidafeng','grin','shenaixue','zixuan','feitong','lina'].includes(x.slug||x.id));blocks=d.blocks||[];bookingTestMode=d.test_mode===true;yukinojiChibiAccepting=d.yukinoji_chibi_accepting!==false;linaSignedRemaining=Math.max(0,Math.min(3,Number(d.lina_signed_remaining??3)));renderDeliveryStaff();const hoursNote=$('bookingHoursNote');if(hoursNote)hoursNote.textContent=bookingTestMode?'⚠ 指名測試模式啟用中：目前不受 21:00～24:00 時間限制；館員忙碌、請假與休息狀態仍照常生效。':'每日 21:00～24:00 開放即時指名；館員服務中時暫停新的指名。'}catch(e){console.warn(e);toast('暫時無法讀取最新指名狀態')}if(!staff.length)staff=FALLBACK_STAFF;if(!selected||!staff.some(x=>x.id===selected))selected=staff[0].id;renderStaff();updateAll()}
serviceBoxes().forEach(x=>x.addEventListener('change',updateAll));$('foodChoices').addEventListener('input',updateAll);polaroid.addEventListener('change',updateAll);yukinojiPolaroid.addEventListener('change',updateAll);diningPolaroid.addEventListener('change',updateAll);diningYukinojiPolaroid.addEventListener('change',updateAll);deliveryPreference?.addEventListener('change',updateAll);$('randomMealBtn')?.addEventListener('click',randomMealPackage);
document.querySelectorAll('.booking-mode-btn').forEach(x=>x.addEventListener('click',()=>setMode(x.dataset.mode)));
function showPolaroidModal(){confirmedPolaroid=false;$('polaroidRead').checked=false;$('confirmSubmit').disabled=true;$('polaroidModal').hidden=false}
function showPickupCode(codeOrCodes){const raw=(Array.isArray(codeOrCodes)?codeOrCodes:[codeOrCodes]).filter(Boolean),items=raw.map(x=>typeof x==='string'?{code:x,label:'成品'}:x),codes=items.map(x=>x.code).filter(Boolean);$('generatedPickupCode').innerHTML=items.map(x=>`<div class="pickup-code-item"><small>${x.label||'成品'}</small><b>${x.code}</b></div>`).join('');$('pickupCodeModal').hidden=false;$('copyPickupCode').onclick=async()=>{const text=items.map(x=>`${x.label||'成品'}：${x.code}`).join('\n');try{await navigator.clipboard.writeText(text);toast('取件碼已複製')}catch{toast('請手動記下取件碼：'+codes.join('、'))}};$('closePickupCode').onclick=()=>$('pickupCodeModal').hidden=true}
$('polaroidRead').onchange=e=>$('confirmSubmit').disabled=!e.target.checked;$('returnEdit').onclick=()=>$('polaroidModal').hidden=true;$('confirmSubmit').onclick=()=>{confirmedPolaroid=true;$('polaroidModal').hidden=true;$('bookingForm').requestSubmit()};
$('bookingForm').onsubmit=async e=>{e.preventDefault();const guest=$('guest').value.trim(),s=serviceTotals(),items=selectedItems(),hasDiningPolaroid=diningPolaroid.checked||diningYukinojiPolaroid.checked;if(!guest)return toast('請填寫客人名稱');if(orderMode==='dining'&&!mealPackageOk())return toast('請完成一份套餐：主食、甜點、飲品各選一項');if(orderMode==='dining'){if(hasDiningPolaroid&&!confirmedPolaroid)return showPolaroidModal()}else{if(!check())return toast('請確認館員狀態與服務');if((polaroid.checked||yukinojiPolaroid.checked)&&!confirmedPolaroid)return showPolaroidModal()}const activeSubmit=orderMode==='dining'?diningSubmit:bookingSubmit;activeSubmit.disabled=true;activeSubmit.textContent='傳送中…';try{const url=orderMode==='dining'?'/api/orders':'/api/combined-order';const body=orderMode==='dining'?{guest_name:guest,items:items.map(x=>({name:x.food.name,qty:x.qty})),polaroid:diningPolaroid.checked,yukinoji_polaroid:diningYukinojiPolaroid.checked,note:$('diningNote').value.trim(),delivery_preference_staff_id:deliveryPreference?.value||null}:{guest_name:guest,staff_id:selected,services:packageBox.checked?['眠楓套席']:s.names,items:[],polaroid:polaroid.checked,yukinoji_polaroid:yukinojiPolaroid.checked,note:$('note').value.trim()};const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||'送出失敗');if(orderMode==='booking')await broadcastBookingChange('booking_changed');e.target.reset();document.querySelectorAll('.food-choice').forEach(x=>x.checked=false);diningPolaroid.checked=false;diningYukinojiPolaroid.checked=false;confirmedPolaroid=false;if(result.pickup_items?.length)showPickupCode(result.pickup_items);else if(result.pickup_codes?.length)showPickupCode(result.pickup_codes);else if(result.pickup_code)showPickupCode(result.pickup_code);else toast(orderMode==='dining'?'餐點訂單已成功送出':'指名服務已成功送出');await load();setMode(orderMode)}catch(error){toast(error instanceof Error?error.message:'送出失敗，請稍後再試')}finally{activeSubmit.disabled=false;activeSubmit.textContent=orderMode==='dining'?'送出餐點訂單':'送出指名';updateAll()}};
function switchTab(name){document.querySelectorAll('.booking-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.booking-tab-panel').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));if(name==='dining')updateAll();window.scrollTo({top:document.querySelector('.form-panel').offsetTop-90,behavior:'smooth'})}
document.querySelectorAll('.booking-tab').forEach(x=>x.addEventListener('click',()=>switchTab(x.dataset.tab)));
document.querySelectorAll('.next-tab').forEach(x=>x.addEventListener('click',()=>switchTab(x.dataset.goto)));
setInterval(()=>{renderStaff();updateAll()},30000);
setupRealtime();load();setInterval(()=>{if(document.visibilityState==='visible')load()},10000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});window.addEventListener('beforeunload',()=>{try{if(realtimeClient&&realtimeChannel)realtimeClient.removeChannel(realtimeChannel)}catch{}});
