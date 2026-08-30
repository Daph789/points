alter table public.business_offers
  add column if not exists external_checkout_enabled boolean not null default false;

alter table public.business_offers
  add column if not exists external_checkout_url text;

alter table public.offer_automation_requests
  add column if not exists prefers_external_checkout boolean not null default false;

notify pgrst, 'reload schema';

select 'external checkout offers ready' as status;
