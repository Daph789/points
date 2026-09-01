-- DEPRECADO: usa supabase-open-business-offers-no-rls.sql.
-- Este archivo se queda pequeno para que, si lo ejecutas por error,
-- solo deje las ofertas visibles como antes y no duplique todo el schema.

drop policy if exists "Businesses can read their own offers" on public.business_offers;
drop policy if exists "Businesses can insert their own offers" on public.business_offers;
drop policy if exists "Businesses can update their own offers" on public.business_offers;
drop policy if exists "Anyone can read public offers" on public.business_offers;
drop policy if exists "Businesses can manage their own offers" on public.business_offers;

alter table public.business_offers disable row level security;

notify pgrst, 'reload schema';

select 'business_offers sin RLS para desarrollo' as status;
