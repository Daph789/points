-- Private directory for the primary Donoss admin. No customer/secondary access.
create table if not exists public.admin_official_links (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  source_url text not null check (source_url ~* '^https?://' and char_length(source_url) <= 4000),
  search_text text generated always as (title || ' ' || description || ' ' || source_url) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_official_links_created_idx
  on public.admin_official_links (created_at desc, id desc);

alter table public.admin_official_links enable row level security;
revoke all on public.admin_official_links from public, anon, authenticated;
grant select, insert, update, delete on public.admin_official_links to service_role;

notify pgrst, 'reload schema';
