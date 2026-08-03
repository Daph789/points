alter table public.business_offers
  add column if not exists qr_valid_from date;

alter table public.business_offers
  add column if not exists qr_valid_until date;

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
  add column if not exists verified_at timestamptz;

alter table public.purchases
  add column if not exists verified_by uuid references auth.users(id);

alter table public.purchases
  add column if not exists verification_method text;

alter table public.purchases
  add column if not exists verification_count integer not null default 0;

alter table public.purchases
  add column if not exists last_verified_at timestamptz;

update public.business_offers
set qr_valid_from = coalesce(qr_valid_from, start_date, current_date),
    qr_valid_until = coalesce(qr_valid_until, end_date)
where qr_valid_from is null;

update public.purchases
set validation_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))
where validation_code is null;

update public.purchases
set security_code = lpad(floor(random() * 10000)::int::text, 4, '0')
where security_code is null;

update public.purchases
set qr_token = gen_random_uuid()::text
where qr_token is null;

update public.purchases as purchases
set qr_valid_from = coalesce(purchases.qr_valid_from, offers.qr_valid_from, offers.start_date, purchases.created_at::date),
    qr_valid_until = coalesce(purchases.qr_valid_until, offers.qr_valid_until, offers.end_date)
from public.business_offers as offers
where purchases.offer_id = offers.id;

alter table public.purchases
  alter column validation_code set not null;

alter table public.purchases
  alter column security_code set not null;

alter table public.purchases
  alter column qr_token set not null;

alter table public.purchases
  alter column qr_valid_from set default current_date;

create unique index if not exists purchases_validation_code_key
  on public.purchases(validation_code);

create unique index if not exists purchases_qr_token_key
  on public.purchases(qr_token);

create table if not exists public.ticket_verifications (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  business_id uuid not null references auth.users(id) on delete cascade,
  method text not null default 'manual',
  status text not null,
  checked_at timestamptz not null default now()
);

alter table public.ticket_verifications enable row level security;

drop policy if exists "Businesses can read their ticket verifications" on public.ticket_verifications;

create policy "Businesses can read their ticket verifications"
  on public.ticket_verifications
  for select
  to authenticated
  using (auth.uid() = business_id);

create index if not exists ticket_verifications_purchase_id_checked_at_idx
  on public.ticket_verifications(purchase_id, checked_at desc);

notify pgrst, 'reload schema';

select 'validacion QR Donos activada' as status;
