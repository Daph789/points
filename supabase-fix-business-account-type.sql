-- Donoss - corriger un compte qui doit etre une entreprise
-- Remplace l'email ci-dessous par l'email du compte entreprise bloque en mode Usuario.

update public.profiles
set account_type = 'business',
    updated_at = now()
where lower(email) = lower('EMAIL_ENTREPRISE_A_CORRIGER');

notify pgrst, 'reload schema';

select id, email, display_name, account_type
from public.profiles
where lower(email) = lower('EMAIL_ENTREPRISE_A_CORRIGER');
