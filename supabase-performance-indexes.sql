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

do $$
begin
  if to_regclass('public.social_plan_messages') is not null then
    create index if not exists social_plan_messages_plan_created_idx
      on public.social_plan_messages (plan_id, created_at);
  end if;

  if to_regclass('public.social_plan_message_reads') is not null then
    create index if not exists social_plan_message_reads_message_reader_idx
      on public.social_plan_message_reads (message_id, reader_id);
  end if;

  if to_regclass('public.social_plan_side_group_messages') is not null then
    create index if not exists social_plan_side_group_messages_plan_status_created_idx
      on public.social_plan_side_group_messages (plan_id, group_status, created_at);
  end if;

  if to_regclass('public.social_plan_side_group_message_reads') is not null then
    create index if not exists social_plan_side_group_message_reads_message_reader_idx
      on public.social_plan_side_group_message_reads (message_id, reader_id);
  end if;

  if to_regclass('public.social_plan_members') is not null then
    create index if not exists social_plan_members_plan_user_idx
      on public.social_plan_members (plan_id, user_id);
    create index if not exists social_plan_members_plan_status_idx
      on public.social_plan_members (plan_id, status);
  end if;

  if to_regclass('public.liked_offers') is not null then
    create index if not exists liked_offers_offer_idx
      on public.liked_offers (offer_id);
  end if;

  if to_regclass('public.business_follows') is not null then
    create index if not exists business_follows_business_follower_idx
      on public.business_follows (business_id, follower_id);
  end if;
end $$;

notify pgrst, 'reload schema';

select 'performance indexes ready' as status;
