import {NextResponse} from 'next/server';
import {publicSupabase} from '@/lib/supabase-server';

export async function GET(){
 try{
  const{data,error}=await publicSupabase().from('site_settings').select('key,value');
  if(error)throw error;
  const settings=Object.fromEntries((data||[]).map(row=>[row.key,row.value]));
  return NextResponse.json(settings,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const message=error instanceof Error?error.message:'讀取網站設定失敗';
  return NextResponse.json({error:message},{status:500});
 }
}
