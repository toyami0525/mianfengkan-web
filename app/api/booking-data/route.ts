import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

const INACTIVE_STATUSES = ['completed','cancelled','rejected','已完成','已取消','已拒絕'];

export async function GET() {
  try {
    const db = adminSupabase();
    const nowShifted=new Date(Date.now()+8*60*60*1000);
    const dayStartUtc=new Date(Date.UTC(nowShifted.getUTCFullYear(),nowShifted.getUTCMonth(),nowShifted.getUTCDate())-8*60*60*1000);
    const dayEndUtc=new Date(dayStartUtc.getTime()+24*60*60*1000);
    const [{data:staff,error:staffError},{data:unavailability,error:leaveError},{data:reservations,error:reservationError},{data:settings,error:settingsError},{count:linaSignedCount,error:linaCountError}] = await Promise.all([
      db.from('staff').select('id,slug,name,role,services,sort_order').eq('active',true).eq('accepting_reservations',true).order('sort_order',{ascending:true}),
      db.from('staff_unavailability').select('staff_id,starts_at,ends_at,recurrence'),
      db.from('reservations').select('staff_id,starts_at,ends_at,status').not('status','in',`(${INACTIVE_STATUSES.join(',')})`).order('starts_at',{ascending:true}),
      db.from('site_settings').select('key,value').in('key',['booking_test_mode','yukinoji_chibi_accepting']),
      db.from('polaroid_pickups').select('id',{count:'exact',head:true}).eq('item_type','lina_signed_polaroid').gte('created_at',dayStartUtc.toISOString()).lt('created_at',dayEndUtc.toISOString()),
    ]);
    if(staffError) throw staffError;
    if(leaveError) throw leaveError;
    if(reservationError) throw reservationError;
    if(settingsError) throw settingsError;
    if(linaCountError) throw linaCountError;
    const blocks=[
      ...(unavailability||[]).map((x:any)=>({staff_id:x.staff_id,start_at:x.starts_at,end_at:x.ends_at,recurrence:x.recurrence,block_type:'unavailable'})),
      ...(reservations||[]).map((x:any)=>({staff_id:x.staff_id,start_at:x.starts_at,end_at:x.ends_at,status:x.status,block_type:'reservation'})),
    ];
    const settingMap=Object.fromEntries((settings||[]).map((row:any)=>[row.key,row.value]));
    const testValue=settingMap.booking_test_mode;
    const testMode=testValue===true||testValue?.enabled===true;
    const chibiValue=settingMap.yukinoji_chibi_accepting;
    const yukinojiChibiAccepting=chibiValue===undefined?true:(chibiValue===true||chibiValue?.enabled===true);
    const linaSignedRemaining=Math.max(0,3-Number(linaSignedCount||0));
    return NextResponse.json({staff:staff||[],blocks,test_mode:testMode,yukinoji_chibi_accepting:yukinojiChibiAccepting,lina_signed_remaining:linaSignedRemaining},{headers:{'Cache-Control':'no-store, max-age=0'}});
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取可指名資料失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
