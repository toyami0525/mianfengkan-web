import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  try {
    const code=(req.nextUrl.searchParams.get('code')||'').trim().toUpperCase();
    if(!/^MF-[A-Z2-9]{6}$/.test(code)) return NextResponse.json({error:'請輸入正確的取件碼'},{status:400});
    const db=adminSupabase();
    const {data,error}=await db.from('polaroid_pickups').select('pickup_code,staff_name,status,image_path,created_at,completed_at').eq('pickup_code',code).maybeSingle();
    if(error) throw error;
    if(!data) return NextResponse.json({error:'找不到此取件碼，請確認後再試。'},{status:404});
    if(data.status!=='ready'||!data.image_path) return NextResponse.json({ok:true,pickup_code:data.pickup_code,staff_name:data.staff_name,status:'processing'});
    const {data:signed,error:signedError}=await db.storage.from('polaroids').createSignedUrl(data.image_path,3600);
    if(signedError) throw signedError;
    return NextResponse.json({ok:true,pickup_code:data.pickup_code,staff_name:data.staff_name,status:'ready',image_url:signed.signedUrl,completed_at:data.completed_at});
  } catch(e) {
    return NextResponse.json({error:e instanceof Error?e.message:'查詢失敗'},{status:500});
  }
}
