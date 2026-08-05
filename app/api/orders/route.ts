import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';

const FOOD_PRICES: Record<string, number> = {
  '蛋包飯':5000,'扇貝咖哩':7000,'加雷馬披薩':7000,'醬炒飯':5000,'懸掛番茄沙拉':7000,'羊駝奶油麵':5000,
  '圓扇刺刺梨蛋糕':4000,'巧克力奶油蛋糕':4000,'白桃塔':6000,'蜂蜜牛角麵包':6000,'烏雞布丁':6000,
  '奶油熱巧克力':3000,'蜜瓜果汁':5000,'白桃汁':5000,'抹茶':5000,'路易波士紅茶':5000,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const guestName = String(body.guest_name ?? '').trim();
    const items = Array.isArray(body.items) ? body.items : [];
    const note = String(body.note ?? '').trim().slice(0, 1000);

    if (!guestName) return NextResponse.json({ error: '請填寫客人名稱' }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: '請至少選擇一項餐點' }, { status: 400 });

    const cleanItems = items.map((item: any) => {
      const name = String(item?.name ?? '').slice(0, 100);
      const qty = Math.max(1, Math.min(99, Math.floor(Number(item?.qty ?? 1))));
      return { name, qty, price: FOOD_PRICES[name] ?? -1 };
    }).filter((item: any) => item.name && item.price >= 0);

    if (!cleanItems.length) return NextResponse.json({ error: '餐點資料不正確' }, { status: 400 });
    const total = cleanItems.reduce((sum: number, item: any) => sum + item.price * item.qty, 0);

    const { error } = await publicSupabase().from('orders').insert({
      guest_name: guestName,
      items: cleanItems,
      total,
      note: note || '只點餐訂單',
      status: 'pending',
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送出點餐失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
