alter table public.business_offers
  add column if not exists stock_quantity integer;

alter table public.business_offers
  add column if not exists sold_count integer not null default 0;

alter table public.business_offers
  add column if not exists out_of_stock_since timestamptz;

update public.business_offers
set sold_count = 0
where sold_count is null;

update public.business_offers
set out_of_stock_since = now()
where stock_quantity is not null
  and sold_count >= stock_quantity
  and out_of_stock_since is null;

notify pgrst, 'reload schema';

select 'stock listo' as status;
