-- Donoss - mode lancement rapide pour les offres
-- Ce fichier remet business_offers comme avant: lisible par l'app sans RLS.
-- A utiliser si tu ne veux pas de RLS sur les publications/offres.

drop policy if exists "Businesses can read their own offers" on public.business_offers;
drop policy if exists "Businesses can insert their own offers" on public.business_offers;
drop policy if exists "Businesses can update their own offers" on public.business_offers;
drop policy if exists "Anyone can read public offers" on public.business_offers;
drop policy if exists "Businesses can manage their own offers" on public.business_offers;

alter table public.business_offers disable row level security;

notify pgrst, 'reload schema';

select 'business_offers abierta sin RLS' as status;
