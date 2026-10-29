-- MealTrack: DELETE ALL DATA AND ALL LOGIN ACCOUNTS. Cannot be undone.
-- Tables, functions and security rules are kept. Afterwards the app shows the
-- first-time setup screen, and the first person to set it up becomes admin.

begin;
delete from public.notification_log;
delete from public.push_subscriptions;
delete from public.notification_preferences;
delete from public.meal_overrides;
delete from public.household_invites;
delete from public.household_members;
delete from public.households;
delete from public.family_pin_attempts;
delete from auth.users;  -- also removes their sessions and identities
commit;
