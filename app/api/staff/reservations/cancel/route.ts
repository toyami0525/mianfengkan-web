import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

async function accountFrom(req:NextRequest){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return null;
  const db=adminSupabase();
  const{data:{user}}=await db.auth.getUser(token);
  if(!user)return null;
  const{data:account}=await db.from('staff_accounts').select('role,staff_id,active').eq('user_id',user.id).eq('active',true).maybeSingle();
  return account?{db,account}:null;
}

export async function POST(req:NextRequest){
  try{
    const auth=await accountFrom(req);
    if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});

    const body=await req.json();
    const reservationId=String(body.reservation_id||'').trim();
    if(!reservationId)return NextResponse.json({error:'缺少指名資料'},{status:400});

    const{db,account}=auth;
    const{data:reservation,error:reservationError}=await db.from('reservations').select('id,staff_id,status,service_name').eq('id',reservationId).maybeSingle();
    if(reservationError)throw reservationError;
    if(!reservation)return NextResponse.json({error:'找不到這筆指名服務'},{status:404});

    if(account.role==='staff'&&String(account.staff_id||'')!==String(reservation.staff_id||'')){
      return NextResponse.json({error:'只能取消自己的指名服務'},{status:403});
    }

    // 取消指名時，成品管理不應留下「等待上傳」的孤兒紀錄。
    // 先刪除該指名關聯的成品圖片與 polaroid_pickups，
    // 再保留 reservation 本身並標記 cancelled，方便館主日後查紀錄。
    const{data:pickups,error:pickupReadError}=await db.from('polaroid_pickups').select('id,image_path').eq('reservation_id',reservationId);
    if(pickupReadError)throw pickupReadError;

    const imagePaths=(pickups||[]).map((x:any)=>String(x.image_path||'').trim()).filter(Boolean);
    if(imagePaths.length){
      const{error:storageError}=await db.storage.from('polaroids').remove(imagePaths);
      if(storageError)console.error('remove cancelled pickup images failed',storageError);
    }

    let removedPickups=0;
    if((pickups||[]).length){
      const{data:deleted,error:deleteError}=await db.from('polaroid_pickups').delete().eq('reservation_id',reservationId).select('id');
      if(deleteError)throw deleteError;
      removedPickups=(deleted||[]).length;
    }

    const{data:updated,error:updateError}=await db.from('reservations').update({status:'cancelled'}).eq('id',reservationId).select('*').maybeSingle();
    if(updateError)throw updateError;
    if(!updated)return NextResponse.json({error:'取消指名失敗，請重新整理後再試'},{status:409});

    return NextResponse.json({ok:true,reservation:updated,removed_pickups:removedPickups});
  }catch(error){
    console.error('cancel reservation failed',error);
    return NextResponse.json({error:error instanceof Error?error.message:'取消指名失敗，請稍後再試'},{status:500});
  }
}
