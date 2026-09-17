-- Donoss markets: country + city fields.
-- Safe to run more than once. Run without enabling RLS.

alter table if exists public.profiles
  add column if not exists country_code text default 'ES',
  add column if not exists country_label text default 'España',
  add column if not exists city_market text default 'donostia',
  add column if not exists city_label text default 'Donostia / San Sebastián',
  add column if not exists city_status text default 'active',
  add column if not exists requested_city text,
  add column if not exists requested_city_country text;

alter table if exists public.business_offers
  add column if not exists country_code text default 'ES',
  add column if not exists city_market text default 'donostia',
  add column if not exists city_label text default 'Donostia / San Sebastián';

alter table if exists public.social_plans
  add column if not exists country_code text default 'ES',
  add column if not exists city_market text default 'donostia',
  add column if not exists city_label text default 'Donostia / San Sebastián';

create table if not exists public.city_opening_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  account_type text,
  country_code text not null,
  city_name text not null,
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.city_markets (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  city_market text not null,
  city_label text not null,
  is_active boolean not null default true,
  opened_from_request_id uuid references public.city_opening_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, city_market)
);

create index if not exists profiles_market_idx
  on public.profiles (country_code, city_market, city_status);

create index if not exists business_offers_market_idx
  on public.business_offers (country_code, city_market);

create index if not exists social_plans_market_idx
  on public.social_plans (country_code, city_market);

create index if not exists city_opening_requests_status_idx
  on public.city_opening_requests (status, country_code, city_name);

create index if not exists city_markets_active_idx
  on public.city_markets (country_code, is_active, city_market);

create unique index if not exists city_opening_requests_profile_city_uidx
  on public.city_opening_requests (profile_id, country_code, city_name);

insert into public.city_markets (country_code, city_market, city_label, is_active)
values
  ('ES', 'donostia', 'Donostia / San Sebastián', true),
  ('FR', 'lille', 'Lille', true),
  ('BE', 'tournai', 'Tournai', true)
on conflict (country_code, city_market) do update
set
  city_label = excluded.city_label,
  is_active = true,
  updated_at = now();

update public.profiles
set
  country_code = coalesce(country_code, 'ES'),
  country_label = coalesce(country_label, 'España'),
  city_market = coalesce(city_market, 'donostia'),
  city_label = coalesce(city_label, 'Donostia / San Sebastián'),
  city_status = coalesce(city_status, 'active')
where country_code is null
   or country_label is null
   or city_market is null
   or city_label is null
   or city_status is null;

update public.business_offers
set
  country_code = coalesce(country_code, 'ES'),
  city_market = coalesce(city_market, 'donostia'),
  city_label = coalesce(city_label, 'Donostia / San Sebastián')
where country_code is null
   or city_market is null
   or city_label is null;

update public.social_plans
set
  country_code = coalesce(country_code, 'ES'),
  city_market = coalesce(city_market, 'donostia'),
  city_label = coalesce(city_label, 'Donostia / San Sebastián')
where country_code is null
   or city_market is null
   or city_label is null;
