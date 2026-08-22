-- 眠楓館 v2.8.1：排班月曆簡化＋每週一固定休館＋臨時休館

create table if not exists public.staff_work_calendar (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  status text not null check (status in ('working','off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(staff_id, work_date)
);
create index if not exists staff_work_calendar_date_idx on public.staff_work_calendar(work_date);
create index if not exists staff_work_calendar_staff_date_idx on public.staff_work_calendar(staff_id,work_date);
alter table public.staff_work_calendar enable row level security;

-- 全館臨時休館日期。每週一固定休館由程式自動判斷，不需寫入資料表。
create table if not exists public.venue_closures (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  reason text not null default '臨時休館',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists venue_closures_date_idx on public.venue_closures(work_date);
alter table public.venue_closures enable row level security;

-- v2.8.1 起，週二～週日預設即為上班；因此舊的 working 明細不再需要。
-- 只保留館員主動設定的休假(off)。
delete from public.staff_work_calendar where status='working';
