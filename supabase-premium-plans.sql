alter table public.profiles
  add column if not exists premium_status text default 'inactive',
  add column if not exists premium_started_at timestamptz,
  add column if not exists premium_next_charge_at timestamptz,
  add column if not exists premium_failed_at timestamptz;

create table if not exists public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_type text not null default 'user',
  points integer not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  next_charge_at timestamptz not null,
  last_charge_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_subscriptions_status_check check (status in ('active', 'failed', 'cancelled')),
  constraint premium_subscriptions_points_check check (points in (20, 30))
);

create table if not exists public.premium_subscription_charges (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.premium_subscriptions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null,
  status text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint premium_subscription_charges_status_check check (status in ('paid', 'failed'))
);

create index if not exists premium_subscriptions_profile_id_idx on public.premium_subscriptions(profile_id);
create index if not exists premium_subscriptions_status_next_charge_idx on public.premium_subscriptions(status, next_charge_at);
create index if not exists premium_subscription_charges_profile_id_idx on public.premium_subscription_charges(profile_id);
create index if not exists premium_subscription_charges_created_at_idx on public.premium_subscription_charges(created_at desc);

alter table public.premium_subscriptions enable row level security;
alter table public.premium_subscription_charges enable row level security;

drop policy if exists "Users can read their premium subscription" on public.premium_subscriptions;
create policy "Users can read their premium subscription"
  on public.premium_subscriptions for select
  using (auth.uid() = profile_id);

drop policy if exists "Users can read their premium charges" on public.premium_subscription_charges;
create policy "Users can read their premium charges"
  on public.premium_subscription_charges for select
  using (auth.uid() = profile_id);

notify pgrst, 'reload schema';

select 'premium_plans_ready' as status;
