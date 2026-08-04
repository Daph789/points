create table if not exists public.point_pack_settings (
  points integer primary key,
  is_disabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.point_pack_settings (points, is_disabled)
values
  (50, false),
  (100, false),
  (250, false),
  (500, false)
on conflict (points) do nothing;

notify pgrst, 'reload schema';

select 'point_pack_settings listo' as status;
