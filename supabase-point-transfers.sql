create table if not exists public.point_transfers (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references public.profiles(id) on delete cascade,
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null,
  transfer_type text not null default 'send',
  status text not null default 'completed',
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.point_transfers
  add column if not exists from_profile_id uuid references public.profiles(id) on delete cascade;

alter table public.point_transfers
  add column if not exists to_profile_id uuid references public.profiles(id) on delete cascade;

alter table public.point_transfers
  add column if not exists points integer;

alter table public.point_transfers
  add column if not exists transfer_type text not null default 'send';

alter table public.point_transfers
  add column if not exists status text not null default 'completed';

alter table public.point_transfers
  add column if not exists note text;

alter table public.point_transfers
  add column if not exists completed_at timestamptz;

alter table public.point_transfers
  add column if not exists created_at timestamptz not null default now();

create index if not exists point_transfers_from_idx on public.point_transfers(from_profile_id, created_at desc);
create index if not exists point_transfers_to_idx on public.point_transfers(to_profile_id, created_at desc);

notify pgrst, 'reload schema';

select 'point_transfers listo' as status;
