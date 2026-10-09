-- Donoss Quedar: make free plan place/date optional.
-- Run in Supabase SQL editor with "Run without RLS".
--
-- After this, a free plan can be posted without location and without event_date.
-- If event_date is filled, the app/server still checks that it is today or later.

alter table public.social_plans alter column purchase_id drop not null;

alter table public.social_plans add column if not exists plan_type text not null default 'ticket';
alter table public.social_plans add column if not exists free_category text;
alter table public.social_plans add column if not exists location text;
alter table public.social_plans add column if not exists event_date date;
alter table public.social_plans alter column event_date drop not null;
alter table public.social_plans alter column location drop not null;

alter table public.social_plans drop constraint if exists social_plans_ticket_or_free_check;
alter table public.social_plans add constraint social_plans_ticket_or_free_check check (
  (plan_type = 'ticket' and purchase_id is not null)
  or
  (plan_type = 'free' and purchase_id is null)
);

notify pgrst, 'reload schema';

select 'social_plans_optional_place_date_ready' as status;
