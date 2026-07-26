'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Row=Record<string,any>;
const tabs=[['dashboard','總覽'],['staff','館員管理'],['schedule','排班／請假'],['reservations','預約管理'],['orders','點餐管理'],['announcements','公告管理'],['settings','網站設定']];
const labels:Record<string,string>={guest_name:'客人',contact:'聯絡方式',staff_name:'指名館員',service_name:'服務',starts_at:'預約時間',status:'狀態',note:'備註',items:'點餐內容',total:'總金額',created_at:'送出時間',name:'姓名',role:'職位',active:'前台顯示',accepting_reservations:'接受預約',staff_id:'館員 ID',ends_at:'結束時間',reason:'原因',title:'標題',content:'內容',published:'公開',key:'設定項目',value:'設定內容',updated_at:'更新時間'};
const statusText:Record<string,string>={pending:'待確認',confirmed:'已確認',completed:'已完成',cancelled:'已取消',rejected:'已拒絕'};

export default function AdminApp(){
 const[ready,setReady]=useState(false),[tab,setTab]=useState('dashboard'),[data,setData]=useState<Record<string,Row[]>>({}),[msg,setMsg]=useState(''),[busy,setBusy]=useState('');
 const db=useMemo(()=>supabase(),[]);
 async function load(){
  setMsg('讀取中…');
  const names=['staff','staff_unavailability','reservations','orders','announcements','site_settings'];
  const out:Record<string,Row[]>={};
  for(const n of names){
   const{data,error}=await db.from(n).select('*').order('created_at',{ascending:false});
   if(error){console.error(n,error);out[n]=[];}else out[n]=data||[];
  }
  setData(out);setMsg('');
 }
 useEffect(()=>{db.auth.getUser().then(({data})=>{if(!data.user){location.href='/login';return}setReady(true);load()})},[]);
 async function logout(){await db.auth.signOut();location.href='/login'}
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
 if(!ready)return <main className="admin-loading">確認登入狀態…</main>;
 const reservations=data.reservations||[],orders=data.orders||[],staff=data.staff||[];
 return <div className="admin-shell"><aside className="admin-side"><div className="admin-brand"><span>楓</span><div><b>眠楓館</b><small>ADMINISTRATION</small></div></div><nav>{tabs.map(([k,v])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{v}</button>)}</nav><div className="side-bottom"><a href="/index.html">查看網站</a><button onClick={logout}>登出</button></div></aside><main className="admin-main"><header><div><p className="eyebrow">MIANFENGKAN</p><h1>{tabs.find(x=>x[0]===tab)?.[1]}</h1></div><button className="ghost" onClick={load}>重新整理</button></header>{msg&&<p className="admin-message">{msg}</p>}
 {tab==='dashboard'&&<><section className="stats"><article><b>{reservations.length}</b><span>全部預約</span></article><article><b>{reservations.filter(x=>x.status==='pending').length}</b><span>待確認</span></article><article><b>{orders.length}</b><span>點餐紀錄</span></article><article><b>{staff.filter(x=>x.active).length}</b><span>在籍館員</span></article></section><Panel title="近期預約"><Table rows={reservations.slice(0,8)} keys={['guest_name','staff_name','service_name','starts_at','status']}/></Panel></>}
 {tab==='staff'&&<Panel title="館員資料" action={<button onClick={()=>quickAdd('staff')}>新增館員</button>}><Table rows={staff} keys={['name','role','active','accepting_reservations']} actions={(r)=><button disabled={busy===`staff:${r.id}`} onClick={()=>remove('staff',r.id)}>刪除</button>}/></Panel>}
 {tab==='schedule'&&<Panel title="不可預約時段" action={<button onClick={()=>quickAdd('leave')}>新增請假</button>}><Table rows={data.staff_unavailability||[]} keys={['staff_id','starts_at','ends_at','reason']} actions={r=><button disabled={busy===`staff_unavailability:${r.id}`} onClick={()=>remove('staff_unavailability',r.id)}>刪除</button>}/></Panel>}
 {tab==='reservations'&&<Panel title="預約紀錄"><Table rows={reservations} keys={['guest_name','contact','staff_name','service_name','starts_at','status','note']} actions={r=><><button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'confirmed')}>確認</button><button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'completed')}>完成</button><button disabled={busy===`reservations:${r.id}`} onClick={()=>status('reservations',r.id,'cancelled')}>取消</button></>}/></Panel>}
 {tab==='orders'&&<Panel title="點餐紀錄"><Table rows={orders} keys={['guest_name','items','total','status','created_at']} actions={r=><><button disabled={busy===`orders:${r.id}`} onClick={()=>status('orders',r.id,'completed')}>完成</button><button disabled={busy===`orders:${r.id}`} onClick={()=>status('orders',r.id,'cancelled')}>取消</button></>}/></Panel>}
 {tab==='announcements'&&<Panel title="公告" action={<button onClick={()=>quickAdd('announcement')}>新增公告</button>}><Table rows={data.announcements||[]} keys={['title','content','published','created_at']} actions={r=><button disabled={busy===`announcements:${r.id}`} onClick={()=>remove('announcements',r.id)}>刪除</button>}/></Panel>}
 {tab==='settings'&&<Panel title="網站設定"><Table rows={data.site_settings||[]} keys={['key','value','updated_at']}/><p className="hint">可在 Supabase Table Editor 修改店名、Discord、營業狀態與營業時間；下一版會加入完整表單與圖片上傳。</p></Panel>}
 </main></div>
}
function Panel({title,action,children}:{title:string,action?:React.ReactNode,children:React.ReactNode}){return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>}
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
function Table({rows,keys,actions}:{rows:Row[],keys:string[],actions?:(r:Row)=>React.ReactNode}){if(!rows.length)return <div className="empty">目前沒有資料</div>;return <div className="table-wrap"><table><thead><tr>{keys.map(k=><th key={k}>{labels[k]||k}</th>)}{actions&&<th>操作</th>}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}>{keys.map(k=><td key={k}>{formatCell(k,r[k])}</td>)}{actions&&<td className="actions">{actions(r)}</td>}</tr>)}</tbody></table></div>}
