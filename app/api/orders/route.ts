import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';
import { adminSupabase } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

const POLAROID_PRICE = 80000;
const YUKINOJI_POLAROID_PRICE = 100000;
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
async function createPickup(staff:{id:string;name:string},guestName:string){
  const db=adminSupabase();
  for(let attempt=0;attempt<8;attempt++){
    const code=makePickupCode();
    const {error}=await db.from('polaroid_pickups').insert({reservation_id:null,staff_id:staff.id,staff_name:staff.name,guest_name:guestName,pickup_code:code,status:'processing'});
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
    if (!guestName) return NextResponse.json({ error: '請填寫客人名稱' }, { status: 400 });

    const cleanItems = (Array.isArray(body.items) ? body.items : []).map((item:any)=>{
      const name=String(item?.name??'').slice(0,100);
      const qty=Math.max(1,Math.min(99,Math.floor(Number(item?.qty??1))));
      return {name,qty,price:FOOD_PRICES[name]??-1};
    }).filter((item:any)=>item.name&&item.price>=0);
    if (!cleanItems.length) return NextResponse.json({ error: '請至少選擇一項餐點' }, { status: 400 });

    const foodTotal=cleanItems.reduce((n:number,x:any)=>n+x.price*x.qty,0);
    if(wantsPolaroid&&foodTotal<150000)return NextResponse.json({error:'慕斯菲露紀念拍立得需本筆餐點消費滿 150,000 Gil'},{status:400});
    if(wantsYukinojiPolaroid&&foodTotal<200000)return NextResponse.json({error:'雪之寺羽狩紀念拍立得需本筆餐點消費滿 200,000 Gil'},{status:400});

    let musu:any=null,yuki:any=null;
    if(wantsPolaroid){const r=await publicSupabase().from('staff').select('id,name,slug').eq('slug','musufiru').single();if(r.error||!r.data)return NextResponse.json({error:'找不到慕斯菲露館員資料'},{status:400});musu=r.data}
    if(wantsYukinojiPolaroid){const r=await publicSupabase().from('staff').select('id,name,slug').eq('slug','yukinoji-hakari').single();if(r.error||!r.data)return NextResponse.json({error:'找不到雪之寺羽狩館員資料'},{status:400});yuki=r.data}

    const orderItems=[...cleanItems,...(wantsPolaroid?[{name:'慕斯菲露－紀念拍立得',qty:1,price:POLAROID_PRICE}]:[]),...(wantsYukinojiPolaroid?[{name:'雪之寺羽狩－紀念拍立得',qty:1,price:YUKINOJI_POLAROID_PRICE}]:[])];
    const total=foodTotal+(wantsPolaroid?POLAROID_PRICE:0)+(wantsYukinojiPolaroid?YUKINOJI_POLAROID_PRICE:0);
    const staffId=wantsPolaroid&&!wantsYukinojiPolaroid?musu.id:wantsYukinojiPolaroid&&!wantsPolaroid?yuki.id:null;
    const { error } = await publicSupabase().from('orders').insert({guest_name:guestName,staff_id:staffId,items:orderItems,total,note:String(body.note??'').trim(),status:'pending'});
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
