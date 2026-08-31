alter table public.purchases
  add column if not exists delivery_address text;

alter table public.purchases
  add column if not exists validation_code text;

alter table public.purchases
  add column if not exists security_code text;

alter table public.purchases
  add column if not exists qr_token text;

alter table public.purchases
  add column if not exists qr_valid_from date;

alter table public.purchases
  add column if not exists qr_valid_until date;

alter table public.purchases
  add column if not exists reservation_requested boolean not null default false;

alter table public.purchases
  add column if not exists reservation_date date;

alter table public.purchases
  add column if not exists reservation_time text;

alter table public.purchases
  add column if not exists reservation_people integer;

with duplicate_external_clicks as (
  select
    id,
    row_number() over (
      partition by buyer_id, offer_id
      order by created_at desc, id desc
    ) as row_number
  from public.purchases
  where total_points = 0
    and qr_token is null
)
delete from public.purchases
where id in (
  select id
  from duplicate_external_clicks
  where row_number > 1
);

create unique index if not exists purchases_external_click_once_idx
  on public.purchases(buyer_id, offer_id)
  where total_points = 0
    and qr_token is null;

notify pgrst, 'reload schema';

select 'historial externo Donoss listo' as status;
