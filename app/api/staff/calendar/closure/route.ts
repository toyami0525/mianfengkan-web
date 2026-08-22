import {NextRequest,NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';

function taipeiDateKey(date=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
async function ownerFrom(req:NextRequest){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return null;
 const db=adminSupabase();const{data:{user}}=await db.auth.getUser(token);if(!user)return null;
 const{data:account}=await db.from('staff_accounts').select('role,active').eq('user_id',user.id).eq('active',true).maybeSingle();
 return account?.role==='owner'?{db,account}:null;
}
export async function POST(req:NextRequest){
 try{
  const auth=await ownerFrom(req);if(!auth)return NextResponse.json({error:'只有館主可以設定臨時休館'},{status:403});
  const body=await req.json().catch(()=>({}));const workDate=String(body?.work_date||taipeiDateKey());const closed=body?.closed===true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate))return NextResponse.json({error:'日期格式錯誤'},{status:400});
  const weekday=new Date(`${workDate}T12:00:00+08:00`).getUTCDay();
  if(weekday===1)return NextResponse.json({error:'每週一已是固定休館，不需要再設定臨時休館'},{status:400});
  if(!closed){const{error}=await auth.db.from('venue_closures').delete().eq('work_date',workDate);if(error)throw error;return NextResponse.json({ok:true,closed:false,row:null,work_date:workDate})}
  const now=new Date().toISOString();const{data:row,error}=await auth.db.from('venue_closures').upsert({work_date:workDate,reason:'臨時休館',updated_at:now},{onConflict:'work_date'}).select('id,work_date,reason,updated_at').single();if(error)throw error;
  return NextResponse.json({ok:true,closed:true,row,work_date:workDate});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'更新臨時休館失敗'},{status:500})}
}
