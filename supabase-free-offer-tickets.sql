-- Explicit opt-in only: existing zero-price offers remain blocked.
alter table public.business_offers
  add column if not exists is_free boolean not null default false;

-- Free tickets must have a real zero price and use the normal ticket/QR flow.
alter table public.business_offers drop constraint if exists business_offers_free_ticket_check;
alter table public.business_offers add constraint business_offers_free_ticket_check check (
  not is_free or (
    reduced_price is not null and reduced_price = 0
    and required_points is not null and required_points = 0
    and coalesce(external_checkout_enabled, false) = false
  )
);
notify pgrst, 'reload schema';
