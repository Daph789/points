create table if not exists public.social_plan_side_group_messages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_plans(id) on delete cascade,
  group_status text not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint social_plan_side_group_messages_status_check check (group_status in ('waiting', 'removed', 'merged')),
  constraint social_plan_side_group_messages_body_length check (char_length(body) between 1 and 800)
);

create index if not exists social_plan_side_group_messages_plan_idx
  on public.social_plan_side_group_messages(plan_id, group_status, created_at asc);

create index if not exists social_plan_side_group_messages_sender_idx
  on public.social_plan_side_group_messages(sender_id, created_at desc);

alter table public.social_plan_side_group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table if not exists public.social_plan_side_group_message_reads (
  message_id uuid not null references public.social_plan_side_group_messages(id) on delete cascade,
  plan_id uuid not null references public.social_plans(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, reader_id)
);

create index if not exists social_plan_side_group_message_reads_plan_idx
  on public.social_plan_side_group_message_reads(plan_id, read_at desc);

create index if not exists social_plan_side_group_message_reads_reader_idx
  on public.social_plan_side_group_message_reads(reader_id, read_at desc);

create table if not exists public.social_plan_side_group_merges (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_plans(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint social_plan_side_group_merges_from_check check (from_status in ('waiting', 'removed')),
  constraint social_plan_side_group_merges_to_check check (to_status in ('waiting', 'removed')),
  constraint social_plan_side_group_merges_status_check check (status in ('pending', 'accepted', 'declined'))
);

create index if not exists social_plan_side_group_merges_plan_idx
  on public.social_plan_side_group_merges(plan_id, status, created_at desc);

alter table public.social_plan_side_group_messages enable row level security;
alter table public.social_plan_side_group_message_reads enable row level security;
alter table public.social_plan_side_group_merges enable row level security;

notify pgrst, 'reload schema';

select 'side_groups con chat completo listo' as status;
