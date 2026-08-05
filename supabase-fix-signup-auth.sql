drop trigger if exists on_auth_user_created_profile on auth.users;

drop function if exists public.handle_new_user_profile();

alter table public.profiles
  add column if not exists points integer not null default 0;

alter table public.profiles
  add column if not exists transaction_id text;

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

notify pgrst, 'reload schema';

select 'signup auth desbloqueado: el perfil se crea desde el servidor Donos al iniciar sesión' as status;
