create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  phone text,
  neighborhood text not null,
  account_type text not null default 'user' check (account_type in ('user', 'business')),
  business_categories text[],
  tax_id text,
  address text,
  transaction_id text not null unique check (
    transaction_id ~ '^[A-Z0-9]{12}$'
    and length(regexp_replace(transaction_id, '[^A-Z]', '', 'g')) = 4
    and length(regexp_replace(transaction_id, '[^0-9]', '', 'g')) = 8
  ),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists transaction_id text;

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

alter table public.profiles
  add column if not exists account_type text not null default 'user';

alter table public.profiles
  add column if not exists business_categories text[];

alter table public.profiles
  add column if not exists tax_id text;

alter table public.profiles
  add column if not exists address text;

alter table public.profiles
  alter column phone drop not null;

alter table public.profiles
  drop column if exists business_category;

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check check (account_type in ('user', 'business'));

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

update public.profiles
set transaction_id = public.generate_donos_transaction_id()
where transaction_id is null
  or transaction_id !~ '^[A-Z0-9]{12}$'
  or length(regexp_replace(transaction_id, '[^A-Z]', '', 'g')) <> 4
  or length(regexp_replace(transaction_id, '[^0-9]', '', 'g')) <> 8;

alter table public.profiles
  alter column transaction_id set not null;

alter table public.profiles
  drop constraint if exists profiles_transaction_id_check;

alter table public.profiles
  add constraint profiles_transaction_id_check check (
    transaction_id ~ '^[A-Z0-9]{12}$'
    and length(regexp_replace(transaction_id, '[^A-Z]', '', 'g')) = 4
    and length(regexp_replace(transaction_id, '[^0-9]', '', 'g')) = 8
  );

create unique index if not exists profiles_transaction_id_key
  on public.profiles (transaction_id);

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

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_transaction_id text;
begin
  clean_transaction_id := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'transaction_id', ''), '[^A-Z0-9]', '', 'g'));

  insert into public.profiles (
    id,
    account_type,
    display_name,
    email,
    phone,
    neighborhood,
    transaction_id,
    business_categories,
    tax_id,
    address
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'account_type', ''), 'user'),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'neighborhood', ''), 'Donostia'),
    case
      when clean_transaction_id ~ '^[A-Z0-9]{12}$'
       and length(regexp_replace(clean_transaction_id, '[^A-Z]', '', 'g')) = 4
       and length(regexp_replace(clean_transaction_id, '[^0-9]', '', 'g')) = 8
        then clean_transaction_id
      else public.generate_donos_transaction_id()
    end,
    public.metadata_business_categories(new.raw_user_meta_data),
    nullif(new.raw_user_meta_data ->> 'tax_id', ''),
    nullif(new.raw_user_meta_data ->> 'address', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

-- Donos crea/rehidrata el perfil desde el servidor con /api/me/profile.
-- No recreamos el trigger de auth.users porque un error aquí bloquea completamente el registro.
drop function if exists public.handle_new_user_profile();

insert into public.profiles (
  id,
  account_type,
  display_name,
  email,
  phone,
  neighborhood,
  transaction_id,
  business_categories,
  tax_id,
  address
)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data ->> 'account_type', ''), 'user'),
  coalesce(nullif(users.raw_user_meta_data ->> 'display_name', ''), split_part(users.email, '@', 1)),
  users.email,
  nullif(users.raw_user_meta_data ->> 'phone', ''),
  coalesce(nullif(users.raw_user_meta_data ->> 'neighborhood', ''), 'Donostia'),
  case
    when upper(regexp_replace(coalesce(users.raw_user_meta_data ->> 'transaction_id', ''), '[^A-Z0-9]', '', 'g')) ~ '^[A-Z0-9]{12}$'
     and length(regexp_replace(upper(regexp_replace(coalesce(users.raw_user_meta_data ->> 'transaction_id', ''), '[^A-Z0-9]', '', 'g')), '[^A-Z]', '', 'g')) = 4
     and length(regexp_replace(upper(regexp_replace(coalesce(users.raw_user_meta_data ->> 'transaction_id', ''), '[^A-Z0-9]', '', 'g')), '[^0-9]', '', 'g')) = 8
      then upper(regexp_replace(users.raw_user_meta_data ->> 'transaction_id', '[^A-Z0-9]', '', 'g'))
    else public.generate_donos_transaction_id()
  end,
  public.metadata_business_categories(users.raw_user_meta_data),
  nullif(users.raw_user_meta_data ->> 'tax_id', ''),
  nullif(users.raw_user_meta_data ->> 'address', '')
from auth.users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.lookup_profile_by_transaction_id(search_transaction_id text)
returns table(display_name text)
language sql
security definer
set search_path = public
as $$
  select profiles.display_name
  from public.profiles
  where profiles.transaction_id = upper(regexp_replace(search_transaction_id, '[^A-Z0-9]', '', 'g'))
  limit 1;
$$;

grant execute on function public.lookup_profile_by_transaction_id(text) to authenticated;

notify pgrst, 'reload schema';

select 'profiles listo' as status;
