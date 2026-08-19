import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const db = adminSupabase();
    const { data, error } = await db.from('staff')
      .select('id,slug,name,role,sort_order')
      .eq('active', true)
      .neq('slug', 'lina')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ staff: data || [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取送餐館員失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
