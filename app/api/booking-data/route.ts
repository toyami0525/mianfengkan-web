import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { data, error } = await publicSupabase().rpc('get_public_booking_data');
    if (error) throw error;
    return NextResponse.json(data ?? { staff: [], blocks: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '讀取可預約資料失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
