import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

const INACTIVE_STATUSES = ['completed','cancelled','rejected','已完成','已取消','已拒絕'];

export async function GET() {
  try {
    const db = adminSupabase();
    const [{data:staff,error:staffError},{data:unavailability,error:leaveError},{data:reservations,error:reservationError},{data:testSetting,error:testSettingError}] = await Promise.all([
      db.from('staff').select('id,slug,name,role,services,sort_order').eq('active',true).eq('accepting_reservations',true).order('sort_order',{ascending:true}),
      db.from('staff_unavailability').select('staff_id,starts_at,ends_at,recurrence'),
      db.from('reservations').select('staff_id,starts_at,ends_at,status').not('status','in',`(${INACTIVE_STATUSES.join(',')})`).order('starts_at',{ascending:true}),
      db.from('site_settings').select('value').eq('key','booking_test_mode').maybeSingle(),
    ]);
    if(staffError) throw staffError;
    if(leaveError) throw leaveError;
    if(reservationError) throw reservationError;
    if(testSettingError) throw testSettingError;
    const blocks=[
      ...(unavailability||[]).map((x:any)=>({staff_id:x.staff_id,start_at:x.starts_at,end_at:x.ends_at,recurrence:x.recurrence,block_type:'unavailable'})),
      ...(reservations||[]).map((x:any)=>({staff_id:x.staff_id,start_at:x.starts_at,end_at:x.ends_at,status:x.status,block_type:'reservation'})),
    ];
    const testValue=(testSetting as any)?.value;
    const testMode=testValue===true||testValue?.enabled===true;
    return NextResponse.json({staff:staff||[],blocks,test_mode:testMode},{headers:{'Cache-Control':'no-store, max-age=0'}});
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取可指名資料失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
