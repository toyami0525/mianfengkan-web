'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Row=Record<string,any>;
type DateRange='today'|'yesterday'|'week'|'month'|'all';
type VenueSettings={name:string,address:string,discord:string,business_status:string,business_hours:string};
type Account={role:'owner'|'staff'|'frontdesk';staff_id:string|null;staff_name:string;staff_slug:string;accepting_reservations:boolean};
type HomepageSettings={tagline:string,services_text:string};
type RuleItem={title:string,content:string};
const PAGE_SIZE=20;
const BASE_DAILY_PAY=150000;
const BUSINESS_DAY_START_HOUR=21;
const OWNER_PAYROLL_FALLBACK_ID='__owner__';
const ownerTabs=[['dashboard','總覽'],['payroll','營業日薪資'],['staff','館員管理'],['schedule','排班／請假'],['operations','營運管理'],['polaroids','成品管理'],['announcements','公告管理'],['rules','規章管理'],['settings','網站設定']];
const staffTabs=[['dashboard','我的總覽'],['operations','營運管理'],['polaroids','我的成品']];
const frontdeskTabs=[['dashboard','總覽'],['operations','營運管理'],['polaroids','成品管理']];
const labels:Record<string,string>={guest_name:'客人',contact:'聯絡方式',staff_name:'指名館員',service_name:'服務',price:'服務金額',starts_at:'預約／開始時間',status:'狀態',note:'備註',items:'點餐內容',total:'總金額',created_at:'送出時間',name:'姓名',role:'職位',active:'前台顯示',accepting_reservations:'接受指名',staff_id:'館員 ID',ends_at:'結束時間',reason:'原因',title:'標題',content:'內容',published:'公開',key:'設定項目',value:'設定內容',updated_at:'更新時間',pickup_code:'取件碼',delivery_preference_staff_name:'希望送餐',delivery_staff_name:'實際送餐',item_type:'成品類型'};
const EXTENSION_INFO:Record<string,{price:number;duration:number}>={'泡湯洗浴':{price:150000,duration:15},'按摩服務':{price:100000,duration:15},'耳語陪伴':{price:100000,duration:15}};
// 服務快結束／結束提示音：使用館主提供的「和風慶雲 - Release」前 6.7 秒。
const SERVICE_END_SOUND_URL='/assets/sounds/wafu-keiun-release-first6p7-v264.mp3';
// 餐點送餐提示音：只有被客人指定送餐的館員會聽到。
const FOOD_ORDER_SOUND_URL='/assets/sounds/doorbell-order-v262.mp3';
const statusText:Record<string,string>={pending:'待確認',acknowledged:'已確認・待開始',confirmed:'服務中',completed:'已完成',cancelled:'已取消',rejected:'已拒絕'};
const dateRangeText:Record<DateRange,string>={today:'今天',yesterday:'昨天',week:'本週',month:'本月',all:'全部'};
const DEFAULT_VENUE:VenueSettings={name:'眠楓館',address:'穹頂皓天 7區22號',discord:'',business_status:'open',business_hours:'依招募板公告為主'};
const DEFAULT_HOME:HomepageSettings={tagline:'在楓影與湯煙之間，靜候旅人安歇。',services_text:'和風溫泉會館　食・湯・癒・眠'};
const DEFAULT_RULES:RuleItem[]=[
 {title:'尊重館員與每位旅人',content:'請尊重館員及其他來館旅人的交流空間，避免任何騷擾、惡意言論或影響他人體驗的行為。'},
 {title:'館內請放慢腳步',content:'請避免於館內奔跑、跳躍或持續使用大型特效技能，共同維護寧靜舒適的環境。'},
 {title:'拍照請先徵詢同意',content:'若欲與館員或其他旅人拍照、合影或錄影，請先取得對方同意後再進行。'},
 {title:'尊重館員的服務安排',content:'每位館員可依現場狀況調整服務內容或婉拒部分服務，敬請理解並予以尊重。'},
 {title:'共同維護館內環境',content:'請避免長時間占用公共空間、刻意干擾他人或影響館內秩序，共同維護舒適的休憩環境。'},
 {title:'如有任何需求',content:'若有任何問題或需要協助，歡迎隨時向館員提出，我們將竭誠為您服務。'}
];

export default function AdminApp(){
 const[ready,setReady]=useState(false),[tab,setTab]=useState('dashboard'),[data,setData]=useState<Record<string,Row[]>>({}),[msg,setMsg]=useState(''),[busy,setBusy]=useState('');
 const[reservationRange,setReservationRange]=useState<DateRange>('today'),[orderRange,setOrderRange]=useState<DateRange>('today');
 const[reservationStatus,setReservationStatus]=useState('pending'),[orderStatus,setOrderStatus]=useState('pending');
 const[reservationSearch,setReservationSearch]=useState(''),[orderSearch,setOrderSearch]=useState('');
 const[reservationPage,setReservationPage]=useState(1),[orderPage,setOrderPage]=useState(1);
 const[venue,setVenue]=useState<VenueSettings>(DEFAULT_VENUE),[homepage,setHomepage]=useState<HomepageSettings>(DEFAULT_HOME),[rules,setRules]=useState<RuleItem[]>(DEFAULT_RULES),[bookingTestMode,setBookingTestMode]=useState(false),[yukinojiChibiAccepting,setYukinojiChibiAccepting]=useState(true);
 const[notificationSound,setNotificationSound]=useState(false),[newReservation,setNewReservation]=useState<Row|null>(null),[newOrder,setNewOrder]=useState<Row|null>(null),[endingReservation,setEndingReservation]=useState<Row|null>(null);
 const[extendTarget,setExtendTarget]=useState<Row|null>(null),[extendService,setExtendService]=useState('泡湯洗浴');
 const[leaveStaffId,setLeaveStaffId]=useState(''),[leaveDate,setLeaveDate]=useState(()=>localDateInput(new Date())),[leaveStart,setLeaveStart]=useState('21:00'),[leaveEnd,setLeaveEnd]=useState('24:00'),[leaveReason,setLeaveReason]=useState('請假');
 const[payrollStaffIds,setPayrollStaffIds]=useState<string[]>([]);
 const[manualPolaroidGuest,setManualPolaroidGuest]=useState(''),[manualPolaroidCode,setManualPolaroidCode]=useState('');
 const[account,setAccount]=useState<Account|null>(null);
 const audioContextRef=useRef<AudioContext|null>(null);
 const publicBookingChannelRef=useRef<any>(null);
 const db=useMemo(()=>supabase(),[]);
 function notifyPublicBookingChange(event='booking_changed'){const channel=publicBookingChannelRef.current;if(!channel)return;void channel.send({type:'broadcast',event,payload:{at:new Date().toISOString()}}).catch((error:any)=>console.warn('前台 Realtime 廣播失敗，10 秒輪詢仍會補上。',error))}
 function syncSettings(rows:Row[]){
  const map=Object.fromEntries((rows||[]).map(r=>[r.key,r.value]));
  setVenue({...DEFAULT_VENUE,...(map.venue||{})});
  setHomepage({...DEFAULT_HOME,...(map.homepage||{})});
  setRules(Array.isArray(map.rules)&&map.rules.length?map.rules:DEFAULT_RULES);
  setBookingTestMode(map.booking_test_mode===true||map.booking_test_mode?.enabled===true);
  const chibi=map.yukinoji_chibi_accepting;setYukinojiChibiAccepting(chibi===undefined?true:(chibi===true||chibi?.enabled===true));
 }
 const tabs=account?.role==='owner'?ownerTabs:account?.role==='frontdesk'?frontdeskTabs:staffTabs;
 async function load(currentAccount=account){
  setMsg('讀取中…');
  const names=['staff','staff_unavailability','reservations','orders','polaroid_pickups','announcements','site_settings'];
  const out:Record<string,Row[]>={};
  for(const n of names){
   const query=db.from(n).select('*');
   const result=n==='site_settings'?await query.order('key',{ascending:true}):await query.order('created_at',{ascending:false});
   if(result.error){console.error(n,result.error);out[n]=[];}else out[n]=result.data||[];
  }
  if(currentAccount?.role==='staff'&&currentAccount.staff_id){
   out.reservations=(out.reservations||[]).filter(r=>r.staff_id===currentAccount.staff_id);
   out.polaroid_pickups=(out.polaroid_pickups||[]).filter(r=>r.staff_id===currentAccount.staff_id);
   out.staff=(out.staff||[]).filter(r=>r.id===currentAccount.staff_id);
  }
  setData(out);syncSettings(out.site_settings||[]);setMsg('');
 }
 useEffect(()=>{
  let mounted=true;
  let currentAccount:Account|null=null;
  db.auth.getUser().then(async({data})=>{
   if(!data.user){location.href='/login';return}
   const{data:accountRow,error}=await db.from('staff_accounts').select('role,staff_id,active,staff:staff_id(id,name,slug,accepting_reservations)').eq('user_id',data.user.id).eq('active',true).single();
   if(error||!accountRow){await db.auth.signOut();alert('此登入帳號尚未綁定館員權限。');location.href='/login';return}
   const rawAccount=accountRow as any;
   const staffValue=Array.isArray(rawAccount.staff)?rawAccount.staff[0]:rawAccount.staff;
   currentAccount={role:rawAccount.role as Account['role'],staff_id:rawAccount.staff_id??null,staff_name:staffValue?.name||(rawAccount.role==='owner'?'館主':'館員'),staff_slug:staffValue?.slug||'',accepting_reservations:staffValue?.accepting_reservations??true};
   if(!mounted)return;
   setAccount(currentAccount);
   setNotificationSound(localStorage.getItem('mf-notification-sound')==='on');
   setReady(true);await load(currentAccount);
  });
  const publicBookingChannel=db.channel('public-booking-live').subscribe();
  publicBookingChannelRef.current=publicBookingChannel;
  const channel=db.channel('admin-live-alerts')
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'reservations'},payload=>{
    const row=payload.new as Row;
    if(!currentAccount)return;
    if(currentAccount.role==='staff'&&row.staff_id!==currentAccount.staff_id)return;
    setData(prev=>({...prev,reservations:[row,...(prev.reservations||[]).filter(x=>x.id!==row.id)]}));
    setNewReservation(row);
    if(localStorage.getItem('mf-notification-sound')==='on'){if(isChibiReservation(row))playFoodOrderSound();else playNotificationSound();}
   })
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'reservations'},payload=>{
    const row=payload.new as Row;
    if(!currentAccount)return;
    if(currentAccount.role==='staff'&&row.staff_id!==currentAccount.staff_id)return;
    setData(prev=>({...prev,reservations:(prev.reservations||[]).map(x=>x.id===row.id?row:x)}));
   })
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},payload=>{
    const row=payload.new as Row;
    if(!currentAccount)return;
    setData(prev=>({...prev,orders:[row,...(prev.orders||[]).filter(x=>x.id!==row.id)]}));
    setNewOrder(row);
    const assignedToMe=Boolean(currentAccount.staff_id)&&String(row.delivery_preference_staff_id||'')===String(currentAccount.staff_id);
    if(assignedToMe&&hasFoodItems(row)&&localStorage.getItem('mf-notification-sound')==='on')playFoodOrderSound();
   })
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders'},payload=>{
    const row=payload.new as Row;
    if(!currentAccount)return;
    setData(prev=>({...prev,orders:(prev.orders||[]).map(x=>x.id===row.id?row:x)}));
   })
   .subscribe();
  return()=>{mounted=false;db.removeChannel(channel);db.removeChannel(publicBookingChannel);if(publicBookingChannelRef.current===publicBookingChannel)publicBookingChannelRef.current=null};
 },[]);
 // 瀏覽器可能在重新整理／重新登入後暫停 Web Audio。
 // 只要通知音已開啟，館員下一次點擊或按鍵時就主動恢復指名音效的 AudioContext。
 useEffect(()=>{
  const unlockReservationAudio=()=>{
   if(localStorage.getItem('mf-notification-sound')!=='on')return;
   try{
    const Ctx=window.AudioContext||(window as any).webkitAudioContext;
    const ctx=audioContextRef.current||new Ctx();audioContextRef.current=ctx;
    if(ctx.state==='suspended')void ctx.resume();
   }catch(error){console.warn('無法解鎖指名提示音',error)}
  };
  window.addEventListener('pointerdown',unlockReservationAudio);
  window.addEventListener('keydown',unlockReservationAudio);
  return()=>{window.removeEventListener('pointerdown',unlockReservationAudio);window.removeEventListener('keydown',unlockReservationAudio)};
 },[]);
 useEffect(()=>{
  if(!ready||!account||account.role!=='owner')return;
  const allStaff=(data.staff||[]).filter(r=>r.active!==false);
  const ownerRow=allStaff.find(r=>String(r.id)===String(account.staff_id||''))||allStaff.find(r=>r.slug==='riku'||r.role==='館主');
  const ownerId=String(ownerRow?.id||OWNER_PAYROLL_FALLBACK_ID);
  const validIds=new Set(allStaff.map(r=>String(r.id)));validIds.add(ownerId);
  const dateKey=businessDateKey(new Date());
  const storageKey=`mf-payroll-roster:${dateKey}`;
  const stored=localStorage.getItem(storageKey);
  if(stored){
   try{
    const parsed=JSON.parse(stored);
    if(Array.isArray(parsed)){
     const cleaned=parsed.map(String).filter(id=>validIds.has(id));
     if(!cleaned.includes(ownerId))cleaned.unshift(ownerId);
     setPayrollStaffIds([...new Set(cleaned)]);return;
    }
   }catch{}
  }
  const shiftStart=toTaipeiIso(dateKey,'21:00'),shiftEnd=toTaipeiIso(dateKey,'24:00');
  const offIds=new Set<string>();
  if(shiftStart&&shiftEnd){
   const a=new Date(shiftStart).getTime(),b=new Date(shiftEnd).getTime();
   for(const row of data.staff_unavailability||[]){
    const x=new Date(row.starts_at).getTime(),y=new Date(row.ends_at).getTime();
    if(Number.isFinite(x)&&Number.isFinite(y)&&x<b&&y>a)offIds.add(String(row.staff_id));
   }
  }
  const defaults=allStaff.filter(r=>String(r.id)===ownerId||!offIds.has(String(r.id))).map(r=>String(r.id));
  if(!defaults.includes(ownerId))defaults.unshift(ownerId);
  const unique=[...new Set(defaults)];
  localStorage.setItem(storageKey,JSON.stringify(unique));
  setPayrollStaffIds(unique);
 },[ready,account?.role,account?.staff_id,account?.staff_name,data.staff,data.staff_unavailability]);
 useEffect(()=>{
  if(!ready||!account)return;
  // 一般營業時只提醒被指名館員本人；館主開啟「指名測試模式」時，也可收到全部指名的測試提醒。
  const ownerTesting=account.role==='owner'&&bookingTestMode;
  if(account.role!=='staff'&&!ownerTesting)return;
  if(account.role==='staff'&&!account.staff_id)return;
  const tick=()=>{
   const now=Date.now();
   const rows=(data.reservations||[]).filter(r=>{
    if(!['confirmed','已確認'].includes(String(r.status)))return false;
    return account.role==='staff'?r.staff_id===account.staff_id:true;
   });
   for(const r of rows){
    const start=new Date(r.starts_at).getTime(),end=new Date(r.ends_at).getTime();
    if(!Number.isFinite(start)||!Number.isFinite(end)||now<start)continue;
    const remain=end-now;
    // 兩階段提醒：剩 3 分鐘一次；到時間/剛超時再一次。
    // 超時提醒保留 30 分鐘容錯，避免背景分頁被瀏覽器節流後直接錯過。
    let phase:''|'ending'|'ended'='';
    if(remain>0&&remain<=3*60*1000)phase='ending';
    else if(remain<=0&&remain>=-30*60*1000)phase='ended';
    if(!phase)continue;
    const key=`mf-service-${phase}:${r.id}:${r.ends_at}`;
    if(!localStorage.getItem(key)){
     localStorage.setItem(key,'shown');setEndingReservation({...r,__service_alert_phase:phase});
     if(localStorage.getItem('mf-notification-sound')==='on')playServiceEndingSound(phase);
     break;
    }
   }
  };
  tick();const timer=window.setInterval(tick,3000);return()=>window.clearInterval(timer);
 },[ready,account?.role,account?.staff_id,bookingTestMode,data.reservations]);
 async function playNotificationSound(){
  try{
   const Ctx=window.AudioContext||(window as any).webkitAudioContext;
   const ctx=audioContextRef.current||new Ctx();audioContextRef.current=ctx;
   if(ctx.state==='suspended')await ctx.resume();
   const now=ctx.currentTime+0.02;
   // 新服務指名專用：大聲「叮咚、叮咚」兩次。
   [[0,988],[0.20,659],[0.72,988],[0.92,659]].forEach(([delay,freq])=>{
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(freq,now+delay);
    gain.gain.setValueAtTime(0.0001,now+delay);gain.gain.exponentialRampToValueAtTime(0.48,now+delay+0.012);gain.gain.exponentialRampToValueAtTime(0.0001,now+delay+0.30);
    oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(now+delay);oscillator.stop(now+delay+0.32);
   });
  }catch(error){console.warn('無法播放指名提示音',error)}
 }
 function playServiceEndingSound(phase:'ending'|'ended'='ending'){
  try{
   // 快結束與正式結束都使用同一段 6.7 秒提示音。
   const audio=new Audio(SERVICE_END_SOUND_URL);
   audio.preload='auto';
   audio.volume=1;
   void audio.play().catch(error=>console.warn('無法播放服務結束提示音',error));
  }catch(error){console.warn('無法播放服務結束提醒音',error)}
 }
 function playFoodOrderSound(){
  try{
   const audio=new Audio(FOOD_ORDER_SOUND_URL);
   audio.preload='auto';
   audio.volume=1;
   void audio.play().catch(error=>console.warn('無法播放餐點送餐提示音',error));
  }catch(error){console.warn('無法播放餐點送餐提示音',error)}
 }
 async function toggleNotificationSound(){
  const next=!notificationSound;
  setNotificationSound(next);localStorage.setItem('mf-notification-sound',next?'on':'off');
  // 從使用者點擊事件中直接播放一次新指名音，順便解鎖瀏覽器 Web Audio。
  if(next)await playNotificationSound();
 }

 async function uploadPolaroid(id:string,file:File){
  setBusy(`polaroid:${id}`);setMsg('上傳成品中…');
  try{
   const{data:{session}}=await db.auth.getSession();if(!session)throw new Error('登入已失效，請重新登入');
   const form=new FormData();form.append('id',id);form.append('file',file);
   const response=await fetch('/api/staff/polaroids',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:form});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'上傳失敗');
   setMsg('成品已完成並開放客人領取。');await load();
  }catch(error){const text=error instanceof Error?error.message:'上傳失敗';setMsg(text);alert(text)}finally{setBusy('')}
 }
 async function issueMusufiruPolaroid(){
  if(account?.role!=='owner')return;
  const guestName=manualPolaroidGuest.trim();
  if(!guestName){alert('請先輸入客人名稱');return}
  setBusy('manual-polaroid');setMsg('正在產生慕斯菲露拍立得取件碼…');
  try{
   const{data:{session}}=await db.auth.getSession();if(!session)throw new Error('登入已失效，請重新登入');
   const response=await fetch('/api/staff/polaroids/manual-issue',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({guest_name:guestName})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'發放取件碼失敗');
   setManualPolaroidCode(String(result.pickup_code||''));setManualPolaroidGuest('');
   setMsg(`已為 ${guestName} 發放慕斯菲露拍立得取件碼：${result.pickup_code}`);await load();
  }catch(error){const text=error instanceof Error?error.message:'發放失敗';setMsg(text);alert(text)}finally{setBusy('')}
 }

 async function logout(){await db.auth.signOut();location.href='/login'}
 async function toggleAvailability(){
  if(!account?.staff_id)return;
  const next=!account.accepting_reservations;setBusy('availability');
  const{error}=await db.from('staff').update({accepting_reservations:next}).eq('id',account.staff_id);
  if(error){alert(`更新失敗：${error.message}`)}else{setAccount({...account,accepting_reservations:next});notifyPublicBookingChange('availability_changed')}
  setBusy('');
 }
 async function toggleYukinojiChibi(){
  if(account?.staff_slug!=='yukinoji-hakari')return;
  const next=!yukinojiChibiAccepting;setBusy('yukinoji-chibi');
  try{
   const{data:{session}}=await db.auth.getSession();if(!session)throw new Error('登入已失效，請重新登入');
   const response=await fetch('/api/staff/yukinoji-chibi',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({enabled:next})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'更新 Q版繪圖接單狀態失敗');
   setYukinojiChibiAccepting(result.enabled===true);setMsg(result.enabled?'Q版繪圖(公版)已恢復接單。':'Q版繪圖(公版)已暫停接單。');notifyPublicBookingChange('settings_changed');await load();
  }catch(error){const text=error instanceof Error?error.message:'更新失敗';setMsg(text);alert(text)}finally{setBusy('')}
 }
 async function status(table:string,id:string,nextStatus:string){
  const key=`${table}:${id}`;setBusy(key);
  const isReservation=table==='reservations';
  setMsg(isReservation&&nextStatus==='acknowledged'?'確認指名中…':isReservation&&nextStatus==='confirmed'?'開始服務並重新計時中…':'更新中…');
  try{
   if(isReservation&&(nextStatus==='acknowledged'||nextStatus==='confirmed')){
    const{data:{session}}=await db.auth.getSession();if(!session)throw new Error('登入已失效，請重新登入');
    const endpoint=nextStatus==='acknowledged'?'/api/staff/reservations/acknowledge':'/api/staff/reservations/confirm';
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({reservation_id:id})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||(nextStatus==='acknowledged'?'確認指名失敗':'開始服務失敗'));
    if(result.reservation)setData(prev=>({...prev,reservations:(prev.reservations||[]).map(x=>x.id===result.reservation.id?result.reservation:x)}));
    if(nextStatus==='acknowledged')setMsg('指名已確認，等待館員按「開始」後才會正式計時。');
    else setMsg(`服務已開始：${formatDate(result.reservation?.starts_at)} → ${formatDate(result.reservation?.ends_at)}。`);
    notifyPublicBookingChange('booking_changed');await load();
   }else{
    const{error}=await db.from(table).update({status:nextStatus}).eq('id',id).select('id').single();
    if(error)throw error;
    if(isReservation)notifyPublicBookingChange('booking_changed');
    setMsg(`狀態已更新為「${statusText[nextStatus]||nextStatus}」`);await load();
   }
  }catch(error){const text=error instanceof Error?error.message:'更新失敗';console.error(error);setMsg(`更新失敗：${text}`);alert(`更新失敗：${text}`)}finally{setBusy('')}
 }
 function extensionOptionsFor(_reservation:Row){
  // 續時視為「追加服務」：不綁原本服務，也不受館員 services 欄位限制。
  return Object.keys(EXTENSION_INFO);
 }
 function canExtendReservation(reservation:Row){
  if(!account||account.role==='frontdesk')return false;
  if(account.role==='staff'&&reservation.staff_id!==account.staff_id)return false;
  if(!['confirmed','已確認'].includes(String(reservation.status)))return false;
  const start=new Date(reservation.starts_at).getTime(),end=new Date(reservation.ends_at).getTime(),now=Date.now();
  return Number.isFinite(start)&&Number.isFinite(end)&&now>=start&&now<end+5*60*1000;
 }
 function openExtend(reservation:Row){
  const options=extensionOptionsFor(reservation);setExtendService(options[0]||'耳語陪伴');setExtendTarget(reservation);
 }
 async function extendReservation(){
  if(!extendTarget||!EXTENSION_INFO[extendService])return;
  const key=`extend:${extendTarget.id}`;setBusy(key);setMsg('續時處理中…');
  try{
   const{data:{session}}=await db.auth.getSession();if(!session)throw new Error('登入已失效，請重新登入');
   const response=await fetch('/api/staff/reservations/extend',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({reservation_id:extendTarget.id,service_name:extendService})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'續時失敗');
   if(result.reservation)setData(prev=>({...prev,reservations:(prev.reservations||[]).map(x=>x.id===result.reservation.id?result.reservation:x)}));
   setExtendTarget(null);setEndingReservation(null);setMsg(`續時完成：${extendService} +${EXTENSION_INFO[extendService].duration} 分鐘，新的結束時間 ${formatDate(result.reservation?.ends_at)}。`);notifyPublicBookingChange('booking_changed');await load();
  }catch(error){const text=error instanceof Error?error.message:'續時失敗';setMsg(text);alert(text)}finally{setBusy('')}
 }
 async function claimDelivery(order:Row){
  if(!account?.staff_id){alert('目前登入帳號沒有綁定館員身分，無法接下送餐。');return}
  if(order.delivery_staff_id){alert(`這筆訂單已由 ${order.delivery_staff_name||'其他館員'} 接下送餐。`);return}
  const key=`delivery:${order.id}`;setBusy(key);setMsg('登記送餐館員中…');
  const{data:updated,error}=await db.from('orders').update({delivery_staff_id:account.staff_id,delivery_staff_name:account.staff_name,delivery_claimed_at:new Date().toISOString()}).eq('id',order.id).is('delivery_staff_id',null).select('*').maybeSingle();
  if(error){console.error(error);setMsg(`接單失敗：${error.message}`);alert(`接單失敗：${error.message}`)}
  else if(!updated){setMsg('這筆訂單剛剛已被其他館員接走。');alert('這筆訂單剛剛已被其他館員接走。')}
  else{setData(prev=>({...prev,orders:(prev.orders||[]).map(x=>x.id===updated.id?updated:x)}));setMsg(`已登記由 ${account.staff_name} 送餐。`)}
  setBusy('');
 }
 async function remove(table:string,id:string){
  if(!confirm('確定刪除？'))return;setBusy(`${table}:${id}`);
  const{error}=await db.from(table).delete().eq('id',id);
  if(error){setMsg(`刪除失敗：${error.message}`);alert(`刪除失敗：${error.message}`);}else{if(table==='staff_unavailability'||table==='staff')notifyPublicBookingChange('availability_changed');await load();}
  setBusy('');
 }
 function payrollOwnerInfo(){
  const allStaff=(data.staff||[]).filter(r=>r.active!==false);
  const ownerRow=allStaff.find(r=>String(r.id)===String(account?.staff_id||''))||allStaff.find(r=>r.slug==='riku'||r.role==='館主');
  return {ownerRow,ownerId:String(ownerRow?.id||OWNER_PAYROLL_FALLBACK_ID)};
 }
 function savePayrollRoster(next:string[]){
  const {ownerId}=payrollOwnerInfo();
  const safe=[...new Set([ownerId,...next.map(String)])];
  localStorage.setItem(`mf-payroll-roster:${businessDateKey(new Date())}`,JSON.stringify(safe));
  setPayrollStaffIds(safe);
 }
 function togglePayrollStaff(id:string){
  if(account?.role!=='owner')return;
  const {ownerId}=payrollOwnerInfo();
  if(String(id)===ownerId)return;
  savePayrollRoster(payrollStaffIds.includes(String(id))?payrollStaffIds.filter(x=>x!==String(id)):[...payrollStaffIds,String(id)]);
 }
 function resetPayrollRoster(){
  if(account?.role!=='owner')return;
  const allStaff=(data.staff||[]).filter(r=>r.active!==false);
  const {ownerId}=payrollOwnerInfo();
  const dateKey=businessDateKey(new Date()),shiftStart=toTaipeiIso(dateKey,'21:00'),shiftEnd=toTaipeiIso(dateKey,'24:00');
  const offIds=new Set<string>();
  if(shiftStart&&shiftEnd){
   const a=new Date(shiftStart).getTime(),b=new Date(shiftEnd).getTime();
   for(const row of data.staff_unavailability||[]){
    const x=new Date(row.starts_at).getTime(),y=new Date(row.ends_at).getTime();
    if(Number.isFinite(x)&&Number.isFinite(y)&&x<b&&y>a)offIds.add(String(row.staff_id));
   }
  }
  savePayrollRoster(allStaff.filter(r=>String(r.id)===ownerId||!offIds.has(String(r.id))).map(r=>String(r.id)));
 }
 async function quickAdd(kind:string){
  if(kind==='staff'){const name=prompt('館員姓名');if(name)await db.from('staff').insert({name,role:'館員',active:true,accepting_reservations:true})}
  if(kind==='announcement'){const title=prompt('公告標題');const content=prompt('公告內容');if(title)await db.from('announcements').insert({title,content,published:true})}
  if(kind==='staff')notifyPublicBookingChange('availability_changed');
  await load();
 }
 async function addLeave(e:React.FormEvent){
  e.preventDefault();
  if(!leaveStaffId){setMsg('請先選擇館員。');return}
  if(!leaveDate){setMsg('請選擇請假日期。');return}
  const startsAt=toTaipeiIso(leaveDate,leaveStart),endsAt=toTaipeiIso(leaveDate,leaveEnd);
  if(!startsAt||!endsAt){setMsg('請假時間格式不正確。');return}
  if(new Date(endsAt)<=new Date(startsAt)){setMsg('結束時間必須晚於開始時間。');return}
  setBusy('leave:add');setMsg('儲存請假時段中…');
  const{error}=await db.from('staff_unavailability').insert({staff_id:leaveStaffId,starts_at:startsAt,ends_at:endsAt,reason:leaveReason.trim()||'請假'});
  if(error){console.error(error);setMsg(`新增請假失敗：${error.message}`);alert(`新增請假失敗：${error.message}`)}
  else{setMsg('請假時段已新增，客人端會自動避開此時段。');setLeaveReason('請假');notifyPublicBookingChange('availability_changed');await load()}
  setBusy('');
 }
 async function saveSetting(key:string,value:any){
  setBusy(`setting:${key}`);setMsg('儲存中…');
  const{error}=await db.from('site_settings').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error){setMsg(`儲存失敗：${error.message}`);alert(`儲存失敗：${error.message}`);}else{if(key==='booking_test_mode')notifyPublicBookingChange('settings_changed');setMsg('已儲存，前台會套用最新內容。');await load()}
  setBusy('');
 }
 function updateRule(index:number,field:keyof RuleItem,value:string){setRules(prev=>prev.map((r,i)=>i===index?{...r,[field]:value}:r))}
 function moveRule(index:number,delta:number){setRules(prev=>{const next=[...prev],to=index+delta;if(to<0||to>=next.length)return prev;[next[index],next[to]]=[next[to],next[index]];return next})}
 if(!ready||!account)return <main className="admin-loading">確認登入狀態…</main>;
 const reservations=data.reservations||[],orders=data.orders||[],staff=data.staff||[],polaroids=data.polaroid_pickups||[];
 const activeStaff=staff.filter(r=>r.active!==false);
 const leaveRows=(data.staff_unavailability||[]).map(r=>({...r,staff_name:staff.find(s=>s.id===r.staff_id)?.name||'未知館員'}));
 const leaveTimeOptions=buildLeaveTimes();
 const todayReservations=filterRows(reservations,'today','all','');
 const todayOrders=filterRows(orders,'today','all','');
 const filteredReservations=filterRows(reservations,reservationRange,reservationStatus,reservationSearch);
 const filteredOrders=filterRows(orders,orderRange,orderStatus,orderSearch);
 const reservationPages=Math.max(1,Math.ceil(filteredReservations.length/PAGE_SIZE));
 const orderPages=Math.max(1,Math.ceil(filteredOrders.length/PAGE_SIZE));
 const visibleReservations=filteredReservations.slice((reservationPage-1)*PAGE_SIZE,reservationPage*PAGE_SIZE);
 const visibleOrders=filteredOrders.slice((orderPage-1)*PAGE_SIZE,orderPage*PAGE_SIZE);
 const ownerStaffRow=activeStaff.find(r=>String(r.id)===String(account.staff_id||''))||activeStaff.find(r=>r.slug==='riku'||r.role==='館主');
 const ownerPayrollId=String(ownerStaffRow?.id||OWNER_PAYROLL_FALLBACK_ID);
 const payrollPeople=[...activeStaff.map(r=>({id:String(r.id),name:String(r.name||'未命名館員'),isOwner:String(r.id)===ownerPayrollId})),...(ownerStaffRow?[]:[{id:ownerPayrollId,name:account.staff_name||'館主',isOwner:true}])];
 const selectedPayrollPeople=payrollPeople.filter(p=>payrollStaffIds.includes(p.id)||p.id===ownerPayrollId);
 const payrollHeadcount=Math.max(1,selectedPayrollPeople.length);
 const payrollOrders=todayOrders.filter(r=>!['cancelled','rejected','已取消','已拒絕'].includes(String(r.status)));
 const payrollFoodRevenue=payrollOrders.reduce((sum,r)=>sum+foodOnlyOrderTotal(r),0);
 const payrollFoodShare=Math.floor(payrollFoodRevenue/payrollHeadcount);
 const payrollRemainder=payrollFoodRevenue-payrollFoodShare*payrollHeadcount;
 const payrollPerPerson=BASE_DAILY_PAY+payrollFoodShare;
 const payrollEmployeeCount=selectedPayrollPeople.filter(p=>!p.isOwner).length;
 const payrollCashOut=payrollPerPerson*payrollEmployeeCount;
 return <div className="admin-shell"><aside className="admin-side"><div className="admin-brand"><span>楓</span><div><b>眠楓館</b><small>ADMINISTRATION</small></div></div><div className="role-caption">{account.role==='owner'?'完整管理權限':account.role==='frontdesk'?'櫃台處理權限':'個人指名／全館點餐'}</div><nav>{tabs.map(([k,v])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{v}</button>)}</nav><div className="side-bottom"><a href="/index.html">查看網站</a><button onClick={logout}>登出</button></div></aside><main className="admin-main"><header><div><p className="eyebrow">MIANFENGKAN</p><h1>{tabs.find(x=>x[0]===tab)?.[1]}</h1></div><div className="admin-header-actions">{account.role==='owner'&&bookingTestMode&&<div className="identity-badge"><strong>⚠ 指名測試模式啟用中</strong></div>}<div className="identity-badge">目前身份：<strong>{account.staff_name}</strong>（{account.role==='owner'?'館主':account.role==='frontdesk'?'櫃台':'館員'}）</div><button className={`sound-toggle ${notificationSound?'enabled':''}`} onClick={toggleNotificationSound}>{notificationSound?'🔔 通知音：開啟':'🔕 開啟通知音'}</button>{account.role==='owner'&&<button className="ghost" onClick={()=>playServiceEndingSound('ended')}>🔊 測試結束提示音</button>}<button className="ghost" onClick={()=>load()}>重新整理</button></div></header>{msg&&<p className="admin-message">{msg}</p>}
 {tab==='dashboard'&&<>{account.role==='staff'&&<><div className="staff-availability"><strong>接單狀態</strong><span>{account.accepting_reservations?'目前接受新指名':'目前暫停接受新指名'}</span><button disabled={busy==='availability'} className={account.accepting_reservations?'offline':'online'} onClick={toggleAvailability}>{account.accepting_reservations?'切換為休息中':'切換為接單中'}</button></div>{account.staff_slug==='yukinoji-hakari'&&<div className="staff-availability chibi-availability"><div><strong>Q版繪圖(公版)</strong><span>{yukinojiChibiAccepting?'目前接單中':'目前暫停接單'}</span><small>切換後會即時反映到客人的指名介面。</small></div><button disabled={busy==='yukinoji-chibi'} className={yukinojiChibiAccepting?'offline':'online'} onClick={toggleYukinojiChibi}>{yukinojiChibiAccepting?'暫停 Q版接單':'恢復 Q版接單'}</button></div>}</>}<section className="stats"><article><b>{todayReservations.length}</b><span>{account.role==='staff'?'我的本營業日指名':'本營業日指名'}</span></article><article><b>{todayReservations.filter(x=>x.status==='pending').length}</b><span>本營業日待確認</span></article><article><b>{todayOrders.length}</b><span>本營業日點餐</span></article><article><b>{todayOrders.reduce((sum,x)=>sum+Number(x.total||0),0).toLocaleString('zh-TW')}</b><span>本營業日點餐金額（Gil）</span></article></section>{account.role==='owner'&&<section className="payroll-dashboard-card"><div><span>館主專用・本營業日薪資</span><strong>{payrollPerPerson.toLocaleString('zh-TW')} Gil／人</strong><small>基本薪資 150,000 ＋ 每人餐點分紅 {payrollFoodShare.toLocaleString('zh-TW')} Gil</small></div><div><span>本營業日需發給其他館員</span><strong>{payrollCashOut.toLocaleString('zh-TW')} Gil</strong><small>目前計入 {payrollHeadcount} 位上班人員（含館主）</small></div><button onClick={()=>setTab('payroll')}>查看薪資明細</button></section>}<Panel title={account.role==='staff'?'我的本營業日近期指名':'本營業日近期指名'}><Table rows={todayReservations.slice(0,8)} keys={['guest_name','staff_name','service_name','starts_at','status']}/></Panel></>}
 {tab==='staff'&&<Panel title="館員資料" action={<button onClick={()=>quickAdd('staff')}>新增館員</button>}><Table rows={staff} keys={['name','role','active','accepting_reservations']} actions={(r)=><button disabled={busy===`staff:${r.id}`} onClick={()=>remove('staff',r.id)}>刪除</button>}/></Panel>}
 {tab==='schedule'&&<><Panel title="新增請假／不可指名時段"><form className="leave-form" onSubmit={addLeave}><label><span>館員</span><select value={leaveStaffId} onChange={e=>setLeaveStaffId(e.target.value)} required><option value="">請選擇館員</option>{activeStaff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label><span>日期</span><input type="date" value={leaveDate} onChange={e=>setLeaveDate(e.target.value)} required/></label><label><span>開始時間</span><select value={leaveStart} onChange={e=>setLeaveStart(e.target.value)}>{leaveTimeOptions.slice(0,-1).map(t=><option key={`start-${t}`} value={t}>{t}</option>)}</select></label><label><span>結束時間</span><select value={leaveEnd} onChange={e=>setLeaveEnd(e.target.value)}>{leaveTimeOptions.slice(1).map(t=><option key={`end-${t}`} value={t}>{t}</option>)}</select></label><label className="leave-reason"><span>原因／備註</span><input value={leaveReason} onChange={e=>setLeaveReason(e.target.value)} placeholder="例如：請假、休息、暫停指名"/></label><button className="leave-submit" type="submit" disabled={busy==='leave:add'}>{busy==='leave:add'?'儲存中…':'新增請假'}</button></form><p className="hint">新增後，該館員在這段時間內會自動顯示為不可指名。營業時段以 21:00～24:00 為主。</p></Panel><Panel title="已設定的不可指名時段"><Table rows={leaveRows} keys={['staff_name','starts_at','ends_at','reason']} actions={r=><button disabled={busy===`staff_unavailability:${r.id}`} onClick={()=>remove('staff_unavailability',r.id)}>刪除</button>}/></Panel></>}
 {tab==='operations'&&<div className="operations-grid">
  <div className="operations-column operations-orders"><Panel title="點餐管理"><RecordToolbar range={orderRange} status={orderStatus} search={orderSearch} onRange={v=>{setOrderRange(v);setOrderPage(1)}} onStatus={v=>{setOrderStatus(v);setOrderPage(1)}} onSearch={v=>{setOrderSearch(v);setOrderPage(1)}} statuses={['pending','completed','cancelled','all']}/><RecordSummary total={filteredOrders.length} range={orderRange} status={orderStatus}/><Table rows={visibleOrders} keys={['guest_name','items','delivery_preference_staff_name','delivery_staff_name','total','status','created_at']} actions={r=><>{account.staff_id&&!r.delivery_staff_id&&r.status==='pending'&&<button disabled={busy===`delivery:${r.id}`} onClick={()=>claimDelivery(r)}>{r.delivery_preference_staff_id&&r.delivery_preference_staff_id!==account.staff_id?'代為送餐':'由我送餐'}</button>}{r.delivery_staff_id===account.staff_id&&<button disabled>已由我接單</button>}<button disabled={busy===`orders:${r.id}`} onClick={()=>status('orders',r.id,'completed')}>完成</button><button disabled={busy===`orders:${r.id}`} onClick={()=>status('orders',r.id,'cancelled')}>取消</button></>}/><Pagination page={orderPage} pages={orderPages} onChange={setOrderPage}/></Panel></div>
  <div className="operations-column operations-reservations"><Panel title={account.role==='staff'?'我的指名管理':'指名管理'}><RecordToolbar range={reservationRange} status={reservationStatus} search={reservationSearch} onRange={v=>{setReservationRange(v);setReservationPage(1)}} onStatus={v=>{setReservationStatus(v);setReservationPage(1)}} onSearch={v=>{setReservationSearch(v);setReservationPage(1)}} statuses={['pending','acknowledged','confirmed','completed','cancelled','all']}/><RecordSummary total={filteredReservations.length} range={reservationRange} status={reservationStatus}/><Table rows={visibleReservations} keys={['guest_name','contact','staff_name','service_name','starts_at','ends_at','price','status','note']} actions={r=><>{r.status==='pending'&&account.role!=='frontdesk'&&<button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'acknowledged')}>確認</button>}{r.status==='acknowledged'&&account.role!=='frontdesk'&&<button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'confirmed')}>開始</button>}{canExtendReservation(r)&&<button className="extend-button" disabled={busy===`extend:${r.id}`} onClick={()=>openExtend(r)}>續時</button>}<button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'completed')}>完成</button><button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'cancelled')}>取消</button></>}/><Pagination page={reservationPage} pages={reservationPages} onChange={setReservationPage}/></Panel></div>
 </div>}
 {tab==='payroll'&&account.role==='owner'&&<><section className="payroll-stats"><article><span>本營業日餐點收入</span><b>{payrollFoodRevenue.toLocaleString('zh-TW')} <small>Gil</small></b><em>已排除取消訂單與拍立得加購</em></article><article><span>本營業日上班人數</span><b>{payrollHeadcount} <small>人</small></b><em>包含館主本人</em></article><article><span>每人餐點分紅</span><b>{payrollFoodShare.toLocaleString('zh-TW')} <small>Gil</small></b><em>餐點收入 ÷ 上班人數</em></article><article className="payroll-highlight"><span>每人本營業日薪資</span><b>{payrollPerPerson.toLocaleString('zh-TW')} <small>Gil</small></b><em>基本 150,000 ＋ 餐點分紅</em></article></section><Panel title="本營業日上班人員" action={<button className="ghost" onClick={resetPayrollRoster}>依本營業日請假重新判定</button>}><p className="hint">館主固定計入。系統第一次會依本營業日 21:00～24:00 的請假／不可指名時段預設排除館員；若只是短暫離開或實際仍有上班，可在這裡手動勾回。名單會記在這台裝置的本營業日後台。</p><div className="payroll-roster">{payrollPeople.map(person=><label key={person.id} className={person.isOwner?'owner':''}><input type="checkbox" checked={person.isOwner||payrollStaffIds.includes(person.id)} disabled={person.isOwner} onChange={()=>togglePayrollStaff(person.id)}/><span><strong>{person.name}</strong><small>{person.isOwner?'館主・固定計入':'館員'}</small></span></label>)}</div></Panel><Panel title="本營業日薪資明細"><div className="payroll-formula"><span>基本薪資</span><strong>{BASE_DAILY_PAY.toLocaleString('zh-TW')} Gil</strong><b>＋</b><span>每人餐點分紅</span><strong>{payrollFoodShare.toLocaleString('zh-TW')} Gil</strong><b>＝</b><span>每人應得</span><strong>{payrollPerPerson.toLocaleString('zh-TW')} Gil</strong></div><div className="table-wrap"><table className="payroll-table"><thead><tr><th>人員</th><th>基本薪資</th><th>餐點分紅</th><th>本營業日應得</th></tr></thead><tbody>{selectedPayrollPeople.map(person=><tr key={person.id}><td><strong>{person.name}</strong>{person.isOwner&&<small>（館主）</small>}</td><td>{BASE_DAILY_PAY.toLocaleString('zh-TW')}</td><td>{payrollFoodShare.toLocaleString('zh-TW')}</td><td><strong>{payrollPerPerson.toLocaleString('zh-TW')} Gil</strong></td></tr>)}</tbody></table></div>{payrollRemainder>0&&<p className="payroll-remainder">餐點收入平均後剩餘 <strong>{payrollRemainder.toLocaleString('zh-TW')} Gil</strong> 無法整除，這筆尾數未加入任何人的薪資。</p>}<div className="payroll-payout"><div><span>其他館員人數</span><strong>{payrollEmployeeCount} 人</strong></div><div className="total"><span>本營業日實際需要發給其他館員</span><strong>{payrollCashOut.toLocaleString('zh-TW')} Gil</strong></div><small>館主自己的 {payrollPerPerson.toLocaleString('zh-TW')} Gil 顯示在明細中，但不計入「要支付出去」的金額。</small></div></Panel></>}
 {tab==='polaroids'&&<>{account.role==='owner'&&<Panel title="慕斯菲露拍立得・手動發號"><div className="manual-pickup-box"><div><p className="hint">館主專用。這裡不走指名與營業時間限制，可在接近打烊或前台無法下單時直接補發拍立得取件碼。</p><label className="manual-pickup-field"><span>客人名稱</span><input value={manualPolaroidGuest} onChange={e=>setManualPolaroidGuest(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void issueMusufiruPolaroid()}}} placeholder="輸入客人角色名稱"/></label><button disabled={busy==='manual-polaroid'} onClick={()=>void issueMusufiruPolaroid()}>{busy==='manual-polaroid'?'發號中…':'發放拍立得取件碼'}</button></div>{manualPolaroidCode&&<div className="manual-pickup-result"><span>剛剛發放的取件碼</span><strong>{manualPolaroidCode}</strong><button className="ghost" onClick={()=>void navigator.clipboard?.writeText(manualPolaroidCode)}>複製號碼</button><small>這筆會直接出現在慕斯菲露的「我的成品」，之後照原本流程上傳即可。</small></div>}</div></Panel>}<Panel title={account.role==='staff'?'我的成品':'成品管理'}><div className="record-summary">拍立得與 Q版繪圖都在這裡上傳。上傳完成後，客人即可使用取件碼領取。</div><div className="polaroid-admin-grid">{polaroids.length?polaroids.map(r=>{const itemName=pickupTypeText(r.item_type);return <article className="polaroid-admin-card" key={r.id}><div><span className="eyebrow">{r.item_type==='chibi_public'?'Q ART PICKUP':'PICKUP CODE'}</span><h3>{r.pickup_code}</h3><p><b>{itemName}</b>・{r.staff_name}・客人：{r.guest_name}</p><small>{r.status==='ready'?'已完成，可領取':'等待館員上傳'}</small></div><label className="polaroid-upload-button">{busy===`polaroid:${r.id}`?'上傳中…':r.status==='ready'?'重新上傳':`上傳${itemName}`}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy===`polaroid:${r.id}`} onChange={e=>{const f=e.target.files?.[0];if(f)void uploadPolaroid(r.id,f);e.currentTarget.value=''}}/></label></article>}):<p className="empty-state">目前沒有待上傳成品。</p>}</div></Panel></>}
 {tab==='announcements'&&<Panel title="公告" action={<button onClick={()=>quickAdd('announcement')}>新增公告</button>}><Table rows={data.announcements||[]} keys={['title','content','published','created_at']} actions={r=><button disabled={busy===`announcements:${r.id}`} onClick={()=>remove('announcements',r.id)}>刪除</button>}/></Panel>}
 {tab==='rules'&&<Panel title="來館規章" action={<button onClick={()=>setRules(prev=>[...prev,{title:'新規章',content:''}])}>新增規章</button>}><div className="rules-editor">{rules.map((rule,index)=><article className="rule-editor" key={index}><div className="rule-number">{String(index+1).padStart(2,'0')}</div><label>標題<input value={rule.title} onChange={e=>updateRule(index,'title',e.target.value)}/></label><label>內容<textarea rows={3} value={rule.content} onChange={e=>updateRule(index,'content',e.target.value)}/></label><div className="rule-actions"><button onClick={()=>moveRule(index,-1)} disabled={index===0}>上移</button><button onClick={()=>moveRule(index,1)} disabled={index===rules.length-1}>下移</button><button className="danger" onClick={()=>setRules(prev=>prev.filter((_,i)=>i!==index))}>刪除</button></div></article>)}</div><div className="form-submit"><button disabled={busy==='setting:rules'} onClick={()=>saveSetting('rules',rules)}>儲存全部規章</button></div></Panel>}
 {tab==='settings'&&<><Panel title="指名測試模式"><div className="staff-availability"><div><strong>{bookingTestMode?'目前：測試模式已開啟':'目前：正式營業模式'}</strong><p className="hint">{bookingTestMode?'客人端可在 21:00～24:00 以外送出指名；館員休息、請假與服務中鎖定仍會生效。':'客人端維持每日 21:00～24:00 的正式指名時間限制。'}</p></div><button disabled={busy==='setting:booking_test_mode'} className={bookingTestMode?'offline':'online'} onClick={()=>saveSetting('booking_test_mode',{enabled:!bookingTestMode})}>{bookingTestMode?'關閉測試模式':'開啟測試模式'}</button></div><p className="permission-note">僅館主後台提供此切換。測試完成後請記得關閉，避免非營業時段仍可送出指名。</p></Panel><Panel title="基本資訊"><div className="settings-grid"><label>店名<input value={venue.name} onChange={e=>setVenue({...venue,name:e.target.value})}/></label><label>住宅地址<input value={venue.address} onChange={e=>setVenue({...venue,address:e.target.value})}/></label><label>Discord／聯絡資訊<input value={venue.discord} onChange={e=>setVenue({...venue,discord:e.target.value})} placeholder="可留空"/></label><label>營業時間<input value={venue.business_hours} onChange={e=>setVenue({...venue,business_hours:e.target.value})}/></label><label>營業狀態<select value={venue.business_status} onChange={e=>setVenue({...venue,business_status:e.target.value})}><option value="open">營業中</option><option value="closed">今日休館</option><option value="preparing">準備中</option></select></label></div><div className="form-submit"><button disabled={busy==='setting:venue'} onClick={()=>saveSetting('venue',venue)}>儲存基本資訊</button></div></Panel><Panel title="首頁文字"><div className="settings-grid single"><label>首頁標語<input value={homepage.tagline} onChange={e=>setHomepage({...homepage,tagline:e.target.value})}/></label><label>服務摘要<input value={homepage.services_text} onChange={e=>setHomepage({...homepage,services_text:e.target.value})}/></label></div><div className="form-submit"><button disabled={busy==='setting:homepage'} onClick={()=>saveSetting('homepage',homepage)}>儲存首頁文字</button></div><p className="hint">本版可直接修改文字、地址、營業狀態與規章。圖片上傳會在後續版本加入。</p></Panel></>}
 {extendTarget&&<div className="reservation-alert-backdrop" role="dialog" aria-modal="true" aria-label="續時服務"><div className="reservation-alert extension-dialog"><div className="reservation-alert-icon">⏳</div><p className="eyebrow">EXTEND SERVICE</p><h2>續時服務</h2><dl><div><dt>客人</dt><dd>{extendTarget.guest_name||'—'}</dd></div><div><dt>館員</dt><dd>{extendTarget.staff_name||'—'}</dd></div><div><dt>目前結束</dt><dd>{formatDate(extendTarget.ends_at)}</dd></div></dl><label className="extension-select"><span>選擇續時項目</span><select value={extendService} onChange={e=>setExtendService(e.target.value)}>{extensionOptionsFor(extendTarget).map(name=><option key={name} value={name}>{name}　+{EXTENSION_INFO[name].duration} 分鐘／{EXTENSION_INFO[name].price.toLocaleString('zh-TW')} Gil</option>)}</select></label><div className="extension-summary"><span>續時後預計結束</span><strong>{formatDate(new Date(new Date(extendTarget.ends_at).getTime()+(EXTENSION_INFO[extendService]?.duration||0)*60000))}</strong><small>追加 {Number(EXTENSION_INFO[extendService]?.price||0).toLocaleString('zh-TW')} Gil</small></div><div className="reservation-alert-actions"><button disabled={busy===`extend:${extendTarget.id}`} onClick={()=>void extendReservation()}>{busy===`extend:${extendTarget.id}`?'續時中…':'確認續時'}</button><button className="ghost" disabled={busy===`extend:${extendTarget.id}`} onClick={()=>setExtendTarget(null)}>取消</button></div></div></div>}
 {endingReservation&&<div className="reservation-alert-backdrop" role="dialog" aria-modal="true" aria-label={endingReservation.__service_alert_phase==='ended'?'服務時間已到':'服務即將結束'}><div className="reservation-alert service-ending-alert"><div className="reservation-alert-icon">🌙</div><p className="eyebrow">{endingReservation.__service_alert_phase==='ended'?'SERVICE ENDED':'SERVICE ENDING'}</p><h2>{endingReservation.__service_alert_phase==='ended'?'服務時間已到':'服務時間剩不到 3 分鐘'}</h2><dl><div><dt>客人</dt><dd>{endingReservation.guest_name||'—'}</dd></div><div><dt>服務</dt><dd>{endingReservation.service_name||'—'}</dd></div><div><dt>預計結束</dt><dd>{formatDate(endingReservation.ends_at)}</dd></div></dl><p className="hint">{endingReservation.__service_alert_phase==='ended'?'目前已到預計結束時間。若客人要續時，可直接追加服務；否則請完成本次指名。':'若客人要續時，現在可直接選擇追加的服務項目；續時後提醒時間會依新的結束時間重新計算。'}</p><div className="reservation-alert-actions"><button onClick={()=>{openExtend(endingReservation);setEndingReservation(null)}}>續時</button><button className="ghost" onClick={()=>setEndingReservation(null)}>知道了</button></div></div></div>}
 {newReservation&&<div className="reservation-alert-backdrop" role="dialog" aria-modal="true" aria-label="新的指名預約"><div className="reservation-alert"><div className="reservation-alert-icon">🔔</div><p className="eyebrow">NEW RESERVATION</p><h2>{account.role==='staff'?'你收到新的指名預約':'收到新的指名預約'}</h2><dl><div><dt>客人</dt><dd>{newReservation.guest_name||'未填寫'}</dd></div><div><dt>指名館員</dt><dd>{newReservation.staff_name||'未指定'}</dd></div><div><dt>服務</dt><dd>{newReservation.service_name||'—'}</dd></div><div><dt>時間</dt><dd>{formatDate(newReservation.starts_at||newReservation.start_at)}</dd></div></dl><div className="reservation-alert-actions"><button onClick={()=>{setTab('operations');setNewReservation(null)}}>前往營運管理</button><button className="ghost" onClick={()=>setNewReservation(null)}>關閉</button></div></div></div>}
 {newOrder&&<div className="reservation-alert-backdrop" role="dialog" aria-modal="true" aria-label="新的點餐訂單"><div className="reservation-alert"><div className="reservation-alert-icon">🍽️</div><p className="eyebrow">NEW ORDER</p><h2>{newOrder.delivery_preference_staff_id&&newOrder.delivery_preference_staff_id===account.staff_id?'🍱 客人希望由你送餐':'收到新的餐點訂單'}</h2><dl><div><dt>客人</dt><dd>{newOrder.guest_name||'未填寫'}</dd></div><div><dt>餐點</dt><dd>{Array.isArray(newOrder.items)?newOrder.items.map((x:any)=>`${x.name} × ${x.qty??1}`).join('、'):'請至營運管理查看'}</dd></div><div><dt>希望送餐</dt><dd>{newOrder.delivery_preference_staff_name||'不指定／由館內安排'}</dd></div><div><dt>總金額</dt><dd>{Number(newOrder.total||0).toLocaleString('zh-TW')} Gil</dd></div><div><dt>送出時間</dt><dd>{formatDate(newOrder.created_at)}</dd></div></dl><div className="reservation-alert-actions"><button onClick={()=>{setTab('operations');setNewOrder(null)}}>前往營運管理</button><button className="ghost" onClick={()=>setNewOrder(null)}>關閉</button></div></div></div>}
 </main></div>
}
function Panel({title,action,children}:{title:string,action?:React.ReactNode,children:React.ReactNode}){return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>}
function RecordToolbar({range,status,search,onRange,onStatus,onSearch,statuses}:{range:DateRange,status:string,search:string,onRange:(v:DateRange)=>void,onStatus:(v:string)=>void,onSearch:(v:string)=>void,statuses:string[]}){return <div className="record-toolbar"><div className="filter-group"><span>日期</span>{(Object.keys(dateRangeText) as DateRange[]).map(v=><button key={v} className={range===v?'selected':''} onClick={()=>onRange(v)}>{dateRangeText[v]}</button>)}</div><div className="filter-group"><span>狀態</span>{statuses.map(v=><button key={v} className={status===v?'selected':''} onClick={()=>onStatus(v)}>{v==='all'?'全部':statusText[v]}</button>)}</div><label className="record-search"><span>搜尋</span><input value={search} onChange={e=>onSearch(e.target.value)} placeholder="客人、館員、服務或品項"/></label></div>}
function RecordSummary({total,range,status}:{total:number,range:DateRange,status:string}){return <div className="record-summary">顯示：{dateRangeText[range]}・{status==='all'?'全部狀態':statusText[status]}，共 {total} 筆。取消或完成的紀錄不會被刪除，可切換狀態查看。</div>}
function Pagination({page,pages,onChange}:{page:number,pages:number,onChange:(p:number)=>void}){if(pages<=1)return null;return <div className="pagination"><button disabled={page<=1} onClick={()=>onChange(page-1)}>上一頁</button><span>第 {page} / {pages} 頁</span><button disabled={page>=pages} onClick={()=>onChange(page+1)}>下一頁</button></div>}
function localDateInput(d:Date){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function toTaipeiIso(date:string,time:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;let targetDate=date,targetTime=time;if(time==='24:00'){const d=new Date(`${date}T00:00:00+08:00`);d.setUTCDate(d.getUTCDate()+1);targetDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);targetTime='00:00'}return new Date(`${targetDate}T${targetTime}:00+08:00`).toISOString()}
function buildLeaveTimes(){const values:string[]=[];for(let minutes=21*60;minutes<=24*60;minutes++){const h=Math.floor(minutes/60),m=minutes%60;values.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)}return values}
function startOfLocalDay(d:Date){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function businessDateKey(d:Date=new Date()){const shifted=new Date(d.getTime()-BUSINESS_DAY_START_HOUR*60*60*1000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(shifted)}
function businessDayBounds(d:Date=new Date()){const key=businessDateKey(d);const start=new Date(`${key}T${String(BUSINESS_DAY_START_HOUR).padStart(2,'0')}:00:00+08:00`);const end=new Date(start.getTime()+24*60*60*1000);return {key,start,end}}
function inDateRange(value:any,range:DateRange){if(range==='all')return true;const d=new Date(value);if(Number.isNaN(d.getTime()))return false;const now=new Date();const business=businessDayBounds(now);if(range==='today')return d>=business.start&&d<business.end;if(range==='yesterday'){const previousStart=new Date(business.start.getTime()-24*60*60*1000);return d>=previousStart&&d<business.start}const today=startOfLocalDay(now);const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);if(range==='week'){const weekStart=new Date(today);const day=(weekStart.getDay()+6)%7;weekStart.setDate(weekStart.getDate()-day);return d>=weekStart&&d<tomorrow}if(range==='month'){const monthStart=new Date(now.getFullYear(),now.getMonth(),1);return d>=monthStart&&d<tomorrow}return true}
function hasFoodItems(order:Row){
 let items=order?.items;
 try{if(typeof items==='string')items=JSON.parse(items)}catch{return false}
 if(!Array.isArray(items))return false;
 return items.some((item:any)=>{const name=String(item?.name||'').trim();return Boolean(name)&&!name.includes('拍立得')});
}

function isChibiReservation(row:Row){return String(row?.service_name||'').includes('Q版繪圖(公版)')}
function pickupTypeText(value:any){const type=String(value);if(type==='chibi_public')return 'Q版繪圖(公版)';if(type==='lina_signed_polaroid')return '簽繪拍立得';return '紀念拍立得'}
function filterRows(rows:Row[],range:DateRange,status:string,search:string){const q=search.trim().toLowerCase();return rows.filter(r=>{const time=r.created_at||r.starts_at;const dateOk=inDateRange(time,range);const statusOk=status==='all'||r.status===status;let searchOk=true;if(q){const items=Array.isArray(r.items)?r.items:[];const hay=[r.guest_name,r.contact,r.staff_name,r.service_name,r.note,r.delivery_preference_staff_name,r.delivery_staff_name,...items.map((x:any)=>x?.name)].filter(Boolean).join(' ').toLowerCase();searchOk=hay.includes(q)}return dateOk&&statusOk&&searchOk})}
function formatDate(value:any){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function foodOnlyOrderTotal(row:Row){let items=row?.items;try{if(typeof items==='string')items=JSON.parse(items)}catch{}if(Array.isArray(items)){const food=items.filter((item:any)=>!String(item?.name||'').includes('拍立得')).reduce((sum:number,item:any)=>sum+Math.max(0,Number(item?.price||0))*Math.max(1,Number(item?.qty||1)),0);if(food>0)return food}return Math.max(0,Number(row?.total||0))}
function formatItems(value:any){let items=value;try{if(typeof items==='string')items=JSON.parse(items)}catch{}if(!Array.isArray(items))return String(value??'—');return <div className="order-items">{items.map((item:any,i:number)=><div key={i}><strong>{item.name||'未命名品項'}</strong><span> × {item.qty??1}</span>{item.price!=null&&<small>（{Number(item.price).toLocaleString('zh-TW')} Gil）</small>}</div>)}</div>}
function formatCell(key:string,value:any){
 if(key==='items')return formatItems(value);
 if(key==='delivery_preference_staff_name')return <span className={`delivery-pill ${value?'preferred':'neutral'}`}>{value||'不指定／館內安排'}</span>;
 if(key==='delivery_staff_name')return <span className={`delivery-pill ${value?'claimed':'waiting'}`}>{value||'尚未接單'}</span>;
 if(key==='total'||key==='price')return `${Number(value||0).toLocaleString('zh-TW')} Gil`;
 if(['created_at','updated_at','starts_at','ends_at'].includes(key))return formatDate(value);
 if(key==='status')return <span className={`status-pill status-${value}`}>{statusText[String(value)]||String(value??'—')}</span>;
 if(typeof value==='boolean')return value?'是':'否';
 if(typeof value==='object')return JSON.stringify(value);
 return String(value??'—');
}
function Table({rows,keys,actions}:{rows:Row[],keys:string[],actions?:(r:Row)=>React.ReactNode}){if(!rows.length)return <div className="empty">目前沒有符合條件的資料</div>;return <div className={`table-wrap${actions?' has-actions':''}`}><table><thead><tr>{actions&&<th className="actions-head">操作</th>}{keys.map(k=><th key={k}>{labels[k]||k}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}>{actions&&<td className="actions">{actions(r)}</td>}{keys.map(k=><td key={k}>{formatCell(k,r[k])}</td>)}</tr>)}</tbody></table></div>}
