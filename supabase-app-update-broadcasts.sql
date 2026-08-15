create table if not exists public.app_update_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nueva actualización Donoss',
  message text not null default 'Hay una novedad en la app. Lánzala para cargar la última versión sin cerrar sesión.',
  update_size text not null default 'small' check (update_size in ('small', 'large')),
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists app_update_broadcasts_created_at_idx
  on public.app_update_broadcasts (created_at desc);

alter table public.app_update_broadcasts disable row level security;

notify pgrst, 'reload schema';

select 'app_update_broadcasts ready' as status;
