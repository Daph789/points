create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_profile_id uuid not null references public.profiles(id) on delete cascade,
  referred_profile_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  referred_recharged_at timestamptz,
  reward_eligible_at timestamptz,
  reward_paid_at timestamptz,
  reward_points integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referred_profile_id)
);

create index if not exists referrals_referrer_profile_id_idx on public.referrals(referrer_profile_id);
create index if not exists referrals_referred_profile_id_idx on public.referrals(referred_profile_id);
create index if not exists referrals_referral_code_idx on public.referrals(referral_code);

alter table public.referrals disable row level security;

notify pgrst, 'reload schema';

select 'referrals ready' as status;
