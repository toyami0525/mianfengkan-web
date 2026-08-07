import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

async function accountFrom(req:NextRequest){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token) return null;
  const db=adminSupabase();
  const {data:{user}}=await db.auth.getUser(token);
  if(!user) return null;
  const {data}=await db.from('staff_accounts').select('role,staff_id,active').eq('user_id',user.id).eq('active',true).maybeSingle();
  return data?{db,account:data}:null;
}

export async function POST(req:NextRequest){
  try{
    const auth=await accountFrom(req);if(!auth)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
    const form=await req.formData();const id=String(form.get('id')||'');const file=form.get('file');
    if(!id||!(file instanceof File))return NextResponse.json({error:'請選擇拍立得圖片'},{status:400});
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))return NextResponse.json({error:'僅支援 JPG、PNG、WEBP'},{status:400});
    if(file.size>15*1024*1024)return NextResponse.json({error:'圖片不可超過 15MB'},{status:400});
    const {db,account}=auth;
    const {data:pickup,error}=await db.from('polaroid_pickups').select('id,staff_id,pickup_code,image_path').eq('id',id).maybeSingle();
    if(error)throw error;if(!pickup)return NextResponse.json({error:'找不到拍立得訂單'},{status:404});
    if(account.role!=='owner'&&account.staff_id!==pickup.staff_id)return NextResponse.json({error:'沒有權限上傳此拍立得'},{status:403});
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=`${pickup.staff_id}/${pickup.pickup_code}-${Date.now()}.${ext}`;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const {error:uploadError}=await db.storage.from('polaroids').upload(path,bytes,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;
    if(pickup.image_path)await db.storage.from('polaroids').remove([pickup.image_path]);
    const {error:updateError}=await db.from('polaroid_pickups').update({image_path:path,status:'ready',completed_at:new Date().toISOString()}).eq('id',id);if(updateError)throw updateError;
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'上傳失敗'},{status:500})}
}
