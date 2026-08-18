import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

const SERVICE_INFO:Record<string,{price:number;duration:number}>={
  '泡湯洗浴':{price:150000,duration:15},
  '按摩服務':{price:100000,duration:15},
  '耳語陪伴':{price:100000,duration:15},
};
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
function taipeiStamp(date:Date){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)}

export async function POST(req:NextRequest){
  try{
    const auth=await accountFrom(req);if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
    const body=await req.json();const reservationId=String(body.reservation_id||'').trim(),serviceName=String(body.service_name||'').trim();
    const info=SERVICE_INFO[serviceName];if(!reservationId||!info)return NextResponse.json({error:'續時資料不完整或服務項目不正確'},{status:400});
    const{db,account}=auth;
    if(account.role==='frontdesk')return NextResponse.json({error:'櫃台帳號不能替館員執行續時'},{status:403});
    const{data:reservation,error:reservationError}=await db.from('reservations').select('id,guest_name,staff_id,staff_name,service_name,price,starts_at,ends_at,note,status').eq('id',reservationId).maybeSingle();
    if(reservationError)throw reservationError;if(!reservation)return NextResponse.json({error:'找不到這筆指名服務'},{status:404});
    if(account.role!=='owner'&&account.staff_id!==reservation.staff_id)return NextResponse.json({error:'只能替自己的指名服務續時'},{status:403});
    if(TERMINAL.includes(String(reservation.status)))return NextResponse.json({error:'已結束或取消的服務不能續時'},{status:400});
    if(!['confirmed','已確認'].includes(String(reservation.status)))return NextResponse.json({error:'請先按「開始」，服務開始後才能續時'},{status:400});
    const start=new Date(reservation.starts_at),oldEnd=new Date(reservation.ends_at),now=new Date();
    if(Number.isNaN(start.getTime())||Number.isNaN(oldEnd.getTime()))return NextResponse.json({error:'原服務時間資料不正確'},{status:400});
    if(now<start)return NextResponse.json({error:'服務尚未開始，開始後才能續時'},{status:400});

    // 續時視為追加服務：只要是系統支援的續時項目就可自由選擇，
    // 不綁原本服務，也不再以 staff.services / 特定館員服務限制阻擋。

    const newEnd=new Date(oldEnd.getTime()+info.duration*60000);
    const{data:testSetting,error:testError}=await db.from('site_settings').select('value').eq('key','booking_test_mode').maybeSingle();if(testError)throw testError;
    const testValue=(testSetting as any)?.value,bookingTestMode=testValue===true||testValue?.enabled===true;
    if(!bookingTestMode){
      const shifted=new Date(start.getTime()+TAIPEI_OFFSET_MS);const closeAt=new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate(),16,0,0,0));
      if(newEnd>closeAt)return NextResponse.json({error:'正式營業模式下，續時後服務必須在 24:00 前結束'},{status:400});
    }

    const extensionLine=`[續時 ${taipeiStamp(now)}] ${serviceName} +${info.duration} 分鐘 / +${info.price.toLocaleString('zh-TW')} Gil`;
    const nextNote=[reservation.note,extensionLine].filter(Boolean).join('\n');
    const nextServiceName=`${reservation.service_name}＋續時：${serviceName}`;
    const nextPrice=Number(reservation.price||0)+info.price;
    const{data:updated,error:updateError}=await db.from('reservations').update({ends_at:newEnd.toISOString(),price:nextPrice,service_name:nextServiceName,note:nextNote}).eq('id',reservation.id).eq('ends_at',reservation.ends_at).select('*').maybeSingle();
    if(updateError)throw updateError;if(!updated)return NextResponse.json({error:'這筆服務剛剛已被更新，請重新整理後再試'},{status:409});
    return NextResponse.json({ok:true,reservation:updated,extension:{service_name:serviceName,duration_minutes:info.duration,price:info.price}});
  }catch(error){console.error('extend reservation failed',error);return NextResponse.json({error:error instanceof Error?error.message:'續時失敗，請稍後再試'},{status:500})}
}
