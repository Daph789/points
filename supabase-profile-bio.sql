alter table public.profiles
  add column if not exists bio text;

comment on column public.profiles.bio is
  'Bio visible/modifiable du compte Donoss. Obligatoire côté app pour les nouvelles inscriptions.';

notify pgrst, 'reload schema';

select 'profile bio ready' as status;
