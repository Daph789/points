-- Donoss - indexes de performance pour eviter les scans inutiles.
-- A executer une fois dans Supabase. Ne change pas les donnees.

create index if not exists business_offers_created_idx
  on public.business_offers (created_at desc);

create index if not exists business_offers_business_created_idx
  on public.business_offers (business_id, created_at desc);

create index if not exists business_offers_hidden_created_idx
  on public.business_offers (is_hidden, created_at desc);

create index if not exists business_offers_categories_gin_idx
  on public.business_offers using gin (categories);

create index if not exists business_offers_qr_valid_until_idx
  on public.business_offers (qr_valid_until);

create index if not exists business_offers_end_date_idx
  on public.business_offers (end_date);

create index if not exists purchases_buyer_created_idx
  on public.purchases (buyer_id, created_at desc);

create index if not exists purchases_offer_created_idx
  on public.purchases (offer_id, created_at desc);

create index if not exists purchases_receiver_created_idx
  on public.purchases (receiver_profile_id, created_at desc);

create index if not exists notification_reads_profile_key_idx
  on public.notification_reads (profile_id, notification_key);

notify pgrst, 'reload schema';

select 'performance indexes ready' as status;
