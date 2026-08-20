import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const db = adminSupabase();
    const { data, error } = await db.from('staff')
      .select('id,slug,name,role,sort_order,accepting_reservations')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    const visible = (data || []).filter((row: any) => row.accepting_reservations === true || row.slug === 'riku' || row.name === '羽鶴璃久');
    return NextResponse.json({ staff: visible }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取送餐館員失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
