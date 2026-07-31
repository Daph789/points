alter table public.profiles
  add column if not exists points integer not null default 0;

create table if not exists public.stripe_point_recharges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  points integer not null check (points > 0),
  amount_total integer not null default 0,
  currency text not null default 'eur',
  created_at timestamptz not null default now()
);

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
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stripe_point_recharges (
    user_id,
    stripe_session_id,
    points,
    amount_total,
    currency
  )
  values (
    p_user_id,
    p_stripe_session_id,
    p_points,
    coalesce(p_amount_total, 0),
    coalesce(nullif(p_currency, ''), 'eur')
  );

  update public.profiles
  set points = points + p_points,
      updated_at = now()
  where id = p_user_id;
exception
  when unique_violation then
    null;
end;
$$;

grant execute on function public.credit_points_from_stripe(uuid, integer, text, integer, text) to service_role;

notify pgrst, 'reload schema';

select 'Stripe points ready' as status;
