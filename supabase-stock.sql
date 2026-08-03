alter table public.business_offers
  add column if not exists stock_quantity integer;

alter table public.business_offers
  add column if not exists sold_count integer not null default 0;

update public.business_offers
set sold_count = 0
where sold_count is null;

notify pgrst, 'reload schema';

select 'stock listo' as status;
