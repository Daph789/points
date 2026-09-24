-- Donoss points security hardening.
-- Run without RLS. This file keeps direct browser access from changing money-like fields.

alter table public.profiles
  add column if not exists points integer not null default 0;

create or replace function public.donoss_is_trusted_server()
returns boolean
language sql
stable
as $$
  select
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
$$;

create or replace function public.protect_profile_sensitive_columns()
returns trigger
language plpgsql
as $$
begin
  if public.donoss_is_trusted_server() then
    return new;
  end if;

  if new.points is distinct from old.points
    or new.is_verified is distinct from old.is_verified
    or new.transaction_id is distinct from old.transaction_id
    or new.account_type is distinct from old.account_type
    or to_jsonb(new) -> 'admin_verified' is distinct from to_jsonb(old) -> 'admin_verified'
    or to_jsonb(new) -> 'premium_status' is distinct from to_jsonb(old) -> 'premium_status'
    or to_jsonb(new) -> 'premium_started_at' is distinct from to_jsonb(old) -> 'premium_started_at'
    or to_jsonb(new) -> 'premium_next_charge_at' is distinct from to_jsonb(old) -> 'premium_next_charge_at'
    or to_jsonb(new) -> 'premium_failed_at' is distinct from to_jsonb(old) -> 'premium_failed_at'
  then
    raise exception 'protected_profile_field';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_sensitive_columns_trigger on public.profiles;

create trigger protect_profile_sensitive_columns_trigger
  before update on public.profiles
  for each row
  execute function public.protect_profile_sensitive_columns();

create or replace function public.donoss_secure_move_points(
  p_from_profile_id uuid,
  p_to_profile_id uuid,
  p_points integer
)
returns table (
  sender_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.profiles%rowtype;
  v_to public.profiles%rowtype;
begin
  if p_from_profile_id is null or p_to_profile_id is null then
    raise exception 'missing_profile';
  end if;

  if p_from_profile_id = p_to_profile_id then
    raise exception 'self_transfer_not_allowed';
  end if;

  if coalesce(p_points, 0) <= 0 then
    raise exception 'invalid_points';
  end if;

  select *
  into v_from
  from public.profiles
  where id = p_from_profile_id
  for update;

  if not found then
    raise exception 'sender_not_found';
  end if;

  select *
  into v_to
  from public.profiles
  where id = p_to_profile_id
  for update;

  if not found then
    raise exception 'receiver_not_found';
  end if;

  if coalesce(v_from.points, 0) < p_points then
    raise exception 'insufficient_points';
  end if;

  update public.profiles
  set points = points - p_points,
      updated_at = now()
  where id = p_from_profile_id
  returning points into sender_points;

  update public.profiles
  set points = points + p_points,
      updated_at = now()
  where id = p_to_profile_id;

  return next;
end;
$$;

create or replace function public.donoss_send_points(
  p_sender_id uuid,
  p_receiver_transaction_id text,
  p_points integer,
  p_note text default null
)
returns table (
  movement_id uuid,
  sender_points integer,
  receiver_id uuid,
  receiver_display_name text,
  receiver_email text,
  receiver_phone text,
  receiver_account_type text,
  receiver_transaction_id text,
  receiver_is_verified boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receiver public.profiles%rowtype;
  v_move record;
begin
  if p_sender_id is null then
    raise exception 'sender_not_found';
  end if;

  select *
  into v_receiver
  from public.profiles
  where transaction_id = upper(regexp_replace(coalesce(p_receiver_transaction_id, ''), '[^A-Z0-9]', '', 'g'));

  if not found then
    raise exception 'receiver_not_found';
  end if;

  select *
  into v_move
  from public.donoss_secure_move_points(p_sender_id, v_receiver.id, p_points);

  insert into public.point_transfers (
    from_profile_id,
    to_profile_id,
    points,
    transfer_type,
    status,
    note,
    completed_at
  )
  values (
    p_sender_id,
    v_receiver.id,
    p_points,
    'send',
    'completed',
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  )
  returning id into movement_id;

  sender_points := v_move.sender_points;
  receiver_id := v_receiver.id;
  receiver_display_name := v_receiver.display_name;
  receiver_email := v_receiver.email;
  receiver_phone := v_receiver.phone;
  receiver_account_type := v_receiver.account_type;
  receiver_transaction_id := v_receiver.transaction_id;
  receiver_is_verified := coalesce(v_receiver.is_verified, false);
  return next;
end;
$$;

create or replace function public.donoss_respond_point_request(
  p_payer_id uuid,
  p_movement_id uuid,
  p_action text
)
returns table (
  status text,
  payer_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement public.point_transfers%rowtype;
  v_move record;
begin
  select *
  into v_movement
  from public.point_transfers
  where id = p_movement_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if v_movement.from_profile_id <> p_payer_id then
    raise exception 'request_not_for_you';
  end if;

  if v_movement.transfer_type <> 'request' or v_movement.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  if p_action = 'decline' then
    update public.point_transfers
    set status = 'declined'
    where id = v_movement.id;

    select points
    into payer_points
    from public.profiles
    where id = p_payer_id;

    status := 'declined';
    return next;
    return;
  end if;

  select *
  into v_move
  from public.donoss_secure_move_points(v_movement.from_profile_id, v_movement.to_profile_id, v_movement.points);

  update public.point_transfers
  set status = 'completed',
      completed_at = now()
  where id = v_movement.id;

  status := 'completed';
  payer_points := v_move.sender_points;
  return next;
end;
$$;

alter table public.profiles enable row level security;
alter table public.point_transfers enable row level security;
alter table public.purchases enable row level security;
alter table public.stripe_point_recharges enable row level security;

drop policy if exists "Users can read their own point movements" on public.point_transfers;
drop policy if exists "Users can insert point movements" on public.point_transfers;
drop policy if exists "Users can update point movements" on public.point_transfers;
drop policy if exists "Users can delete point movements" on public.point_transfers;

create policy "Users can read their own point movements"
  on public.point_transfers
  for select
  to authenticated
  using (auth.uid() = from_profile_id or auth.uid() = to_profile_id);

drop policy if exists "Users can read their own purchases" on public.purchases;
drop policy if exists "Businesses can read received purchases" on public.purchases;

create policy "Users can read their own purchases"
  on public.purchases
  for select
  to authenticated
  using (auth.uid() = buyer_id);

create policy "Businesses can read received purchases"
  on public.purchases
  for select
  to authenticated
  using (auth.uid() = receiver_profile_id);

drop policy if exists "Users can read their own stripe recharges" on public.stripe_point_recharges;

create policy "Users can read their own stripe recharges"
  on public.stripe_point_recharges
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.point_transfers from anon, authenticated;
revoke insert, update, delete on public.purchases from anon, authenticated;
revoke insert, update, delete on public.stripe_point_recharges from anon, authenticated;

grant execute on function public.donoss_secure_move_points(uuid, uuid, integer) to service_role;
grant execute on function public.donoss_send_points(uuid, text, integer, text) to service_role;
grant execute on function public.donoss_respond_point_request(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';

select 'donoss_points_security_ready' as status;
