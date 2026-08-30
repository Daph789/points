alter table public.business_offers
  add column if not exists reservation_enabled boolean not null default false;

alter table public.business_offers
  add column if not exists reservation_time_slots text[] not null default '{}'::text[];

alter table public.business_offers
  add column if not exists reservation_max_people integer;

alter table public.business_offers
  add column if not exists reservation_days_ahead integer not null default 0;

alter table public.business_offers
  add column if not exists reservation_available_weekdays jsonb not null default '[1,2,3,4,5,6,0]'::jsonb;

alter table public.purchases
  add column if not exists reservation_requested boolean not null default false;

alter table public.purchases
  add column if not exists reservation_date date;

alter table public.purchases
  add column if not exists reservation_time text;

alter table public.purchases
  add column if not exists reservation_people integer;

notify pgrst, 'reload schema';

select 'offer reservations ready' as status;
