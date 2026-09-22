'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import styles from './WerewolfAdmin.module.css';
type Status='pending'|'confirmed'|'completed'|'cancelled';
type Booking={id:number;booking_code:string;created_at:string;guest_name:string;guest_server:string;contact:string;starts_at:string;players:number;notes:string;price:number;status:Status};
const names:Record<Status,string>={pending:'待確認',confirmed:'已確認',completed:'已完成',cancelled:'已取消'};
const PAGE=20;
const date=(value:string)=>new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
function useOwner(){
  const db=useMemo(()=>supabase(),[]);
  const [role,setRole]=useState<'loading'|'owner'|'denied'|'error'>('loading');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true,version=0;
    async function check(){
      const current=++version;
      try{
        const {data:{user},error}=await db.auth.getUser();
        if(!active||current!==version)return;
        if(error||!user){setRole('denied');return;}
        const result=await db.from('staff_accounts').select('role').eq('user_id',user.id).eq('active',true).maybeSingle();
        if(result.error)throw result.error;
        if(active&&current===version)setRole(result.data?.role==='owner'?'owner':'denied');
      }catch{if(active&&current===version)setRole('error');}
    }
    void check();
    // Defer auth queries outside Supabase's auth-event callback.
    let authTimer:ReturnType<typeof setTimeout>|undefined;
    const {data}=db.auth.onAuthStateChange(event=>{if(event!=='INITIAL_SESSION'){clearTimeout(authTimer);authTimer=setTimeout(()=>void check(),0);}});
    return()=>{active=false;version++;clearTimeout(authTimer);data.subscription.unsubscribe();};
  },[db,retry]);
  return {db,role,retry:()=>setRetry(n=>n+1)};
}
export function WerewolfAdminEntry(){
  const {db,role}=useOwner();
  const [pending,setPending]=useState<number|null>(null);
  useEffect(()=>{
    if(role!=='owner')return;
    let active=true;
    async function refresh(){
      if(document.hidden)return;
      try{const r=await db.from('werewolf_reservations').select('id',{count:'exact',head:true}).eq('status','pending');if(active)setPending(r.error?null:r.count||0);}catch{if(active)setPending(null);}
    }
    void refresh();const timer=setInterval(()=>void refresh(),30000);
    const visible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[db,role]);
  if(role!=='owner')return null;
  return <aside className={styles.entry} aria-label="狼人殺預約入口"><span>團體遊戲 · 每場 500,000 Gil</span><a href="/admin/werewolf">狼人殺預約管理{pending!==null&&pending>0?` · ${pending} 筆待確認`:' →'}</a></aside>;
}
export default function WerewolfAdmin(){
  const {db,role,retry}=useOwner();
  const [rows,setRows]=useState<Booking[]>([]),[filter,setFilter]=useState<Status|'all'>('pending');
  const [page,setPage]=useState(0),[count,setCount]=useState(0),[loading,setLoading]=useState(false);
  const [refresh,setRefresh]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState<number|null>(null);
  useEffect(()=>{
    if(role!=='owner')return;
    let active=true;setLoading(true);setError('');
    void(async()=>{
      try{
        let query=db.from('werewolf_reservations').select('id,booking_code,created_at,guest_name,guest_server,contact,starts_at,players,notes,price,status',{count:'exact'});
        if(filter!=='all')query=query.eq('status',filter);
        const result=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*PAGE,(page+1)*PAGE-1);
        if(result.error)throw result.error;
        if(active){setRows((result.data||[]) as Booking[]);setCount(result.count||0);if(page>0&&page*PAGE>=(result.count||0))setPage(0);}
      }catch{if(active){setRows([]);setError('預約暫時無法載入，請重試；若登入已過期，請重新登入館主帳號。');}}
      finally{if(active)setLoading(false);}
    })();return()=>{active=false;};
  },[db,role,filter,page,refresh]);
  useEffect(()=>{
    if(role!=='owner')return;
    const timer=setInterval(()=>{if(!document.hidden&&busy===null)setRefresh(n=>n+1);},30000);
    return()=>clearInterval(timer);
  },[role,busy]);
  async function change(row:Booking,next:Status){
    if(busy!==null||!window.confirm(`將 ${row.booking_code}（${row.guest_name}）設為「${names[next]}」？${next==='confirmed'?'請先確認時間與人數安排。':''}${next==='completed'||next==='cancelled'?'這個狀態不會在本頁重新開啟。':''}`))return;
    setBusy(row.id);setNotice('');
    try{
      const r=await db.rpc('update_werewolf_reservation',{p_id:row.id,p_expected_status:row.status,p_status:next});
      if(r.error)throw r.error;
      setNotice(`${row.booking_code} 已設為「${names[next]}」。`);setRefresh(n=>n+1);
    }catch(e){
      const message=(e as {message?:string})?.message;
      setNotice(message==='WW_STALE'?'這筆預約已被其他操作更新，請重新整理後確認。':message==='WW_OWNER'?'只有有效的館主帳號可以操作，請重新登入。':'狀態尚未更新成功，請重新整理確認後再試。');
      setRefresh(n=>n+1);
    }finally{setBusy(null);}
  }
  return <main className={styles.page}>
    <header className={styles.heading}><div><small>MIANFENGKAN · OWNER ONLY</small><h1>狼人殺預約管理</h1><p>每場 500,000 Gil；獨立於館員指名與餐點。</p></div><nav><a href="/admin">返回館主後台</a><a href="/werewolf-reserve.html" target="_blank" rel="noopener noreferrer">開啟預約頁 ↗</a></nav></header>
    {role==='loading'?<p role="status">正在確認館主權限…</p>:role==='denied'?<section className={styles.card}><h2>此頁僅供館主使用</h2><p>請使用有效的館主帳號登入後再開啟本頁。</p><a href="/login">前往登入</a></section>:role==='error'?<p role="alert">權限暫時無法確認。<button onClick={retry}>重試</button></p>:<>
      <p className={styles.hint}>預約是待確認的申請，不會自動鎖定時段。確認前請與客人協調時間與人數。本頁只管理預約狀態，不會自動扣款、計入營收或分配薪資。</p>
      <div className={styles.toolbar}><label>顯示狀態 <select value={filter} disabled={busy!==null} onChange={e=>{setFilter(e.target.value as Status|'all');setPage(0);}}><option value="all">全部</option>{Object.entries(names).map(([key,value])=><option value={key} key={key}>{value}</option>)}</select></label><button disabled={loading||busy!==null} onClick={()=>setRefresh(n=>n+1)}>重新整理</button><span>{count} 筆 · 每 30 秒更新</span></div>
      {notice&&<p className={styles.notice} role="status">{notice}</p>}
      {error?<p role="alert">{error}</p>:loading?<p role="status">正在更新預約…</p>:rows.length?<div className={styles.list}>{rows.map(row=><article className={styles.card} key={row.id}>
        <header><div><small>{row.booking_code}</small><h2>{row.guest_name} <span>{row.guest_server}</span></h2></div><strong className={styles.badge}>{names[row.status]}</strong></header>
        <dl><div><dt>希望開始</dt><dd>{date(row.starts_at)}（台灣時間）</dd></div><div><dt>參加人數</dt><dd>{row.players} 人（含預約代表）</dd></div><div><dt>整場費用</dt><dd>{row.price.toLocaleString()} Gil</dd></div><div><dt>聯絡方式</dt><dd>{row.contact||'請以角色名稱與伺服器聯絡'}</dd></div></dl>
        <p className={styles.notes}>{row.notes||'無其他備註。'}</p><p className={styles.time}>送出時間：{date(row.created_at)}</p>
        <div className={styles.actions}>{row.status==='pending'&&<button disabled={busy!==null} onClick={()=>void change(row,'confirmed')}>確認預約</button>}{row.status==='confirmed'&&<button disabled={busy!==null} onClick={()=>void change(row,'completed')}>標記已完成</button>}{(row.status==='pending'||row.status==='confirmed')&&<button disabled={busy!==null} onClick={()=>void change(row,'cancelled')}>取消預約</button>}</div>
      </article>)}</div>:<p className={styles.card}>目前沒有符合此狀態的預約。</p>}
      <div className={styles.toolbar}><button disabled={loading||page===0} onClick={()=>setPage(n=>n-1)}>上一頁</button><span>第 {page+1} 頁</span><button disabled={loading||(page+1)*PAGE>=count} onClick={()=>setPage(n=>n+1)}>下一頁</button></div>
    </>}
  </main>;
}
