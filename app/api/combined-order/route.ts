import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';
import { adminSupabase } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const POLAROID_PRICE = 80000;
const YUKINOJI_POLAROID_PRICE = 100000;
const SERVICE_INFO: Record<string, { price: number; duration: number }> = {
  '泡湯搓澡': { price: 150000, duration: 15 },
  '按摩服務': { price: 100000, duration: 15 },
  '耳語陪伴': { price: 100000, duration: 15 },
  '眠楓套席': { price: 300000, duration: 45 },
};
const FOOD_PRICES: Record<string, number> = {
  '蛋包飯':5000,'扇貝咖哩':7000,'加雷馬披薩':7000,'醬炒飯':5000,'懸掛番茄沙拉':7000,'羊駝奶油麵':5000,
  '圓扇刺刺梨蛋糕':4000,'巧克力奶油蛋糕':4000,'白桃塔':6000,'蜂蜜牛角麵包':6000,'烏雞布丁':6000,
  '奶油熱巧克力':3000,'蜜瓜果汁':5000,'白桃汁':5000,'抹茶':5000,'路易波士紅茶':5000,
};
function makePickupCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=randomBytes(6);
  return 'MF-'+Array.from(bytes as Uint8Array).map((b:number)=>alphabet[b%alphabet.length]).join('');
}
function taipeiParts(date: Date) {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const guestName = String(body.guest_name ?? '').trim();
    const staffId = String(body.staff_id ?? '').trim();
    const requestedServices = Array.isArray(body.services) ? body.services.map(String) : [];
    const startAt = String(body.start_at ?? '');
    const note = String(body.note ?? '').trim();
    const wantsPolaroid = body.polaroid === true;
    const wantsYukinojiPolaroid = body.yukinoji_polaroid === true;
    if (!guestName || !staffId || !requestedServices.length || !startAt) return NextResponse.json({ error: '預約資料不完整' }, { status: 400 });

    const services: string[] = requestedServices.includes('眠楓套席')
      ? ['眠楓套席']
      : [...new Set<string>(requestedServices)].filter((x) => x !== '眠楓套席');

    if (!services.length || services.some((x) => !(x in SERVICE_INFO))) {
      return NextResponse.json({ error: '服務項目不正確' }, { status: 400 });
    }

    const servicePrice = services.reduce(
      (n, x) => n + SERVICE_INFO[x].price,
      0,
    );
    const duration = services.reduce(
      (n, x) => n + SERVICE_INFO[x].duration,
      0,
    );

    const cleanItems = (Array.isArray(body.items) ? body.items : []).map((item: any) => {
      const name = String(item?.name ?? '').slice(0,100);
      const qty = Math.max(1, Math.min(99, Math.floor(Number(item?.qty ?? 1))));
      return { name, qty, price: FOOD_PRICES[name] ?? -1 };
    }).filter((x:any)=>x.name && x.price >= 0);
    const foodTotal = cleanItems.reduce((n:number,x:any)=>n+x.price*x.qty,0);

    const start = new Date(startAt), now = new Date();
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: '預約時間格式不正確' }, { status: 400 });
    const today = taipeiParts(now), selectedDate = taipeiParts(start);
    const sameDay = today.year===selectedDate.year && today.month===selectedDate.month && today.day===selectedDate.day;
    const startMinutes = selectedDate.hour*60+selectedDate.minute;
    if (!sameDay || start <= now || startMinutes < 21*60 || startMinutes + duration > 24*60) {
      return NextResponse.json({ error: '可指名時間為當天 21:00～24:00，服務必須在午夜 12 點前結束' }, { status: 400 });
    }

    const { data: staff, error: staffError } = await publicSupabase().from('staff').select('id,slug,name').eq('id',staffId).single();
    if (staffError || !staff) return NextResponse.json({ error: '找不到指定館員' }, { status: 400 });
    if (staff.slug === 'shenaixue' && (services.length !== 1 || services[0] !== '耳語陪伴')) {
      return NextResponse.json({ error: '神噯雪目前僅提供耳語陪伴服務' }, { status: 400 });
    }
    if (wantsPolaroid && staff.slug !== 'musufiru') return NextResponse.json({ error: '慕斯菲露紀念拍立得僅限指名慕斯菲露' }, { status: 400 });
    if (wantsPolaroid && servicePrice + foodTotal < 150000) return NextResponse.json({ error: '慕斯菲露紀念拍立得需單筆服務與餐點合計滿 150,000 Gil' }, { status: 400 });
    if (wantsYukinojiPolaroid && staff.slug !== 'yukinoji-hakari') return NextResponse.json({ error: '雪之寺羽狩紀念拍立得僅限指名雪之寺羽狩' }, { status: 400 });
    if (wantsYukinojiPolaroid && servicePrice + foodTotal < 200000) return NextResponse.json({ error: '雪之寺羽狩紀念拍立得需單筆服務與餐點合計滿 200,000 Gil' }, { status: 400 });

    const serviceName = services.join('＋');
    const fullNote = [note, wantsPolaroid ? '包含：慕斯菲露紀念拍立得' : '', wantsYukinojiPolaroid ? '包含：雪之寺羽狩紀念拍立得' : ''].filter(Boolean).join('\n');
    const { data: reservationId, error: reservationError } = await publicSupabase().rpc('create_reservation', {
      p_guest_name: guestName, p_staff_id: staffId, p_service_name: serviceName,
      p_price: servicePrice, p_duration_minutes: duration, p_start_at: startAt, p_note: fullNote,
    });
    if (reservationError) throw reservationError;

    if (cleanItems.length || wantsPolaroid || wantsYukinojiPolaroid) {
      const orderItems = [...cleanItems, ...(wantsPolaroid ? [{ name:'慕斯菲露－紀念拍立得', qty:1, price:POLAROID_PRICE }] : []), ...(wantsYukinojiPolaroid ? [{ name:'雪之寺羽狩－紀念拍立得', qty:1, price:YUKINOJI_POLAROID_PRICE }] : [])];
      const total = foodTotal + (wantsPolaroid ? POLAROID_PRICE : 0) + (wantsYukinojiPolaroid ? YUKINOJI_POLAROID_PRICE : 0);
      const { error: orderError } = await publicSupabase().from('orders').insert({ guest_name:guestName, staff_id:staffId, items:orderItems, total, note:`關聯預約：${reservationId}`, status:'pending' });
      if (orderError) throw orderError;
    }
    let pickupCode:string|undefined;
    if (wantsPolaroid || wantsYukinojiPolaroid) {
      const admin=adminSupabase();
      for(let attempt=0;attempt<8;attempt++){
        const code=makePickupCode();
        const {error:pickupError}=await admin.from('polaroid_pickups').insert({
          reservation_id:reservationId,staff_id:staffId,staff_name:staff.name,guest_name:guestName,pickup_code:code,status:'processing'
        });
        if(!pickupError){pickupCode=code;break}
        if(pickupError.code!=='23505') throw pickupError;
      }
      if(!pickupCode) throw new Error('無法產生拍立得取件碼，請稍後再試');
    }
    return NextResponse.json({ ok:true, reservation_id:reservationId, pickup_code:pickupCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送出預約與點餐失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
