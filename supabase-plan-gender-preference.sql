alter table public.profiles
  add column if not exists plan_gender_preference text;

alter table public.profiles
  drop constraint if exists profiles_plan_gender_preference_check;

alter table public.profiles
  add constraint profiles_plan_gender_preference_check
  check (plan_gender_preference is null or plan_gender_preference in ('woman', 'man'));

notify pgrst, 'reload schema';

select 'plan gender preference ready' as status;
