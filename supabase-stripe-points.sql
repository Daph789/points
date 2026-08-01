alter table public.profiles
  add column if not exists points integer not null default 0;

create table if not exists public.stripe_point_recharges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  points integer not null check (points > 0),
  amount_total integer not null default 0,
  stripe_fee_amount integer not null default 0,
  net_amount integer not null default 0,
  customer_email text,
  currency text not null default 'eur',
  created_at timestamptz not null default now()
);

alter table public.stripe_point_recharges
  add column if not exists stripe_fee_amount integer not null default 0;

alter table public.stripe_point_recharges
  add column if not exists net_amount integer not null default 0;

alter table public.stripe_point_recharges
  add column if not exists customer_email text;

alter table public.stripe_point_recharges enable row level security;

drop policy if exists "Users can read their own stripe recharges" on public.stripe_point_recharges;

create policy "Users can read their own stripe recharges"
  on public.stripe_point_recharges
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.credit_points_from_stripe(
  p_user_id uuid,
  p_points integer,
  p_stripe_session_id text,
  p_amount_total integer,
  p_currency text,
  p_stripe_fee_amount integer default 0,
  p_net_amount integer default 0,
  p_customer_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_id uuid;
begin
  insert into public.stripe_point_recharges (
    user_id,
    stripe_session_id,
    points,
    amount_total,
    stripe_fee_amount,
    net_amount,
    customer_email,
    currency
  )
  values (
    p_user_id,
    p_stripe_session_id,
    p_points,
    coalesce(p_amount_total, 0),
    coalesce(p_stripe_fee_amount, 0),
    coalesce(nullif(p_net_amount, 0), coalesce(p_amount_total, 0) - coalesce(p_stripe_fee_amount, 0)),
    nullif(p_customer_email, ''),
    coalesce(nullif(p_currency, ''), 'eur')
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    update public.profiles
    set points = points + p_points,
        updated_at = now()
    where id = p_user_id;
  end if;
end;
$$;

grant execute on function public.credit_points_from_stripe(uuid, integer, text, integer, text, integer, integer, text) to service_role;

create or replace function public.admin_delete_stripe_recharge(
  p_recharge_id uuid
)
returns table (
  deleted_id uuid,
  deleted_user_id uuid,
  removed_points integer,
  remaining_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recharge public.stripe_point_recharges%rowtype;
  v_remaining_points integer := 0;
begin
  select *
  into v_recharge
  from public.stripe_point_recharges
  where id = p_recharge_id
  for update;

  if not found then
    raise exception 'Recharge not found';
  end if;

  delete from public.stripe_point_recharges
  where id = p_recharge_id;

  update public.profiles
  set points = greatest(points - v_recharge.points, 0),
      updated_at = now()
  where id = v_recharge.user_id
  returning points into v_remaining_points;

  return query select
    v_recharge.id,
    v_recharge.user_id,
    v_recharge.points,
    coalesce(v_remaining_points, 0);
end;
$$;

grant execute on function public.admin_delete_stripe_recharge(uuid) to service_role;

notify pgrst, 'reload schema';

select 'Stripe points ready' as status;
