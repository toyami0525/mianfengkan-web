import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

const INACTIVE_STATUSES = ['completed','cancelled','rejected','已完成','已取消','已拒絕'];
function taipeiDateKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function isMonday(dateKey:string){return new Date(`${dateKey}T12:00:00+08:00`).getUTCDay()===1}

export async function GET() {
  try {
    const db = adminSupabase();
    const today=taipeiDateKey();
    const [{data:staff,error:staffError},{data:reservations,error:reservationError},{data:settings,error:settingsError},{data:closure,error:closureError},{data:calendarOff,error:calendarOffError}] = await Promise.all([
      db.from('staff').select('id,slug,name,role,services,sort_order').eq('active',true).eq('accepting_reservations',true).order('sort_order',{ascending:true}),
      db.from('reservations').select('staff_id,starts_at,ends_at,status').not('status','in',`(${INACTIVE_STATUSES.join(',')})`).order('starts_at',{ascending:true}),
      db.from('site_settings').select('key,value').in('key',['booking_test_mode','yukinoji_chibi_accepting']),
      db.from('venue_closures').select('work_date,reason').eq('work_date',today).maybeSingle(),
      db.from('staff_work_calendar').select('staff_id').eq('work_date',today).eq('status','off'),
    ]);
    if(staffError) throw staffError;
    if(reservationError) throw reservationError;
    if(settingsError) throw settingsError;
    if(closureError) throw closureError;
    if(calendarOffError) throw calendarOffError;
    const blocks=(reservations||[]).map((x:any)=>({staff_id:x.staff_id,start_at:x.starts_at,end_at:x.ends_at,status:x.status,block_type:'reservation'}));
    const settingMap=Object.fromEntries((settings||[]).map((row:any)=>[row.key,row.value]));
    const testValue=settingMap.booking_test_mode;
    const testMode=testValue===true||testValue?.enabled===true;
    const chibiValue=settingMap.yukinoji_chibi_accepting;
    const yukinojiChibiAccepting=chibiValue===undefined?true:(chibiValue===true||chibiValue?.enabled===true);
    const venueClosed=isMonday(today)||Boolean(closure);const venueClosedReason=isMonday(today)?'每週一固定休館':closure?.reason||'';
    const offIds=new Set((calendarOff||[]).map((x:any)=>String(x.staff_id)));const availableStaff=(staff||[]).filter((x:any)=>!offIds.has(String(x.id)));
    return NextResponse.json({staff:availableStaff,blocks,test_mode:testMode,yukinoji_chibi_accepting:yukinojiChibiAccepting,venue_closed:venueClosed,venue_closed_reason:venueClosedReason},{headers:{'Cache-Control':'no-store, max-age=0'}});
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取可指名資料失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
