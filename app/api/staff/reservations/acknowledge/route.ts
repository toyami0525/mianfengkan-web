import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

const TERMINAL=['completed','cancelled','rejected','已完成','已取消','已拒絕'];

async function accountFrom(req:NextRequest){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return null;
  const db=adminSupabase();
  const{data:{user}}=await db.auth.getUser(token);if(!user)return null;
  const{data:account}=await db.from('staff_accounts').select('role,staff_id,active').eq('user_id',user.id).eq('active',true).maybeSingle();
  return account?{db,account}:null;
}
function taipeiStamp(date:Date){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)}

export async function POST(req:NextRequest){
  try{
    const auth=await accountFrom(req);if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
    const body=await req.json();const reservationId=String(body.reservation_id||'').trim();
    if(!reservationId)return NextResponse.json({error:'缺少指名資料'},{status:400});
    const{db,account}=auth;
    if(account.role==='frontdesk')return NextResponse.json({error:'櫃台帳號不能替館員確認指名服務'},{status:403});

    const{data:reservation,error:reservationError}=await db.from('reservations').select('id,guest_name,staff_id,staff_name,service_name,price,starts_at,ends_at,note,status').eq('id',reservationId).maybeSingle();
    if(reservationError)throw reservationError;if(!reservation)return NextResponse.json({error:'找不到這筆指名服務'},{status:404});
    if(account.role!=='owner'&&account.staff_id!==reservation.staff_id)return NextResponse.json({error:'只能確認自己的指名服務'},{status:403});
    if(TERMINAL.includes(String(reservation.status)))return NextResponse.json({error:'這筆服務已經結束或取消'},{status:400});
    if(String(reservation.status)!=='pending')return NextResponse.json({error:'這筆指名已經確認過或狀態已變更'},{status:409});

    const now=new Date();
    const confirmLine=`[確認 ${taipeiStamp(now)}] 館員已確認指名；尚未開始計時`;
    const nextNote=[reservation.note,confirmLine].filter(Boolean).join('\n');
    const{data:updated,error:updateError}=await db.from('reservations').update({status:'accepted',note:nextNote}).eq('id',reservation.id).eq('status','pending').select('*').maybeSingle();
    if(updateError)throw updateError;if(!updated)return NextResponse.json({error:'這筆指名剛剛已被其他人更新，請重新整理後再試'},{status:409});
    return NextResponse.json({ok:true,reservation:updated});
  }catch(error){console.error('acknowledge reservation failed',error);return NextResponse.json({error:error instanceof Error?error.message:'確認指名失敗，請稍後再試'},{status:500})}
}
