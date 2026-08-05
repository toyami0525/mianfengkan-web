const FALLBACK_STAFF=[{id:'wei',slug:'wei',name:'微',role:'館員'},{id:'musufiru',slug:'musufiru',name:'慕斯菲露',role:'館員'},{id:'yukinoji-hakari',slug:'yukinoji-hakari',name:'雪之寺羽狩',role:'館員'},{id:'hong-hong-hong-taidafeng',slug:'hong-hong-hong-taidafeng',name:'轟轟轟太大風',role:'館員'},{id:'grin',slug:'grin',name:'格林',role:'館員'},{id:'shenaixue',slug:'shenaixue',name:'神噯雪',role:'館員',services:['枕邊談心']},{id:'zixuan',slug:'zixuan',name:'子瑄',role:'館員',services:['泡湯搓澡','按摩','枕邊談心']}];
const SERVICE_INFO={'泡湯搓澡':{price:150000,duration:15},'按摩服務':{price:100000,duration:15},'耳語陪伴':{price:100000,duration:15},'眠楓套席':{price:300000,duration:45}};
const POLAROID_PRICE=80000;const YUKINOJI_POLAROID_PRICE=100000;
const foods=[['主食','蛋包飯',5000],['主食','扇貝咖哩',7000],['主食','加雷馬披薩',7000],['主食','醬炒飯',5000],['主食','懸掛番茄沙拉',7000],['主食','羊駝奶油麵',5000],['甜點','圓扇刺刺梨蛋糕',4000],['甜點','巧克力奶油蛋糕',4000],['甜點','白桃塔',6000],['甜點','蜂蜜牛角麵包',6000],['甜點','烏雞布丁',6000],['飲品','奶油熱巧克力',3000],['飲品','蜜瓜果汁',5000],['飲品','白桃汁',5000],['飲品','抹茶',5000],['飲品','路易波士紅茶',5000]].map((x,i)=>({id:i+1,category:x[0],name:x[1],price:x[2]}));
let staff=[],blocks=[],selected='',confirmedPolaroid=false;const OPEN_HOUR=21,CLOSE_HOUR=24,BOOKING_BUFFER_MINUTES=5,$=id=>document.getElementById(id);
const staffBox=$('staffSelect'),bookingDate=$('bookingDate'),bookingStartTime=$('bookingStartTime'),availabilityMessage=$('availabilityMessage'),bookingSummary=$('bookingSummary'),submitButton=$('bookingSubmit'),packageBox=$('packageService'),polaroid=$('polaroid'),polaroidSection=$('polaroidSection'),polaroidHint=$('polaroidHint'),yukinojiPolaroid=$('yukinojiPolaroid'),yukinojiPolaroidSection=$('yukinojiPolaroidSection'),yukinojiPolaroidHint=$('yukinojiPolaroidHint');
const serviceBoxes=()=>[...document.querySelectorAll('input[name="service"]')];
$('foodChoices').innerHTML=foods.map(f=>`<label class="food-row"><span><small>${f.category}</small><b>${f.name}</b></span><span>${f.price.toLocaleString('zh-TW')} Gil</span><input class="food-qty" type="number" min="0" max="99" value="0" data-id="${f.id}" aria-label="${f.name}數量"></label>`).join('');
const fmt=d=>new Date(d).toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}),pad=n=>String(n).padStart(2,'0');
const localDate=d=>{const x=new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`};
function chosenServices(){return serviceBoxes().filter(x=>x.checked).map(x=>x.value)}
function serviceTotals(){if(packageBox.checked)return {price:300000,duration:45,names:['眠楓套席']};const names=chosenServices();return {price:names.reduce((n,x)=>n+SERVICE_INFO[x].price,0),duration:names.reduce((n,x)=>n+SERVICE_INFO[x].duration,0),names}}
function selectedItems(){return [...document.querySelectorAll('.food-qty')].map(x=>({food:foods.find(f=>f.id===Number(x.dataset.id)),qty:Number(x.value)||0})).filter(x=>x.qty>0)}
function foodTotal(){return selectedItems().reduce((n,x)=>n+x.food.price*x.qty,0)}
function eligibleSubtotal(){return serviceTotals().price+foodTotal()}
function orderTotal(){return eligibleSubtotal()+(polaroid.checked?POLAROID_PRICE:0)+(yukinojiPolaroid.checked?YUKINOJI_POLAROID_PRICE:0)}
function interval(){const s=serviceTotals();if(!bookingDate.value||!bookingStartTime.value||!s.duration)return null;const start=new Date(`${bookingDate.value}T${bookingStartTime.value}`);return {start,end:new Date(start.getTime()+s.duration*60000)}}
function selectedStaffSlug(){return staff.find(x=>x.id===selected)?.slug||selected}
function syncPackage(){
 const slug=selectedStaffSlug(),boxes=serviceBoxes(),children=boxes.filter(x=>x!==packageBox);
 if(slug==='shenaixue'){
  packageBox.checked=false;
  boxes.forEach(x=>{
   const allowed=x.value==='耳語陪伴';
   if(!allowed)x.checked=false;
   x.disabled=!allowed;
   x.closest('.service-check').classList.toggle('locked',!allowed);
   x.closest('.service-check').title=allowed?'':'神噯雪目前僅提供耳語陪伴';
  });
  return;
 }
 boxes.forEach(x=>{x.closest('.service-check').title=''});
 if(packageBox.checked){children.forEach(x=>{x.checked=true;x.disabled=true;x.closest('.service-check').classList.add('locked')});packageBox.disabled=false;packageBox.closest('.service-check').classList.remove('locked')}
 else{boxes.forEach(x=>{x.disabled=false;x.closest('.service-check').classList.remove('locked')})}
}
function updatePolaroid(){
 const slug=selectedStaffSlug(),total=eligibleSubtotal();
 const isMusu=slug==='musufiru',musuMissing=Math.max(0,150000-total);
 polaroidSection.hidden=!isMusu;
 if(!isMusu){polaroid.checked=false;polaroid.disabled=true}else{polaroid.disabled=musuMissing>0;if(musuMissing>0){polaroid.checked=false;polaroidHint.textContent=`目前 ${total.toLocaleString('zh-TW')} Gil，再消費 ${musuMissing.toLocaleString('zh-TW')} Gil 即可解鎖（服務與餐點皆列入）`}else polaroidHint.textContent=`已達 ${total.toLocaleString('zh-TW')} Gil，可加購紀念拍立得（80,000 Gil）`}
 const isYukinoji=slug==='yukinoji-hakari',yMissing=Math.max(0,200000-total);
 yukinojiPolaroidSection.hidden=!isYukinoji;
 if(!isYukinoji){yukinojiPolaroid.checked=false;yukinojiPolaroid.disabled=true}else{yukinojiPolaroid.disabled=yMissing>0;if(yMissing>0){yukinojiPolaroid.checked=false;yukinojiPolaroidHint.textContent=`目前 ${total.toLocaleString('zh-TW')} Gil，再消費 ${yMissing.toLocaleString('zh-TW')} Gil 即可解鎖（服務與餐點皆列入）`}else yukinojiPolaroidHint.textContent=`已達 ${total.toLocaleString('zh-TW')} Gil，可加購紀念拍立得（100,000 Gil）`}
}
function renderStaff(){staffBox.innerHTML=staff.map(s=>`<button type="button" class="staff-choice ${selected===s.id?'selected':''}" data-id="${s.id}"><b>${s.name}</b><br><small>${s.role}・可指名</small></button>`).join('');staffBox.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.id;renderStaff();updateAll()})}
function overlaps(a,b){return a.start<b.end&&b.start<a.end}function isToday(v){return v===localDate(new Date())}
function blockMatches(b,i){if(b.staff_id!==selected)return false;const x={start:new Date(b.start_at),end:new Date(b.end_at)};if(b.block_type==='reservation'){const z=BOOKING_BUFFER_MINUTES*60000;return i.start<new Date(x.end.getTime()+z)&&new Date(i.end.getTime()+z)>x.start}return overlaps(i,x)}
function latestStart(){const d=serviceTotals().duration||15,total=CLOSE_HOUR*60-d;return `${pad(Math.floor(total/60))}:${pad(total%60)}`}
function setTimeLimits(){bookingStartTime.min='21:00';bookingStartTime.max=latestStart()}
function check(){const i=interval();submitButton.disabled=false;if(!chosenServices().length){availabilityMessage.textContent='請至少選擇一項服務。';availabilityMessage.className='availability-message unavailable';submitButton.disabled=true;return false}if(!i){availabilityMessage.textContent='請選擇希望時段。';submitButton.disabled=true;return false}const opening=new Date(`${bookingDate.value}T21:00`),closing=new Date(`${bookingDate.value}T24:00`);if(!isToday(bookingDate.value)||i.start<opening||i.end>closing){availabilityMessage.textContent=`可指名時間為當天 21:00～24:00；目前所選服務最晚需於 ${latestStart()} 開始。`;availabilityMessage.className='availability-message unavailable';submitButton.disabled=true;return false}const bad=blocks.find(b=>blockMatches(b,i));if(i.start<new Date()||bad){availabilityMessage.textContent=bad?.block_type==='unavailable'?'此館員於該時段請假或不開放指名。':bad?'此時間與既有指名或其後 5 分鐘緩衝時間重疊。':'此時間已經過了。';availabilityMessage.className='availability-message unavailable';submitButton.disabled=true;return false}availabilityMessage.textContent='此館員可接受此時間。';availabilityMessage.className='availability-message available';return true}
function updateSummary(){syncPackage();updatePolaroid();setTimeLimits();const s=serviceTotals(),items=selectedItems(),i=interval(),staffName=staff.find(x=>x.id===selected)?.name||'';let services=packageBox.checked?'眠楓套席（包含泡湯搓澡、按摩服務、耳語陪伴）':s.names.join('、');let foodLines=items.length?items.map(x=>`${x.food.name} × ${x.qty}`).join('、'):'未加購餐點';bookingSummary.innerHTML=`<b>${staffName}</b><br>服務：${services||'尚未選擇'}<br>餐點：${foodLines}${polaroid.checked?`<br>專屬服務：慕斯菲露紀念拍立得（${POLAROID_PRICE.toLocaleString('zh-TW')} Gil）`:''}${yukinojiPolaroid.checked?`<br>專屬服務：雪之寺羽狩紀念拍立得（${YUKINOJI_POLAROID_PRICE.toLocaleString('zh-TW')} Gil）`:''}${i?`<br>${fmt(i.start)} ～ ${fmt(i.end)}`:''}<br><strong>訂單總金額：${orderTotal().toLocaleString('zh-TW')} Gil</strong>`;check()}
function setTime(){const now=new Date(),today=localDate(now);bookingDate.min=today;bookingDate.max=today;bookingDate.value=today;let target=new Date(`${today}T21:00`);if(now>target){target=new Date(now);target.setSeconds(0,0);target.setMinutes(target.getMinutes()+1)}bookingStartTime.value=`${pad(target.getHours())}:${pad(target.getMinutes())}`;updateAll()}
function updateAll(){updateSummary()}
async function fetchBookingData(){const r=await fetch('/api/booking-data',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'讀取指名資料失敗');return j}
async function load(){try{const d=await fetchBookingData();staff=(d.staff||[]).filter(x=>['wei','musufiru','yukinoji-hakari','hong-hong-hong-taidafeng','grin','shenaixue','zixuan'].includes(x.slug||x.id));blocks=d.blocks||[]}catch(e){console.warn(e);toast('暫時無法讀取最新指名狀態')}if(!staff.length)staff=FALLBACK_STAFF;selected=staff[0].id;renderStaff();setTime()}
serviceBoxes().forEach(x=>x.addEventListener('change',updateAll));$('foodChoices').addEventListener('input',updateAll);polaroid.addEventListener('change',updateAll);yukinojiPolaroid.addEventListener('change',updateAll);bookingStartTime.addEventListener('input',updateAll);bookingDate.addEventListener('change',setTime);
function showPolaroidModal(){confirmedPolaroid=false;$('polaroidRead').checked=false;$('confirmSubmit').disabled=true;$('polaroidModal').hidden=false}
$('polaroidRead').onchange=e=>$('confirmSubmit').disabled=!e.target.checked;$('returnEdit').onclick=()=>$('polaroidModal').hidden=true;$('confirmSubmit').onclick=()=>{confirmedPolaroid=true;$('polaroidModal').hidden=true;$('bookingForm').requestSubmit()};
$('bookingForm').onsubmit=async e=>{e.preventDefault();const guest=$('guest').value.trim(),i=interval(),s=serviceTotals(),items=selectedItems();if(!guest)return toast('請填寫客人名稱');if(!i||!check())return toast('請確認服務與時段');if((polaroid.checked||yukinojiPolaroid.checked)&&!confirmedPolaroid)return showPolaroidModal();submitButton.disabled=true;submitButton.textContent='傳送中…';try{const response=await fetch('/api/combined-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guest_name:guest,staff_id:selected,services:packageBox.checked?['眠楓套席']:s.names,items:items.map(x=>({name:x.food.name,qty:x.qty})),polaroid:polaroid.checked,yukinoji_polaroid:yukinojiPolaroid.checked,start_at:i.start.toISOString(),note:$('note').value.trim()})});const result=await response.json();if(!response.ok)throw new Error(result.error||'送出失敗');e.target.reset();document.querySelectorAll('.food-qty').forEach(x=>x.value=0);confirmedPolaroid=false;toast('預約與點餐已成功送出');await load()}catch(error){toast(error instanceof Error?error.message:'送出失敗，請稍後再試')}finally{submitButton.disabled=false;submitButton.textContent='送出預約與點餐';updateAll()}};
load();