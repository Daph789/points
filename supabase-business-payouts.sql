create table if not exists public.business_payouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null,
  amount_cents integer not null,
  note text,
  period_start date,
  period_end date,
  created_at timestamptz not null default now()
);

create index if not exists business_payouts_business_idx on public.business_payouts(business_id, created_at desc);

alter table public.business_payouts
  add column if not exists bank_fee_cents integer not null default 0;

notify pgrst, 'reload schema';

select 'business_payouts listo' as status;
