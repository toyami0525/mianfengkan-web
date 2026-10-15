import { NextResponse } from 'next/server';
import { publicSupabase } from '@/lib/supabase-server';
import { adminSupabase } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';
import {parseDiningItems,DiningInputError} from '@/lib/dining-items';

const POLAROID_PRICE = 80000;
const YUKINOJI_POLAROID_PRICE = 100000;
function taipeiDateKey(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function isMonday(dateKey:string){return new Date(`${dateKey}T12:00:00+08:00`).getUTCDay()===1}
function makePickupCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=randomBytes(6);
  return 'MF-'+Array.from(bytes as Uint8Array).map((b:number)=>alphabet[b%alphabet.length]).join('');
}
async function createPickup(staff:{id:string;name:string},guestName:string,guestServer:string){
  const db=adminSupabase();
  for(let attempt=0;attempt<8;attempt++){
    const code=makePickupCode();
    const {error}=await db.from('polaroid_pickups').insert({reservation_id:null,staff_id:staff.id,staff_name:String(staff?.name ?? ''),guest_name:guestName,guest_server:guestServer,pickup_code:code,status:'processing'});
    if(!error)return code;
    if(error.code!=='23505')throw error;
  }
  throw new Error('無法產生拍立得取件碼，請稍後再試');
}

export async function POST(request: Request) {
  try {
    const raw=await request.text();
    if(raw.length>64000)throw new DiningInputError('訂單內容過長，請分筆送出');
    const body = JSON.parse(raw);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new DiningInputError('訂單格式不正確');
    const guestName = String(body.guest_name ?? '').trim();
    const guestServer = String(body.guest_server ?? '').trim().slice(0,60);
    const wantsPolaroid = body.polaroid === true;
    const wantsYukinojiPolaroid = body.yukinoji_polaroid === true;
    const deliveryPreferenceStaffId = String(body.delivery_preference_staff_id ?? '').trim();
    if (!guestName) return NextResponse.json({ error: '請填寫客人名稱' }, { status: 400 });
    if (!guestServer) return NextResponse.json({ error: '請填寫伺服器' }, { status: 400 });
    const todayKey=taipeiDateKey();const closureDb=adminSupabase();const{data:venueClosure,error:venueClosureError}=await closureDb.from('venue_closures').select('work_date,reason').eq('work_date',todayKey).maybeSingle();if(venueClosureError)throw venueClosureError;if(isMonday(todayKey)||venueClosure)return NextResponse.json({error:isMonday(todayKey)?'今日為每週一固定休館':'今日臨時休館，暫停接受點餐'},{status:400});

    const {items:cleanItems,foodTotal,liquorTotal}=parseDiningItems(body.items);
    if(wantsPolaroid&&foodTotal<150000)return NextResponse.json({error:'慕斯菲露紀念拍立得需本筆餐點消費滿 150,000 Gil（酒品不列入）'},{status:400});
    if(wantsYukinojiPolaroid&&foodTotal<200000)return NextResponse.json({error:'雪之寺羽狩紀念拍立得需本筆餐點消費滿 200,000 Gil（酒品不列入）'},{status:400});

    let deliveryPreferenceStaff:any=null;
    if(deliveryPreferenceStaffId){
      const staffDb=adminSupabase();
      // 副館主不另建帳號；以館主的有效 ID 收單及通知，但保留客人指定的副館主姓名。
      const isDeputyDelivery=deliveryPreferenceStaffId==='croseviel';
      const deliveryLookup=isDeputyDelivery?'riku':deliveryPreferenceStaffId;
      const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryLookup);
      const query=staffDb.from('staff').select('id,name,active').eq('active',true);
      const r=isUuid?await query.eq('id',deliveryLookup).single():await query.eq('slug',deliveryLookup).single();
      if(r.error||!r.data)return NextResponse.json({error:'指定的希望送餐館員目前無法選擇'},{status:400});
      const{data:deliveryOff,error:deliveryOffError}=await staffDb.from('staff_work_calendar').select('staff_id').eq('staff_id',r.data.id).eq('work_date',todayKey).eq('status','off').maybeSingle();if(deliveryOffError)throw deliveryOffError;if(deliveryOff)return NextResponse.json({error:'希望送餐的館員今日休假，請改選其他館員或不指定'},{status:400});
      if(isDeputyDelivery){
        const{data:active,error:activeError}=await staffDb.from('reservations').select('id').eq('staff_id',r.data.id).not('status','in','(completed,cancelled,rejected,已完成,已取消,已拒絕)').limit(1);
        if(activeError)throw activeError;
        if(active?.length)return NextResponse.json({error:'副館主目前無法安排送餐，請改選其他館員或不指定'},{status:409});
      }
      deliveryPreferenceStaff={...r.data,name:isDeputyDelivery?'克羅塞維爾':r.data.name};
    }

    let musu:any=null,yuki:any=null;
    if(wantsPolaroid){const r=await publicSupabase().from('staff').select('id,name,slug').eq('slug','musufiru').single();if(r.error||!r.data)return NextResponse.json({error:'找不到慕斯菲露館員資料'},{status:400});musu=r.data}
    if(wantsYukinojiPolaroid){const r=await publicSupabase().from('staff').select('id,name,slug').eq('slug','yukinoji-hakari').single();if(r.error||!r.data)return NextResponse.json({error:'找不到雪之寺羽狩館員資料'},{status:400});yuki=r.data}
    if(musu||yuki){
      const {data:paused,error:serviceError}=await closureDb.from('staff_service_availability').select('staff_id').in('staff_id',[musu?.id,yuki?.id].filter(Boolean)).eq('service_name','紀念拍立得').eq('enabled',false);
      if(serviceError)throw serviceError;
      if(paused?.length)return NextResponse.json({error:'所選的紀念拍立得目前暫停提供，請重新選擇。'},{status:409});
    }

    const orderItems=[...cleanItems,...(wantsPolaroid?[{name:'慕斯菲露－紀念拍立得',qty:1,price:POLAROID_PRICE}]:[]),...(wantsYukinojiPolaroid?[{name:'雪之寺羽狩－紀念拍立得',qty:1,price:YUKINOJI_POLAROID_PRICE}]:[])];
    const total=foodTotal+liquorTotal+(wantsPolaroid?POLAROID_PRICE:0)+(wantsYukinojiPolaroid?YUKINOJI_POLAROID_PRICE:0);
    if(!Number.isSafeInteger(total))throw new DiningInputError('訂單金額過大，請分筆送出');
    const staffId=wantsPolaroid&&!wantsYukinojiPolaroid?musu.id:wantsYukinojiPolaroid&&!wantsPolaroid?yuki.id:null;
    const { error } = await publicSupabase().from('orders').insert({guest_name:guestName,guest_server:guestServer,staff_id:staffId,items:orderItems,total,note:String(body.note??'').trim(),status:'pending',delivery_preference_staff_id:deliveryPreferenceStaff?.id??null,delivery_preference_staff_name:deliveryPreferenceStaff?.name??null});
    if (error) throw error;

    const pickupCodes:string[]=[];
    if(wantsPolaroid)pickupCodes.push(await createPickup(musu,guestName,guestServer));
    if(wantsYukinojiPolaroid)pickupCodes.push(await createPickup(yuki,guestName,guestServer));
    return NextResponse.json({ ok: true, pickup_code:pickupCodes[0], pickup_codes:pickupCodes });
  } catch (error) {
    if(error instanceof DiningInputError||error instanceof SyntaxError)return NextResponse.json({error:error instanceof SyntaxError?'訂單格式不正確':error.message},{status:400});
    const message = error instanceof Error ? error.message : '送出點餐失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
