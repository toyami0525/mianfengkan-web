'use client';

import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import styles from './HalloweenCampaignPanel.module.css';

type Config={id:string;title:string;reward_name:string;threshold:number;per_day_limit:number;timezone:string;enabled:boolean;published:boolean;starts_on:string|null;ends_on:string|null;updated_at:string};
type Draft={enabled:boolean;published:boolean;starts_on:string;ends_on:string;expected_updated_at:string};
type Claim={id:string;pickup_code:string;pickup_status:string;issued_at:string;qualifying_total:number};
type Guest={guest_name:string;guest_server:string;reservation_total:number;dining_total:number;game_total:number;total:number;eligible:boolean;can_issue:boolean;claim:Claim|null};
type CampaignData={config:Config;spend_date:string;guests:Guest[];summary:{total_guests:number;qualified_guests:number;issued_count:number}};
type Issued={ok:boolean;guest_name:string;guest_server:string;spend_date:string;pickup_code:string;already_issued:boolean};
type Props={db:SupabaseClient};
const money=(value:number)=>Number(value||0).toLocaleString('zh-TW');
function todayTaipei(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value}
function draftOf(config:Config):Draft{return {enabled:config.enabled,published:config.published,starts_on:config.starts_on||'',ends_on:config.ends_on||'',expected_updated_at:config.updated_at}}
function settingError(draft:Draft){
 if(Boolean(draft.starts_on)!==Boolean(draft.ends_on))return '請完整設定開始與結束日期，或將兩欄都留空。';
 if(draft.starts_on&&(!validDate(draft.starts_on)||!validDate(draft.ends_on)||draft.starts_on>draft.ends_on))return '請確認活動日期，結束日期不能早於開始日期。';
 if((draft.enabled||draft.published)&&(!draft.starts_on||!draft.ends_on))return '啟用前請先設定活動日期。';
 return '';
}
function campaignStatus(config:Config){
 const today=todayTaipei();
 if(!config.enabled)return '草稿・尚未啟用';
 if(!config.published)return '已啟用・前台隱藏';
 if(config.starts_on&&today<config.starts_on)return '已排定・開始日公開';
 if(config.ends_on&&today>config.ends_on)return '已結束・前台隱藏';
 return '活動中・前台公開';
}
async function request<T>(db:SupabaseClient,path:string,options:RequestInit={}):Promise<T>{
 const {data,error}=await db.auth.getSession();
 if(error||!data.session?.access_token)throw new Error('請重新登入館主後台。');
 const response=await fetch(path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`,...options.headers}});
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'活動資料暫時無法讀取，請重試。');
 return result as T;
}

export default function HalloweenCampaignPanel({db}:Props){
 const[date,setDate]=useState(todayTaipei),[revision,setRevision]=useState(0);
 const[config,setConfig]=useState<Config|null>(null),[draft,setDraft]=useState<Draft|null>(null),[data,setData]=useState<CampaignData|null>(null);
 const[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[dirty,setDirty]=useState(false);
 const[readError,setReadError]=useState(''),[actionError,setActionError]=useState(''),[message,setMessage]=useState('');
 const[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[issued,setIssued]=useState<Issued|null>(null);
 const dirtyRef=useRef(false),busyRef=useRef(false),mountedRef=useRef(false),readVersionRef=useRef(0);
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false}},[]);
 useEffect(()=>{
  const controller=new AbortController(),version=++readVersionRef.current;
  setData(null);setReadError('');
  if(!validDate(date)){setLoading(false);setReadError('請選擇有效的累計日期。');return()=>controller.abort()}
  setLoading(true);
  void request<CampaignData>(db,`/api/staff/halloween-campaign?date=${encodeURIComponent(date)}`,{signal:controller.signal})
   .then(result=>{
    if(controller.signal.aborted||version!==readVersionRef.current)return;
    setConfig(result.config);setData(result);
    if(!dirtyRef.current)setDraft(draftOf(result.config));
   }).catch(reason=>{
    if(!controller.signal.aborted&&version===readVersionRef.current)setReadError(reason instanceof Error?reason.message:'讀取活動資料失敗。');
   }).finally(()=>{if(!controller.signal.aborted&&version===readVersionRef.current)setLoading(false)});
  return()=>controller.abort();
 },[db,date,revision]);
 function edit(change:Partial<Draft>){
  if(busyRef.current)return;
  dirtyRef.current=true;setDirty(true);setActionError('');setMessage('');
  setDraft(previous=>previous?{...previous,...change}:previous);
 }
 async function save(){
  if(busyRef.current||loading||!draft||!config||readError)return;
  const invalid=settingError(draft);if(invalid){setActionError(invalid);return}
  busyRef.current=true;setBusy('settings');setActionError('');setMessage('');
  try{
   const result=await request<{ok:boolean;config:Config}>(db,'/api/staff/halloween-campaign',{method:'PATCH',body:JSON.stringify({...draft,starts_on:draft.starts_on||null,ends_on:draft.ends_on||null})});
   if(!mountedRef.current)return;
   dirtyRef.current=false;setDirty(false);setConfig(result.config);setDraft(draftOf(result.config));setData(null);setRevision(value=>value+1);
   setMessage(result.config.enabled?(result.config.published?'設定已儲存，活動將在設定日期內顯示於指名前台。':'設定已儲存，活動已啟用，指名前台維持隱藏。'):'草稿已儲存，活動尚未啟用，指名前台維持隱藏。');
  }catch(reason){if(mountedRef.current)setActionError(reason instanceof Error?reason.message:'儲存結果無法確認，請重新讀取後再操作。')}
  finally{busyRef.current=false;if(mountedRef.current)setBusy('')}
 }
 async function issue(guest:Guest){
  if(busyRef.current||loading||readError||dirty||!data||data.spend_date!==date||!guest.can_issue||guest.claim)return;
  const key=JSON.stringify([guest.guest_name,guest.guest_server]);
  busyRef.current=true;setBusy(key);setActionError('');setMessage('');setIssued(null);
  try{
   const result=await request<Issued>(db,'/api/staff/halloween-campaign/issue',{method:'POST',body:JSON.stringify({spend_date:date,guest_name:guest.guest_name,guest_server:guest.guest_server})});
   if(!mountedRef.current)return;
   setIssued(result);setMessage(result.already_issued?'這位客人當日已發過贈品，已取回原本的取件碼。':'贈品取件碼已發放，愛梨可在「我的成品」上傳簽繪。');
  }catch(reason){if(mountedRef.current)setActionError(reason instanceof Error?reason.message:'發放結果無法確認，請重新讀取名單後確認。')}
  finally{
   busyRef.current=false;
   if(mountedRef.current){setBusy('');setData(null);setRevision(value=>value+1)}
  }
 }
 async function copy(code:string){
  try{await navigator.clipboard.writeText(code);setMessage(`已複製取件碼 ${code}。`)}
  catch{setActionError(`無法自動複製，請選取取件碼 ${code} 手動複製。`)}
 }
 function resetDraft(){
  if(busyRef.current)return;
  dirtyRef.current=false;setDirty(false);setDraft(config?draftOf(config):null);setActionError('');setMessage('');setRevision(value=>value+1);
 }
 const term=search.trim().toLocaleLowerCase('zh-TW');
 const guests=(data?.guests||[]).filter(guest=>(!term||`${guest.guest_name} ${guest.guest_server}`.toLocaleLowerCase('zh-TW').includes(term))&&(filter==='all'||filter==='qualified'&&guest.eligible&&!guest.claim||filter==='issued'&&Boolean(guest.claim)));
 const threshold=config?.threshold||400000;
 const title=config?.title||'愛梨・萬聖節滿額贈';
 const reward=config?.reward_name||'萬聖節特別版簽繪';
 return <div className={styles.root}>
  <section className={styles.card} aria-busy={loading&&!config}>
   <div className={styles.heading}><div><p className={styles.eyebrow}>HALLOWEEN WITH AIRI</p><h2>{title}</h2></div><span className={styles.status}>{config?campaignStatus(config):'讀取活動狀態中…'}</span></div>
   <p className={styles.description}>單日累計已完成消費滿 <b>{money(threshold)} Gil</b>，贈送一張{reward}。每天分開計算，同一角色及伺服器每日限領一張。</p>
   {draft&&<>
    <div className={styles.settings}>
     <label htmlFor="halloween-start">活動開始日期<input id="halloween-start" type="date" value={draft.starts_on} disabled={Boolean(busy)} onChange={event=>edit({starts_on:event.target.value})}/></label>
     <label htmlFor="halloween-end">活動結束日期<input id="halloween-end" type="date" value={draft.ends_on} min={draft.starts_on||undefined} disabled={Boolean(busy)} onChange={event=>edit({ends_on:event.target.value})}/></label>
    </div>
    <div className={styles.toggles}>
     <label><input type="checkbox" checked={draft.enabled} disabled={Boolean(busy)} onChange={event=>edit({enabled:event.target.checked,...(!event.target.checked?{published:false}:{})})}/><span><b>啟用活動</b><small>設定日期內的達標消費，經館主確認後可發放贈品取件碼。</small></span></label>
     <label><input type="checkbox" checked={draft.published} disabled={Boolean(busy)||!draft.enabled} onChange={event=>edit({published:event.target.checked})}/><span><b>在指名前台顯示活動</b><small>活動啟用、勾選公開並儲存後，才會在活動日期內顯示。</small></span></label>
    </div>
    <div className={styles.actions}><button type="button" disabled={Boolean(busy)||loading||Boolean(readError)||!dirty} onClick={()=>void save()}>{busy==='settings'?'儲存中…':'儲存活動設定'}</button><button type="button" className="ghost" disabled={Boolean(busy)||loading} onClick={resetDraft}>{dirty?'放棄修改並重新讀取':'重新讀取設定'}</button>{dirty&&<span className={styles.pending}>有尚未儲存的修改</span>}</div>
   </>}
   {readError&&<p className={styles.error} role="alert">{readError} <button type="button" className="ghost" disabled={Boolean(busy)} onClick={()=>setRevision(value=>value+1)}>重試</button></p>}
   {actionError&&<p className={styles.error} role="alert">{actionError}</p>}
   {message&&<p className={styles.message} role="status">{message}</p>}
  </section>

  <section className={styles.card} aria-labelledby="halloween-preview-title">
   <div className={styles.heading}><h3 id="halloween-preview-title">客人端預覽</h3><span className={styles.previewTag}>僅館主可見</span></div>
   <div className={styles.preview}>
    <span className={styles.eyebrow}>HALLOWEEN 2026</span><h3>{title}</h3><p>把今夜的回憶，留在一張萬聖節限定簽繪裡。</p>
    <div className={styles.offer}><span>單日累計任意消費滿</span><strong>{money(threshold)} <small>Gil</small></strong><b>贈一張{reward}</b></div>
    <p className={styles.dates}>{draft?.starts_on&&draft?.ends_on?`${draft.starts_on} ～ ${draft.ends_on}`:'活動日期待設定'}</p>
    <p className={styles.rules}>以台北日期計算，每人每日限一張，不同日不累加。餐點、酒品、指名、拍立得與團體遊戲皆可累計；僅計已完成消費，打賞不列入。達標後請向館主領取贈品取件碼。</p>
   </div>
  </section>

  <section className={styles.card} aria-labelledby="halloween-guests-title" aria-busy={loading}>
   <div className={styles.heading}><div><h3 id="halloween-guests-title">每日累計與贈品發放</h3><p className={styles.description}>依客人角色名稱＋伺服器分開統計，達標名單僅供館主查看。</p></div><button type="button" className="ghost" disabled={Boolean(busy)||loading} onClick={()=>setRevision(value=>value+1)}>更新名單</button></div>
   <div className={styles.toolbar}>
    <label htmlFor="halloween-spend-date">累計日期<input id="halloween-spend-date" type="date" max={todayTaipei()} value={date} disabled={Boolean(busy)} onChange={event=>{setDate(event.target.value);setIssued(null);setMessage('');setActionError('')}}/></label>
    <label htmlFor="halloween-guest-search">搜尋客人<input id="halloween-guest-search" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="角色名稱或伺服器"/></label>
    <label htmlFor="halloween-guest-filter">查看名單<select id="halloween-guest-filter" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">全部消費客人</option><option value="qualified">達標待發放</option><option value="issued">已發取件碼</option></select></label>
   </div>
   <div className={styles.metrics}><div><span>當日消費客人</span><b>{loading?'—':data?.summary.total_guests??'—'}</b></div><div><span>達標人數</span><b>{loading?'—':data?.summary.qualified_guests??'—'}</b></div><div><span>已發取件碼</span><b>{loading?'—':data?.summary.issued_count??'—'}</b></div></div>
   {config&&!config.enabled&&<p className={styles.notice}>目前為草稿，可預覽每日累計；啟用活動並設定日期後，才能發放贈品。</p>}
   {dirty&&<p className={styles.notice}>請先儲存活動設定或放棄修改，再進行贈品發放。</p>}
   {issued&&<div className={styles.issued} role="status"><div><span>{issued.guest_name}・{issued.guest_server}｜{issued.spend_date}</span><strong>{issued.pickup_code}</strong><small>交給客人保存，完成簽繪後可於成品領取頁查詢。</small></div><button type="button" className="ghost" onClick={()=>void copy(issued.pickup_code)}>複製取件碼</button></div>}
   {loading?<p className={styles.empty}>正在讀取這一天的消費與發放紀錄…</p>:readError?<p className={styles.empty}>尚未取得最新名單，請重試讀取。</p>:!guests.length?<p className={styles.empty}>{data?.guests.length?'沒有符合搜尋條件的客人。':'這一天還沒有可累計的已完成消費。'}</p>:<div className={styles.tableWrap}>
    <table className={styles.table}><caption className={styles.srOnly}>{date} 的萬聖節累計消費與贈品發放紀錄</caption><thead><tr><th scope="col">客人／伺服器</th><th scope="col">已完成消費</th><th scope="col">達標進度</th><th scope="col">贈品狀態</th><th scope="col">操作</th></tr></thead><tbody>{guests.map(guest=>{
     const key=JSON.stringify([guest.guest_name,guest.guest_server]),remaining=Math.max(0,threshold-guest.total),progress=Math.min(100,Math.max(0,guest.total/threshold*100));
     return <tr key={key}><th scope="row"><b>{guest.guest_name}</b><small>{guest.guest_server||'未記錄伺服器・需核對'}</small></th><td><strong>{money(guest.total)} Gil</strong><small>指名 {money(guest.reservation_total)}<br/>餐點／加購 {money(guest.dining_total)}<br/>團體遊戲 {money(guest.game_total)}</small></td><td><div className={styles.progress} role="progressbar" aria-label={`${guest.guest_name} 的滿額進度`} aria-valuemin={0} aria-valuemax={threshold} aria-valuenow={Math.min(threshold,guest.total)} aria-valuetext={remaining?`尚差 ${money(remaining)} Gil`:'已達滿額門檻'}><span style={{width:`${progress}%`}}/></div><small>{!guest.guest_server?'需核對伺服器':remaining?`尚差 ${money(remaining)} Gil`:'已達滿額門檻'}</small></td><td>{guest.claim?<><b className={styles.claimed}>{guest.claim.pickup_status==='ready'?'成品已上傳':'已發取件碼'}</b><code>{guest.claim.pickup_code}</code><small>發放時累計 {money(guest.claim.qualifying_total)} Gil</small></>:<b className={guest.eligible?styles.qualified:styles.muted}>{guest.eligible?'達標・待發放':'尚未達標'}</b>}</td><td>{guest.claim?<button type="button" className="ghost" onClick={()=>void copy(guest.claim!.pickup_code)}>複製取件碼</button>:<button type="button" disabled={!guest.can_issue||Boolean(busy)||dirty||loading||Boolean(readError)} onClick={()=>void issue(guest)}>{busy===key?'發放中…':'發放贈品取件碼'}</button>}</td></tr>;
    })}</tbody></table>
   </div>}
   <p className={styles.footnote}>每日 00:00～23:59（台北時間）獨立計算。只納入已完成的訂單與服務，續時按原指名累計，取消與打賞不列入。成品取件碼不會增加消費金額；發放前系統會再核對最新消費，避免重複發放。</p>
  </section>
 </div>;
}
