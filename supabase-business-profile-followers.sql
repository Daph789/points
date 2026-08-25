alter table public.profiles
  add column if not exists profile_photo_data_url text;

create table if not exists public.business_follows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles(id) on delete cascade,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (business_id, follower_id),
  check (business_id <> follower_id)
);

create index if not exists business_follows_business_id_idx
  on public.business_follows(business_id);

create index if not exists business_follows_follower_id_idx
  on public.business_follows(follower_id);

alter table public.business_follows disable row level security;

comment on column public.profiles.profile_photo_data_url is
  'Foto publica de perfil para cuentas empresa en Donoss.';

notify pgrst, 'reload schema';

select 'business profile followers ready' as status;
