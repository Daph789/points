create table if not exists public.app_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  session_key text,
  page text not null default 'unknown',
  source text not null default 'app',
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.app_activity_events
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

alter table public.app_activity_events
  add column if not exists session_key text;

alter table public.app_activity_events
  add column if not exists page text not null default 'unknown';

alter table public.app_activity_events
  add column if not exists source text not null default 'app';

alter table public.app_activity_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.app_activity_events
  add column if not exists user_agent text;

alter table public.app_activity_events
  add column if not exists created_at timestamptz not null default now();

alter table public.app_activity_events
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists app_activity_events_created_at_idx
  on public.app_activity_events (created_at desc);

create index if not exists app_activity_events_user_id_idx
  on public.app_activity_events (user_id);

create index if not exists app_activity_events_session_key_idx
  on public.app_activity_events (session_key);

create index if not exists app_activity_events_page_idx
  on public.app_activity_events (page);

alter table public.app_activity_events enable row level security;

notify pgrst, 'reload schema';

select 'activity analytics ready' as status;
