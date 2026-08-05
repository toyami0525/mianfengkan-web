import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const PHOTO_RULES: Record<string,{staffSlug:string,name:string,price:number,threshold:number}> = {
  musufiru:{staffSlug:'musufiru',name:'慕斯菲露－紀念拍立得',price:80000,threshold:150000},
  'yukinoji-hakari':{staffSlug:'yukinoji-hakari',name:'雪之寺羽狩－指名拍立得',price:100000,threshold:200000},
};
const SERVICE_INFO: Record<string, { price: number; duration: number }> = {
  '泡湯搓澡': { price: 150000, duration: 15 }, '按摩服務': { price: 100000, duration: 15 },
  '耳語陪伴': { price: 100000, duration: 15 }, '眠楓套席': { price: 300000, duration: 45 },
};
const FOOD_PRICES: Record<string, number> = {'蛋包飯':5000,'扇貝咖哩':7000,'加雷馬披薩':7000,'醬炒飯':5000,'懸掛番茄沙拉':7000,'羊駝奶油麵':5000,'圓扇刺刺梨蛋糕':4000,'巧克力奶油蛋糕':4000,'白桃塔':6000,'蜂蜜牛角麵包':6000,'烏雞布丁':6000,'奶油熱巧克力':3000,'蜜瓜果汁':5000,'白桃汁':5000,'抹茶':5000,'路易波士紅茶':5000};
function taipeiParts(date: Date) { const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS); return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() }; }
export async function POST(request: Request) {
  try {
    const body=await request.json(),guestName=String(body.guest_name??'').trim(),staffId=String(body.staff_id??'').trim(),requestedServices=Array.isArray(body.services)?body.services.map(String):[],startAt=String(body.start_at??''),note=String(body.note??'').trim();
    const photoType=body.polaroid_type?String(body.polaroid_type):'';
    if(!guestName||!staffId||!requestedServices.length||!startAt)return NextResponse.json({error:'預約資料不完整'},{status:400});
    const services=requestedServices.includes('眠楓套席')?['眠楓套席']:[...new Set(requestedServices)].filter(x=>x!=='眠楓套席');
    if(!services.length||services.some(x=>!SERVICE_INFO[x]))return NextResponse.json({error:'服務項目不正確'},{status:400});
    const servicePrice=services.reduce((n,x)=>n+SERVICE_INFO[x].price,0),duration=services.reduce((n,x)=>n+SERVICE_INFO[x].duration,0);
    const cleanItems=(Array.isArray(body.items)?body.items:[]).map((item:any)=>{const name=String(item?.name??'').slice(0,100),qty=Math.max(1,Math.min(99,Math.floor(Number(item?.qty??1))));return{name,qty,price:FOOD_PRICES[name]??-1}}).filter((x:any)=>x.name&&x.price>=0);
    const foodTotal=cleanItems.reduce((n:number,x:any)=>n+x.price*x.qty,0),start=new Date(startAt),now=new Date();
    if(Number.isNaN(start.getTime()))return NextResponse.json({error:'預約時間格式不正確'},{status:400});
    const today=taipeiParts(now),selected=taipeiParts(start),sameDay=today.year===selected.year&&today.month===selected.month&&today.day===selected.day,startMinutes=selected.hour*60+selected.minute;
    if(!sameDay||start<=now||startMinutes<1260||startMinutes+duration>1440)return NextResponse.json({error:'預約時間不在可接受範圍內'},{status:400});
    const {data:staff,error:staffError}=await publicSupabase().from('staff').select('id,slug,name').eq('id',staffId).single();
    if(staffError||!staff)return NextResponse.json({error:'找不到指定館員'},{status:400});
    const photo=photoType?PHOTO_RULES[photoType]:null;
    if(photoType&&!photo)return NextResponse.json({error:'拍立得服務不正確'},{status:400});
    if(photo&&staff.slug!==photo.staffSlug)return NextResponse.json({error:'此拍立得僅限指名對應館員'},{status:400});
    if(photo&&servicePrice+foodTotal<photo.threshold)return NextResponse.json({error:`此拍立得需單筆服務與餐點合計滿 ${photo.threshold.toLocaleString('zh-TW')} Gil`},{status:400});
    const fullNote=[note,photo?`包含：${photo.name}`:''].filter(Boolean).join('\n');
    const {data:reservationId,error:reservationError}=await publicSupabase().rpc('create_reservation',{p_guest_name:guestName,p_staff_id:staffId,p_service_name:services.join('＋'),p_price:servicePrice,p_duration_minutes:duration,p_start_at:startAt,p_note:fullNote});
    if(reservationError)throw reservationError;
    if(cleanItems.length||photo){const orderItems=[...cleanItems,...(photo?[{name:photo.name,qty:1,price:photo.price}]:[])];const lockNote=photo?`關聯預約：${reservationId}\n拍立得鎖定館員：${staffId}`:`關聯預約：${reservationId}`;const {error:orderError}=await publicSupabase().from('orders').insert({guest_name:guestName,items:orderItems,total:foodTotal+(photo?.price??0),note:lockNote,status:'pending'});if(orderError)throw orderError;}
    return NextResponse.json({ok:true,reservation_id:reservationId});
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:'送出預約與點餐失敗'},{status:500})}
}
