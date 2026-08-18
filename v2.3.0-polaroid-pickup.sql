-- 眠楓館 v2.3.0：拍立得取件系統
create table if not exists public.polaroid_pickups (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  staff_name text not null,
  guest_name text not null,
  pickup_code text not null unique,
  status text not null default 'processing' check (status in ('processing','ready')),
  image_path text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists polaroid_pickups_staff_id_idx on public.polaroid_pickups(staff_id);
create index if not exists polaroid_pickups_code_idx on public.polaroid_pickups(pickup_code);

alter table public.polaroid_pickups enable row level security;

drop policy if exists "staff read own polaroids" on public.polaroid_pickups;
create policy "staff read own polaroids" on public.polaroid_pickups
for select to authenticated
using (public.current_staff_role() in ('owner','frontdesk') or staff_id = public.current_staff_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('polaroids', 'polaroids', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=15728640, allowed_mime_types=array['image/jpeg','image/png','image/webp'];
