import {NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';

export const CAMPAIGN_NO_STORE = {'Cache-Control': 'private, no-store, max-age=0'};

type CampaignOwner = {db: ReturnType<typeof adminSupabase>; userId: string};
type CampaignAuth = CampaignOwner | {response: ReturnType<typeof NextResponse.json>};

export async function authenticateCampaignOwner(request: Request): Promise<CampaignAuth> {
  const bearer = (request.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return {response: NextResponse.json({error: '請重新登入館主後台'}, {status: 401, headers: CAMPAIGN_NO_STORE})};
  const db = adminSupabase();
  const {data: {user}, error: authError} = await db.auth.getUser(bearer[1]);
  if (authError || !user) return {response: NextResponse.json({error: '登入已失效，請重新登入館主後台'}, {status: 401, headers: CAMPAIGN_NO_STORE})};
  const {data: account, error} = await db.from('staff_accounts').select('role,active')
    .eq('user_id', user.id).eq('active', true).maybeSingle();
  if (error) throw error;
  if (account?.role !== 'owner') return {response: NextResponse.json({error: '只有館主可以管理滿額贈活動'}, {status: 403, headers: CAMPAIGN_NO_STORE})};
  return {db, userId: user.id};
}
