-- Donoss input/text hardening.
-- Run without RLS. Keeps user text readable while stripping dangerous HTML/script payloads.

create or replace function public.donoss_clean_text(
  p_value text,
  p_max_length integer default 5000
)
returns text
language plpgsql
immutable
as $$
declare
  v_text text;
begin
  if p_value is null then
    return null;
  end if;

  v_text := left(p_value, greatest(coalesce(p_max_length, 5000), 1));
  v_text := replace(v_text, chr(0), '');
  v_text := regexp_replace(v_text, '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', ' ', 'g');
  v_text := regexp_replace(v_text, '[<>]', ' ', 'g');
  v_text := regexp_replace(v_text, '(?i)javascript\s*:', '', 'g');
  v_text := regexp_replace(v_text, '\s{3,}', ' ', 'g');

  return nullif(trim(v_text), '');
end;
$$;

create or replace function public.donoss_clean_text_array(
  p_value text[],
  p_max_items integer default 12,
  p_max_length integer default 80
)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(cleaned) filter (where cleaned is not null),
    '{}'::text[]
  )
  from (
    select public.donoss_clean_text(item, p_max_length) as cleaned
    from unnest(coalesce(p_value, '{}'::text[])) with ordinality as values(item, position)
    where position <= greatest(coalesce(p_max_items, 12), 1)
  ) cleaned_items;
$$;

create or replace function public.donoss_clean_profiles_text()
returns trigger
language plpgsql
as $$
begin
  new.display_name := coalesce(public.donoss_clean_text(new.display_name, 80), 'Cuenta Donoss');
  new.email := lower(public.donoss_clean_text(new.email, 180));
  new.phone := public.donoss_clean_text(new.phone, 40);
  new.neighborhood := coalesce(public.donoss_clean_text(new.neighborhood, 80), 'Donostia');
  new.address := public.donoss_clean_text(new.address, 180);
  new.tax_id := public.donoss_clean_text(new.tax_id, 80);
  new.business_categories := public.donoss_clean_text_array(new.business_categories, 8, 60);
  new.bio := public.donoss_clean_text(new.bio, 700);
  return new;
end;
$$;

drop trigger if exists donoss_clean_profiles_text_trigger on public.profiles;

create trigger donoss_clean_profiles_text_trigger
  before insert or update on public.profiles
  for each row
  execute function public.donoss_clean_profiles_text();

create or replace function public.donoss_clean_business_offers_text()
returns trigger
language plpgsql
as $$
begin
  new.cover_photo_name := public.donoss_clean_text(new.cover_photo_name, 180);
  new.presentation_image_names := public.donoss_clean_text_array(new.presentation_image_names, 12, 180);
  new.title := public.donoss_clean_text(new.title, 140);
  new.address := public.donoss_clean_text(new.address, 220);
  new.categories := public.donoss_clean_text_array(new.categories, 12, 60);
  new.hours := public.donoss_clean_text(new.hours, 120);
  new.age := public.donoss_clean_text(new.age, 60);
  new.author := public.donoss_clean_text(new.author, 100);
  new.description := public.donoss_clean_text(new.description, 1800);
  new.cart_button_text := coalesce(public.donoss_clean_text(new.cart_button_text, 50), 'Comprar');
  new.receiver_display_name := public.donoss_clean_text(new.receiver_display_name, 100);
  new.business_display_name := public.donoss_clean_text(new.business_display_name, 100);
  new.receiver_transaction_id := upper(regexp_replace(coalesce(new.receiver_transaction_id, ''), '[^A-Z0-9]', '', 'g'));
  if new.receiver_transaction_id = '' then
    new.receiver_transaction_id := null;
  end if;
  if new.external_checkout_url is not null and new.external_checkout_url !~* '^https?://' then
    new.external_checkout_url := null;
    new.external_checkout_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists donoss_clean_business_offers_text_trigger on public.business_offers;

create trigger donoss_clean_business_offers_text_trigger
  before insert or update on public.business_offers
  for each row
  execute function public.donoss_clean_business_offers_text();

create or replace function public.donoss_clean_social_plans_text()
returns trigger
language plpgsql
as $$
begin
  new.free_category := public.donoss_clean_text(new.free_category, 80);
  new.location := public.donoss_clean_text(new.location, 180);
  new.title := public.donoss_clean_text(new.title, 140);
  new.message := public.donoss_clean_text(new.message, 1200);
  return new;
end;
$$;

drop trigger if exists donoss_clean_social_plans_text_trigger on public.social_plans;

create trigger donoss_clean_social_plans_text_trigger
  before insert or update on public.social_plans
  for each row
  execute function public.donoss_clean_social_plans_text();

create or replace function public.donoss_clean_social_plan_members_text()
returns trigger
language plpgsql
as $$
begin
  new.note := public.donoss_clean_text(new.note, 300);
  return new;
end;
$$;

drop trigger if exists donoss_clean_social_plan_members_text_trigger on public.social_plan_members;

create trigger donoss_clean_social_plan_members_text_trigger
  before insert or update on public.social_plan_members
  for each row
  execute function public.donoss_clean_social_plan_members_text();

create or replace function public.donoss_clean_social_plan_messages_text()
returns trigger
language plpgsql
as $$
begin
  new.body := coalesce(public.donoss_clean_text(new.body, 800), '');
  return new;
end;
$$;

drop trigger if exists donoss_clean_social_plan_messages_text_trigger on public.social_plan_messages;

create trigger donoss_clean_social_plan_messages_text_trigger
  before insert or update on public.social_plan_messages
  for each row
  execute function public.donoss_clean_social_plan_messages_text();

create or replace function public.donoss_clean_point_transfers_text()
returns trigger
language plpgsql
as $$
begin
  new.note := public.donoss_clean_text(new.note, 220);
  return new;
end;
$$;

drop trigger if exists donoss_clean_point_transfers_text_trigger on public.point_transfers;

create trigger donoss_clean_point_transfers_text_trigger
  before insert or update on public.point_transfers
  for each row
  execute function public.donoss_clean_point_transfers_text();

notify pgrst, 'reload schema';

select 'donoss_input_security_ready' as status;
