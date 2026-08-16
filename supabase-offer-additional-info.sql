alter table public.business_offers
  add column if not exists additional_links jsonb not null default '[]'::jsonb;

alter table public.business_offers
  add column if not exists additional_details jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

select 'offer additional info ready' as status;
