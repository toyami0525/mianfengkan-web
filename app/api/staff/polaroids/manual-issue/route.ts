import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MANUAL_PRODUCTS:Record<string,Record<string,string>>={
  musufiru:{polaroid:'紀念拍立得'},
  'yukinoji-hakari':{polaroid:'紀念拍立得',chibi_public:'Q版繪圖(公版)'},
  lina:{lina_signed_polaroid:'簽繪拍立得',lina_plain_polaroid:'拍立得(無簽繪)'},
};

function makePickupCode(){
  let value='MF-';
  for(let i=0;i<6;i++) value+=CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];
  return value;
}

async function accountFrom(req:NextRequest){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return null;
  const db=adminSupabase();
  const{data:{user}}=await db.auth.getUser(token);
  if(!user)return null;
  const{data}=await db.from('staff_accounts').select('role,staff_id,active').eq('user_id',user.id).eq('active',true).maybeSingle();
  return data?{db,account:data}:null;
}

export async function POST(req:NextRequest){
  try{
    const auth=await accountFrom(req);
    if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
    if(auth.account.role!=='owner')return NextResponse.json({error:'只有館主可以手動發放成品取件碼'},{status:403});

    const body=await req.json().catch(()=>({}));
    const guestName=String(body?.guest_name||'').trim().slice(0,80);
    const staffSlug=String(body?.staff_slug||'').trim();
    const itemType=String(body?.item_type||'').trim();
    if(!guestName)return NextResponse.json({error:'請輸入客人名稱'},{status:400});
    const itemLabel=MANUAL_PRODUCTS[staffSlug]?.[itemType];
    if(!itemLabel)return NextResponse.json({error:'此館員沒有這個可手動發號的成品類型'},{status:400});

    const{db}=auth;
    const{data:staff,error:staffError}=await db.from('staff').select('id,name,slug').eq('slug',staffSlug).maybeSingle();
    if(staffError)throw staffError;
    if(!staff)return NextResponse.json({error:'找不到指定館員資料'},{status:404});

    for(let attempt=0;attempt<12;attempt++){
      const pickupCode=makePickupCode();
      const{data,error}=await db.from('polaroid_pickups').insert({
        reservation_id:null,
        staff_id:staff.id,
        staff_name:String(staff?.name ?? ''),
        guest_name:guestName,
        pickup_code:pickupCode,
        status:'processing',
        item_type:itemType,
      }).select('id,pickup_code,staff_id,staff_name,guest_name,status,item_type,created_at').single();
      if(!error)return NextResponse.json({ok:true,pickup_code:pickupCode,pickup:data,staff_name:String(staff?.name ?? ''),item_label:itemLabel});
      if(error.code==='23505')continue;
      if(itemType==='lina_signed_polaroid'&&String(error.message||'').includes('Lina 簽繪拍立得今日已達 3 張上限')){
        return NextResponse.json({error:'Lina 簽繪拍立得今日 3 張已額滿'},{status:409});
      }
      throw error;
    }

    return NextResponse.json({error:'取件碼產生失敗，請再試一次'},{status:500});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'發放取件碼失敗'},{status:500});
  }
}
