import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

function taipeiDateKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function isMonday(dateKey:string){return new Date(`${dateKey}T12:00:00+08:00`).getUTCDay()===1}

export async function GET() {
  try {
    const db = adminSupabase();const today=taipeiDateKey();
    const [{data,error},{data:calendarOff,error:calendarOffError},{data:closure,error:closureError}]=await Promise.all([
      db.from('staff').select('id,slug,name,role,sort_order').eq('active',true).order('sort_order',{ascending:true}),
      db.from('staff_work_calendar').select('staff_id').eq('work_date',today).eq('status','off'),
      db.from('venue_closures').select('work_date').eq('work_date',today).maybeSingle(),
    ]);
    if(error)throw error;if(calendarOffError)throw calendarOffError;if(closureError)throw closureError;
    if(isMonday(today)||closure)return NextResponse.json({staff:[],venue_closed:true},{headers:{'Cache-Control':'no-store, max-age=0'}});
    const offIds=new Set((calendarOff||[]).map((x:any)=>String(x.staff_id)));
    const available=(data||[]).filter((x:any)=>!offIds.has(String(x.id)));
    // 副館主只作為送餐選項；沿用館主的接單與休假狀態，不新增帳號或薪資人頭。
    const staff=available.flatMap((row:any)=>row.slug==='riku'?[row,{
      id:'croseviel',slug:'croseviel',name:'克羅塞維爾',role:'副館主',
      sort_order:row.sort_order,availability_staff_id:row.id
    }]:[row]);
    return NextResponse.json({staff},{headers:{'Cache-Control':'no-store, max-age=0'}});
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取送餐館員失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
