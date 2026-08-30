create table if not exists public.offer_automation_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  prefers_external_checkout boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  result_offer_url text,
  admin_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.offer_automation_requests
  add column if not exists business_id uuid references auth.users(id) on delete cascade;

alter table public.offer_automation_requests
  add column if not exists source_url text;

alter table public.offer_automation_requests
  add column if not exists prefers_external_checkout boolean not null default false;

alter table public.offer_automation_requests
  add column if not exists status text not null default 'pending';

alter table public.offer_automation_requests
  add column if not exists result_offer_url text;

alter table public.offer_automation_requests
  add column if not exists admin_note text;

alter table public.offer_automation_requests
  add column if not exists completed_at timestamptz;

alter table public.offer_automation_requests
  add column if not exists created_at timestamptz not null default now();

alter table public.offer_automation_requests
  add column if not exists updated_at timestamptz not null default now();

create index if not exists offer_automation_requests_business_idx
  on public.offer_automation_requests (business_id, created_at desc);

create index if not exists offer_automation_requests_status_idx
  on public.offer_automation_requests (status, created_at desc);

alter table public.offer_automation_requests enable row level security;

drop policy if exists "Businesses can read own automation requests" on public.offer_automation_requests;
create policy "Businesses can read own automation requests"
  on public.offer_automation_requests
  for select
  using (auth.uid() = business_id);

drop policy if exists "Businesses can create own automation requests" on public.offer_automation_requests;
create policy "Businesses can create own automation requests"
  on public.offer_automation_requests
  for insert
  with check (auth.uid() = business_id);

notify pgrst, 'reload schema';

select 'offer automation requests ready' as status;
