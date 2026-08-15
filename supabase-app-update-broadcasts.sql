create table if not exists public.app_update_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nueva actualización Donoss',
  message text not null default 'Hay una novedad en la app. Lánzala para actualizar sin cerrar sesión.',
  update_size text not null default 'small' check (update_size in ('small', 'large')),
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists app_update_broadcasts_created_idx
  on public.app_update_broadcasts(created_at desc);

alter table public.app_update_broadcasts enable row level security;

drop policy if exists "Anyone can read app update broadcasts" on public.app_update_broadcasts;

create policy "Anyone can read app update broadcasts"
  on public.app_update_broadcasts
  for select
  to anon, authenticated
  using (expires_at is null or expires_at > now());

notify pgrst, 'reload schema';

select 'app_update_broadcasts lista' as status;
