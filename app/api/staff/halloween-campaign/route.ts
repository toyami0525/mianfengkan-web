import {NextResponse} from 'next/server';
import {authenticateCampaignOwner, CAMPAIGN_NO_STORE} from '@/lib/halloween-campaign-auth';
import {
  HALLOWEEN_CAMPAIGN_ID, HALLOWEEN_CONFIG_COLUMNS, HALLOWEEN_THRESHOLD,
  campaignAmount, campaignCanIssueOn, campaignConfig, isCampaignDate, taipeiCampaignDate,
  type HalloweenCampaignRecord, type HalloweenCampaignDashboard, type HalloweenGuestRow,
} from '@/lib/halloween-campaign';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 1000;
type Db = Awaited<ReturnType<typeof authenticateCampaignOwner>> extends infer Auth
  ? Auth extends {db: infer Client} ? Client : never : never;
type SpendRow = {guest_name: string; guest_server: string; guest_key: string; server_key: string;
  reservation_total: number | string; dining_total: number | string; game_total: number | string; total: number | string};
type ClaimRow = {id: string; guest_name: string; guest_server: string; guest_key: string; server_key: string;
  qualifying_total: number | string; issued_at: string; pickup: {pickup_code: string; status: string} | {pickup_code: string; status: string}[] | null};

async function readSpend(db: Db, date: string): Promise<SpendRow[]> {
  const rows: SpendRow[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const {data, error} = await db.rpc('halloween_daily_spend', {p_spend_date: date})
      .order('guest_key').order('server_key').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as SpendRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readClaims(db: Db, date: string): Promise<ClaimRow[]> {
  const rows: ClaimRow[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const {data, error} = await db.from('halloween_reward_claims')
      .select('id,guest_name,guest_server,guest_key,server_key,qualifying_total,issued_at,pickup:polaroid_pickups!pickup_id(pickup_code,status)')
      .eq('campaign_id', HALLOWEEN_CAMPAIGN_ID).eq('spend_date', date).order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as unknown as ClaimRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function guestIdentity(row: {guest_key: string; server_key: string}): string {
  return JSON.stringify([row.guest_key, row.server_key]);
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateCampaignOwner(request);
    if ('response' in auth) return auth.response;
    const date = new URL(request.url).searchParams.get('date') || taipeiCampaignDate();
    if (!isCampaignDate(date)) return NextResponse.json({error: '請選擇有效日期'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    const [settings, spend, claims] = await Promise.all([
      auth.db.from('halloween_campaigns').select(HALLOWEEN_CONFIG_COLUMNS).eq('id', HALLOWEEN_CAMPAIGN_ID).maybeSingle(),
      readSpend(auth.db, date), readClaims(auth.db, date),
    ]);
    if (settings.error) throw settings.error;
    if (!settings.data) return NextResponse.json({error: '活動設定尚未準備完成'}, {status: 503, headers: CAMPAIGN_NO_STORE});
    const config = campaignConfig(settings.data as HalloweenCampaignRecord);
    const dayCanIssue = campaignCanIssueOn(config, date);
    const guests = new Map<string, HalloweenGuestRow>();
    for (const row of spend) {
      const total = campaignAmount(row.total);
      const eligible = total >= HALLOWEEN_THRESHOLD && Boolean(row.guest_name?.trim() && row.guest_server?.trim());
      guests.set(guestIdentity(row), {
        guest_name: row.guest_name, guest_server: row.guest_server,
        reservation_total: campaignAmount(row.reservation_total), dining_total: campaignAmount(row.dining_total),
        game_total: campaignAmount(row.game_total), total, eligible, can_issue: eligible && dayCanIssue, claim: null,
      });
    }
    for (const row of claims) {
      const key = guestIdentity(row);
      // Issued rewards stay visible even if a source order is subsequently cancelled.
      const guest = guests.get(key) || {
        guest_name: row.guest_name, guest_server: row.guest_server, reservation_total: 0,
        dining_total: 0, game_total: 0, total: 0, eligible: false, can_issue: false, claim: null,
      };
      const pickup = Array.isArray(row.pickup) ? row.pickup[0] : row.pickup;
      guest.claim = {
        id: row.id, pickup_code: pickup?.pickup_code || '', pickup_status: pickup?.status || 'processing',
        issued_at: row.issued_at, qualifying_total: campaignAmount(row.qualifying_total),
      };
      guest.can_issue = false;
      guests.set(key, guest);
    }
    const rows = [...guests.values()].sort((a, b) => Number(b.can_issue) - Number(a.can_issue) || b.total - a.total
      || a.guest_name.localeCompare(b.guest_name, 'zh-Hant-TW') || a.guest_server.localeCompare(b.guest_server, 'zh-Hant-TW'));
    const result: HalloweenCampaignDashboard = {
      config, spend_date: date, guests: rows,
      summary: {total_guests: rows.length, qualified_guests: rows.filter(row => row.eligible).length,
        issued_count: rows.filter(row => row.claim).length},
    };
    return NextResponse.json(result, {headers: CAMPAIGN_NO_STORE});
  } catch (error) {
    console.error('Halloween campaign dashboard read failed');
    return NextResponse.json({error: '讀取活動資料失敗，請稍後重新整理'}, {status: 500, headers: CAMPAIGN_NO_STORE});
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateCampaignOwner(request);
    if ('response' in auth) return auth.response;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.enabled !== 'boolean' || typeof body.published !== 'boolean') {
      return NextResponse.json({error: '請確認活動啟用與公開設定'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    const startsOn = body.starts_on === '' || body.starts_on === null ? null : body.starts_on;
    const endsOn = body.ends_on === '' || body.ends_on === null ? null : body.ends_on;
    if ((startsOn !== null && !isCampaignDate(startsOn)) || (endsOn !== null && !isCampaignDate(endsOn))
      || (startsOn && endsOn && startsOn > endsOn)) {
      return NextResponse.json({error: '請填寫有效的活動日期，結束日期不能早於開始日期'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    if ((body.enabled || body.published) && (!startsOn || !endsOn)) {
      return NextResponse.json({error: '啟用活動前，請先設定開始與結束日期'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    if (body.published && !body.enabled) {
      return NextResponse.json({error: '請先啟用活動，再公開到前台'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    const expected = body.expected_updated_at;
    if (typeof expected !== 'string' || expected.length > 80 || !Number.isFinite(Date.parse(expected))) {
      return NextResponse.json({error: '請重新整理活動設定後再儲存'}, {status: 400, headers: CAMPAIGN_NO_STORE});
    }
    // Make revisions advance even when two saves occur within one millisecond.
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(expected) + 1)).toISOString();
    const {data, error} = await auth.db.from('halloween_campaigns').update({
      enabled: body.enabled, published: body.published, starts_on: startsOn, ends_on: endsOn, updated_at: updatedAt,
    }).eq('id', HALLOWEEN_CAMPAIGN_ID).eq('updated_at', expected).select(HALLOWEEN_CONFIG_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({error: '活動設定已由其他視窗更新，請重新整理後再儲存'}, {status: 409, headers: CAMPAIGN_NO_STORE});
    return NextResponse.json({ok: true, config: campaignConfig(data as HalloweenCampaignRecord)}, {headers: CAMPAIGN_NO_STORE});
  } catch (error) {
    console.error('Halloween campaign settings save failed');
    return NextResponse.json({error: '儲存活動設定失敗，請稍後再試'}, {status: 500, headers: CAMPAIGN_NO_STORE});
  }
}
