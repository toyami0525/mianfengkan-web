const staff=[{name:'微',role:'館員'}];
const SERVICE_INFO={
  '泡湯搓澡':{price:150000,duration:15},
  '按摩服務':{price:100000,duration:15},
  '耳語陪伴':{price:100000,duration:15},
  '眠楓套席':{price:300000,duration:45}
};
let selected=staff[0].name;
const staffBox=document.getElementById('staffSelect');
const serviceSelect=document.getElementById('service');
const servicePrice=document.getElementById('servicePrice');
const timeInput=document.getElementById('time');
const bookingDate=document.getElementById('bookingDate');
const bookingHour=document.getElementById('bookingHour');
const minuteSlots=document.getElementById('minuteSlots');
let selectedMinute='00';
const availabilityMessage=document.getElementById('availabilityMessage');
const bookingSummary=document.getElementById('bookingSummary');
const submitButton=document.getElementById('bookingSubmit');

const successModal=document.getElementById('bookingSuccessModal');
const successModalClose=document.getElementById('bookingSuccessClose');
function openSuccessModal(){
  if(!successModal)return;
  successModal.classList.add('show');
  successModal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  setTimeout(()=>successModalClose?.focus(),80);
}
function closeSuccessModal(){
  if(!successModal)return;
  successModal.classList.remove('show');
  successModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}
successModalClose?.addEventListener('click',closeSuccessModal);
successModal?.addEventListener('click',e=>{if(e.target===successModal)closeSuccessModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&successModal?.classList.contains('show'))closeSuccessModal()});

function renderStaff(){
  staffBox.innerHTML=staff.map(s=>`<button type="button" class="staff-choice ${selected===s.name?'selected':''}" data-name="${s.name}"><b>${s.name}</b><br><small>${s.role}・可指名</small></button>`).join('');
  staffBox.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.name;renderStaff();checkAvailability()});
}
function serviceInfo(){return SERVICE_INFO[serviceSelect.value]||{price:0,duration:15}}
function selectedPrice(){return serviceInfo().price}
function formatDateTime(date){return date.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
function getInterval(){
  if(!timeInput.value)return null;
  const start=new Date(timeInput.value);
  if(Number.isNaN(start.getTime()))return null;
  return {start,end:new Date(start.getTime()+serviceInfo().duration*60000)};
}
function bookingInterval(b){
  const startRaw=b.startISO||b.rawTime;
  if(!startRaw)return null;
  const start=new Date(startRaw);
  if(Number.isNaN(start.getTime()))return null;
  const duration=Number(b.duration||SERVICE_INFO[b.service]?.duration||15);
  const end=b.endISO?new Date(b.endISO):new Date(start.getTime()+duration*60000);
  return {start,end};
}
function overlaps(a,b){return a.start<b.end&&b.start<a.end}
function confirmedConflict(interval){
  const bookings=JSON.parse(localStorage.getItem('mianfeng_bookings')||'[]');
  return bookings.find(b=>b.staff===selected&&b.status==='已確認'&&bookingInterval(b)&&overlaps(interval,bookingInterval(b)));
}
function updatePrice(){
  servicePrice.textContent=`${selectedPrice().toLocaleString('zh-TW')} Gil｜${serviceInfo().duration} 分鐘`;
  checkAvailability();
}
function toLocalDateValue(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function syncTimeValue(){
  if(!bookingDate.value||bookingHour.value===''){timeInput.value='';return}
  timeInput.value=`${bookingDate.value}T${String(bookingHour.value).padStart(2,'0')}:${selectedMinute}`;
}
function slotInterval(minute){
  if(!bookingDate.value||bookingHour.value==='')return null;
  const start=new Date(`${bookingDate.value}T${String(bookingHour.value).padStart(2,'0')}:${minute}`);
  if(Number.isNaN(start.getTime()))return null;
  return {start,end:new Date(start.getTime()+serviceInfo().duration*60000)};
}
function renderMinuteSlots(){
  const minutes=['00','15','30','45'];
  minuteSlots.innerHTML=minutes.map(minute=>{
    const interval=slotInterval(minute);
    const past=interval&&interval.start<new Date();
    const conflict=interval&&confirmedConflict(interval);
    const disabled=!interval||past||Boolean(conflict);
    const label=conflict?`${minute} 已滿`:minute;
    return `<button type="button" class="minute-slot ${selectedMinute===minute?'selected':''} ${disabled?'disabled':''}" data-minute="${minute}" ${disabled?'disabled':''}>${label}</button>`;
  }).join('');
  if(minuteSlots.querySelector(`[data-minute="${selectedMinute}"]`)?.disabled){
    const first=[...minuteSlots.querySelectorAll('.minute-slot:not(:disabled)')][0];
    if(first)selectedMinute=first.dataset.minute;
  }
  minuteSlots.querySelectorAll('.minute-slot:not(:disabled)').forEach(button=>button.addEventListener('click',()=>{
    selectedMinute=button.dataset.minute;
    syncTimeValue();renderMinuteSlots();checkAvailability();
  }));
  syncTimeValue();
}
function setMinimumTime(){
  const now=new Date();
  bookingDate.min=toLocalDateValue(now);
  if(!bookingDate.value)bookingDate.value=toLocalDateValue(now);
  bookingHour.innerHTML=Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,'0')} 時</option>`).join('');
  let roundedHour=now.getHours();
  const nextQuarter=Math.ceil(now.getMinutes()/15)*15;
  if(nextQuarter>=60)roundedHour=(roundedHour+1)%24;
  bookingHour.value=String(roundedHour);
  selectedMinute=String(nextQuarter>=60?0:nextQuarter).padStart(2,'0');
  renderMinuteSlots();
}
function checkAvailability(){
  const interval=getInterval();
  submitButton.disabled=false;
  availabilityMessage.className='availability-message';
  if(!interval){
    availabilityMessage.textContent='請選擇希望時段。';
    bookingSummary.textContent='';
    return true;
  }
  const minute=interval.start.getMinutes();
  if(minute%15!==0){
    availabilityMessage.textContent='請選擇 00、15、30 或 45 分的時段。';
    availabilityMessage.classList.add('unavailable');
    submitButton.disabled=true;
    return false;
  }
  if(interval.start<new Date()){
    availabilityMessage.textContent='無法預約已經過去的時段。';
    availabilityMessage.classList.add('unavailable');
    submitButton.disabled=true;
    return false;
  }
  const conflict=confirmedConflict(interval);
  bookingSummary.innerHTML=`<b>${selected}</b>・${serviceSelect.value}<br>${formatDateTime(interval.start)} ～ ${formatDateTime(interval.end)}<br><strong>${selectedPrice().toLocaleString('zh-TW')} Gil</strong>`;
  if(conflict){
    const occupied=bookingInterval(conflict);
    availabilityMessage.textContent=`此館員於 ${formatDateTime(occupied.start)}～${formatDateTime(occupied.end)} 已有確認預約，請更換時段或館員。`;
    availabilityMessage.classList.add('unavailable');
    submitButton.disabled=true;
    return false;
  }
  availabilityMessage.textContent='此館員目前可接受此時段的預約需求。';
  availabilityMessage.classList.add('available');
  return true;
}

renderStaff();
setMinimumTime();
serviceSelect.addEventListener('change',()=>{updatePrice();renderMinuteSlots()});
bookingDate.addEventListener('change',()=>{renderMinuteSlots();checkAvailability()});
bookingHour.addEventListener('change',()=>{renderMinuteSlots();checkAvailability()});
window.addEventListener('storage',checkAvailability);
updatePrice();

document.getElementById('bookingForm').addEventListener('submit',e=>{
  e.preventDefault();
  const guest=document.getElementById('guest').value.trim();
  if(!guest){toast('請填寫客人名稱');return}
  const interval=getInterval();
  if(!interval){toast('請選擇希望時段');return}
  if(!checkAvailability()){toast('此時段目前無法預約');return}
  const bookings=JSON.parse(localStorage.getItem('mianfeng_bookings')||'[]');
  // 送出前再次檢查，降低同一瀏覽器分頁同時送出的撞單機率。
  if(confirmedConflict(interval)){checkAvailability();toast('此時段剛被預約，請重新選擇');return}
  bookings.unshift({
    guest,staff:selected,service:serviceSelect.value,price:selectedPrice(),duration:serviceInfo().duration,
    startISO:interval.start.toISOString(),endISO:interval.end.toISOString(),rawTime:timeInput.value,
    time:`${formatDateTime(interval.start)} ～ ${formatDateTime(interval.end)}`,
    note:document.getElementById('note').value.trim(),status:'等待確認',createdAt:new Date().toISOString()
  });
  localStorage.setItem('mianfeng_bookings',JSON.stringify(bookings));
  e.target.reset();
  selected=staff[0].name;
  renderStaff();setMinimumTime();updatePrice();
  openSuccessModal();
});
