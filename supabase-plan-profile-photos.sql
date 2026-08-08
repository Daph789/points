alter table public.profiles
  add column if not exists plan_photo_data_url text;

notify pgrst, 'reload schema';

select 'plan profile photos ready' as status;
