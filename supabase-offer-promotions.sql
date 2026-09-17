create table if not exists public.offer_promotions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.business_offers(id) on delete cascade,
  business_id uuid not null references public.profiles(id) on delete cascade,
  duration_hours integer not null,
  price_cents integer not null,
  points_cost integer not null,
  paid_with_points boolean not null default true,
  is_admin_free boolean not null default false,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint offer_promotions_duration_check check (duration_hours between 24 and 168 and duration_hours % 24 = 0),
  constraint offer_promotions_status_check check (status in ('active', 'cancelled', 'expired'))
);

create index if not exists offer_promotions_business_idx
  on public.offer_promotions (business_id, created_at desc);

create index if not exists offer_promotions_offer_active_idx
  on public.offer_promotions (offer_id, status, ends_at desc);

create index if not exists offer_promotions_active_feed_idx
  on public.offer_promotions (status, ends_at desc, starts_at desc);

alter table public.offer_promotions disable row level security;

select 'offer_promotions listo' as status;
