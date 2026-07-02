-- ============================================================
-- AUTH FIX: allow an authenticated user to create their OWN
-- users-table row (self-heal when the on_auth_user_created
-- trigger did not run or was delayed).
--
-- Background: `users` has RLS enabled with SELECT + UPDATE
-- policies only (see 20260612000000_initial_rls.sql). The client
-- (useAuthStore.refreshUser) falls back to INSERTing the row when
-- it is missing, but with no INSERT policy that INSERT was always
-- rejected — corrupting the session on first login in edge cases.
--
-- This policy is safe: the row id is forced to equal auth.uid(),
-- so a user can only ever create their own record, never another.
-- ============================================================

DROP POLICY IF EXISTS users_insert_self ON public.users;
CREATE POLICY users_insert_self ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
