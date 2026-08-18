import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const loginId = String(body.login_id ?? '').trim();
    const password = String(body.password ?? '');

    if (!loginId || !password) {
      return NextResponse.json(
        { error: '請輸入遊戲角色 ID 與密碼。' },
        { status: 400 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: '伺服器尚未完成館員登入設定。' },
        { status: 500 },
      );
    }

    // 僅在伺服器端使用 service role，查詢啟用中的館員帳號對照。
    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: account, error: accountError } = await admin
      .from('staff_accounts')
      .select('user_id, staff_id, login_id, role, active')
      .eq('login_id', loginId)
      .eq('active', true)
      .maybeSingle();

    if (accountError) {
      console.error('staff_accounts lookup failed', accountError);
      return NextResponse.json({ error: '登入資料查詢失敗。' }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json(
        { error: '找不到此遊戲角色 ID，或帳號已停用。' },
        { status: 401 },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await admin.auth.admin.getUserById(account.user_id);

    if (userError || !user?.email) {
      console.error('auth user lookup failed', userError);
      return NextResponse.json(
        { error: '此館員尚未建立有效的登入帳號。' },
        { status: 401 },
      );
    }

    // 使用公開金鑰驗證館員輸入的密碼，不讓 service role 參與登入工作階段。
    const authClient = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: loginData, error: loginError } =
      await authClient.auth.signInWithPassword({
        email: user.email,
        password,
      });

    if (loginError || !loginData.session) {
      return NextResponse.json(
        { error: '遊戲角色 ID 或密碼錯誤。' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      account: {
        staff_id: account.staff_id,
        login_id: account.login_id,
        role: account.role,
      },
    });
  } catch (error) {
    console.error('staff login failed', error);
    return NextResponse.json({ error: '登入失敗，請稍後再試。' }, { status: 500 });
  }
}
