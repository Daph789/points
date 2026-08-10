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

alter table public.social_plan_messages enable row level security;

notify pgrst, 'reload schema';

select 'social_plan_messages listo' as status;
