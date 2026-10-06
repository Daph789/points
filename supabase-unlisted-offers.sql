-- Link-only listings remain purchasable; is_hidden retains its existing meaning.
alter table public.business_offers
  add column if not exists is_unlisted boolean not null default false;
notify pgrst, 'reload schema';
