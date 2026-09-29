import type {SupabaseClient} from '@supabase/supabase-js';

export type VenueClosureRow={id:string;work_date:string;reason:string;updated_at:string};
export type VenueClosureChange={work_date:string;closed:boolean;row:VenueClosureRow|null};

export function taipeiClosureDate(now=new Date()):string{
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validClosureDate(value:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return false;
 const date=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function fixedClosureDate(value:string):boolean{
 return validClosureDate(value)&&new Date(`${value}T12:00:00+08:00`).getUTCDay()===1;
}
async function tokenFor(db:SupabaseClient):Promise<string>{
 const{data:{session},error}=await db.auth.getSession();
 if(error||!session)throw new Error('登入已失效，請重新登入');
 return session.access_token;
}
export async function readVenueClosure(db:SupabaseClient,workDate:string,signal?:AbortSignal):Promise<VenueClosureChange>{
 if(!validClosureDate(workDate))throw new Error('請選擇有效的休館日期');
 const token=await tokenFor(db);
 const response=await fetch(`/api/staff/calendar?month=${encodeURIComponent(workDate.slice(0,7))}`,{
  cache:'no-store',headers:{Authorization:`Bearer ${token}`},signal,
 });
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'讀取休館狀態失敗');
 // 缺少資料不等於正常營業；禁止使用不完整回應解鎖儲存按鈕。
 if(!Array.isArray(result.closures))throw new Error('無法確認此日期的休館狀態，請重試讀取');
 const row=result.closures.find((item:VenueClosureRow)=>item?.work_date===workDate)||null;
 return {work_date:workDate,closed:Boolean(row),row};
}
export async function saveVenueClosure(db:SupabaseClient,workDate:string,closed:boolean):Promise<VenueClosureChange>{
 // 不讓空白日期落入舊 API 的「今天」預設值。
 if(!validClosureDate(workDate))throw new Error('請選擇有效的休館日期');
 if(fixedClosureDate(workDate))throw new Error('每週一已是全館固定休館，不需另外設定');
 if(typeof closed!=='boolean')throw new Error('休館狀態格式錯誤');
 const token=await tokenFor(db);
 const response=await fetch('/api/staff/calendar/closure',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
  body:JSON.stringify({work_date:workDate,closed}),
 });
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'更新臨時休館失敗');
 if(result.ok!==true||result.work_date!==workDate||result.closed!==closed||(closed&&result.row?.work_date!==workDate)){
  throw new Error('無法確認指定日期是否儲存成功，請重試讀取後確認');
 }
 return {work_date:workDate,closed,row:closed?result.row:null};
}
