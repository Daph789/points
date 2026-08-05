alter table public.profiles
  add column if not exists neighborhood text;

alter table public.profiles
  add column if not exists account_type text not null default 'user';

alter table public.profiles
  add column if not exists business_categories text[];

alter table public.profiles
  add column if not exists tax_id text;

alter table public.profiles
  add column if not exists address text;

alter table public.profiles
  add column if not exists transaction_id text;

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

alter table public.profiles
  alter column phone drop not null;

create or replace function public.generate_donos_transaction_id()
returns text
language plpgsql
as $$
declare
  chars text[] := array[]::text[];
  result text := '';
  picked_index integer;
  letters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  digits text := '0123456789';
begin
  for i in 1..4 loop
    chars := chars || substr(letters, floor(random() * length(letters) + 1)::integer, 1);
  end loop;

  for i in 1..8 loop
    chars := chars || substr(digits, floor(random() * length(digits) + 1)::integer, 1);
  end loop;

  while array_length(chars, 1) > 0 loop
    picked_index := floor(random() * array_length(chars, 1) + 1)::integer;
    result := result || chars[picked_index];
    select coalesce(array_agg(value order by ordinality), array[]::text[])
    into chars
    from unnest(chars) with ordinality
    where ordinality <> picked_index;
  end loop;

  return result;
end;
$$;

create or replace function public.metadata_business_categories(metadata jsonb)
returns text[]
language sql
stable
as $$
  select case
    when jsonb_typeof(metadata -> 'business_categories') = 'array'
      then array(select jsonb_array_elements_text(metadata -> 'business_categories'))
    else null
  end;
$$;

insert into public.profiles (
  id,
  display_name,
  email,
  phone,
  neighborhood,
  account_type,
  business_categories,
  tax_id,
  address,
  transaction_id
)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data ->> 'display_name', ''), nullif(users.raw_user_meta_data ->> 'full_name', ''), split_part(users.email, '@', 1)),
  users.email,
  nullif(users.raw_user_meta_data ->> 'phone', ''),
  coalesce(nullif(users.raw_user_meta_data ->> 'neighborhood', ''), 'Donostia'),
  coalesce(nullif(users.raw_user_meta_data ->> 'account_type', ''), 'user'),
  public.metadata_business_categories(users.raw_user_meta_data),
  nullif(users.raw_user_meta_data ->> 'tax_id', ''),
  nullif(users.raw_user_meta_data ->> 'address', ''),
  case
    when upper(regexp_replace(coalesce(users.raw_user_meta_data ->> 'transaction_id', ''), '[^A-Z0-9]', '', 'g')) ~ '^[A-Z0-9]{12}$'
     and length(regexp_replace(upper(regexp_replace(coalesce(users.raw_user_meta_data ->> 'transaction_id', ''), '[^A-Z0-9]', '', 'g')), '[^A-Z]', '', 'g')) = 4
     and length(regexp_replace(upper(regexp_replace(coalesce(users.raw_user_meta_data ->> 'transaction_id', ''), '[^A-Z0-9]', '', 'g')), '[^0-9]', '', 'g')) = 8
      then upper(regexp_replace(users.raw_user_meta_data ->> 'transaction_id', '[^A-Z0-9]', '', 'g'))
    else public.generate_donos_transaction_id()
  end
from auth.users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    email,
    phone,
    neighborhood,
    account_type,
    business_categories,
    tax_id,
    address,
    transaction_id
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'neighborhood', ''), 'Donostia'),
    coalesce(nullif(new.raw_user_meta_data ->> 'account_type', ''), 'user'),
    public.metadata_business_categories(new.raw_user_meta_data),
    nullif(new.raw_user_meta_data ->> 'tax_id', ''),
    nullif(new.raw_user_meta_data ->> 'address', ''),
    public.generate_donos_transaction_id()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

-- Donos crea/rehidrata el perfil desde el servidor con /api/me/profile.
-- No recreamos el trigger de auth.users porque un error aquí bloquea completamente el registro.
drop function if exists public.handle_new_user_profile();

select id, display_name, email, account_type, transaction_id
from public.profiles
order by created_at desc;

alter table public.business_offers
  add column if not exists author text;

alter table public.business_offers
  add column if not exists delivery_home_enabled boolean not null default false;

alter table public.business_offers
  add column if not exists delivery_home_price numeric;

alter table public.business_offers
  add column if not exists delivery_home_points integer;

alter table public.business_offers
  add column if not exists delivery_pickup_enabled boolean not null default true;

alter table public.business_offers
  alter column business_id set default auth.uid();
