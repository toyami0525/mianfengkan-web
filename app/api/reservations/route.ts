import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function taipeiParts(date: Date) {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

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
      return NextResponse.json({ error: '指名資料不完整' }, { status: 400 });
    }

    const start = new Date(startAt);
    const now = new Date();
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: '指名時間格式不正確' }, { status: 400 });
    }
    const today = taipeiParts(now);
    const selected = taipeiParts(start);
    const sameDay = today.year === selected.year && today.month === selected.month && today.day === selected.day;
    const startMinutes = selected.hour * 60 + selected.minute;
    const endMinutes = startMinutes + duration;
    if (!sameDay) {
      return NextResponse.json({ error: '指名僅限當天，不能指名其他日期' }, { status: 400 });
    }
    if (start <= now) {
      return NextResponse.json({ error: '不可指名已經過去的時間' }, { status: 400 });
    }
    if (startMinutes < 21 * 60 || endMinutes > 24 * 60) {
      return NextResponse.json({ error: '可指名時間為當天 21:00～24:00，服務必須在午夜 12 點前結束' }, { status: 400 });
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
    const message = error instanceof Error ? error.message : '送出指名失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
