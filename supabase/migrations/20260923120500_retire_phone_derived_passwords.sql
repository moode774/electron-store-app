-- =============================================================
-- SECURITY: retire the phone-derived password scheme.
--
-- Until now every account was created as
--   email    = u<digits>@levi-phone.app
--   password = Levi-<digits>-auth
-- so anyone who knew a phone number (including the admin number that was
-- documented in this public repository) could call
-- auth.signInWithPassword with the public publishable key and get a real
-- session for that account.
--
-- The app now signs in with Supabase phone OTP. This migration:
--   1. links each legacy account to its phone number (auth.users.phone), so
--      the OTP login reaches the SAME account and role instead of creating a
--      duplicate customer;
--   2. replaces the derivable passwords with random ones (no one knows them);
--   3. revokes every existing session of those accounts, in case one was
--      obtained with a derived password.
--
-- DEPLOY ORDER (see docs/LAUNCH_CHECKLIST.md):
--   a) enable the Phone provider + an SMS provider in Supabase Auth;
--   b) ship the OTP client build;
--   c) apply this migration.
-- Applying it without an SMS provider locks every user out until one is set.
-- =============================================================

DO $retire$
DECLARE
  v_pattern constant text := '^u([0-9]{6,15})@levi-phone\.app$';
BEGIN
  -- 1) Link the phone so phone OTP resolves to the existing account.
  UPDATE auth.users AS u
  SET phone = substring(u.email FROM v_pattern),
      phone_confirmed_at = COALESCE(u.phone_confirmed_at, now())
  WHERE u.email ~ v_pattern
    AND COALESCE(u.phone, '') = ''
    AND NOT EXISTS (
      SELECT 1 FROM auth.users AS other
      WHERE other.phone = substring(u.email FROM v_pattern)
        AND other.id <> u.id
    );

  INSERT INTO auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
  SELECT u.id, 'phone', u.id::text,
         jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true),
         now(), now()
  FROM auth.users AS u
  WHERE u.email ~ v_pattern
    AND COALESCE(u.phone, '') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM auth.identities AS i
      WHERE i.user_id = u.id AND i.provider = 'phone'
    );

  -- 2) Nobody can know these passwords any more.
  UPDATE auth.users AS u
  SET encrypted_password = extensions.crypt(
        encode(extensions.gen_random_bytes(32), 'hex'),
        extensions.gen_salt('bf')
      ),
      updated_at = now()
  WHERE u.email ~ v_pattern;

  -- 3) Sign out every session that may have been obtained with them.
  DELETE FROM auth.refresh_tokens AS rt
  USING auth.users AS u
  WHERE rt.user_id = u.id::text AND u.email ~ v_pattern;

  DELETE FROM auth.sessions AS s
  USING auth.users AS u
  WHERE s.user_id = u.id AND u.email ~ v_pattern;
END;
$retire$;
