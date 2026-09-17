-- Guest feedback: public submission, owner-only reading.
create table public.guest_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  created_at timestamptz not null default now(),
  is_anonymous boolean not null,
  guest_name text,
  staff_name text not null,
  rating smallint not null,
  services text[] not null,
  comments text not null default '',
  constraint guest_feedback_identity check (
    (is_anonymous and guest_name is null) or
    (not is_anonymous and guest_name is not null and char_length(btrim(guest_name)) between 1 and 80)
  ),
  constraint guest_feedback_staff check (char_length(btrim(staff_name)) between 1 and 160),
  constraint guest_feedback_rating check (rating between 1 and 5),
  constraint guest_feedback_services check (
    cardinality(services) between 1 and 8
    and array_position(services, null) is null
    and services <@ array['只點餐而已','泡湯洗浴','按摩服務','耳語陪伴','Q版繪圖(公版)','拍立得','簽繪拍立得','其他服務']::text[]
    and (not ('只點餐而已' = any(services)) or cardinality(services) = 1)
  ),
  constraint guest_feedback_comments check (char_length(comments) <= 2000)
);
create index guest_feedback_created_at_idx on public.guest_feedback (created_at desc, id desc);
alter table public.guest_feedback enable row level security;
revoke all on public.guest_feedback from public, anon, authenticated;
grant insert (submission_id,is_anonymous,guest_name,staff_name,rating,services,comments)
  on public.guest_feedback to anon, authenticated;
grant select on public.guest_feedback to authenticated;
create policy "guests submit feedback" on public.guest_feedback for insert
  to anon, authenticated with check (true);
create policy "owner reads feedback" on public.guest_feedback for select
  to authenticated using (exists (
    select 1 from public.staff_accounts account
    where account.user_id = (select auth.uid())
      and account.active = true and account.role = 'owner'
  ));
comment on table public.guest_feedback is 'Private guest feedback; anonymous responses never store a guest name.';
