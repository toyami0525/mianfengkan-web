import {NextResponse} from 'next/server';
import {randomBytes} from 'crypto';
import {authenticateCampaignOwner, CAMPAIGN_NO_STORE} from '@/lib/halloween-campaign-auth';
import {campaignAmount, isCampaignDate, normalizeCampaignGuest, taipeiCampaignDate} from '@/lib/halloween-campaign';

export const dynamic = 'force-dynamic';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pickupCode(): string {
  return 'MF-' + Array.from(randomBytes(6) as Uint8Array).map(value => CODE_CHARS[value % CODE_CHARS.length]).join('');
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateCampaignOwner(request);
    if ('response' in auth) return auth.response;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.guest_name !== 'string' || typeof body.guest_server !== 'string'
      || body.guest_name.length > 256 || body.guest_server.length > 180) {
      return NextResponse.json({error: '請確認客人名稱與伺服器'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    const guestName = normalizeCampaignGuest(body.guest_name), guestServer = normalizeCampaignGuest(body.guest_server);
    if (!guestName || guestName.length > 80 || !guestServer || guestServer.length > 60) {
      return NextResponse.json({error: '請填寫完整客人名稱與伺服器；名稱最多 80 字，伺服器最多 60 字'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    const date = body.spend_date;
    if (!isCampaignDate(date) || date > taipeiCampaignDate()) {
      return NextResponse.json({error: '請選擇有效的已發生消費日期'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const {data, error} = await auth.db.rpc('issue_halloween_reward', {
        p_guest_name: guestName, p_guest_server: guestServer, p_spend_date: date,
        p_issued_by: auth.userId, p_pickup_code: pickupCode(),
      });
      if (error) {
        if (error.code === '23505' && error.message.includes('polaroid_pickups_pickup_code_key')) continue;
        if (error.code === 'P0001') return NextResponse.json({error: error.message}, {status: 409, headers: CAMPAIGN_NO_STORE});
        throw error;
      }
      if (!data?.id || !data?.pickup_id || !data?.pickup_code) throw new Error('活動取件碼資料不完整');
      return NextResponse.json({
        ok: true, id: data.id, spend_date: data.spend_date, guest_name: data.guest_name,
        guest_server: data.guest_server, total: campaignAmount(data.total), pickup_code: data.pickup_code,
        pickup_id: data.pickup_id, issued_at: data.issued_at, already_issued: data.already_issued === true,
      }, {headers: CAMPAIGN_NO_STORE});
    }
    return NextResponse.json({error: '暫時無法產生取件碼，請稍後再試'}, {status: 503, headers: CAMPAIGN_NO_STORE});
  } catch (error) {
    console.error('Halloween reward issue failed');
    return NextResponse.json({error: '發放失敗，請重新整理確認紀錄後再試'}, {status: 500, headers: CAMPAIGN_NO_STORE});
  }
}
