import {NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';
import {
  HALLOWEEN_CAMPAIGN_ID, HALLOWEEN_CONFIG_COLUMNS, campaignConfig, campaignIsPublic,
  type HalloweenCampaignRecord,
} from '@/lib/halloween-campaign';

export const dynamic = 'force-dynamic';
const HEADERS = {'Cache-Control': 'no-store, max-age=0'};
const inactive = () => NextResponse.json({active: false}, {headers: HEADERS});

export async function GET() {
  try {
    const {data, error} = await adminSupabase().from('halloween_campaigns').select(HALLOWEEN_CONFIG_COLUMNS)
      .eq('id', HALLOWEEN_CAMPAIGN_ID).maybeSingle();
    if (error || !data || !campaignIsPublic(data as HalloweenCampaignRecord)) return inactive();
    const config = campaignConfig(data as HalloweenCampaignRecord);
    // Only public announcement text is returned. Drafts, guest totals and codes stay private.
    return NextResponse.json({
      active: true, title: config.title, reward_name: config.reward_name, threshold: config.threshold,
      per_day_limit: config.per_day_limit, timezone: config.timezone,
      starts_on: config.starts_on, ends_on: config.ends_on,
    }, {headers: HEADERS});
  } catch {
    return inactive();
  }
}
