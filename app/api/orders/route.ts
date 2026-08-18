import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';
import { adminSupabase } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

const POLAROID_PRICE = 80000;
const YUKINOJI_POLAROID_PRICE = 100000;
const FOOD_PRICES: Record<string, number> = {
  '蛋包飯':7000,'扇貝咖哩':9000,'加雷馬披薩':9000,'醬炒飯':7000,'懸掛番茄沙拉':9000,'羊駝奶油麵':7000,
  '圓扇刺刺梨蛋糕':6000,'巧克力奶油蛋糕':6000,'白桃塔':8000,'蜂蜜牛角麵包':8000,'烏雞布丁':8000,
  '奶油熱巧克力':5000,'蜜瓜果汁':7000,'白桃汁':7000,'抹茶':7000,'路易波士紅茶':7000,
};
const FOOD_CATEGORIES: Record<string, string> = {
  '蛋包飯':'主食',  '扇貝咖哩':'主食',  '加雷馬披薩':'主食',  '醬炒飯':'主食',  '懸掛番茄沙拉':'主食',  '羊駝奶油麵':'主食',  '圓扇刺刺梨蛋糕':'甜點',  '巧克力奶油蛋糕':'甜點',  '白桃塔':'甜點',  '蜂蜜牛角麵包':'甜點',  '烏雞布丁':'甜點',  '奶油熱巧克力':'飲品',  '蜜瓜果汁':'飲品',  '白桃汁':'飲品',  '抹茶':'飲品',  '路易波士紅茶':'飲品'
};
function makePickupCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=randomBytes(6);
  return 'MF-'+Array.from(bytes as Uint8Array).map((b:number)=>alphabet[b%alphabet.length]).join('');
}
async function createPickup(staff:{id:string;name:string},guestName:string){
  const db=adminSupabase();
  for(let attempt=0;attempt<8;attempt++){
    const code=makePickupCode();
    const {error}=await db.from('polaroid_pickups').insert({reservation_id:null,staff_id:staff.id,staff_name:String(staff?.name ?? ''),guest_name:guestName,pickup_code:code,status:'processing'});
    if(!error)return code;
    if(error.code!=='23505')throw error;
  }
  throw new Error('無法產生拍立得取件碼，請稍後再試');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const guestName = String(body.guest_name ?? '').trim();
    const wantsPolaroid = body.polaroid === true;
    const wantsYukinojiPolaroid = body.yukinoji_polaroid === true;
    const deliveryPreferenceStaffId = String(body.delivery_preference_staff_id ?? '').trim();
    if (!guestName) return NextResponse.json({ error: '請填寫客人名稱' }, { status: 400 });

    const cleanItems = (Array.isArray(body.items) ? body.items : []).map((item:any)=>{
      const name=String(item?.name??'').slice(0,100);
      const qty=Math.max(1,Math.min(99,Math.floor(Number(item?.qty??1))));
      return {name,qty,price:FOOD_PRICES[name]??-1};
    }).filter((item:any)=>item.name&&item.price>=0);
    if (!cleanItems.length) return NextResponse.json({ error: '請至少選擇一項餐點' }, { status: 400 });

    const foodTotal=cleanItems.reduce((n:number,x:any)=>n+x.price*x.qty,0);
    const mealCounts = ['主食','甜點','飲品'].map(c => cleanItems.filter((x:any)=>FOOD_CATEGORIES[x.name]===c).reduce((n:number,x:any)=>n+x.qty,0));
    if (mealCounts.some(n=>n!==1) || cleanItems.length!==3) return NextResponse.json({ error: '本館採套餐制，請從主食、甜點、飲品各選一項' }, { status: 400 });
    if(wantsPolaroid&&foodTotal<150000)return NextResponse.json({error:'慕斯菲露紀念拍立得需本筆餐點消費滿 150,000 Gil'},{status:400});
    if(wantsYukinojiPolaroid&&foodTotal<200000)return NextResponse.json({error:'雪之寺羽狩紀念拍立得需本筆餐點消費滿 200,000 Gil'},{status:400});

    let deliveryPreferenceStaff:any=null;
    if(deliveryPreferenceStaffId){
      const staffDb=adminSupabase();
      const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryPreferenceStaffId);
      const query=staffDb.from('staff').select('id,name,active').eq('active',true);
      const r=isUuid?await query.eq('id',deliveryPreferenceStaffId).single():await query.eq('slug',deliveryPreferenceStaffId).single();
      if(r.error||!r.data)return NextResponse.json({error:'指定的希望送餐館員目前無法選擇'},{status:400});
      deliveryPreferenceStaff=r.data;
    }

    let musu:any=null,yuki:any=null;
    if(wantsPolaroid){const r=await publicSupabase().from('staff').select('id,name,slug').eq('slug','musufiru').single();if(r.error||!r.data)return NextResponse.json({error:'找不到慕斯菲露館員資料'},{status:400});musu=r.data}
    if(wantsYukinojiPolaroid){const r=await publicSupabase().from('staff').select('id,name,slug').eq('slug','yukinoji-hakari').single();if(r.error||!r.data)return NextResponse.json({error:'找不到雪之寺羽狩館員資料'},{status:400});yuki=r.data}

    const orderItems=[...cleanItems,...(wantsPolaroid?[{name:'慕斯菲露－紀念拍立得',qty:1,price:POLAROID_PRICE}]:[]),...(wantsYukinojiPolaroid?[{name:'雪之寺羽狩－紀念拍立得',qty:1,price:YUKINOJI_POLAROID_PRICE}]:[])];
    const total=foodTotal+(wantsPolaroid?POLAROID_PRICE:0)+(wantsYukinojiPolaroid?YUKINOJI_POLAROID_PRICE:0);
    const staffId=wantsPolaroid&&!wantsYukinojiPolaroid?musu.id:wantsYukinojiPolaroid&&!wantsPolaroid?yuki.id:null;
    const { error } = await publicSupabase().from('orders').insert({guest_name:guestName,staff_id:staffId,items:orderItems,total,note:String(body.note??'').trim(),status:'pending',delivery_preference_staff_id:deliveryPreferenceStaff?.id??null,delivery_preference_staff_name:deliveryPreferenceStaff?.name??null});
    if (error) throw error;

    const pickupCodes:string[]=[];
    if(wantsPolaroid)pickupCodes.push(await createPickup(musu,guestName));
    if(wantsYukinojiPolaroid)pickupCodes.push(await createPickup(yuki,guestName));
    return NextResponse.json({ ok: true, pickup_code:pickupCodes[0], pickup_codes:pickupCodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : '送出點餐失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
