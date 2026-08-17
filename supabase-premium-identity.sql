alter table public.profiles
  add column if not exists premium_identity_dni text;

alter table public.profiles
  add column if not exists premium_identity_photo_data_url text;

alter table public.profiles
  add column if not exists premium_identity_verified_at timestamptz;

alter table public.profiles
  add column if not exists premium_identity_updated_at timestamptz;

select 'premium identity ready' as status;
