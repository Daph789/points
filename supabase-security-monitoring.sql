create table if not exists public.app_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  session_key text,
  ip_address text,
  route text not null default 'unknown',
  method text not null default 'GET',
  event_type text not null default 'suspicious',
  request_count integer not null default 0,
  window_seconds integer not null default 60,
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_security_blocks (
  id uuid primary key default gen_random_uuid(),
  block_type text not null check (block_type in ('ip', 'account')),
  ip_address text,
  user_id uuid references public.profiles(id) on delete cascade,
  reason text,
  created_by text not null default 'admin',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (block_type = 'ip' and ip_address is not null)
    or
    (block_type = 'account' and user_id is not null)
  )
);

alter table public.app_activity_events
  add column if not exists ip_address text;

alter table public.app_activity_events
  add column if not exists route text;

alter table public.app_activity_events
  add column if not exists method text;

create index if not exists app_security_events_created_at_idx
  on public.app_security_events (created_at desc);

create index if not exists app_security_events_ip_created_idx
  on public.app_security_events (ip_address, created_at desc);

create index if not exists app_security_events_user_created_idx
  on public.app_security_events (user_id, created_at desc);

create index if not exists app_security_blocks_active_ip_idx
  on public.app_security_blocks (ip_address, revoked_at, expires_at);

create index if not exists app_security_blocks_active_user_idx
  on public.app_security_blocks (user_id, revoked_at, expires_at);

create index if not exists app_activity_events_ip_created_idx
  on public.app_activity_events (ip_address, created_at desc);

alter table public.app_security_events enable row level security;
alter table public.app_security_blocks enable row level security;

notify pgrst, 'reload schema';

select 'security monitoring ready' as status;
