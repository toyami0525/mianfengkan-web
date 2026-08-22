import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';
import { adminSupabase } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const POLAROID_PRICE = 80000;
const YUKINOJI_POLAROID_PRICE = 100000;
const SERVICE_INFO: Record<string, { price: number; duration: number }> = {
  '泡湯洗浴': { price: 150000, duration: 15 },
  '按摩服務': { price: 100000, duration: 15 },
  '耳語陪伴': { price: 100000, duration: 15 },
  'Q版繪圖(公版)': { price: 350000, duration: 15 },
  '眠楓套席': { price: 300000, duration: 45 },
};
const FOOD_PRICES: Record<string, number> = {
  '蛋包飯':7000,'扇貝咖哩':9000,'加雷馬披薩':9000,'醬炒飯':7000,'懸掛番茄沙拉':9000,'羊駝奶油麵':7000,'犎牛牛排':15000,
  '圓扇刺刺梨蛋糕':6000,'巧克力奶油蛋糕':6000,'白桃塔':8000,'蜂蜜牛角麵包':8000,'烏雞布丁':8000,
  '奶油熱巧克力':5000,'蜜瓜果汁':7000,'白桃汁':7000,'抹茶':7000,'路易波士紅茶':7000,
};
const FOOD_CATEGORIES: Record<string, string> = {
  '蛋包飯':'主食',  '扇貝咖哩':'主食',  '加雷馬披薩':'主食',  '醬炒飯':'主食',  '懸掛番茄沙拉':'主食',  '羊駝奶油麵':'主食',  '犎牛牛排':'主食',  '圓扇刺刺梨蛋糕':'甜點',  '巧克力奶油蛋糕':'甜點',  '白桃塔':'甜點',  '蜂蜜牛角麵包':'甜點',  '烏雞布丁':'甜點',  '奶油熱巧克力':'飲品',  '蜜瓜果汁':'飲品',  '白桃汁':'飲品',  '抹茶':'飲品',  '路易波士紅茶':'飲品'
};
function makePickupCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=randomBytes(6);
  return 'MF-'+Array.from(bytes as Uint8Array).map((b:number)=>alphabet[b%alphabet.length]).join('');
}
function taipeiDateKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function isMonday(dateKey:string){return new Date(`${dateKey}T12:00:00+08:00`).getUTCDay()===1}
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
    const note = String(body.note ?? '').trim();
    const wantsPolaroid = body.polaroid === true;
    const wantsYukinojiPolaroid = body.yukinoji_polaroid === true;
    if (!guestName || !staffId || !requestedServices.length) return NextResponse.json({ error: '預約資料不完整' }, { status: 400 });

    if(requestedServices.includes('眠楓套席')&&requestedServices.includes('Q版繪圖(公版)')) {
      return NextResponse.json({error:'Q版繪圖(公版)不可與眠楓套席同時選擇'},{status:400});
    }
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
    // 指名服務與餐食訂單分離：指名 API 不要求套餐，也不接收餐點。
    cleanItems.length = 0;
    const foodTotal = 0;

    const now = new Date();
    const taipeiNow = taipeiParts(now);
    const adminDb = adminSupabase();
    const todayKey=taipeiDateKey(now);
    const [{data:settings,error:settingsError},{data:venueClosure,error:venueClosureError}]=await Promise.all([
      adminDb.from('site_settings').select('key,value').in('key',['booking_test_mode','yukinoji_chibi_accepting']),
      adminDb.from('venue_closures').select('work_date,reason').eq('work_date',todayKey).maybeSingle(),
    ]);
    if(settingsError) throw settingsError;
    if(venueClosureError) throw venueClosureError;
    if(isMonday(todayKey)||venueClosure)return NextResponse.json({error:isMonday(todayKey)?'今日為每週一固定休館':'今日臨時休館，暫停接受指名與點餐'},{status:400});
    const settingMap=Object.fromEntries((settings||[]).map((row:any)=>[row.key,row.value]));
    const testValue=settingMap.booking_test_mode;
    const bookingTestMode=testValue===true||testValue?.enabled===true;
    const chibiValue=settingMap.yukinoji_chibi_accepting;
    const yukinojiChibiAccepting=chibiValue===undefined?true:(chibiValue===true||chibiValue?.enabled===true);
    if (!bookingTestMode && taipeiNow.hour < 21) return NextResponse.json({ error: '目前非指名時間，每日 21:00 起開放即時指名' }, { status: 400 });

    const { data: staff, error: staffError } = await publicSupabase().from('staff').select('id,slug,name').eq('id',staffId).single();
    if (staffError || !staff) return NextResponse.json({ error: '找不到指定館員' }, { status: 400 });
    const staffName = staff.name;
    const {data:calendarOff,error:calendarOffError}=await adminDb.from('staff_work_calendar').select('staff_id').eq('staff_id',staffId).eq('work_date',todayKey).eq('status','off').maybeSingle();
    if(calendarOffError)throw calendarOffError;
    if(calendarOff)return NextResponse.json({error:'此館員今日休假，暫停接受指名'},{status:409});
    // 只要本營業時段仍有未完成的指名，就暫停該館員的新指名；服務完成後才重新開放。
    const sessionStart = bookingTestMode
      ? new Date(Date.UTC(taipeiNow.year, taipeiNow.month, taipeiNow.day, -8, 0, 0, 0)) // 台北當日 00:00
      : new Date(Date.UTC(taipeiNow.year, taipeiNow.month, taipeiNow.day, 13, 0, 0, 0)); // 台北 21:00
    const { data: active } = await adminDb.from('reservations')
      .select('id,starts_at,ends_at,status')
      .eq('staff_id',staffId)
      .gte('starts_at',sessionStart.toISOString())
      .not('status','in','(completed,cancelled,rejected,已完成,已取消,已拒絕)')
      .order('starts_at',{ascending:false})
      .limit(1);
    if(active?.length){
      return NextResponse.json({error:'此館員目前服務中，請待本次服務完成後再重新指名。'},{status:409});
    }
    let start = new Date(now.getTime()+5000);
    start.setSeconds(0,0); if(start<=now) start=new Date(now.getTime()+60000);
    const startAt=start.toISOString();
    // 以台北時間 24:00 為當日營業截止；剛好於 24:00 完成可以接受，超過才拒絕。
    const closeAt = new Date(Date.UTC(taipeiNow.year, taipeiNow.month, taipeiNow.day, 16, 0, 0, 0));
    const projectedEnd = new Date(start.getTime()+duration*60000);
    if(!bookingTestMode && (start>=closeAt || projectedEnd>closeAt)) return NextResponse.json({error:'今日剩餘營業時間不足，本次服務無法在 24:00 前完成'},{status:400});
    if (staff.slug === 'shenaixue' && (services.length !== 1 || services[0] !== '耳語陪伴')) {
      return NextResponse.json({ error: '神噯雪目前僅提供耳語陪伴服務' }, { status: 400 });
    }
    if (staff.slug === 'yukinoji-hakari') {
      const allowed=new Set(['耳語陪伴','Q版繪圖(公版)']);
      if(services.some((name)=>!allowed.has(name))) return NextResponse.json({error:'雪之寺羽狩目前僅提供耳語陪伴與 Q版繪圖(公版)'},{status:400});
    }
    const wantsChibi=services.includes('Q版繪圖(公版)');
    if(wantsChibi&&staff.slug!=='yukinoji-hakari') return NextResponse.json({error:'Q版繪圖(公版)僅限指名雪之寺羽狩'},{status:400});
    if(wantsChibi&&!yukinojiChibiAccepting) return NextResponse.json({error:'Q版繪圖(公版)目前暫停接單，請稍後再查看'},{status:409});
    if (wantsPolaroid && staff.slug !== 'musufiru') return NextResponse.json({ error: '慕斯菲露紀念拍立得僅限指名慕斯菲露' }, { status: 400 });
    if (wantsPolaroid && servicePrice < 150000) return NextResponse.json({ error: '慕斯菲露紀念拍立得需單筆服務費滿 150,000 Gil' }, { status: 400 });
    if (wantsYukinojiPolaroid && staff.slug !== 'yukinoji-hakari') return NextResponse.json({ error: '雪之寺羽狩紀念拍立得僅限指名雪之寺羽狩' }, { status: 400 });
    if (wantsYukinojiPolaroid && servicePrice < 200000) return NextResponse.json({ error: '雪之寺羽狩紀念拍立得需單筆服務費滿 200,000 Gil' }, { status: 400 });

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
    const pickupItems:{code:string;type:string;label:string}[]=[];
    async function createPickup(itemType:'polaroid'|'chibi_public',label:string){
      const admin=adminSupabase();
      for(let attempt=0;attempt<8;attempt++){
        const code=makePickupCode();
        const {error:pickupError}=await admin.from('polaroid_pickups').insert({
          reservation_id:reservationId,staff_id:staffId,staff_name:staffName,guest_name:guestName,pickup_code:code,status:'processing',item_type:itemType
        });
        if(!pickupError){pickupItems.push({code,type:itemType,label});return}
        if(pickupError.code!=='23505') throw pickupError;
      }
      throw new Error('無法產生成品取件碼，請稍後再試');
    }
    if(wantsChibi) await createPickup('chibi_public','Q版繪圖(公版)');
    if(wantsPolaroid||wantsYukinojiPolaroid) await createPickup('polaroid','紀念拍立得');
    return NextResponse.json({ ok:true, reservation_id:reservationId, pickup_code:pickupItems[0]?.code, pickup_codes:pickupItems.map(x=>x.code), pickup_items:pickupItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送出指名服務失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
