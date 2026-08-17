import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: '尚未設定 Supabase Realtime 前端連線資訊' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  return NextResponse.json(
    { supabaseUrl, supabaseKey },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
