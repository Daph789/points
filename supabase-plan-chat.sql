create table if not exists public.social_plan_messages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.social_plans(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint social_plan_messages_body_length check (char_length(body) between 1 and 800)
);

create index if not exists social_plan_messages_plan_created_idx
  on public.social_plan_messages(plan_id, created_at asc);

create index if not exists social_plan_messages_sender_idx
  on public.social_plan_messages(sender_id, created_at desc);

alter table public.social_plan_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table if not exists public.social_plan_message_reads (
  message_id uuid not null references public.social_plan_messages(id) on delete cascade,
  plan_id uuid not null references public.social_plans(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, reader_id)
);

create index if not exists social_plan_message_reads_plan_idx
  on public.social_plan_message_reads(plan_id, read_at desc);

create index if not exists social_plan_message_reads_reader_idx
  on public.social_plan_message_reads(reader_id, read_at desc);

alter table public.social_plan_messages enable row level security;
alter table public.social_plan_message_reads enable row level security;

notify pgrst, 'reload schema';

select 'social_plan_messages y lecturas listo' as status;
