-- Donoss emergency unblock for normal app actions.
-- Run this if login/profile/publications/events started failing after security hardening.
--
-- Run in Supabase SQL editor with "Run without RLS".
--
-- This keeps money-sensitive tables protected:
-- - point_transfers
-- - purchases
-- - stripe_point_recharges
-- - business_payouts
--
-- It removes the extra SQL text-cleaning triggers and reopens the public/action tables
-- that the current frontend still writes to directly.

drop trigger if exists donoss_clean_profiles_text_trigger on public.profiles;
drop trigger if exists donoss_clean_business_offers_text_trigger on public.business_offers;
drop trigger if exists donoss_clean_social_plans_text_trigger on public.social_plans;
drop trigger if exists donoss_clean_social_plan_members_text_trigger on public.social_plan_members;
drop trigger if exists donoss_clean_social_plan_messages_text_trigger on public.social_plan_messages;
drop trigger if exists donoss_clean_point_transfers_text_trigger on public.point_transfers;

alter table if exists public.business_offers disable row level security;
alter table if exists public.liked_offers disable row level security;
alter table if exists public.business_follows disable row level security;
alter table if exists public.notification_reads disable row level security;
alter table if exists public.offer_automation_requests disable row level security;
alter table if exists public.app_activity_events disable row level security;

alter table if exists public.social_plans disable row level security;
alter table if exists public.social_plan_members disable row level security;
alter table if exists public.social_plan_messages disable row level security;
alter table if exists public.social_plan_message_reads disable row level security;
alter table if exists public.social_plan_message_reactions disable row level security;
alter table if exists public.social_plan_side_group_messages disable row level security;
alter table if exists public.social_plan_side_group_message_reads disable row level security;
alter table if exists public.social_plan_side_group_message_reactions disable row level security;
alter table if exists public.social_plan_side_group_merges disable row level security;

-- Keep profile RLS enabled so points cannot be updated directly from the browser.
-- Recreate the basic self-profile policies in case another SQL removed them.
alter table if exists public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.donoss_protect_profile_sensitive_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.points is distinct from old.points
    or new.is_verified is distinct from old.is_verified
    or new.transaction_id is distinct from old.transaction_id
    or new.premium_status is distinct from old.premium_status
    or new.premium_started_at is distinct from old.premium_started_at
    or new.premium_next_charge_at is distinct from old.premium_next_charge_at
    or new.premium_failed_at is distinct from old.premium_failed_at
    or new.admin_verified is distinct from old.admin_verified then
    raise exception 'protected_profile_column';
  end if;

  return new;
end;
$$;

drop trigger if exists donoss_protect_profile_sensitive_columns_trigger on public.profiles;

create trigger donoss_protect_profile_sensitive_columns_trigger
  before update on public.profiles
  for each row
  execute function public.donoss_protect_profile_sensitive_columns();

-- Keep money tables protected.
alter table if exists public.point_transfers enable row level security;
alter table if exists public.purchases enable row level security;
alter table if exists public.stripe_point_recharges enable row level security;

notify pgrst, 'reload schema';

select 'donoss_public_actions_unblocked_money_tables_kept_safe' as status;
