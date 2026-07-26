let bookings=[],orders=[];
const SERVICE_DURATION={'泡湯搓澡':15,'按摩服務':15,'耳語陪伴':15,'眠楓套席':45};
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function load(){bookings=JSON.parse(localStorage.getItem('mianfeng_bookings')||'[]');orders=JSON.parse(localStorage.getItem('mianfeng_orders')||'[]');render()}
function statusClass(s){return s==='已完成'?'done':s==='已取消'?'cancel':s==='已確認'?'confirmed':''}
function intervalOf(b){
  const raw=b.startISO||b.rawTime;
  if(!raw)return null;
  const start=new Date(raw);if(Number.isNaN(start.getTime()))return null;
  const duration=Number(b.duration||SERVICE_DURATION[b.service]||15);
  const end=b.endISO?new Date(b.endISO):new Date(start.getTime()+duration*60000);
  return {start,end};
}
function overlaps(a,b){return a.start<b.end&&b.start<a.end}
function fmt(d){return d.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
function timeText(b){const x=intervalOf(b);return x?`${fmt(x.start)}<br>～ ${fmt(x.end)}<br><small>${Number(b.duration||SERVICE_DURATION[b.service]||15)} 分鐘</small>`:esc(b.time||'現場安排')}
function render(){
  document.getElementById('countAll').textContent=bookings.length;
  document.getElementById('countPending').textContent=bookings.filter(b=>b.status==='等待確認').length;
  document.getElementById('countOrders').textContent=orders.length;
  const c={};bookings.filter(b=>b.status!=='已取消').forEach(b=>c[b.staff]=(c[b.staff]||0)+1);const top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];document.getElementById('topStaff').textContent=top?top[0]:'—';
  document.getElementById('rows').innerHTML=bookings.map((b,i)=>`<tr><td>${esc(b.guest)}</td><td><b>${esc(b.staff)}</b></td><td>${esc(b.service)}<br><b>${Number(b.price||0).toLocaleString('zh-TW')} Gil</b></td><td>${timeText(b)}</td><td>${esc(b.note||'—')}</td><td><span class="status ${statusClass(b.status)}">${esc(b.status)}</span></td><td>${b.status==='等待確認'?`<button class="table-btn primary" onclick="confirmBooking(${i})">確認</button>`:''}<button class="table-btn" onclick="setBookingStatus(${i},'已完成')">完成</button><button class="table-btn" onclick="setBookingStatus(${i},'已取消')">取消</button><button class="table-btn" onclick="removeBooking(${i})">刪除</button></td></tr>`).join('');
  document.getElementById('empty').style.display=bookings.length?'none':'block';
  document.getElementById('orderRows').innerHTML=orders.map((o,i)=>`<tr><td>${esc(o.guest)}</td><td>${o.items.map(x=>`${esc(x.name)} × ${x.qty}`).join('<br>')}</td><td><b>${Number(o.total).toLocaleString('zh-TW')} Gil</b></td><td><span class="status ${statusClass(o.status)}">${esc(o.status)}</span></td><td><button class="table-btn" onclick="setOrderStatus(${i},'已完成')">完成</button><button class="table-btn" onclick="setOrderStatus(${i},'已取消')">取消</button><button class="table-btn" onclick="removeOrder(${i})">刪除</button></td></tr>`).join('');
  document.getElementById('orderEmpty').style.display=orders.length?'none':'block'
}
function save(){localStorage.setItem('mianfeng_bookings',JSON.stringify(bookings));localStorage.setItem('mianfeng_orders',JSON.stringify(orders));render()}
function confirmBooking(i){
  const target=bookings[i],ti=intervalOf(target);
  if(!ti){alert('這筆預約沒有有效時段，無法確認。');return}
  const conflict=bookings.find((b,j)=>j!==i&&b.staff===target.staff&&b.status==='已確認'&&intervalOf(b)&&overlaps(ti,intervalOf(b)));
  if(conflict){const ci=intervalOf(conflict);alert(`${target.staff} 在 ${fmt(ci.start)}～${fmt(ci.end)} 已有確認預約，請先調整或取消其中一筆。`);return}
  target.status='已確認';save();
}
function setBookingStatus(i,s){bookings[i].status=s;save()}
function setOrderStatus(i,s){orders[i].status=s;save()}
function removeBooking(i){if(confirm('確定刪除此筆預約？')){bookings.splice(i,1);save()}}
function removeOrder(i){if(confirm('確定刪除此筆點餐紀錄？')){orders.splice(i,1);save()}}
function clearBookings(){if(confirm('確定清空全部預約資料？')){bookings=[];save()}}
function clearOrders(){if(confirm('確定清空全部點餐資料？')){orders=[];save()}}
window.addEventListener('storage',load);load();
