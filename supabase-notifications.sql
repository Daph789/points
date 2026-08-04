create table if not exists public.notification_reads (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key (profile_id, notification_key)
);

create index if not exists notification_reads_profile_idx on public.notification_reads(profile_id, read_at desc);

notify pgrst, 'reload schema';

select 'notifications listo' as status;
