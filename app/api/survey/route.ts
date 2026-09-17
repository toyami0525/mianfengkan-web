import { NextRequest, NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';
import { validateFeedback } from '@/lib/guest-feedback';

export const dynamic = 'force-dynamic';
const headers = {'Cache-Control':'no-store'};

export async function GET() {
  try {
    const {data, error} = await publicSupabase().from('staff').select('name,slug').eq('active',true).order('sort_order');
    if (error) throw error;
    const names = (data || []).flatMap(row => row.slug==='riku' ? [row.name,'克羅塞維爾'] : [row.name]);
    return NextResponse.json({staff:[...new Set(names)]}, {headers});
  } catch {
    return NextResponse.json({error:'館員名單暫時無法載入，您仍可直接填寫姓名。'}, {status:503, headers});
  }
}

export async function POST(req: NextRequest) {
  let feedback;
  try {
    const raw = await req.text();
    if (raw.length > 16000) return NextResponse.json({error:'填答內容過長'}, {status:413, headers});
    feedback = validateFeedback(JSON.parse(raw));
  } catch (error) {
    return NextResponse.json({error:error instanceof SyntaxError ? '填答格式不正確' : error instanceof Error ? error.message : '請檢查填答內容'}, {status:400, headers});
  }
  try {
    // No SELECT/RETURNING: visitors can submit, but cannot read any responses.
    const {error} = await publicSupabase().from('guest_feedback').insert(feedback);
    // The same submission ID is reused after a network retry to avoid duplicate responses.
    if (error && error.code !== '23505') throw error;
    return NextResponse.json({ok:true}, {headers});
  } catch {
    return NextResponse.json({error:'暫時無法送出，您的填答仍保留在頁面上，請稍後重試。'}, {status:503, headers});
  }
}
