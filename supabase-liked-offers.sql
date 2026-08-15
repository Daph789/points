create table if not exists public.liked_offers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  offer_id uuid not null references public.business_offers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(profile_id, offer_id)
);

create index if not exists liked_offers_profile_created_idx
  on public.liked_offers(profile_id, created_at desc);

create index if not exists liked_offers_offer_idx
  on public.liked_offers(offer_id);

alter table public.liked_offers enable row level security;

drop policy if exists "Users can read their liked offers" on public.liked_offers;
drop policy if exists "Users can insert their liked offers" on public.liked_offers;
drop policy if exists "Users can delete their liked offers" on public.liked_offers;

create policy "Users can read their liked offers"
  on public.liked_offers
  for select
  to authenticated
  using (auth.uid() = profile_id);

create policy "Users can insert their liked offers"
  on public.liked_offers
  for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "Users can delete their liked offers"
  on public.liked_offers
  for delete
  to authenticated
  using (auth.uid() = profile_id);

notify pgrst, 'reload schema';

select 'liked_offers lista' as status;
