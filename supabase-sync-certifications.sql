alter table public.profiles
  add column if not exists is_verified boolean not null default false;

alter table public.business_offers
  add column if not exists business_display_name text;

alter table public.business_offers
  add column if not exists business_is_verified boolean not null default false;

update public.business_offers as offer
set
  business_display_name = coalesce(profile.display_name, offer.business_display_name),
  business_is_verified = coalesce(profile.is_verified, false)
from public.profiles as profile
where offer.business_id = profile.id;

notify pgrst, 'reload schema';

select 'certificaciones sincronizadas' as status;
