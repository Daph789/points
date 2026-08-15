alter table public.profiles
  add column if not exists bank_account_holder text;

alter table public.profiles
  add column if not exists bank_iban text;

alter table public.profiles
  add column if not exists bank_name text;

alter table public.profiles
  add column if not exists bank_bic text;

alter table public.profiles
  drop constraint if exists profiles_bank_iban_format_check;

alter table public.profiles
  add constraint profiles_bank_iban_format_check
  check (
    bank_iban is null
    or bank_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
  );

notify pgrst, 'reload schema';

select 'business bank details ready' as status;
