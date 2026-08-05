import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const guestName = String(body.guest_name ?? '').trim();
    const items = Array.isArray(body.items) ? body.items : [];
    const total = Number(body.total ?? 0);

    if (!guestName) return NextResponse.json({ error: '請填寫客人名稱' }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: '請至少選擇一項餐點' }, { status: 400 });
    if (!Number.isFinite(total) || total < 0) return NextResponse.json({ error: '訂單金額不正確' }, { status: 400 });

    const cleanItems = items.map((item: any) => ({
      name: String(item?.name ?? '').slice(0, 100),
      qty: Math.max(1, Math.min(99, Number(item?.qty ?? 1))),
      price: Math.max(0, Number(item?.price ?? 0)),
    })).filter((item: any) => item.name);

    if (!cleanItems.length) return NextResponse.json({ error: '餐點資料不正確' }, { status: 400 });

    const { error } = await publicSupabase().from('orders').insert({
      guest_name: guestName,
      items: cleanItems,
      total,
      status: 'pending',
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送出點餐失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
