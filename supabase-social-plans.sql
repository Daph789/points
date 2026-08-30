create table if not exists public.social_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete cascade,
  plan_type text not null default 'ticket',
  free_category text,
  location text,
  event_date date,
  free_cover_data_url text,
  title text,
  message text,
  photo_data_url text,
  wanted_women integer not null default 0,
  wanted_men integer not null default 0,
  wanted_open integer not null default 0,
  status text not null default 'open',
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_plans_status_check check (status in ('open', 'confirmed', 'cancelled')),
  constraint social_plans_type_check check (plan_type in ('ticket', 'free')),
  constraint social_plans_ticket_or_free_check check (
    (plan_type = 'ticket' and purchase_id is not null)
    or
    (plan_type = 'free' and purchase_id is null and nullif(trim(coalesce(location, '')), '') is not null and event_date is not null)
  )
);

alter table public.social_plans alter column purchase_id drop not null;
alter table public.social_plans add column if not exists plan_type text not null default 'ticket';
alter table public.social_plans add column if not exists free_category text;
alter table public.social_plans add column if not exists location text;
alter table public.social_plans add column if not exists event_date date;
alter table public.social_plans add column if not exists free_cover_data_url text;
alter table public.social_plans drop constraint if exists social_plans_type_check;
alter table public.social_plans add constraint social_plans_type_check check (plan_type in ('ticket', 'free'));
alter table public.social_plans drop constraint if exists social_plans_ticket_or_free_check;
alter table public.social_plans add constraint social_plans_ticket_or_free_check check (
  (plan_type = 'ticket' and purchase_id is not null)
  or
  (plan_type = 'free' and purchase_id is null and nullif(trim(coalesce(location, '')), '') is not null and event_date is not null)
);

drop index if exists social_plans_one_active_purchase_idx;
create unique index social_plans_one_active_purchase_idx
  on public.social_plans(purchase_id)
  where status in ('open', 'confirmed') and purchase_id is not null;

create index if not exists social_plans_creator_idx on public.social_plans(creator_id, created_at desc);
create index if not exists social_plans_status_idx on public.social_plans(status, created_at desc);

create table if not exists public.social_plan_members (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  gender text not null default 'open',
  status text not null default 'waiting',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_plan_members_gender_check check (gender in ('woman', 'man', 'open')),
  constraint social_plan_members_status_check check (status in ('accepted', 'waiting', 'removed', 'cancelled'))
);

create unique index if not exists social_plan_members_once_idx
  on public.social_plan_members(plan_id, user_id)
  where status in ('accepted', 'waiting');

create index if not exists social_plan_members_plan_idx on public.social_plan_members(plan_id, status, created_at desc);
create index if not exists social_plan_members_user_idx on public.social_plan_members(user_id, created_at desc);

notify pgrst, 'reload schema';

select 'social_plans listo' as status;
