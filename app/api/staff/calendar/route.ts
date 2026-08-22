import {NextRequest,NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';

function monthBounds(month:string){
 if(!/^\d{4}-\d{2}$/.test(month))return null;
 const[y,m]=month.split('-').map(Number);if(m<1||m>12)return null;
 const start=`${month}-01`,nextDate=new Date(Date.UTC(y,m,1));
 const next=`${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth()+1).padStart(2,'0')}-01`;
 return {start,next};
}
async function accountFrom(req:NextRequest){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return null;
 const db=adminSupabase();const{data:{user}}=await db.auth.getUser(token);if(!user)return null;
 const{data:account}=await db.from('staff_accounts').select('role,staff_id,active').eq('user_id',user.id).eq('active',true).maybeSingle();
 return account?{db,account}:null;
}
export async function GET(req:NextRequest){
 try{
  const auth=await accountFrom(req);if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
  if(!['owner','staff'].includes(String(auth.account.role)))return NextResponse.json({error:'沒有排班月曆權限'},{status:403});
  const month=req.nextUrl.searchParams.get('month')||'';const bounds=monthBounds(month);if(!bounds)return NextResponse.json({error:'月份格式錯誤'},{status:400});
  let staffQuery=auth.db.from('staff').select('id,name,slug,active').eq('active',true).order('name',{ascending:true});
  if(auth.account.role==='staff'){if(!auth.account.staff_id)return NextResponse.json({error:'帳號未綁定館員'},{status:403});staffQuery=staffQuery.eq('id',auth.account.staff_id)}
  const{data:staff,error:staffError}=await staffQuery;if(staffError)throw staffError;const ids=(staff||[]).map(x=>x.id);
  if(!ids.length)return NextResponse.json({staff:[],rows:[]});
  const{data:rows,error}=await auth.db.from('staff_work_calendar').select('id,staff_id,work_date,status,updated_at').in('staff_id',ids).gte('work_date',bounds.start).lt('work_date',bounds.next).order('work_date',{ascending:true});if(error)throw error;
  return NextResponse.json({staff:staff||[],rows:rows||[]});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'讀取排班月曆失敗'},{status:500})}
}
export async function POST(req:NextRequest){
 try{
  const auth=await accountFrom(req);if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
  if(!['owner','staff'].includes(String(auth.account.role)))return NextResponse.json({error:'沒有修改排班權限'},{status:403});
  const body=await req.json();let staffId=String(body?.staff_id||'');const workDate=String(body?.work_date||''),status=body?.status==null?null:String(body.status);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate))return NextResponse.json({error:'日期格式錯誤'},{status:400});
  if(status!==null&&!['working','off'].includes(status))return NextResponse.json({error:'排班狀態錯誤'},{status:400});
  if(auth.account.role==='staff'){staffId=String(auth.account.staff_id||'');if(!staffId)return NextResponse.json({error:'帳號未綁定館員'},{status:403})}
  if(!staffId)return NextResponse.json({error:'請選擇館員'},{status:400});
  const{data:staff}=await auth.db.from('staff').select('id').eq('id',staffId).eq('active',true).maybeSingle();if(!staff)return NextResponse.json({error:'找不到館員'},{status:404});
  if(status===null){const{error}=await auth.db.from('staff_work_calendar').delete().eq('staff_id',staffId).eq('work_date',workDate);if(error)throw error;return NextResponse.json({ok:true,row:null})}
  const now=new Date().toISOString();const{data:row,error}=await auth.db.from('staff_work_calendar').upsert({staff_id:staffId,work_date:workDate,status,updated_at:now},{onConflict:'staff_id,work_date'}).select('id,staff_id,work_date,status,updated_at').single();if(error)throw error;
  return NextResponse.json({ok:true,row});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'更新排班失敗'},{status:500})}
}
