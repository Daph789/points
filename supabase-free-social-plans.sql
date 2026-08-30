alter table public.social_plans alter column purchase_id drop not null;

alter table public.social_plans add column if not exists plan_type text not null default 'ticket';
alter table public.social_plans add column if not exists free_category text;
alter table public.social_plans add column if not exists location text;
alter table public.social_plans add column if not exists event_date date;
alter table public.social_plans add column if not exists free_cover_data_url text;

alter table public.social_plans drop constraint if exists social_plans_type_check;
alter table public.social_plans add constraint social_plans_type_check
  check (plan_type in ('ticket', 'free'));

alter table public.social_plans drop constraint if exists social_plans_ticket_or_free_check;
alter table public.social_plans add constraint social_plans_ticket_or_free_check
  check (
    (plan_type = 'ticket' and purchase_id is not null)
    or
    (
      plan_type = 'free'
      and purchase_id is null
      and nullif(trim(coalesce(location, '')), '') is not null
      and event_date is not null
    )
  );

drop index if exists social_plans_one_active_purchase_idx;
create unique index social_plans_one_active_purchase_idx
  on public.social_plans(purchase_id)
  where status in ('open', 'confirmed') and purchase_id is not null;

notify pgrst, 'reload schema';

select 'planes_libres_listo' as status;
