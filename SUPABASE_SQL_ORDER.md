# Donoss - ordre des fichiers Supabase

Ce fichier sert a eviter de relancer un ancien SQL qui remettrait l'app dans un etat bizarre.

## Mode actuel pour le lancement

Pour les offres/publications, on garde `business_offers` sans RLS pour que les produits restent visibles dans l'app, dans les categories, dans les details et dans les profils entreprises.

Si les produits disparaissent, si `detalle` charge a l'infini, ou si Supabase affiche encore des restrictions sur `business_offers`, execute en dernier:

```sql
supabase-open-business-offers-no-rls.sql
```

## Fichiers principaux

1. `supabase-profiles.sql`
   - profils utilisateurs/entreprises seulement.
   - ne touche plus a `business_offers`.

2. `supabase-business-offers.sql`
   - cree/met a jour les colonnes des offres.
   - laisse `business_offers` sans RLS en mode lancement.

3. `supabase-payments.sql`
   - achats avec points, historique et QR.

4. `supabase-external-purchase-history.sql`
   - historique des clics/achats externes sans QR Donoss.

5. `supabase-liked-offers.sql`
   - favoris/me gusta.

6. `supabase-social-plans.sql`, `supabase-free-social-plans.sql`, `supabase-plan-chat.sql`, `supabase-side-groups.sql`
   - quedadas, plans libres, membres et chats.

7. `supabase-offer-automation-requests.sql`
   - demandes d'automatisation/copie de publication.

8. `supabase-open-business-offers-no-rls.sql`
   - fichier de secours a lancer en dernier si les offres sont bloquees.

9. `supabase-fix-business-account-type.sql`
   - a utiliser seulement si un compte entreprise apparait comme `Usuario`.
   - remplace `EMAIL_ENTREPRISE_A_CORRIGER` par l'email de l'entreprise avant d'executer.

10. `supabase-performance-indexes.sql`
   - indexes de performance pour les offres, achats, categories et notifications.
   - a executer une fois si Supabase monte trop haut en CPU.

## Fichier a ne plus utiliser comme base

`supabase-disable-offers-rls-dev.sql` est garde uniquement pour compatibilite. Il ne duplique plus le schema. Pour un lancement propre, prefere `supabase-open-business-offers-no-rls.sql`.
