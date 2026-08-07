import { createClient } from '@supabase/supabase-js';

export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('伺服器尚未完成 Supabase 管理設定');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
