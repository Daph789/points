-- Donoss - publications/offres des entreprises.
-- Mode lancement actuel: business_offers reste sans RLS pour que les offres publiques
-- s'affichent partout dans l'app. Si tu securises cette table plus tard, il faudra
-- une vraie politique publique en lecture + des routes serveur pour les actions privees.

create table if not exists public.business_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
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
  additional_links jsonb not null default '[]'::jsonb,
  additional_details jsonb not null default '[]'::jsonb,
  cart_button_text text,
  external_checkout_enabled boolean not null default false,
  external_checkout_url text,
  receiver_transaction_id text,
  receiver_display_name text,
  business_display_name text,
  business_is_verified boolean not null default false,
  delivery_home_enabled boolean not null default false,
  delivery_home_price numeric,
  delivery_home_points integer,
  delivery_pickup_enabled boolean not null default true,
  reservation_enabled boolean not null default false,
  reservation_time_slots text[] not null default '{}'::text[],
  reservation_max_people integer,
  reservation_days_ahead integer not null default 0,
  reservation_available_weekdays jsonb not null default '[1,2,3,4,5,6,0]'::jsonb,
  qr_valid_from date,
  qr_valid_until date,
  stock_quantity integer,
  sold_count integer not null default 0,
  out_of_stock_since timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_offers
  add column if not exists business_id uuid references auth.users(id) on delete cascade;

alter table public.business_offers
  alter column business_id set default auth.uid();

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
  add column if not exists additional_links jsonb not null default '[]'::jsonb;

alter table public.business_offers
  add column if not exists additional_details jsonb not null default '[]'::jsonb;

alter table public.business_offers
  add column if not exists cart_button_text text;

alter table public.business_offers
  add column if not exists external_checkout_enabled boolean not null default false;

alter table public.business_offers
  add column if not exists external_checkout_url text;

alter table public.business_offers
  add column if not exists receiver_transaction_id text;

alter table public.business_offers
  add column if not exists receiver_display_name text;

alter table public.business_offers
  add column if not exists business_display_name text;

alter table public.business_offers
  add column if not exists business_is_verified boolean not null default false;

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
  add column if not exists reservation_available_weekdays jsonb not null default '[1,2,3,4,5,6,0]'::jsonb;

alter table public.business_offers
  add column if not exists qr_valid_from date;

alter table public.business_offers
  add column if not exists qr_valid_until date;

alter table public.business_offers
  add column if not exists stock_quantity integer;

alter table public.business_offers
  add column if not exists sold_count integer not null default 0;

alter table public.business_offers
  add column if not exists out_of_stock_since timestamptz;

alter table public.business_offers
  add column if not exists is_hidden boolean not null default false;

update public.business_offers
set sold_count = 0
where sold_count is null;

drop policy if exists "Businesses can read their own offers" on public.business_offers;
drop policy if exists "Businesses can insert their own offers" on public.business_offers;
drop policy if exists "Businesses can update their own offers" on public.business_offers;
drop policy if exists "Anyone can read public offers" on public.business_offers;
drop policy if exists "Businesses can manage their own offers" on public.business_offers;

alter table public.business_offers disable row level security;

create or replace function public.save_business_offer(offer jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  new_offer_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.business_offers (
    business_id,
    cover_photo_name,
    presentation_image_names,
    title,
    address,
    categories,
    base_price,
    reduced_price,
    required_points,
    hours,
    start_date,
    end_date,
    age,
    author,
    description,
    cart_button_text,
    external_checkout_enabled,
    external_checkout_url,
    receiver_transaction_id,
    receiver_display_name,
    delivery_home_enabled,
    delivery_home_price,
    delivery_home_points,
    delivery_pickup_enabled
  )
  values (
    current_user_id,
    nullif(offer ->> 'cover_photo_name', ''),
    case
      when jsonb_typeof(offer -> 'presentation_image_names') = 'array'
        then array(select jsonb_array_elements_text(offer -> 'presentation_image_names'))
      else null
    end,
    nullif(offer ->> 'title', ''),
    nullif(offer ->> 'address', ''),
    case
      when jsonb_typeof(offer -> 'categories') = 'array'
        then array(select jsonb_array_elements_text(offer -> 'categories'))
      else null
    end,
    nullif(offer ->> 'base_price', '')::numeric,
    nullif(offer ->> 'reduced_price', '')::numeric,
    nullif(offer ->> 'required_points', '')::integer,
    nullif(offer ->> 'hours', ''),
    nullif(offer ->> 'start_date', '')::date,
    nullif(offer ->> 'end_date', '')::date,
    nullif(offer ->> 'age', ''),
    nullif(offer ->> 'author', ''),
    nullif(offer ->> 'description', ''),
    coalesce(nullif(offer ->> 'cart_button_text', ''), 'Comprar'),
    coalesce((offer ->> 'external_checkout_enabled')::boolean, false),
    nullif(offer ->> 'external_checkout_url', ''),
    nullif(offer ->> 'receiver_transaction_id', ''),
    nullif(offer ->> 'receiver_display_name', ''),
    coalesce((offer ->> 'delivery_home_enabled')::boolean, false),
    nullif(offer ->> 'delivery_home_price', '')::numeric,
    nullif(offer ->> 'delivery_home_points', '')::integer,
    coalesce((offer ->> 'delivery_pickup_enabled')::boolean, true)
  )
  returning id into new_offer_id;

  return new_offer_id;
end;
$$;

grant execute on function public.save_business_offer(jsonb) to authenticated;

notify pgrst, 'reload schema';

select 'business_offers lista' as status;
