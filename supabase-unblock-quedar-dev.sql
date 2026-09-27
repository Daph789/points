-- Donoss emergency unblock for Quedar / chat.
-- Use this when plan creation or chat messages stop saving after RLS/security SQL.
--
-- IMPORTANT:
-- - Run this in Supabase SQL editor with "Run without RLS".
-- - This intentionally does NOT touch points, purchases, Stripe, payouts or transfers.
-- - It only reopens Quedar/social/chat tables so the app can write again.

alter table if exists public.social_plans disable row level security;
alter table if exists public.social_plan_members disable row level security;
alter table if exists public.social_plan_messages disable row level security;
alter table if exists public.social_plan_message_reads disable row level security;
alter table if exists public.social_plan_message_reactions disable row level security;
alter table if exists public.social_plan_side_group_messages disable row level security;
alter table if exists public.social_plan_side_group_message_reads disable row level security;
alter table if exists public.social_plan_side_group_message_reactions disable row level security;
alter table if exists public.social_plan_side_group_merges disable row level security;

alter table if exists public.social_plans alter column purchase_id drop not null;
alter table if exists public.social_plans add column if not exists plan_type text not null default 'ticket';
alter table if exists public.social_plans add column if not exists free_category text;
alter table if exists public.social_plans add column if not exists location text;
alter table if exists public.social_plans add column if not exists event_date date;
alter table if exists public.social_plans add column if not exists free_cover_data_url text;
alter table if exists public.social_plans add column if not exists wanted_age_min integer;
alter table if exists public.social_plans add column if not exists wanted_age_max integer;
alter table if exists public.social_plans add column if not exists country_code text;
alter table if exists public.social_plans add column if not exists city_market text;
alter table if exists public.social_plans add column if not exists city_label text;

alter table if exists public.social_plan_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.social_plan_messages(id) on delete set null;

alter table if exists public.social_plan_side_group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.social_plan_side_group_messages(id) on delete set null;

create index if not exists social_plans_creator_idx on public.social_plans(creator_id, created_at desc);
create index if not exists social_plans_status_idx on public.social_plans(status, created_at desc);
create index if not exists social_plans_market_idx on public.social_plans(country_code, city_market);
create index if not exists social_plan_members_plan_idx on public.social_plan_members(plan_id, status, created_at desc);
create index if not exists social_plan_members_user_idx on public.social_plan_members(user_id, created_at desc);
create index if not exists social_plan_messages_plan_created_idx on public.social_plan_messages(plan_id, created_at asc);
create index if not exists social_plan_side_group_messages_plan_idx on public.social_plan_side_group_messages(plan_id, group_status, created_at asc);

notify pgrst, 'reload schema';

select 'donoss_quedar_unblocked' as status;
