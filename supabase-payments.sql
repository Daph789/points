alter table public.profiles
  add column if not exists points integer not null default 0;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.business_offers(id) on delete cascade,
  delivery_method text not null check (delivery_method in ('pickup', 'home')),
  offer_points integer not null,
  delivery_points integer not null default 0,
  delivery_address text,
  total_points integer not null,
  receiver_transaction_id text not null,
  receiver_profile_id uuid not null references public.profiles(id),
  validation_code text,
  security_code text,
  qr_token text,
  qr_valid_from date default current_date,
  qr_valid_until date,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  verification_method text,
  verification_count integer not null default 0,
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.purchases
  add column if not exists delivery_address text;

alter table public.purchases
  add column if not exists validation_code text;

alter table public.purchases
  add column if not exists security_code text;

alter table public.purchases
  add column if not exists qr_token text;

alter table public.purchases
  add column if not exists qr_valid_from date default current_date;

alter table public.purchases
  add column if not exists qr_valid_until date;

alter table public.purchases
  add column if not exists verified_at timestamptz;

alter table public.purchases
  add column if not exists verified_by uuid references auth.users(id);

alter table public.purchases
  add column if not exists verification_method text;

alter table public.purchases
  add column if not exists verification_count integer not null default 0;

alter table public.purchases
  add column if not exists last_verified_at timestamptz;

alter table public.business_offers
  add column if not exists qr_valid_from date;

alter table public.business_offers
  add column if not exists qr_valid_until date;

create unique index if not exists purchases_validation_code_key
  on public.purchases(validation_code);

create unique index if not exists purchases_qr_token_key
  on public.purchases(qr_token);

alter table public.purchases enable row level security;

drop policy if exists "Users can read their own purchases" on public.purchases;

create policy "Users can read their own purchases"
  on public.purchases
  for select
  to authenticated
  using (auth.uid() = buyer_id);

create or replace function public.purchase_offer(
  p_offer_id uuid,
  p_delivery_method text,
  p_delivery_address text default null
)
returns table(
  purchase_id uuid,
  total_points integer,
  buyer_points integer,
  receiver_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer_profile public.profiles%rowtype;
  receiver_profile public.profiles%rowtype;
  offer_row public.business_offers%rowtype;
  clean_delivery text;
  offer_cost integer;
  delivery_cost integer;
  total_cost integer;
  new_purchase_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  clean_delivery := coalesce(nullif(p_delivery_method, ''), 'pickup');

  select *
  into offer_row
  from public.business_offers
  where id = p_offer_id;

  if not found then
    raise exception 'offer_not_found';
  end if;

  if clean_delivery = 'pickup' and coalesce(offer_row.delivery_pickup_enabled, true) is not true then
    raise exception 'pickup_not_available';
  end if;

  if clean_delivery = 'home' and coalesce(offer_row.delivery_home_enabled, false) is not true then
    raise exception 'home_delivery_not_available';
  end if;

  if clean_delivery = 'home' and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'delivery_address_missing';
  end if;

  if offer_row.receiver_transaction_id is null or offer_row.receiver_transaction_id = '' then
    raise exception 'receiver_missing';
  end if;

  select *
  into buyer_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'buyer_profile_missing';
  end if;

  select *
  into receiver_profile
  from public.profiles
  where transaction_id = upper(regexp_replace(offer_row.receiver_transaction_id, '[^A-Z0-9]', '', 'g'))
  for update;

  if not found then
    raise exception 'receiver_not_found';
  end if;

  offer_cost := greatest(coalesce(offer_row.required_points, 0), 0);
  delivery_cost := case
    when clean_delivery = 'home' then greatest(coalesce(offer_row.delivery_home_points, 0), 0)
    else 0
  end;
  total_cost := offer_cost + delivery_cost;

  if coalesce(buyer_profile.points, 0) < total_cost then
    raise exception 'insufficient_points';
  end if;

  update public.profiles
  set points = points - total_cost,
      updated_at = now()
  where id = buyer_profile.id;

  update public.profiles
  set points = points + total_cost,
      updated_at = now()
  where id = receiver_profile.id;

  insert into public.purchases (
    buyer_id,
    offer_id,
    delivery_method,
    offer_points,
    delivery_points,
    delivery_address,
    total_points,
    receiver_transaction_id,
    receiver_profile_id,
    validation_code,
    security_code,
    qr_token,
    qr_valid_from,
    qr_valid_until
  )
  values (
    buyer_profile.id,
    offer_row.id,
    clean_delivery,
    offer_cost,
    delivery_cost,
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    total_cost,
    receiver_profile.transaction_id,
    receiver_profile.id,
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)),
    lpad(floor(random() * 10000)::int::text, 4, '0'),
    gen_random_uuid()::text,
    coalesce(offer_row.qr_valid_from, offer_row.start_date, current_date),
    coalesce(offer_row.qr_valid_until, offer_row.end_date)
  )
  returning id into new_purchase_id;

  return query
  select
    new_purchase_id,
    total_cost,
    (buyer_profile.points - total_cost),
    receiver_profile.display_name;
end;
$$;

grant execute on function public.purchase_offer(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

select 'pagos Donos activados' as status;
