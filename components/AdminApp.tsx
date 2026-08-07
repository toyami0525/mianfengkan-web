'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Row=Record<string,any>;
type DateRange='today'|'yesterday'|'week'|'month'|'all';
type VenueSettings={name:string,address:string,discord:string,business_status:string,business_hours:string};
type Account={role:'owner'|'staff'|'frontdesk';staff_id:string|null;staff_name:string;accepting_reservations:boolean};
type HomepageSettings={tagline:string,services_text:string};
type RuleItem={title:string,content:string};
const PAGE_SIZE=20;
const ownerTabs=[['dashboard','總覽'],['staff','館員管理'],['schedule','排班／請假'],['reservations','指名管理'],['orders','點餐管理'],['polaroids','拍立得管理'],['announcements','公告管理'],['rules','規章管理'],['settings','網站設定']];
const staffTabs=[['dashboard','我的總覽'],['reservations','我的指名'],['orders','我的點餐'],['polaroids','我的拍立得']];
const frontdeskTabs=[['dashboard','總覽'],['reservations','指名管理'],['orders','點餐管理'],['polaroids','拍立得管理']];
const labels:Record<string,string>={guest_name:'客人',contact:'聯絡方式',staff_name:'指名館員',service_name:'服務',starts_at:'指名時間',status:'狀態',note:'備註',items:'點餐內容',total:'總金額',created_at:'送出時間',name:'姓名',role:'職位',active:'前台顯示',accepting_reservations:'接受指名',staff_id:'館員 ID',ends_at:'結束時間',reason:'原因',title:'標題',content:'內容',published:'公開',key:'設定項目',value:'設定內容',updated_at:'更新時間',pickup_code:'取件碼'};
const statusText:Record<string,string>={pending:'待確認',confirmed:'已確認',completed:'已完成',cancelled:'已取消',rejected:'已拒絕'};
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
 const[venue,setVenue]=useState<VenueSettings>(DEFAULT_VENUE),[homepage,setHomepage]=useState<HomepageSettings>(DEFAULT_HOME),[rules,setRules]=useState<RuleItem[]>(DEFAULT_RULES);
 const[notificationSound,setNotificationSound]=useState(false),[newReservation,setNewReservation]=useState<Row|null>(null);
 const[account,setAccount]=useState<Account|null>(null);
 const audioContextRef=useRef<AudioContext|null>(null);
 const db=useMemo(()=>supabase(),[]);
 function syncSettings(rows:Row[]){
  const map=Object.fromEntries((rows||[]).map(r=>[r.key,r.value]));
  setVenue({...DEFAULT_VENUE,...(map.venue||{})});
  setHomepage({...DEFAULT_HOME,...(map.homepage||{})});
  setRules(Array.isArray(map.rules)&&map.rules.length?map.rules:DEFAULT_RULES);
 }
 const tabs=account?.role==='staff'?staffTabs:account?.role==='frontdesk'?frontdeskTabs:ownerTabs;
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
   out.orders=(out.orders||[]).filter(r=>r.staff_id===currentAccount.staff_id);
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
   const{data:accountRow,error}=await db.from('staff_accounts').select('role,staff_id,active,staff:staff_id(id,name,accepting_reservations)').eq('user_id',data.user.id).eq('active',true).single();
   if(error||!accountRow){await db.auth.signOut();alert('此登入帳號尚未綁定館員權限。');location.href='/login';return}
   const rawAccount=accountRow as any;
   const staffValue=Array.isArray(rawAccount.staff)?rawAccount.staff[0]:rawAccount.staff;
   currentAccount={role:rawAccount.role as Account['role'],staff_id:rawAccount.staff_id??null,staff_name:staffValue?.name||(rawAccount.role==='owner'?'館主':'館員'),accepting_reservations:staffValue?.accepting_reservations??true};
   if(!mounted)return;
   setAccount(currentAccount);
   setNotificationSound(localStorage.getItem('mf-notification-sound')==='on');
   setReady(true);await load(currentAccount);
  });
  const channel=db.channel('admin-reservation-alerts').on('postgres_changes',{event:'INSERT',schema:'public',table:'reservations'},payload=>{
   const row=payload.new as Row;
   if(!currentAccount)return;
   if(currentAccount.role==='staff'&&row.staff_id!==currentAccount.staff_id)return;
   setData(prev=>({...prev,reservations:[row,...(prev.reservations||[])]}));
   setNewReservation(row);
   if(localStorage.getItem('mf-notification-sound')==='on')playNotificationSound();
  }).subscribe();
  return()=>{mounted=false;db.removeChannel(channel)};
 },[]);
 function playNotificationSound(){
  try{
   const Ctx=window.AudioContext||(window as any).webkitAudioContext;
   const ctx=audioContextRef.current||new Ctx();audioContextRef.current=ctx;
   if(ctx.state==='suspended')void ctx.resume();
   const now=ctx.currentTime;
   // 大聲「叮咚、叮咚」兩次：高音→低音，短暫停頓後再重複。
   [[0,988],[0.20,659],[0.72,988],[0.92,659]].forEach(([delay,freq])=>{
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(freq,now+delay);
    gain.gain.setValueAtTime(0.0001,now+delay);gain.gain.exponentialRampToValueAtTime(0.48,now+delay+0.012);gain.gain.exponentialRampToValueAtTime(0.0001,now+delay+0.30);
    oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(now+delay);oscillator.stop(now+delay+0.32);
   });
  }catch(error){console.warn('無法播放指名提示音',error)}
 }
 async function toggleNotificationSound(){
  const next=!notificationSound;
  setNotificationSound(next);localStorage.setItem('mf-notification-sound',next?'on':'off');
  if(next)playNotificationSound();
 }

 async function uploadPolaroid(id:string,file:File){
  setBusy(`polaroid:${id}`);setMsg('上傳拍立得中…');
  try{
   const{data:{session}}=await db.auth.getSession();if(!session)throw new Error('登入已失效，請重新登入');
   const form=new FormData();form.append('id',id);form.append('file',file);
   const response=await fetch('/api/staff/polaroids',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:form});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'上傳失敗');
   setMsg('拍立得已完成並開放客人領取。');await load();
  }catch(error){const text=error instanceof Error?error.message:'上傳失敗';setMsg(text);alert(text)}finally{setBusy('')}
 }

 async function logout(){await db.auth.signOut();location.href='/login'}
 async function toggleAvailability(){
  if(!account?.staff_id)return;
  const next=!account.accepting_reservations;setBusy('availability');
  const{error}=await db.from('staff').update({accepting_reservations:next}).eq('id',account.staff_id);
  if(error){alert(`更新失敗：${error.message}`)}else setAccount({...account,accepting_reservations:next});
  setBusy('');
 }
 async function status(table:string,id:string,nextStatus:string){
  const key=`${table}:${id}`;setBusy(key);setMsg('更新中…');
  const{error}=await db.from(table).update({status:nextStatus}).eq('id',id).select('id').single();
  if(error){console.error(error);setMsg(`更新失敗：${error.message}`);alert(`更新失敗：${error.message}`);}
  else{setMsg(`狀態已更新為「${statusText[nextStatus]||nextStatus}」`);await load();}
  setBusy('');
 }
 async function remove(table:string,id:string){
  if(!confirm('確定刪除？'))return;setBusy(`${table}:${id}`);
  const{error}=await db.from(table).delete().eq('id',id);
  if(error){setMsg(`刪除失敗：${error.message}`);alert(`刪除失敗：${error.message}`);}else await load();
  setBusy('');
 }
 async function quickAdd(kind:string){
  if(kind==='staff'){const name=prompt('館員姓名');if(name)await db.from('staff').insert({name,role:'館員',active:true,accepting_reservations:true})}
  if(kind==='leave'){const staff_id=prompt('館員 UUID');const starts_at=prompt('開始時間，例如 2026-08-01 20:00');const ends_at=prompt('結束時間，例如 2026-08-01 23:00');if(staff_id&&starts_at&&ends_at)await db.from('staff_unavailability').insert({staff_id,starts_at,ends_at,reason:'請假'})}
  if(kind==='announcement'){const title=prompt('公告標題');const content=prompt('公告內容');if(title)await db.from('announcements').insert({title,content,published:true})}
  await load();
 }
 async function saveSetting(key:string,value:any){
  setBusy(`setting:${key}`);setMsg('儲存中…');
  const{error}=await db.from('site_settings').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error){setMsg(`儲存失敗：${error.message}`);alert(`儲存失敗：${error.message}`);}else{setMsg('已儲存，前台重新整理後會套用最新內容。');await load()}
  setBusy('');
 }
 function updateRule(index:number,field:keyof RuleItem,value:string){setRules(prev=>prev.map((r,i)=>i===index?{...r,[field]:value}:r))}
 function moveRule(index:number,delta:number){setRules(prev=>{const next=[...prev],to=index+delta;if(to<0||to>=next.length)return prev;[next[index],next[to]]=[next[to],next[index]];return next})}
 if(!ready||!account)return <main className="admin-loading">確認登入狀態…</main>;
 const reservations=data.reservations||[],orders=data.orders||[],staff=data.staff||[],polaroids=data.polaroid_pickups||[];
 const todayReservations=filterRows(reservations,'today','all','');
 const todayOrders=filterRows(orders,'today','all','');
 const filteredReservations=filterRows(reservations,reservationRange,reservationStatus,reservationSearch);
 const filteredOrders=filterRows(orders,orderRange,orderStatus,orderSearch);
 const reservationPages=Math.max(1,Math.ceil(filteredReservations.length/PAGE_SIZE));
 const orderPages=Math.max(1,Math.ceil(filteredOrders.length/PAGE_SIZE));
 const visibleReservations=filteredReservations.slice((reservationPage-1)*PAGE_SIZE,reservationPage*PAGE_SIZE);
 const visibleOrders=filteredOrders.slice((orderPage-1)*PAGE_SIZE,orderPage*PAGE_SIZE);
 return <div className="admin-shell"><aside className="admin-side"><div className="admin-brand"><span>楓</span><div><b>眠楓館</b><small>ADMINISTRATION</small></div></div><div className="role-caption">{account.role==='owner'?'完整管理權限':account.role==='frontdesk'?'櫃台處理權限':'僅顯示個人指名'}</div><nav>{tabs.map(([k,v])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{v}</button>)}</nav><div className="side-bottom"><a href="/index.html">查看網站</a><button onClick={logout}>登出</button></div></aside><main className="admin-main"><header><div><p className="eyebrow">MIANFENGKAN</p><h1>{tabs.find(x=>x[0]===tab)?.[1]}</h1></div><div className="admin-header-actions"><div className="identity-badge">目前身份：<strong>{account.staff_name}</strong>（{account.role==='owner'?'館主':account.role==='frontdesk'?'櫃台':'館員'}）</div><button className={`sound-toggle ${notificationSound?'enabled':''}`} onClick={toggleNotificationSound}>{notificationSound?'🔔 指名提示音：開啟':'🔕 開啟指名提示音'}</button><button className="ghost" onClick={()=>load()}>重新整理</button></div></header>{msg&&<p className="admin-message">{msg}</p>}
 {tab==='dashboard'&&<>{account.role==='staff'&&<><div className="permission-note">你目前只會看到自己的預約、點餐與指名通知；其他館員資料不會顯示。</div><div className="staff-availability"><strong>接單狀態</strong><span>{account.accepting_reservations?'目前接受新指名':'目前暫停接受新指名'}</span><button disabled={busy==='availability'} className={account.accepting_reservations?'offline':'online'} onClick={toggleAvailability}>{account.accepting_reservations?'切換為休息中':'切換為接單中'}</button></div></>}<section className="stats"><article><b>{todayReservations.length}</b><span>{account.role==='staff'?'我的今日指名':'今日指名'}</span></article><article><b>{todayReservations.filter(x=>x.status==='pending').length}</b><span>今日待確認</span></article><article><b>{todayOrders.length}</b><span>今日點餐</span></article><article><b>{todayOrders.reduce((sum,x)=>sum+Number(x.total||0),0).toLocaleString('zh-TW')}</b><span>今日點餐金額（Gil）</span></article></section><Panel title={account.role==='staff'?'我的今日近期指名':'今日近期指名'}><Table rows={todayReservations.slice(0,8)} keys={['guest_name','staff_name','service_name','starts_at','status']}/></Panel></>}
 {tab==='staff'&&<Panel title="館員資料" action={<button onClick={()=>quickAdd('staff')}>新增館員</button>}><Table rows={staff} keys={['name','role','active','accepting_reservations']} actions={(r)=><button disabled={busy===`staff:${r.id}`} onClick={()=>remove('staff',r.id)}>刪除</button>}/></Panel>}
 {tab==='schedule'&&<Panel title="不可指名時段" action={<button onClick={()=>quickAdd('leave')}>新增請假</button>}><Table rows={data.staff_unavailability||[]} keys={['staff_id','starts_at','ends_at','reason']} actions={r=><button disabled={busy===`staff_unavailability:${r.id}`} onClick={()=>remove('staff_unavailability',r.id)}>刪除</button>}/></Panel>}
 {tab==='reservations'&&<Panel title="指名紀錄"><RecordToolbar range={reservationRange} status={reservationStatus} search={reservationSearch} onRange={v=>{setReservationRange(v);setReservationPage(1)}} onStatus={v=>{setReservationStatus(v);setReservationPage(1)}} onSearch={v=>{setReservationSearch(v);setReservationPage(1)}} statuses={['pending','confirmed','completed','cancelled','all']}/><RecordSummary total={filteredReservations.length} range={reservationRange} status={reservationStatus}/><Table rows={visibleReservations} keys={['guest_name','contact','staff_name','service_name','starts_at','status','note']} actions={r=><><button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'confirmed')}>確認</button><button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'completed')}>完成</button><button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'cancelled')}>取消</button></>}/><Pagination page={reservationPage} pages={reservationPages} onChange={setReservationPage}/></Panel>}
 {tab==='orders'&&<Panel title="點餐紀錄"><RecordToolbar range={orderRange} status={orderStatus} search={orderSearch} onRange={v=>{setOrderRange(v);setOrderPage(1)}} onStatus={v=>{setOrderStatus(v);setOrderPage(1)}} onSearch={v=>{setOrderSearch(v);setOrderPage(1)}} statuses={['pending','completed','cancelled','all']}/><RecordSummary total={filteredOrders.length} range={orderRange} status={orderStatus}/><Table rows={visibleOrders} keys={['guest_name','items','total','status','created_at']} actions={r=><><button disabled={busy===`orders:${r.id}`} onClick={()=>status('orders',r.id,'completed')}>完成</button><button disabled={busy===`orders:${r.id}`} onClick={()=>status('orders',r.id,'cancelled')}>取消</button></>}/><Pagination page={orderPage} pages={orderPages} onChange={setOrderPage}/></Panel>}
 {tab==='polaroids'&&<Panel title={account.role==='staff'?'我的拍立得':'拍立得管理'}><div className="record-summary">館員完成拍攝與題字後，在這裡上傳成品。上傳完成後，客人即可使用取件碼領取。</div><div className="polaroid-admin-grid">{polaroids.length?polaroids.map(r=><article className="polaroid-admin-card" key={r.id}><div><span className="eyebrow">PICKUP CODE</span><h3>{r.pickup_code}</h3><p><b>{r.staff_name}</b>・客人：{r.guest_name}</p><small>{r.status==='ready'?'已完成，可領取':'等待館員上傳'}</small></div><label className="polaroid-upload-button">{busy===`polaroid:${r.id}`?'上傳中…':r.status==='ready'?'重新上傳':'上傳拍立得'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy===`polaroid:${r.id}`} onChange={e=>{const f=e.target.files?.[0];if(f)void uploadPolaroid(r.id,f);e.currentTarget.value=''}}/></label></article>):<p className="empty-state">目前沒有拍立得訂單。</p>}</div></Panel>}
 {tab==='announcements'&&<Panel title="公告" action={<button onClick={()=>quickAdd('announcement')}>新增公告</button>}><Table rows={data.announcements||[]} keys={['title','content','published','created_at']} actions={r=><button disabled={busy===`announcements:${r.id}`} onClick={()=>remove('announcements',r.id)}>刪除</button>}/></Panel>}
 {tab==='rules'&&<Panel title="來館規章" action={<button onClick={()=>setRules(prev=>[...prev,{title:'新規章',content:''}])}>新增規章</button>}><div className="rules-editor">{rules.map((rule,index)=><article className="rule-editor" key={index}><div className="rule-number">{String(index+1).padStart(2,'0')}</div><label>標題<input value={rule.title} onChange={e=>updateRule(index,'title',e.target.value)}/></label><label>內容<textarea rows={3} value={rule.content} onChange={e=>updateRule(index,'content',e.target.value)}/></label><div className="rule-actions"><button onClick={()=>moveRule(index,-1)} disabled={index===0}>上移</button><button onClick={()=>moveRule(index,1)} disabled={index===rules.length-1}>下移</button><button className="danger" onClick={()=>setRules(prev=>prev.filter((_,i)=>i!==index))}>刪除</button></div></article>)}</div><div className="form-submit"><button disabled={busy==='setting:rules'} onClick={()=>saveSetting('rules',rules)}>儲存全部規章</button></div></Panel>}
 {tab==='settings'&&<><Panel title="基本資訊"><div className="settings-grid"><label>店名<input value={venue.name} onChange={e=>setVenue({...venue,name:e.target.value})}/></label><label>住宅地址<input value={venue.address} onChange={e=>setVenue({...venue,address:e.target.value})}/></label><label>Discord／聯絡資訊<input value={venue.discord} onChange={e=>setVenue({...venue,discord:e.target.value})} placeholder="可留空"/></label><label>營業時間<input value={venue.business_hours} onChange={e=>setVenue({...venue,business_hours:e.target.value})}/></label><label>營業狀態<select value={venue.business_status} onChange={e=>setVenue({...venue,business_status:e.target.value})}><option value="open">營業中</option><option value="closed">今日休館</option><option value="preparing">準備中</option></select></label></div><div className="form-submit"><button disabled={busy==='setting:venue'} onClick={()=>saveSetting('venue',venue)}>儲存基本資訊</button></div></Panel><Panel title="首頁文字"><div className="settings-grid single"><label>首頁標語<input value={homepage.tagline} onChange={e=>setHomepage({...homepage,tagline:e.target.value})}/></label><label>服務摘要<input value={homepage.services_text} onChange={e=>setHomepage({...homepage,services_text:e.target.value})}/></label></div><div className="form-submit"><button disabled={busy==='setting:homepage'} onClick={()=>saveSetting('homepage',homepage)}>儲存首頁文字</button></div><p className="hint">本版可直接修改文字、地址、營業狀態與規章。圖片上傳會在後續版本加入。</p></Panel></>}
 {newReservation&&<div className="reservation-alert-backdrop" role="dialog" aria-modal="true" aria-label="新的指名預約"><div className="reservation-alert"><div className="reservation-alert-icon">🔔</div><p className="eyebrow">NEW RESERVATION</p><h2>{account.role==='staff'?'你收到新的指名預約':'收到新的指名預約'}</h2><dl><div><dt>客人</dt><dd>{newReservation.guest_name||'未填寫'}</dd></div><div><dt>指名館員</dt><dd>{newReservation.staff_name||'未指定'}</dd></div><div><dt>服務</dt><dd>{newReservation.service_name||'—'}</dd></div><div><dt>時間</dt><dd>{formatDate(newReservation.starts_at||newReservation.start_at)}</dd></div></dl><div className="reservation-alert-actions"><button onClick={()=>{setTab('reservations');setNewReservation(null)}}>查看指名</button><button className="ghost" onClick={()=>setNewReservation(null)}>關閉</button></div></div></div>}
 </main></div>
}
function Panel({title,action,children}:{title:string,action?:React.ReactNode,children:React.ReactNode}){return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>}
function RecordToolbar({range,status,search,onRange,onStatus,onSearch,statuses}:{range:DateRange,status:string,search:string,onRange:(v:DateRange)=>void,onStatus:(v:string)=>void,onSearch:(v:string)=>void,statuses:string[]}){return <div className="record-toolbar"><div className="filter-group"><span>日期</span>{(Object.keys(dateRangeText) as DateRange[]).map(v=><button key={v} className={range===v?'selected':''} onClick={()=>onRange(v)}>{dateRangeText[v]}</button>)}</div><div className="filter-group"><span>狀態</span>{statuses.map(v=><button key={v} className={status===v?'selected':''} onClick={()=>onStatus(v)}>{v==='all'?'全部':statusText[v]}</button>)}</div><label className="record-search"><span>搜尋</span><input value={search} onChange={e=>onSearch(e.target.value)} placeholder="客人、館員、服務或品項"/></label></div>}
function RecordSummary({total,range,status}:{total:number,range:DateRange,status:string}){return <div className="record-summary">顯示：{dateRangeText[range]}・{status==='all'?'全部狀態':statusText[status]}，共 {total} 筆。取消或完成的紀錄不會被刪除，可切換狀態查看。</div>}
function Pagination({page,pages,onChange}:{page:number,pages:number,onChange:(p:number)=>void}){if(pages<=1)return null;return <div className="pagination"><button disabled={page<=1} onClick={()=>onChange(page-1)}>上一頁</button><span>第 {page} / {pages} 頁</span><button disabled={page>=pages} onClick={()=>onChange(page+1)}>下一頁</button></div>}
function startOfLocalDay(d:Date){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function inDateRange(value:any,range:DateRange){if(range==='all')return true;const d=new Date(value);if(Number.isNaN(d.getTime()))return false;const now=new Date();const today=startOfLocalDay(now);const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);if(range==='today')return d>=today&&d<tomorrow;const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);if(range==='yesterday')return d>=yesterday&&d<today;if(range==='week'){const weekStart=new Date(today);const day=(weekStart.getDay()+6)%7;weekStart.setDate(weekStart.getDate()-day);return d>=weekStart&&d<tomorrow}if(range==='month'){const monthStart=new Date(now.getFullYear(),now.getMonth(),1);return d>=monthStart&&d<tomorrow}return true}
function filterRows(rows:Row[],range:DateRange,status:string,search:string){const q=search.trim().toLowerCase();return rows.filter(r=>{const time=r.created_at||r.starts_at;const dateOk=inDateRange(time,range);const statusOk=status==='all'||r.status===status;let searchOk=true;if(q){const items=Array.isArray(r.items)?r.items:[];const hay=[r.guest_name,r.contact,r.staff_name,r.service_name,r.note,...items.map((x:any)=>x?.name)].filter(Boolean).join(' ').toLowerCase();searchOk=hay.includes(q)}return dateOk&&statusOk&&searchOk})}
function formatDate(value:any){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function formatItems(value:any){let items=value;try{if(typeof items==='string')items=JSON.parse(items)}catch{}if(!Array.isArray(items))return String(value??'—');return <div className="order-items">{items.map((item:any,i:number)=><div key={i}><strong>{item.name||'未命名品項'}</strong><span> × {item.qty??1}</span>{item.price!=null&&<small>（{Number(item.price).toLocaleString('zh-TW')} Gil）</small>}</div>)}</div>}
function formatCell(key:string,value:any){
 if(key==='items')return formatItems(value);
 if(key==='total')return `${Number(value||0).toLocaleString('zh-TW')} Gil`;
 if(['created_at','updated_at','starts_at','ends_at'].includes(key))return formatDate(value);
 if(key==='status')return <span className={`status-pill status-${value}`}>{statusText[String(value)]||String(value??'—')}</span>;
 if(typeof value==='boolean')return value?'是':'否';
 if(typeof value==='object')return JSON.stringify(value);
 return String(value??'—');
}
function Table({rows,keys,actions}:{rows:Row[],keys:string[],actions?:(r:Row)=>React.ReactNode}){if(!rows.length)return <div className="empty">目前沒有符合條件的資料</div>;return <div className="table-wrap"><table><thead><tr>{keys.map(k=><th key={k}>{labels[k]||k}</th>)}{actions&&<th>操作</th>}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}>{keys.map(k=><td key={k}>{formatCell(k,r[k])}</td>)}{actions&&<td className="actions">{actions(r)}</td>}</tr>)}</tbody></table></div>}
