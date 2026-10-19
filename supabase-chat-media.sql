-- Images and animated GIFs for both chat types. Existing messages are unchanged.
begin;
alter table public.social_plan_messages
  add column if not exists media_type text,
  add column if not exists media_data_url text;
alter table public.social_plan_side_group_messages
  add column if not exists media_type text,
  add column if not exists media_data_url text;
notify pgrst, 'reload schema';
commit;
