import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

const TERMINAL=['completed','cancelled','rejected','已完成','已取消','已拒絕'];
const TAIPEI_OFFSET_MS=8*60*60*1000;

async function accountFrom(req:NextRequest){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return null;
  const db=adminSupabase();
  const{data:{user}}=await db.auth.getUser(token);if(!user)return null;
  const{data:account}=await db.from('staff_accounts').select('role,staff_id,active').eq('user_id',user.id).eq('active',true).maybeSingle();
  return account?{db,account}:null;
}
function taipeiStamp(date:Date){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)}
function midnightAfterTaipeiDate(date:Date){
  const shifted=new Date(date.getTime()+TAIPEI_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate(),16,0,0,0));
}

export async function POST(req:NextRequest){
  try{
    const auth=await accountFrom(req);if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
    const body=await req.json();const reservationId=String(body.reservation_id||'').trim();
    if(!reservationId)return NextResponse.json({error:'缺少指名資料'},{status:400});
    const{db,account}=auth;
    if(account.role==='frontdesk')return NextResponse.json({error:'櫃台帳號不能開始館員的指名服務'},{status:403});

    const{data:reservation,error:reservationError}=await db.from('reservations').select('id,guest_name,staff_id,staff_name,service_name,price,starts_at,ends_at,note,status').eq('id',reservationId).maybeSingle();
    if(reservationError)throw reservationError;if(!reservation)return NextResponse.json({error:'找不到這筆指名服務'},{status:404});
    if(account.role!=='owner'&&account.staff_id!==reservation.staff_id)return NextResponse.json({error:'只能開始自己的指名服務'},{status:403});
    if(TERMINAL.includes(String(reservation.status)))return NextResponse.json({error:'這筆服務已經結束或取消'},{status:400});
    if(String(reservation.status)!=='accepted')return NextResponse.json({error:'請先按「確認」，確認後才能開始服務計時'},{status:409});

    const oldStart=new Date(reservation.starts_at),oldEnd=new Date(reservation.ends_at),now=new Date();
    if(Number.isNaN(oldStart.getTime())||Number.isNaN(oldEnd.getTime())||oldEnd<=oldStart)return NextResponse.json({error:'原服務時間資料不正確'},{status:400});
    const durationMs=oldEnd.getTime()-oldStart.getTime();
    const newStart=now,newEnd=new Date(now.getTime()+durationMs);

    const{data:testSetting,error:testError}=await db.from('site_settings').select('value').eq('key','booking_test_mode').maybeSingle();if(testError)throw testError;
    const testValue=(testSetting as any)?.value,bookingTestMode=testValue===true||testValue?.enabled===true;
    if(!bookingTestMode&&newEnd>midnightAfterTaipeiDate(now))return NextResponse.json({error:'正式營業模式下，現在開始後會超過 24:00，無法開始服務'},{status:400});

    const startLine=`[實際開始 ${taipeiStamp(now)}] 館員按下開始後正式計時；原預約時間 ${taipeiStamp(oldStart)}`;
    const nextNote=[reservation.note,startLine].filter(Boolean).join('\n');
    const{data:updated,error:updateError}=await db.from('reservations').update({status:'confirmed',starts_at:newStart.toISOString(),ends_at:newEnd.toISOString(),note:nextNote}).eq('id',reservation.id).eq('status','accepted').select('*').maybeSingle();
    if(updateError)throw updateError;if(!updated)return NextResponse.json({error:'這筆服務剛剛已被其他人更新，請重新整理後再試'},{status:409});
    return NextResponse.json({ok:true,reservation:updated,duration_minutes:Math.round(durationMs/60000)});
  }catch(error){console.error('start reservation failed',error);return NextResponse.json({error:error instanceof Error?error.message:'開始服務失敗，請稍後再試'},{status:500})}
}
