import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const guestName = String(body.guest_name ?? '').trim();
    const staffId = String(body.staff_id ?? '').trim();
    const serviceName = String(body.service_name ?? '').trim();
    const price = Number(body.price ?? 0);
    const duration = Number(body.duration_minutes ?? 15);
    const startAt = String(body.start_at ?? '');
    const note = String(body.note ?? '').trim();

    if (!guestName || !staffId || !serviceName || !startAt) {
      return NextResponse.json({ error: '預約資料不完整' }, { status: 400 });
    }

    const { data, error } = await publicSupabase().rpc('create_reservation', {
      p_guest_name: guestName,
      p_staff_id: staffId,
      p_service_name: serviceName,
      p_price: price,
      p_duration_minutes: duration,
      p_start_at: startAt,
      p_note: note,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送出預約失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
