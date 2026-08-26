create table if not exists public.business_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references auth.users(id) on delete cascade,
  cover_photo_name text,
  cover_photo_data_url text,
  presentation_image_names text[],
  presentation_image_data_urls text[],
  title text,
  address text,
  categories text[],
  base_price numeric,
  reduced_price numeric,
  required_points integer,
  hours text,
  start_date date,
  end_date date,
  age text,
  author text,
  description text,
  cart_button_text text,
  receiver_transaction_id text,
  receiver_display_name text,
  delivery_home_enabled boolean not null default false,
  delivery_home_price numeric,
  delivery_home_points integer,
  delivery_pickup_enabled boolean not null default true,
  reservation_enabled boolean not null default false,
  reservation_time_slots text[] not null default '{}'::text[],
  reservation_max_people integer,
  reservation_days_ahead integer not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_offers
  add column if not exists business_id uuid references auth.users(id) on delete cascade;

alter table public.business_offers
  add column if not exists cover_photo_name text;

alter table public.business_offers
  add column if not exists cover_photo_data_url text;

alter table public.business_offers
  add column if not exists presentation_image_names text[];

alter table public.business_offers
  add column if not exists presentation_image_data_urls text[];

alter table public.business_offers
  add column if not exists title text;

alter table public.business_offers
  add column if not exists address text;

alter table public.business_offers
  add column if not exists categories text[];

alter table public.business_offers
  add column if not exists base_price numeric;

alter table public.business_offers
  add column if not exists reduced_price numeric;

alter table public.business_offers
  add column if not exists required_points integer;

alter table public.business_offers
  add column if not exists hours text;

alter table public.business_offers
  add column if not exists start_date date;

alter table public.business_offers
  add column if not exists end_date date;

alter table public.business_offers
  add column if not exists age text;

alter table public.business_offers
  add column if not exists author text;

alter table public.business_offers
  add column if not exists description text;

alter table public.business_offers
  add column if not exists cart_button_text text;

alter table public.business_offers
  add column if not exists receiver_transaction_id text;

alter table public.business_offers
  add column if not exists receiver_display_name text;

alter table public.business_offers
  add column if not exists delivery_home_enabled boolean not null default false;

alter table public.business_offers
  add column if not exists delivery_home_price numeric;

alter table public.business_offers
  add column if not exists delivery_home_points integer;

alter table public.business_offers
  add column if not exists delivery_pickup_enabled boolean not null default true;

alter table public.business_offers
  add column if not exists reservation_enabled boolean not null default false;

alter table public.business_offers
  add column if not exists reservation_time_slots text[] not null default '{}'::text[];

alter table public.business_offers
  add column if not exists reservation_max_people integer;

alter table public.business_offers
  add column if not exists reservation_days_ahead integer not null default 0;

alter table public.business_offers
  add column if not exists is_hidden boolean not null default false;

alter table public.business_offers
  add column if not exists additional_links jsonb not null default '[]'::jsonb;

alter table public.business_offers
  add column if not exists additional_details jsonb not null default '[]'::jsonb;

drop policy if exists "Businesses can read their own offers" on public.business_offers;
drop policy if exists "Businesses can insert their own offers" on public.business_offers;
drop policy if exists "Businesses can update their own offers" on public.business_offers;

alter table public.business_offers disable row level security;

notify pgrst, 'reload schema';

select 'business_offers sin RLS para desarrollo' as status;
