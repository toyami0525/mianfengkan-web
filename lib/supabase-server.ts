import { createClient } from '@supabase/supabase-js';

export function publicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('尚未設定 Supabase 環境變數');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
