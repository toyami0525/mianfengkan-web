import {createHash,createHmac} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';
import {validateWerewolfInput,WEREWOLF_PRICE} from '@/lib/werewolf-booking';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
export async function GET() {
  try {
    const db=adminSupabase(),now=new Date();
    const today=new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
    const [closures,settings]=await Promise.all([
      db.from('venue_closures').select('work_date').gte('work_date',today).order('work_date'),
      db.from('site_settings').select('value').eq('key','venue').maybeSingle()
    ]);
    if (closures.error||settings.error) {
      const failure=closures.error||settings.error;
      console.error('[werewolf config query]',{source:closures.error?'closures':'venue',code:failure?.code,message:failure?.message});
      throw new Error('settings');
    }
    const venue=settings.data?.value||{};
    // No reservations, guest names or contact details are exposed by this endpoint.
    return reply({price:WEREWOLF_PRICE,today,now:now.toISOString(),closed_dates:(closures.data||[]).map(r=>r.work_date),address:typeof venue.address==='string'?venue.address:'穹頂皓天 7區22號'});
  } catch(error) {
    console.error('[werewolf config]',error instanceof Error?error.message:'configuration failure');
    return reply({error:'暫時無法確認休館日期，請稍後重新載入。'},503);
  }
}
export async function POST(req:NextRequest) {
  const origin=req.headers.get('origin');
  if (origin&&origin!==req.nextUrl.origin) return reply({error:'請從本站的狼人殺預約頁送出。'},403);
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({error:'預約格式不正確'},415);
  let booking;
  try {
    const raw=await req.text();
    if (raw.length>12000) return reply({error:'填寫內容過長'},413);
    booking=validateWerewolfInput(JSON.parse(raw));
  } catch(error) {return reply({error:error instanceof SyntaxError?'預約格式不正確':error instanceof Error?error.message:'請檢查填寫內容'},400);}
  try {
    const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('configuration');
    // Keep no raw IP address. The platform-supplied client address is HMAC'd for rate limiting.
    const ip=(req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
    const clientHash=createHmac('sha256',secret).update(`werewolf:${ip}`).digest('hex');
    const {request_id,...payload}=booking;
    const payloadHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const {data,error}=await adminSupabase().rpc('create_werewolf_reservation',{
      p_request_id:request_id,p_guest_name:booking.guest_name,p_guest_server:booking.guest_server,
      p_contact:booking.contact,p_starts_at:booking.starts_at,p_players:booking.players,
      p_notes:booking.notes,p_client_hash:clientHash,p_payload_hash:payloadHash
    });
    if (error) {
      const messages:Record<string,[number,string]>={
        WW_CLOSED:[409,'該日期休館，請改選其他日期。'],
        WW_TIME:[400,'請選擇尚未開始的時間（台灣時間 21:00～23:59）。'],
        WW_RATE:[429,'送出次數較多，請稍後再試，或直接聯繫館主。'],
        WW_RETRY:[409,'這筆送出紀錄的內容已變更，請重新整理後再試。']
      };
      const known=messages[error.message];
      if (known) return reply({error:known[1]},known[0]);
      if (error.code==='23505') return reply({error:'相同角色在這個時間已有待處理預約，請先聯繫館主確認，勿重複送出。'},409);
      console.error('[werewolf create]',{code:error.code});
      throw error;
    }
    if (!data?.booking_code||data.price!==WEREWOLF_PRICE) throw new Error('invalid response');
    return reply({ok:true,booking_code:data.booking_code,status:data.status,price:data.price});
  } catch {return reply({error:'尚未收到送出確認。填寫內容已保留，請稍後按原按鈕重試；系統會避免同一次送出重複建單。'},503);}
}
