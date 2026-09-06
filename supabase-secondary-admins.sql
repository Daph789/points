create table if not exists public.secondary_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null default 'primary',
  actor_id uuid,
  actor_username text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists secondary_admins_username_idx
  on public.secondary_admins (username);

create index if not exists secondary_admins_active_idx
  on public.secondary_admins (is_active, created_at desc);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs (actor_type, actor_id, created_at desc);

create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action, created_at desc);

alter table public.secondary_admins enable row level security;
alter table public.admin_audit_logs enable row level security;

notify pgrst, 'reload schema';

select 'secondary admins ready' as status;
