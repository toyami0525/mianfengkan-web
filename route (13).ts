import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

export async function POST(req:NextRequest){
  try{
    const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(!token)return NextResponse.json({error:'請重新登入館員後台'},{status:401});
    const db=adminSupabase();
    const {data:{user}}=await db.auth.getUser(token);
    if(!user)return NextResponse.json({error:'登入已失效'},{status:401});
    const {data:account,error:accountError}=await db.from('staff_accounts').select('role,staff_id,active,staff:staff_id(slug)').eq('user_id',user.id).eq('active',true).maybeSingle();
    if(accountError)throw accountError;
    if(!account)return NextResponse.json({error:'找不到館員權限'},{status:403});
    const staffValue=Array.isArray((account as any).staff)?(account as any).staff[0]:(account as any).staff;
    const allowed=account.role==='owner'||(account.role==='staff'&&staffValue?.slug==='yukinoji-hakari');
    if(!allowed)return NextResponse.json({error:'只有雪之寺羽狩可切換 Q版繪圖接單狀態'},{status:403});
    const body=await req.json();const enabled=body?.enabled===true;
    const {error}=await db.from('site_settings').upsert({key:'yukinoji_chibi_accepting',value:{enabled},updated_at:new Date().toISOString()},{onConflict:'key'});
    if(error)throw error;
    return NextResponse.json({ok:true,enabled});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'更新失敗'},{status:500})}
}
