alter table public.profiles
  add column if not exists is_verified boolean not null default false;

alter table public.business_offers
  add column if not exists business_display_name text;

alter table public.business_offers
  add column if not exists business_is_verified boolean not null default false;

update public.business_offers as offers
set business_display_name = coalesce(profiles.display_name, offers.receiver_display_name, offers.business_display_name),
    business_is_verified = coalesce(profiles.is_verified, false)
from public.profiles as profiles
where offers.business_id = profiles.id;

notify pgrst, 'reload schema';

select 'admin accounts ready' as status;
