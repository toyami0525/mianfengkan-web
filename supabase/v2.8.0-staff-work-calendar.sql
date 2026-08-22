-- 眠楓館 v2.8.0：館員排班月曆
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

-- 只透過網站 API 存取；瀏覽器端不直接讀寫此表。
alter table public.staff_work_calendar enable row level security;
