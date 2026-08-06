'use client';

import { FormEvent, useState } from 'react';
import { supabase } from '@/lib/supabase';

type LoginResponse = {
  ok?: boolean;
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

export default function Login() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setMsg('登入中…');

    try {
      const response = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login_id: loginId.trim(),
          password,
        }),
      });
      const result = (await response.json()) as LoginResponse;

      if (
        !response.ok ||
        !result.ok ||
        !result.access_token ||
        !result.refresh_token
      ) {
        throw new Error(result.error || '登入失敗');
      }

      const { error } = await supabase().auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (error) throw error;

      location.href = '/admin';
    } catch (error) {
      setMsg(error instanceof Error ? error.message : '登入失敗');
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form className="login-card" onSubmit={go}>
        <div className="seal">楓</div>
        <p className="eyebrow">MIANFENGKAN STAFF</p>
        <h1>眠楓館・館員登入</h1>
        <label>
          遊戲角色 ID
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            placeholder="請輸入您的遊戲角色 ID"
            required
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button disabled={busy}>{busy ? '登入中…' : '登入'}</button>
        <p className="message">{msg}</p>
        <a href="/index.html">返回網站</a>
      </form>
    </main>
  );
}
