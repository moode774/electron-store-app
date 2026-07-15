-- Final least-privilege and realtime pass for the marketplace operational repair.
-- This migration intentionally runs after the order and finance/support migrations.

-- Normalize local legacy columns before any index or function references the
-- inspected live contract. These changes preserve equivalent legacy values.
DO $normalize_user_role$
DECLARE v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role';
  IF v_data_type = 'USER-DEFINED' THEN
    ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.users ALTER COLUMN role TYPE text USING role::text;
    ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'customer';
  END IF;
END;
$normalize_user_role$;

-- The onboarding UI supports pickup vehicles, while the oldest enum did not.
-- Normalize to text and enforce the complete application contract below.
DO $normalize_delivery_vehicle_type$
DECLARE v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'delivery_profiles' AND column_name = 'vehicle_type';
  IF v_data_type = 'USER-DEFINED' THEN
    ALTER TABLE public.delivery_profiles ALTER COLUMN vehicle_type DROP DEFAULT;
    ALTER TABLE public.delivery_profiles ALTER COLUMN vehicle_type TYPE text USING vehicle_type::text;
  END IF;
END;
$normalize_delivery_vehicle_type$;

-- The original signup trigger cast caller-controlled metadata to user_role.
-- After role becomes text, keep the trigger working while limiting self-chosen
-- roles to the three application roles. Administrator promotion is admin-only.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := lower(btrim(COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer')));
  v_full_name text := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    ''
  );
  v_phone text := COALESCE(NEW.phone, NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''));
BEGIN
  IF v_role NOT IN ('customer', 'merchant', 'delivery') THEN
    v_role := 'customer';
  END IF;

  INSERT INTO public.users (id, email, phone, full_name, role)
  VALUES (NEW.id, NEW.email, v_phone, left(v_full_name, 150), v_role)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS merchant_id uuid,
  ADD COLUMN IF NOT EXISTS last_message text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_unread integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_unread integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Order chats have an authoritative customer/profile relationship.
UPDATE public.chat_conversations c
SET customer_id = COALESCE(c.customer_id, o.customer_id),
    merchant_id = COALESCE(c.merchant_id, mp.user_id)
FROM public.orders o
LEFT JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
WHERE c.order_id = o.id
  AND (c.customer_id IS NULL OR c.merchant_id IS NULL);

-- Store chats in the oldest schema only had participant_ids. Resolve the two
-- roles when that legacy column exists; ambiguous/unresolvable rows remain
-- visible to the NOT VALID contract checks below instead of being guessed.
DO $normalize_legacy_chat_participants$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'participant_ids'
  ) THEN
    EXECUTE $sql$
      UPDATE public.chat_conversations c
      SET customer_id = COALESCE(c.customer_id, (
            SELECT p.user_id
            FROM unnest(c.participant_ids) AS p(user_id)
            JOIN public.users u ON u.id = p.user_id
            WHERE u.role::text = 'customer'
            ORDER BY p.user_id
            LIMIT 1
          )),
          merchant_id = COALESCE(c.merchant_id, (
            SELECT p.user_id
            FROM unnest(c.participant_ids) AS p(user_id)
            JOIN public.users u ON u.id = p.user_id
            WHERE u.role::text = 'merchant'
            ORDER BY p.user_id
            LIMIT 1
          ))
      WHERE c.order_id IS NULL
        AND (c.customer_id IS NULL OR c.merchant_id IS NULL)
    $sql$;
  END IF;
END;
$normalize_legacy_chat_participants$;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

DO $normalize_chat_message_body$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'body'
  ) THEN
    EXECUTE 'UPDATE public.chat_messages SET message = body WHERE message IS NULL AND body IS NOT NULL';
  END IF;
END;
$normalize_chat_message_body$;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewer_id uuid,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS from_merchant boolean NOT NULL DEFAULT false;

DO $normalize_legacy_reviews$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'customer_id'
  ) THEN
    EXECUTE 'UPDATE public.reviews SET reviewer_id = customer_id WHERE reviewer_id IS NULL';
    EXECUTE 'ALTER TABLE public.reviews ALTER COLUMN customer_id DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'product_id'
  ) THEN
    EXECUTE $$UPDATE public.reviews SET target_type = 'product', target_id = product_id
             WHERE target_id IS NULL AND product_id IS NOT NULL$$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'merchant_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.reviews r
      SET target_type = 'merchant',
          target_id = (
            SELECT mp.id
            FROM public.merchant_profiles mp
            WHERE mp.user_id = r.merchant_id OR mp.id = r.merchant_id
            ORDER BY CASE WHEN mp.user_id = r.merchant_id THEN 0 ELSE 1 END
            LIMIT 1
          )
      WHERE r.target_id IS NULL
        AND r.merchant_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.merchant_profiles mp
          WHERE mp.user_id = r.merchant_id OR mp.id = r.merchant_id
        )
    $sql$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'delivery_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.reviews r
      SET target_type = 'delivery',
          target_id = (
            SELECT dp.id
            FROM public.delivery_profiles dp
            WHERE dp.user_id = r.delivery_id OR dp.id = r.delivery_id
            ORDER BY CASE WHEN dp.user_id = r.delivery_id THEN 0 ELSE 1 END
            LIMIT 1
          )
      WHERE r.target_id IS NULL
        AND r.delivery_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.delivery_profiles dp
          WHERE dp.user_id = r.delivery_id OR dp.id = r.delivery_id
        )
    $sql$;
  END IF;
END;
$normalize_legacy_reviews$;

-- Legacy reviews become public only when the database can prove the reviewer
-- owned a delivered order and the reviewed target belonged to that order.
UPDATE public.reviews
SET is_verified = false
WHERE is_verified IS DISTINCT FROM false;

UPDATE public.reviews r
SET is_verified = true
FROM public.orders o
WHERE r.order_id = o.id
  AND o.status::text = 'delivered'
  AND r.reviewer_id = o.customer_id
  AND (
    (r.target_type = 'merchant' AND r.target_id = o.merchant_id)
    OR (r.target_type = 'delivery' AND r.target_id = o.delivery_id)
    OR (
      r.target_type = 'product'
      AND EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.order_id = o.id AND oi.product_id = r.target_id
      )
    )
  );

-- The oldest complaints table used user_id/subject/body. Normalize it before
-- contact helpers and participant policies reference the production contract.
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS complainant_id uuid,
  ADD COLUMN IF NOT EXISTS against_id uuid,
  ADD COLUMN IF NOT EXISTS against_type text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $normalize_complaint_status$
DECLARE v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'complaints' AND column_name = 'status';
  IF v_data_type = 'USER-DEFINED' THEN
    ALTER TABLE public.complaints ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.complaints ALTER COLUMN status TYPE text USING status::text;
  END IF;
  UPDATE public.complaints SET status = 'under_review' WHERE status = 'in_review';
  UPDATE public.complaints SET status = 'open' WHERE status IS NULL;
  ALTER TABLE public.complaints ALTER COLUMN status SET DEFAULT 'open';
  ALTER TABLE public.complaints ALTER COLUMN status SET NOT NULL;
END;
$normalize_complaint_status$;

DO $normalize_legacy_complaints$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'complaints' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'UPDATE public.complaints SET complainant_id = user_id WHERE complainant_id IS NULL';
    EXECUTE 'ALTER TABLE public.complaints ALTER COLUMN user_id DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'complaints' AND column_name = 'subject'
  ) THEN
    EXECUTE 'UPDATE public.complaints SET title = subject WHERE title IS NULL';
    EXECUTE 'ALTER TABLE public.complaints ALTER COLUMN subject DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'complaints' AND column_name = 'body'
  ) THEN
    EXECUTE 'UPDATE public.complaints SET description = body WHERE description IS NULL';
    EXECUTE 'ALTER TABLE public.complaints ALTER COLUMN body DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'complaints' AND column_name = 'attachment_url'
  ) THEN
    EXECUTE $sql$
      UPDATE public.complaints
      SET evidence_images = jsonb_build_array(attachment_url)
      WHERE NULLIF(btrim(attachment_url), '') IS NOT NULL
        AND COALESCE(evidence_images, '[]'::jsonb) = '[]'::jsonb
    $sql$;
  END IF;
  UPDATE public.complaints SET evidence_images = '[]'::jsonb WHERE evidence_images IS NULL;
  UPDATE public.complaints SET priority = 'medium' WHERE priority IS NULL;
  UPDATE public.complaints SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;
END;
$normalize_legacy_complaints$;

ALTER TABLE public.complaints
  ALTER COLUMN evidence_images SET DEFAULT '[]'::jsonb,
  ALTER COLUMN evidence_images SET NOT NULL,
  ALTER COLUMN priority SET DEFAULT 'medium',
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Some live databases predate the baseline table definition. Keep complaint
-- replies deployable there before adding their participant integrity rules.
ALTER TABLE public.complaint_messages
  ADD COLUMN IF NOT EXISTS complaint_id uuid,
  ADD COLUMN IF NOT EXISTS sender_id uuid,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.complaint_messages
SET attachments = '[]'::jsonb
WHERE attachments IS NULL;

ALTER TABLE public.complaint_messages
  ALTER COLUMN attachments SET DEFAULT '[]'::jsonb,
  ALTER COLUMN attachments SET NOT NULL;

ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS device_type text;
DO $normalize_device_type$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'platform'
  ) THEN
    EXECUTE 'UPDATE public.device_tokens SET device_type = platform WHERE device_type IS NULL';
  END IF;
  UPDATE public.device_tokens SET device_type = 'web' WHERE device_type IS NULL;
  ALTER TABLE public.device_tokens ALTER COLUMN device_type SET DEFAULT 'web';
  ALTER TABLE public.device_tokens ALTER COLUMN device_type SET NOT NULL;
END;
$normalize_device_type$;

-- Add replay-safe integrity contracts. NOT VALID preserves deployability when
-- a legacy row cannot be resolved without guessing, while still enforcing each
-- constraint for all new/changed rows. The tests below report resolvable orphans.
DO $integrity_contracts$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND conname = 'users_role_check') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role IN ('customer', 'merchant', 'delivery', 'admin')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_profiles'::regclass AND conname = 'delivery_profiles_vehicle_type_check') THEN
    ALTER TABLE public.delivery_profiles ADD CONSTRAINT delivery_profiles_vehicle_type_check
      CHECK (vehicle_type IS NULL OR vehicle_type IN ('motorcycle', 'car', 'bicycle', 'pickup')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_conversations'::regclass AND conname = 'chat_conversations_customer_id_fkey') THEN
    ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_conversations'::regclass AND conname = 'chat_conversations_merchant_id_fkey') THEN
    ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_merchant_id_fkey
      FOREIGN KEY (merchant_id) REFERENCES public.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_conversations'::regclass AND conname = 'chat_conversations_participants_required_check') THEN
    ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_participants_required_check
      CHECK (customer_id IS NOT NULL AND merchant_id IS NOT NULL AND customer_id <> merchant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.chat_messages'::regclass AND conname = 'chat_messages_message_type_check') THEN
    ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_message_type_check
      CHECK (message_type IN ('text', 'image', 'order_ref')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reviews'::regclass AND conname = 'reviews_reviewer_id_fkey') THEN
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_reviewer_id_fkey
      FOREIGN KEY (reviewer_id) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reviews'::regclass AND conname = 'reviews_target_contract_check') THEN
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_target_contract_check
      CHECK (reviewer_id IS NOT NULL AND target_type IN ('product', 'merchant', 'delivery') AND target_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reviews'::regclass AND conname = 'reviews_images_array_check') THEN
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_images_array_check
      CHECK (jsonb_typeof(images) = 'array') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.device_tokens'::regclass AND conname = 'device_tokens_device_type_check') THEN
    ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_device_type_check
      CHECK (device_type IN ('ios', 'android', 'web')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaints'::regclass AND conname = 'complaints_complainant_id_fkey') THEN
    ALTER TABLE public.complaints ADD CONSTRAINT complaints_complainant_id_fkey
      FOREIGN KEY (complainant_id) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaints'::regclass AND conname = 'complaints_against_id_fkey') THEN
    ALTER TABLE public.complaints ADD CONSTRAINT complaints_against_id_fkey
      FOREIGN KEY (against_id) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaints'::regclass AND conname = 'complaints_resolved_by_fkey') THEN
    ALTER TABLE public.complaints ADD CONSTRAINT complaints_resolved_by_fkey
      FOREIGN KEY (resolved_by) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaints'::regclass AND conname = 'complaints_contract_check') THEN
    ALTER TABLE public.complaints ADD CONSTRAINT complaints_contract_check CHECK (
      complainant_id IS NOT NULL
      AND NULLIF(btrim(title), '') IS NOT NULL
      AND (against_type IS NULL OR against_type IN ('merchant', 'delivery', 'customer', 'platform'))
      AND (category IS NULL OR category IN ('wrong_item', 'damaged_item', 'not_delivered', 'late_delivery', 'bad_behavior', 'fraud', 'refund_issue', 'other'))
      AND status IN ('open', 'under_review', 'resolved', 'closed', 'escalated')
      AND priority IN ('low', 'medium', 'high', 'urgent')
      AND jsonb_typeof(evidence_images) = 'array'
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaint_messages'::regclass AND conname = 'complaint_messages_complaint_id_fkey') THEN
    ALTER TABLE public.complaint_messages ADD CONSTRAINT complaint_messages_complaint_id_fkey
      FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaint_messages'::regclass AND conname = 'complaint_messages_sender_id_fkey') THEN
    ALTER TABLE public.complaint_messages ADD CONSTRAINT complaint_messages_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.users(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaint_messages'::regclass AND conname = 'complaint_messages_attachments_array_check') THEN
    ALTER TABLE public.complaint_messages ADD CONSTRAINT complaint_messages_attachments_array_check
      CHECK (jsonb_typeof(attachments) = 'array') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.complaint_messages'::regclass AND conname = 'complaint_messages_contract_check') THEN
    ALTER TABLE public.complaint_messages ADD CONSTRAINT complaint_messages_contract_check
      CHECK (
        complaint_id IS NOT NULL
        AND sender_id IS NOT NULL
        AND NULLIF(btrim(message), '') IS NOT NULL
      ) NOT VALID;
  END IF;
END;
$integrity_contracts$;

-- Canonical administrator and operational-account predicates. All later RLS
-- policies and SECURITY DEFINER admin RPCs share these definitions.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.role = 'admin'
      AND u.is_active IS TRUE
      AND NOT public.is_user_blocked(u.id)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_operational(p_required_role text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.is_active IS TRUE
      AND NOT public.is_user_blocked(u.id)
      AND (
        (p_required_role IS NULL AND u.role IN ('customer', 'merchant', 'delivery'))
        OR u.role = p_required_role
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_merchant_publicly_available(p_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p_merchant_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.merchant_profiles mp
    JOIN public.users u ON u.id = mp.user_id
    WHERE mp.id = p_merchant_id
      AND mp.is_approved IS TRUE
      AND mp.is_active IS TRUE
      AND u.role = 'merchant'
      AND u.is_active IS TRUE
      AND NOT public.is_user_blocked(u.id)
  )
$$;

-- Authenticated ownership helpers keep merchant user UUIDs out of the public
-- storefront column surface while still supporting RLS and storage checks.
CREATE OR REPLACE FUNCTION public.is_current_merchant_profile_owner(p_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p_merchant_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.merchant_profiles mp
    JOIN public.users u ON u.id = mp.user_id
    WHERE mp.id = p_merchant_id
      AND mp.user_id = (SELECT auth.uid())
      AND u.role = 'merchant'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_current_merchant_profile_operational(p_merchant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.merchant_profiles mp
    JOIN public.users u ON u.id = mp.user_id
    WHERE mp.user_id = (SELECT auth.uid())
      AND (p_merchant_id IS NULL OR mp.id = p_merchant_id)
      AND u.role = 'merchant'
      AND u.is_active IS TRUE
      AND NOT public.is_user_blocked(u.id)
      AND mp.is_approved IS TRUE
      AND mp.is_active IS TRUE
  )
$$;

CREATE OR REPLACE FUNCTION public.get_current_merchant_profile_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT mp.id
  FROM public.merchant_profiles mp
  JOIN public.users u ON u.id = mp.user_id
  WHERE mp.user_id = (SELECT auth.uid())
    AND u.role = 'merchant'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_current_user_operational(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_merchant_publicly_available(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_current_merchant_profile_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_current_merchant_profile_operational(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_current_merchant_profile_id() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Structural invariants that are safe only after the production preflight shows
-- no duplicates. The 2026-07-13 preflight returned zero violations for each.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_profiles_user_id
  ON public.customer_profiles (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_merchant_profiles_user_id
  ON public.merchant_profiles (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_delivery_profiles_user_id
  ON public.delivery_profiles (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_referral_codes_user_id
  ON public.referral_codes (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_addresses_one_default_per_user
  ON public.addresses (user_id) WHERE is_default IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conversation_order_context
  ON public.chat_conversations (customer_id, merchant_id, order_id)
  WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conversation_store_context
  ON public.chat_conversations (customer_id, merchant_id)
  WHERE order_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_reviews_one_per_order_target
  ON public.reviews (reviewer_id, order_id, target_type, target_id)
  WHERE order_id IS NOT NULL AND reviewer_id IS NOT NULL
    AND target_type IS NOT NULL AND target_id IS NOT NULL;

ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS store_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS tax_number text;

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS image_url text;

DO $normalize_product_image_url$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_images' AND column_name = 'url'
  ) THEN
    EXECUTE 'UPDATE public.product_images SET image_url = url WHERE image_url IS NULL AND url IS NOT NULL';
    EXECUTE 'ALTER TABLE public.product_images ALTER COLUMN url DROP NOT NULL';
  END IF;
END;
$normalize_product_image_url$;

-- -----------------------------------------------------------------------------
-- Guard protected aggregates even if a future grant or policy is broadened.
-- SECURITY INVOKER is deliberate: direct Data API writes run as authenticated,
-- while vetted SECURITY DEFINER business RPCs run as their database owner.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_protected_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('app.marketplace_operation', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'customer_profiles' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.loyalty_points IS DISTINCT FROM OLD.loyalty_points
       OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'protected customer profile field';
    END IF;
  ELSIF TG_TABLE_NAME = 'merchant_profiles' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.store_slug IS DISTINCT FROM OLD.store_slug
       OR NEW.is_approved IS DISTINCT FROM OLD.is_approved
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
       OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
       OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'protected merchant profile field';
    END IF;
  ELSIF TG_TABLE_NAME = 'delivery_profiles' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.is_approved IS DISTINCT FROM OLD.is_approved
       OR NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.total_deliveries IS DISTINCT FROM OLD.total_deliveries
       OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'protected delivery profile field';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_customer_profile_fields ON public.customer_profiles;
CREATE TRIGGER trg_protect_customer_profile_fields
BEFORE UPDATE ON public.customer_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_protected_profile_fields();
DROP TRIGGER IF EXISTS trg_protect_merchant_profile_fields ON public.merchant_profiles;
CREATE TRIGGER trg_protect_merchant_profile_fields
BEFORE UPDATE ON public.merchant_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_protected_profile_fields();
DROP TRIGGER IF EXISTS trg_protect_delivery_profile_fields ON public.delivery_profiles;
CREATE TRIGGER trg_protect_delivery_profile_fields
BEFORE UPDATE ON public.delivery_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_protected_profile_fields();

-- -----------------------------------------------------------------------------
-- Address operations. Identity comes only from auth.uid().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_address(
  p_label text,
  p_full_address text,
  p_city text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_is_default boolean DEFAULT false
)
RETURNS public.addresses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.addresses%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  IF NOT public.is_current_user_operational('customer') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;
  IF length(btrim(COALESCE(p_full_address, ''))) < 5 OR length(p_full_address) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid address';
  END IF;
  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid latitude';
  END IF;
  IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid longitude';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('address-default:' || v_uid::text, 0)
  );
  p_is_default := COALESCE(p_is_default, false)
    OR NOT EXISTS (SELECT 1 FROM public.addresses WHERE user_id = v_uid);
  IF p_is_default THEN
    UPDATE public.addresses SET is_default = false
    WHERE user_id = v_uid AND is_default IS TRUE;
  END IF;

  INSERT INTO public.addresses (user_id, label, full_address, city, latitude, longitude, is_default)
  VALUES (
    v_uid,
    left(NULLIF(btrim(p_label), ''), 50),
    btrim(p_full_address),
    left(NULLIF(btrim(p_city), ''), 100),
    p_latitude,
    p_longitude,
    p_is_default
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Onboarding profile creation is identity-derived and works against both the
-- clean schema (profile id = auth uid) and live databases with an existing
-- same-user placeholder. The JSON contract is explicitly whitelisted.
CREATE OR REPLACE FUNCTION public.create_my_merchant_profile(p_profile jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_existing public.merchant_profiles%ROWTYPE;
  v_id uuid;
  v_store_name text;
  v_store_slug text;
  v_store_description text;
  v_store_category text;
  v_city text;
  v_address text;
  v_latitude numeric;
  v_longitude numeric;
  v_service_area_ids text[] := ARRAY[]::text[];
  v_is_open boolean := true;
  v_owner_name text;
  v_national_id text;
  v_commercial_register text;
  v_tax_number text;
  v_store_phone text;
  v_whatsapp text;
  v_bank_name text;
  v_bank_account text;
  v_bank_account_name text;
  v_store_logo_url text;
  v_store_banner_url text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant profile must be a JSON object';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_profile) AS k(key)
    WHERE NOT (k.key = ANY (ARRAY[
      'store_name','store_slug','store_description','store_category','city','address',
      'latitude','longitude','service_area_ids','is_open','owner_name','national_id',
      'commercial_register','tax_number','store_phone','whatsapp','bank_name',
      'bank_account','bank_account_name','store_logo_url','store_banner_url'
    ]::text[]))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant profile contains unsupported fields';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_profile) AS e(key, value)
    WHERE e.key = ANY (ARRAY[
      'store_name','store_slug','store_description','store_category','city','address',
      'owner_name','national_id','commercial_register','tax_number','store_phone',
      'whatsapp','bank_name','bank_account','bank_account_name','store_logo_url','store_banner_url'
    ]::text[])
      AND jsonb_typeof(e.value) NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant text fields must be strings';
  END IF;

  v_store_name := NULLIF(btrim(p_profile ->> 'store_name'), '');
  v_store_slug := lower(NULLIF(btrim(p_profile ->> 'store_slug'), ''));
  IF v_store_name IS NULL OR length(v_store_name) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid store name';
  END IF;
  -- Arabic-only store names can yield an empty/leading-dash client slug.
  -- Keep onboarding smooth with a stable, collision-free URL-safe fallback.
  IF v_store_slug IS NULL OR length(v_store_slug) NOT BETWEEN 3 AND 80
     OR v_store_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    v_store_slug := 'store-' || replace(v_uid::text, '-', '');
  END IF;

  v_store_description := NULLIF(btrim(p_profile ->> 'store_description'), '');
  v_store_category := NULLIF(btrim(p_profile ->> 'store_category'), '');
  v_city := NULLIF(btrim(p_profile ->> 'city'), '');
  v_address := NULLIF(btrim(p_profile ->> 'address'), '');
  v_owner_name := NULLIF(btrim(p_profile ->> 'owner_name'), '');
  v_national_id := NULLIF(btrim(p_profile ->> 'national_id'), '');
  v_commercial_register := NULLIF(btrim(p_profile ->> 'commercial_register'), '');
  v_tax_number := NULLIF(btrim(p_profile ->> 'tax_number'), '');
  v_store_phone := NULLIF(btrim(p_profile ->> 'store_phone'), '');
  v_whatsapp := NULLIF(btrim(p_profile ->> 'whatsapp'), '');
  v_bank_name := NULLIF(btrim(p_profile ->> 'bank_name'), '');
  v_bank_account := NULLIF(btrim(p_profile ->> 'bank_account'), '');
  v_bank_account_name := NULLIF(btrim(p_profile ->> 'bank_account_name'), '');
  v_store_logo_url := NULLIF(btrim(p_profile ->> 'store_logo_url'), '');
  v_store_banner_url := NULLIF(btrim(p_profile ->> 'store_banner_url'), '');

  IF length(COALESCE(v_store_description, '')) > 4000
     OR length(COALESCE(v_store_category, '')) > 100
     OR length(COALESCE(v_city, '')) > 100
     OR length(COALESCE(v_address, '')) > 500
     OR length(COALESCE(v_owner_name, '')) > 150
     OR length(COALESCE(v_national_id, '')) > 100
     OR length(COALESCE(v_commercial_register, '')) > 150
     OR length(COALESCE(v_tax_number, '')) > 100
     OR length(COALESCE(v_store_phone, '')) > 30
     OR length(COALESCE(v_whatsapp, '')) > 30
     OR length(COALESCE(v_bank_name, '')) > 150
     OR length(COALESCE(v_bank_account, '')) > 150
     OR length(COALESCE(v_bank_account_name, '')) > 150
     OR length(COALESCE(v_store_logo_url, '')) > 2000
     OR length(COALESCE(v_store_banner_url, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant profile field is too long';
  END IF;

  IF (p_profile ? 'latitude' AND jsonb_typeof(p_profile -> 'latitude') NOT IN ('number', 'null'))
     OR (p_profile ? 'longitude' AND jsonb_typeof(p_profile -> 'longitude') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid merchant coordinates';
  END IF;
  BEGIN
    v_latitude := NULLIF(p_profile ->> 'latitude', '')::numeric;
    v_longitude := NULLIF(p_profile ->> 'longitude', '')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid merchant coordinates';
  END;
  IF (v_latitude IS NOT NULL AND (v_latitude < -90 OR v_latitude > 90))
     OR (v_longitude IS NOT NULL AND (v_longitude < -180 OR v_longitude > 180)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid merchant coordinates';
  END IF;

  IF p_profile ? 'service_area_ids' AND jsonb_typeof(p_profile -> 'service_area_ids') <> 'null' THEN
    IF jsonb_typeof(p_profile -> 'service_area_ids') <> 'array'
       OR jsonb_array_length(p_profile -> 'service_area_ids') > 100
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_profile -> 'service_area_ids') AS e(value)
         WHERE jsonb_typeof(e.value) <> 'string' OR length(e.value #>> '{}') > 100
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid service area ids';
    END IF;
    SELECT COALESCE(array_agg(value), ARRAY[]::text[])
    INTO v_service_area_ids
    FROM jsonb_array_elements_text(p_profile -> 'service_area_ids') AS a(value);
  END IF;
  IF p_profile ? 'is_open' AND jsonb_typeof(p_profile -> 'is_open') NOT IN ('boolean', 'null') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid store open state';
  END IF;
  v_is_open := COALESCE((p_profile ->> 'is_open')::boolean, true);

  PERFORM pg_advisory_xact_lock(hashtextextended('merchant-onboarding:' || v_uid::text, 0));
  SELECT * INTO v_existing
  FROM public.merchant_profiles
  WHERE user_id = v_uid
  FOR UPDATE;

  IF FOUND AND v_existing.is_approved IS TRUE THEN
    RETURN v_existing.id;
  ELSIF FOUND THEN
    UPDATE public.merchant_profiles
    SET store_name = v_store_name,
        store_slug = v_store_slug,
        store_description = v_store_description,
        store_category = v_store_category,
        city = v_city,
        address = v_address,
        latitude = v_latitude,
        longitude = v_longitude,
        service_area_ids = v_service_area_ids,
        is_open = v_is_open,
        owner_name = v_owner_name,
        national_id = v_national_id,
        commercial_register = v_commercial_register,
        tax_number = v_tax_number,
        store_phone = v_store_phone,
        whatsapp = v_whatsapp,
        bank_name = v_bank_name,
        bank_account = v_bank_account,
        bank_account_name = v_bank_account_name,
        store_logo_url = v_store_logo_url,
        store_banner_url = v_store_banner_url
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.merchant_profiles (
      id, user_id, store_name, store_slug, store_description, store_category,
      city, address, latitude, longitude, service_area_ids, is_open,
      owner_name, national_id, commercial_register, tax_number, store_phone,
      whatsapp, bank_name, bank_account, bank_account_name,
      store_logo_url, store_banner_url
    ) VALUES (
      v_uid, v_uid, v_store_name, v_store_slug, v_store_description, v_store_category,
      v_city, v_address, v_latitude, v_longitude, v_service_area_ids, v_is_open,
      v_owner_name, v_national_id, v_commercial_register, v_tax_number, v_store_phone,
      v_whatsapp, v_bank_name, v_bank_account, v_bank_account_name,
      v_store_logo_url, v_store_banner_url
    )
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_delivery_profile(p_profile jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_existing public.delivery_profiles%ROWTYPE;
  v_id uuid;
  v_national_id text;
  v_vehicle_type text;
  v_vehicle_plate text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_current_user_operational('delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'delivery account is not operational';
  END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery profile must be a JSON object';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_profile) AS k(key)
    WHERE NOT (k.key = ANY (ARRAY['national_id','vehicle_type','vehicle_plate']::text[]))
  ) OR EXISTS (
    SELECT 1 FROM jsonb_each(p_profile) AS e(key, value)
    WHERE jsonb_typeof(e.value) NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery profile contains unsupported fields';
  END IF;

  v_national_id := NULLIF(btrim(p_profile ->> 'national_id'), '');
  v_vehicle_type := lower(NULLIF(btrim(p_profile ->> 'vehicle_type'), ''));
  v_vehicle_plate := upper(NULLIF(btrim(p_profile ->> 'vehicle_plate'), ''));
  IF v_national_id IS NULL OR length(v_national_id) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid national id';
  END IF;
  IF v_vehicle_type IS NULL OR v_vehicle_type NOT IN ('motorcycle', 'car', 'bicycle', 'pickup') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid vehicle type';
  END IF;
  IF v_vehicle_plate IS NULL OR length(v_vehicle_plate) NOT BETWEEN 2 AND 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid vehicle plate';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('delivery-onboarding:' || v_uid::text, 0));
  SELECT * INTO v_existing
  FROM public.delivery_profiles
  WHERE user_id = v_uid
  FOR UPDATE;

  IF FOUND AND v_existing.is_approved IS TRUE THEN
    RETURN v_existing.id;
  ELSIF FOUND THEN
    UPDATE public.delivery_profiles
    SET national_id = v_national_id,
        vehicle_type = v_vehicle_type,
        vehicle_plate = v_vehicle_plate,
        is_online = false
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.delivery_profiles (
      id, user_id, national_id, vehicle_type, vehicle_plate, is_online
    ) VALUES (
      v_uid, v_uid, v_national_id, v_vehicle_type, v_vehicle_plate, false
    )
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_merchant_profile(p_updates jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_current public.merchant_profiles%ROWTYPE;
  v_patch public.merchant_profiles%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant updates must be a JSON object';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_updates) AS k(key)
    WHERE NOT (k.key = ANY (ARRAY[
      'store_name','store_logo_url','store_banner_url','store_description','store_category',
      'commercial_register','address','city','latitude','longitude','bank_account',
      'bank_name','service_area_ids','owner_name','national_id','store_phone','whatsapp',
      'bank_account_name','tax_number','is_open'
    ]::text[]))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant updates contain protected fields';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_updates) AS e(key, value)
    WHERE e.key = ANY (ARRAY[
      'store_name','store_logo_url','store_banner_url','store_description','store_category',
      'commercial_register','address','city','bank_account','bank_name','owner_name',
      'national_id','store_phone','whatsapp','bank_account_name','tax_number'
    ]::text[])
      AND jsonb_typeof(e.value) NOT IN ('string', 'null')
  ) OR (p_updates ? 'is_open' AND jsonb_typeof(p_updates -> 'is_open') NOT IN ('boolean', 'null'))
    OR (p_updates ? 'latitude' AND jsonb_typeof(p_updates -> 'latitude') NOT IN ('number', 'null'))
    OR (p_updates ? 'longitude' AND jsonb_typeof(p_updates -> 'longitude') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant update field has an invalid type';
  END IF;
  IF p_updates ? 'service_area_ids' THEN
    IF jsonb_typeof(p_updates -> 'service_area_ids') <> 'array'
       OR jsonb_array_length(p_updates -> 'service_area_ids') > 100
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_updates -> 'service_area_ids') AS e(value)
         WHERE jsonb_typeof(e.value) <> 'string' OR length(e.value #>> '{}') > 100
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid service area ids';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('merchant-profile-update:' || v_uid::text, 0));
  SELECT * INTO v_current
  FROM public.merchant_profiles
  WHERE user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'merchant profile not found';
  END IF;

  BEGIN
    SELECT * INTO v_patch FROM jsonb_populate_record(v_current, p_updates);
  EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant update field has an invalid value';
  END;
  IF v_patch.store_name IS NULL OR length(btrim(v_patch.store_name)) NOT BETWEEN 2 AND 150
     OR v_patch.is_open IS NULL
     OR length(COALESCE(v_patch.store_description, '')) > 4000
     OR length(COALESCE(v_patch.store_category, '')) > 100
     OR length(COALESCE(v_patch.city, '')) > 100
     OR length(COALESCE(v_patch.address, '')) > 500
     OR length(COALESCE(v_patch.owner_name, '')) > 150
     OR length(COALESCE(v_patch.national_id, '')) > 100
     OR length(COALESCE(v_patch.commercial_register, '')) > 150
     OR length(COALESCE(v_patch.tax_number, '')) > 100
     OR length(COALESCE(v_patch.store_phone, '')) > 30
     OR length(COALESCE(v_patch.whatsapp, '')) > 30
     OR length(COALESCE(v_patch.bank_name, '')) > 150
     OR length(COALESCE(v_patch.bank_account, '')) > 150
     OR length(COALESCE(v_patch.bank_account_name, '')) > 150
     OR length(COALESCE(v_patch.store_logo_url, '')) > 2000
     OR length(COALESCE(v_patch.store_banner_url, '')) > 2000
     OR (v_patch.latitude IS NOT NULL AND (v_patch.latitude < -90 OR v_patch.latitude > 90))
     OR (v_patch.longitude IS NOT NULL AND (v_patch.longitude < -180 OR v_patch.longitude > 180)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid merchant profile update';
  END IF;

  UPDATE public.merchant_profiles
  SET store_name = btrim(v_patch.store_name),
      store_logo_url = v_patch.store_logo_url,
      store_banner_url = v_patch.store_banner_url,
      store_description = v_patch.store_description,
      store_category = v_patch.store_category,
      commercial_register = v_patch.commercial_register,
      address = v_patch.address,
      city = v_patch.city,
      latitude = v_patch.latitude,
      longitude = v_patch.longitude,
      bank_account = v_patch.bank_account,
      bank_name = v_patch.bank_name,
      service_area_ids = v_patch.service_area_ids,
      owner_name = v_patch.owner_name,
      national_id = v_patch.national_id,
      store_phone = v_patch.store_phone,
      whatsapp = v_patch.whatsapp,
      bank_account_name = v_patch.bank_account_name,
      tax_number = v_patch.tax_number,
      is_open = v_patch.is_open
  WHERE id = v_current.id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_delivery_profile(p_updates jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_current public.delivery_profiles%ROWTYPE;
  v_patch public.delivery_profiles%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_current_user_operational('delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'delivery account is not operational';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery updates must be a JSON object';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_updates) AS k(key)
    WHERE NOT (k.key = ANY (ARRAY['vehicle_type','vehicle_plate']::text[]))
  ) OR EXISTS (
    SELECT 1 FROM jsonb_each(p_updates) AS e(key, value)
    WHERE jsonb_typeof(e.value) NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery updates contain protected fields';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('delivery-profile-update:' || v_uid::text, 0));
  SELECT * INTO v_current
  FROM public.delivery_profiles
  WHERE user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'delivery profile not found';
  END IF;
  SELECT * INTO v_patch FROM jsonb_populate_record(v_current, p_updates);
  IF v_patch.vehicle_type IS NOT NULL
     AND v_patch.vehicle_type NOT IN ('motorcycle', 'car', 'bicycle', 'pickup') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid vehicle type';
  END IF;
  IF length(COALESCE(v_patch.vehicle_plate, '')) > 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid vehicle plate';
  END IF;

  UPDATE public.delivery_profiles
  SET vehicle_type = v_patch.vehicle_type,
      vehicle_plate = CASE WHEN v_patch.vehicle_plate IS NULL THEN NULL ELSE upper(btrim(v_patch.vehicle_plate)) END
  WHERE id = v_current.id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Private profile reads and admin lists prevent public storefront reads from
-- exposing identity documents, bank data, approval fields, or balances.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_merchant_profile()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT to_jsonb(mp)
  FROM public.merchant_profiles mp
  WHERE mp.user_id = (SELECT auth.uid())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_my_user_profile()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'phone', u.phone,
    'full_name', u.full_name,
    'avatar_url', u.avatar_url,
    'role', u.role,
    'is_active', u.is_active,
    'is_verified', u.is_verified,
    'is_blocked', u.is_blocked,
    'blocked_until', u.blocked_until,
    'blocked_reason', u.blocked_reason,
    'admin_role_id', u.admin_role_id,
    'created_at', u.created_at,
    'updated_at', u.updated_at
  )
  FROM public.users u
  WHERE u.id = (SELECT auth.uid())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_my_delivery_profile()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT to_jsonb(dp)
  FROM public.delivery_profiles dp
  WHERE dp.user_id = (SELECT auth.uid())
  LIMIT 1
$$;

-- Reviews are verified order actions, not arbitrary client-owned rows.
CREATE OR REPLACE FUNCTION public.create_order_review(
  p_order_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_order public.orders%ROWTYPE;
  v_review_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  IF NOT public.is_current_user_operational('customer') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;
  IF p_target_type IS NULL OR p_target_type NOT IN ('product', 'merchant', 'delivery')
     OR p_target_id IS NULL OR p_rating IS NULL OR p_rating < 1 OR p_rating > 5
     OR length(COALESCE(p_comment, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid review';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND customer_id = v_uid
  FOR SHARE;
  IF NOT FOUND OR v_order.status <> 'delivered' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only a delivered order can be reviewed';
  END IF;
  IF (p_target_type = 'merchant' AND p_target_id IS DISTINCT FROM v_order.merchant_id)
     OR (p_target_type = 'delivery' AND p_target_id IS DISTINCT FROM v_order.delivery_id)
     OR (p_target_type = 'product' AND NOT EXISTS (
       SELECT 1 FROM public.order_items oi
       WHERE oi.order_id = v_order.id AND oi.product_id = p_target_id
     )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'review target is not part of the order';
  END IF;

  INSERT INTO public.reviews (
    order_id, reviewer_id, target_type, target_id, rating, comment,
    is_verified, from_merchant
  )
  VALUES (
    v_order.id, v_uid, p_target_type, p_target_id, p_rating,
    NULLIF(btrim(p_comment), ''), true, false
  )
  ON CONFLICT (reviewer_id, order_id, target_type, target_id)
    WHERE order_id IS NOT NULL AND reviewer_id IS NOT NULL
      AND target_type IS NOT NULL AND target_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_review_id;

  IF v_review_id IS NULL THEN
    SELECT id INTO v_review_id
    FROM public.reviews
    WHERE reviewer_id = v_uid AND order_id = v_order.id
      AND target_type = p_target_type AND target_id = p_target_id;
  END IF;
  RETURN v_review_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_reviewed_order(
  p_order_id uuid,
  p_target_type text,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.reviewer_id = (SELECT auth.uid())
      AND r.order_id = p_order_id
      AND r.target_type = p_target_type
      AND r.target_id = p_target_id
  )
$$;

CREATE OR REPLACE FUNCTION public.refresh_review_aggregate(
  p_target_type text,
  p_target_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_target_id IS NULL THEN RETURN; END IF;
  PERFORM pg_catalog.set_config('app.marketplace_operation', '1', true);
  IF p_target_type = 'merchant' THEN
    UPDATE public.merchant_profiles mp
    SET rating = stats.average_rating,
        total_reviews = stats.review_count
    FROM (
      SELECT COALESCE(round(avg(r.rating)::numeric, 2), 0) AS average_rating,
             count(*)::integer AS review_count
      FROM public.reviews r
      WHERE r.target_type = 'merchant' AND r.target_id = p_target_id
        AND r.is_verified IS TRUE
    ) stats
    WHERE mp.id = p_target_id;
  ELSIF p_target_type = 'delivery' THEN
    UPDATE public.delivery_profiles dp
    SET rating = stats.average_rating
    FROM (
      SELECT COALESCE(round(avg(r.rating)::numeric, 2), 0) AS average_rating
      FROM public.reviews r
      WHERE r.target_type = 'delivery' AND r.target_id = p_target_id
        AND r.is_verified IS TRUE
    ) stats
    WHERE dp.id = p_target_id;
  ELSIF p_target_type = 'product' THEN
    UPDATE public.products p
    SET rating = stats.average_rating
    FROM (
      SELECT COALESCE(round(avg(r.rating)::numeric, 2), 0) AS average_rating
      FROM public.reviews r
      WHERE r.target_type = 'product' AND r.target_id = p_target_id
        AND r.is_verified IS TRUE
    ) stats
    WHERE p.id = p_target_id;
  END IF;
  PERFORM pg_catalog.set_config('app.marketplace_operation', '0', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.on_review_aggregate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_review_aggregate(OLD.target_type, OLD.target_id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_review_aggregate(NEW.target_type, NEW.target_id);
  ELSE
    PERFORM public.refresh_review_aggregate(OLD.target_type, OLD.target_id);
    IF (NEW.target_type, NEW.target_id) IS DISTINCT FROM (OLD.target_type, OLD.target_id) THEN
      PERFORM public.refresh_review_aggregate(NEW.target_type, NEW.target_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_aggregate_change ON public.reviews;
CREATE TRIGGER trg_review_aggregate_change
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.on_review_aggregate_change();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT target_type, target_id
    FROM public.reviews
    WHERE target_type IN ('merchant', 'delivery', 'product') AND target_id IS NOT NULL
  LOOP
    PERFORM public.refresh_review_aggregate(r.target_type, r.target_id);
  END LOOP;
END;
$$;

-- Campaign usage counters and limits are private business data. Storefront
-- reads receive only the redeemable offer fields; these identity-derived RPCs
-- provide the richer operational view to the owning merchant and admins.
CREATE OR REPLACE FUNCTION public.get_my_merchant_coupons()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'merchant_id', c.merchant_id,
    'code', c.code,
    'type', c.type,
    'value', c.value,
    'min_order_amount', c.min_order_amount,
    'max_discount_amount', c.max_discount_amount,
    'max_uses', COALESCE(c.max_uses, c.usage_limit),
    'used_count', GREATEST(COALESCE(c.used_count, 0), COALESCE(c.usage_count, 0)),
    'usage_limit', COALESCE(c.usage_limit, c.max_uses),
    'usage_count', GREATEST(COALESCE(c.usage_count, 0), COALESCE(c.used_count, 0)),
    'per_user_limit', c.per_user_limit,
    'start_date', c.start_date,
    'end_date', c.end_date,
    'is_active', c.is_active,
    'created_at', c.created_at
  )
  FROM public.coupons c
  JOIN public.merchant_profiles mp ON mp.id = c.merchant_id
  WHERE mp.user_id = (SELECT auth.uid())
  ORDER BY c.created_at DESC, c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_coupons()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'merchant_id', c.merchant_id,
    'code', c.code,
    'type', c.type,
    'value', c.value,
    'min_order_amount', c.min_order_amount,
    'max_discount_amount', c.max_discount_amount,
    'max_uses', COALESCE(c.max_uses, c.usage_limit),
    'used_count', GREATEST(COALESCE(c.used_count, 0), COALESCE(c.usage_count, 0)),
    'usage_limit', COALESCE(c.usage_limit, c.max_uses),
    'usage_count', GREATEST(COALESCE(c.usage_count, 0), COALESCE(c.used_count, 0)),
    'per_user_limit', c.per_user_limit,
    'start_date', c.start_date,
    'end_date', c.end_date,
    'is_active', c.is_active,
    'created_at', c.created_at,
    'merchant_profiles', CASE
      WHEN mp.id IS NULL THEN NULL
      ELSE jsonb_build_object('store_name', mp.store_name)
    END
  )
  FROM public.coupons c
  LEFT JOIN public.merchant_profiles mp ON mp.id = c.merchant_id
  ORDER BY c.created_at DESC, c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_merchants(p_filter text DEFAULT 'all')
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF COALESCE(p_filter, 'all') NOT IN ('all', 'pending', 'approved') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid filter';
  END IF;
  RETURN QUERY
  SELECT to_jsonb(mp) || jsonb_build_object(
    'users', jsonb_build_object('full_name', u.full_name, 'phone', u.phone)
  )
  FROM public.merchant_profiles mp
  LEFT JOIN public.users u ON u.id = mp.user_id
  WHERE p_filter IS NULL OR p_filter = 'all'
     OR (p_filter = 'pending' AND mp.is_approved IS NOT TRUE)
     OR (p_filter = 'approved' AND mp.is_approved IS TRUE)
  ORDER BY mp.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_drivers(p_filter text DEFAULT 'all')
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF COALESCE(p_filter, 'all') NOT IN ('all', 'pending', 'approved') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid filter';
  END IF;
  RETURN QUERY
  SELECT to_jsonb(dp) || jsonb_build_object(
    'users', jsonb_build_object('full_name', u.full_name, 'phone', u.phone)
  )
  FROM public.delivery_profiles dp
  LEFT JOIN public.users u ON u.id = dp.user_id
  WHERE p_filter IS NULL OR p_filter = 'all'
     OR (p_filter = 'pending' AND dp.is_approved IS NOT TRUE)
     OR (p_filter = 'approved' AND dp.is_approved IS TRUE)
  ORDER BY dp.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(p_role text DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('customer','merchant','delivery','admin') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid role';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'phone', u.phone,
    'role', u.role,
    'is_active', u.is_active,
    'is_blocked', u.is_blocked,
    'blocked_until', u.blocked_until,
    'blocked_reason', u.blocked_reason,
    'created_at', u.created_at
  )
  FROM public.users u
  WHERE p_role IS NULL OR u.role = p_role
  ORDER BY u.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_block(
  p_user_id uuid,
  p_blocked boolean,
  p_blocked_until timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before public.users%ROWTYPE;
  v_operational_block boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF COALESCE(p_blocked, false) IS FALSE
     AND p_blocked_until IS NOT NULL AND p_blocked_until <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'block expiry must be in the future';
  END IF;
  SELECT * INTO v_before FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'user not found';
  END IF;
  IF v_before.role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator accounts are protected';
  END IF;
  v_operational_block := COALESCE(p_blocked, false)
    OR (p_blocked_until IS NOT NULL AND p_blocked_until > now());
  UPDATE public.users
  SET is_blocked = COALESCE(p_blocked, false),
      blocked_until = CASE WHEN COALESCE(p_blocked, false) THEN NULL ELSE p_blocked_until END,
      blocked_reason = NULLIF(left(btrim(p_reason), 500), '')
  WHERE id = p_user_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    (SELECT auth.uid()), 'user_block_changed', 'user', p_user_id,
    jsonb_build_object(
      'was_permanently_blocked', v_before.is_blocked,
      'was_blocked_until', v_before.blocked_until,
      'is_permanently_blocked', COALESCE(p_blocked, false),
      'blocked_until', CASE WHEN COALESCE(p_blocked, false) THEN NULL ELSE p_blocked_until END,
      'operations_stopped', v_operational_block,
      'reason', NULLIF(left(btrim(p_reason), 500), '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  p_user_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before public.users%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  SELECT * INTO v_before FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'user not found';
  END IF;
  IF v_before.role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator accounts are protected';
  END IF;
  UPDATE public.users SET is_active = COALESCE(p_active, false) WHERE id = p_user_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    (SELECT auth.uid()), 'user_active_changed', 'user', p_user_id,
    jsonb_build_object(
      'was_active', v_before.is_active,
      'is_active', COALESCE(p_active, false),
      'operations_stopped', p_active IS NOT TRUE
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before public.users%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('customer','merchant','delivery','admin') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid role';
  END IF;
  IF p_full_name IS NOT NULL AND length(btrim(p_full_name)) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid full name';
  END IF;
  IF p_phone IS NOT NULL AND length(btrim(p_phone)) NOT BETWEEN 7 AND 30 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid phone';
  END IF;
  SELECT * INTO v_before FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'user not found';
  END IF;
  IF v_before.role = 'admin' OR p_role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator accounts are protected';
  END IF;
  IF p_role IS NOT NULL AND p_role IS DISTINCT FROM v_before.role THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'role changes require a dedicated migration workflow';
  END IF;
  UPDATE public.users
  SET full_name = CASE WHEN p_full_name IS NULL THEN full_name ELSE left(btrim(p_full_name), 150) END,
      phone = CASE WHEN p_phone IS NULL THEN phone ELSE left(btrim(p_phone), 30) END
  WHERE id = p_user_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    (SELECT auth.uid()), 'user_profile_updated', 'user', p_user_id,
    jsonb_build_object(
      'old_role', v_before.role,
      'new_role', COALESCE(p_role, v_before.role),
      'name_changed', p_full_name IS NOT NULL,
      'phone_changed', p_phone IS NOT NULL
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_store_followers_count(p_merchant_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT count(*)::bigint
  FROM public.store_follows sf
  WHERE sf.merchant_id = p_merchant_id;
$$;

-- -----------------------------------------------------------------------------
-- Participant-safe chat RPCs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_merchant_ref uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_merchant_profile uuid;
  v_merchant_user uuid;
  v_conversation uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  IF NOT public.is_current_user_operational('customer') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer account is not operational';
  END IF;

  SELECT mp.id, mp.user_id INTO v_merchant_profile, v_merchant_user
  FROM public.merchant_profiles mp
  JOIN public.users u ON u.id = mp.user_id
  WHERE (mp.id = p_merchant_ref OR mp.user_id = p_merchant_ref)
    AND u.role = 'merchant'
    AND mp.is_approved IS TRUE AND mp.is_active IS TRUE
    AND u.is_active IS TRUE AND NOT public.is_user_blocked(u.id)
  ORDER BY (mp.id = p_merchant_ref) DESC
  LIMIT 1;
  IF v_merchant_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant is not available';
  END IF;
  IF v_merchant_user = v_uid THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'cannot chat with yourself';
  END IF;
  IF p_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id AND o.customer_id = v_uid AND o.merchant_id = v_merchant_profile
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'order context is not owned';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'chat:' || v_uid::text || ':' || v_merchant_user::text || ':' || COALESCE(p_order_id::text, 'store'), 0
  ));
  SELECT c.id INTO v_conversation
  FROM public.chat_conversations c
  WHERE c.customer_id = v_uid AND c.merchant_id = v_merchant_user
    AND c.order_id IS NOT DISTINCT FROM p_order_id
  LIMIT 1;
  IF v_conversation IS NULL THEN
    INSERT INTO public.chat_conversations (customer_id, merchant_id, order_id, is_active)
    VALUES (v_uid, v_merchant_user, p_order_id, true)
    RETURNING id INTO v_conversation;
  END IF;
  RETURN v_conversation;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation_id uuid,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_message_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  IF length(btrim(COALESCE(p_message, ''))) = 0 OR length(p_message) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid message';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_conversations c
    JOIN public.users u ON u.id = v_uid
    WHERE c.id = p_conversation_id AND c.is_active IS TRUE
      AND v_uid IN (c.customer_id, c.merchant_id)
      AND u.is_active IS TRUE AND NOT public.is_user_blocked(u.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not a conversation participant';
  END IF;
  INSERT INTO public.chat_messages (conversation_id, sender_id, message, message_type)
  VALUES (p_conversation_id, v_uid, btrim(p_message), 'text')
  RETURNING id INTO v_message_id;
  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_customer uuid;
  v_merchant uuid;
BEGIN
  IF NOT public.is_current_user_operational() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;
  SELECT customer_id, merchant_id INTO v_customer, v_merchant
  FROM public.chat_conversations WHERE id = p_conversation_id;
  IF v_uid IS NULL OR v_uid NOT IN (v_customer, v_merchant) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not a conversation participant';
  END IF;
  UPDATE public.chat_messages SET is_read = true
  WHERE conversation_id = p_conversation_id AND sender_id <> v_uid AND is_read IS NOT TRUE;
  IF v_uid = v_customer THEN
    UPDATE public.chat_conversations SET customer_unread = 0 WHERE id = p_conversation_id;
  ELSE
    UPDATE public.chat_conversations SET merchant_unread = 0 WHERE id = p_conversation_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation public.chat_conversations%ROWTYPE;
  v_recipient uuid;
BEGIN
  SELECT * INTO v_conversation FROM public.chat_conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND OR NEW.sender_id NOT IN (v_conversation.customer_id, v_conversation.merchant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'invalid chat sender';
  END IF;
  IF NEW.sender_id = v_conversation.customer_id THEN
    v_recipient := v_conversation.merchant_id;
    UPDATE public.chat_conversations
    SET last_message = NEW.message, last_message_at = NEW.created_at,
        merchant_unread = COALESCE(merchant_unread, 0) + 1
    WHERE id = NEW.conversation_id;
  ELSE
    v_recipient := v_conversation.customer_id;
    UPDATE public.chat_conversations
    SET last_message = NEW.message, last_message_at = NEW.created_at,
        customer_unread = COALESCE(customer_unread, 0) + 1
    WHERE id = NEW.conversation_id;
  END IF;
  INSERT INTO public.notifications (user_id, title, body, type, channel, data)
  VALUES (
    v_recipient,
    'رسالة جديدة',
    left(COALESCE(NEW.message, 'لديك رسالة جديدة'), 180),
    'chat_message',
    'in_app',
    jsonb_build_object('conversation_id', NEW.conversation_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message ON public.chat_messages;
CREATE TRIGGER trg_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.on_chat_message();

-- -----------------------------------------------------------------------------
-- Device tokens are session-bound so logout cannot detach another device.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_device_token(p_token text, p_device_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  IF NOT public.is_current_user_operational() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;
  IF p_device_type NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid device type';
  END IF;
  IF length(COALESCE(p_token, '')) < 16 OR length(p_token) > 512 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid device token';
  END IF;
  BEGIN
    v_session_id := NULLIF((SELECT auth.jwt()) ->> 'session_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_session_id := NULL;
  END;
  INSERT INTO public.device_tokens (user_id, token, device_type, session_id, is_active, last_seen_at, updated_at)
  VALUES (v_uid, p_token, p_device_type, v_session_id, true, now(), now())
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    device_type = EXCLUDED.device_type,
    session_id = EXCLUDED.session_id,
    is_active = true,
    last_seen_at = now(),
    updated_at = now()
  WHERE public.device_tokens.user_id = EXCLUDED.user_id
     OR public.device_tokens.is_active IS NOT TRUE
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'device token belongs to another active session';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_device_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  UPDATE public.device_tokens
  SET is_active = false, updated_at = now()
  WHERE token = p_token AND user_id = (SELECT auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_current_session_device_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  BEGIN
    v_session_id := NULLIF((SELECT auth.jwt()) ->> 'session_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_session_id := NULL;
  END;
  IF v_session_id IS NULL THEN RETURN 0; END IF;
  UPDATE public.device_tokens SET is_active = false, updated_at = now()
  WHERE user_id = v_uid AND session_id = v_session_id AND is_active IS TRUE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- Referral code identity is never accepted from another user.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_referral(p_user uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_code text;
  v_attempt integer := 0;
BEGIN
  IF v_uid IS NULL OR p_user IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'cannot access another referral code';
  END IF;
  IF NOT public.is_current_user_operational('customer') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;
  SELECT r.code INTO v_code FROM public.referral_codes r WHERE r.user_id = v_uid;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'REF' || upper(substr(replace(v_uid::text, '-', ''), 1, 10));
    IF v_attempt > 1 THEN v_code := v_code || lpad(v_attempt::text, 2, '0'); END IF;
    BEGIN
      INSERT INTO public.referral_codes (user_id, code) VALUES (v_uid, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      SELECT r.code INTO v_code FROM public.referral_codes r WHERE r.user_id = v_uid;
      IF v_code IS NOT NULL THEN RETURN v_code; END IF;
      IF v_attempt >= 20 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

-- Keep public.users private by default while allowing the minimum contact data
-- needed by people who share an order, chat, support ticket, or complaint.
CREATE OR REPLACE FUNCTION public.can_view_user_contact(p_target_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    p_target_user = (SELECT auth.uid())
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      LEFT JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
      LEFT JOIN public.delivery_profiles dp ON dp.id = o.delivery_id
      WHERE (SELECT auth.uid()) IN (o.customer_id, mp.user_id, dp.user_id)
        AND p_target_user IN (o.customer_id, mp.user_id, dp.user_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      WHERE (SELECT auth.uid()) IN (c.customer_id, c.merchant_id)
        AND p_target_user IN (c.customer_id, c.merchant_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE (SELECT auth.uid()) IN (st.user_id, st.assigned_to)
        AND p_target_user IN (st.user_id, st.assigned_to)
    )
    OR EXISTS (
      SELECT 1
      FROM public.complaints c
      WHERE (SELECT auth.uid()) IN (c.complainant_id, c.against_id)
        AND p_target_user IN (c.complainant_id, c.against_id)
    )
$$;

-- -----------------------------------------------------------------------------
-- Storage ownership. Public buckets may serve known object URLs, but listing
-- and writes remain owner-scoped. Private proof objects are participant-only.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users update products" ON storage.objects;
DROP POLICY IF EXISTS "Auth users update stores" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload complaints" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload products" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload stores" ON storage.objects;
DROP POLICY IF EXISTS "Owner reads complaints files" ON storage.objects;
DROP POLICY IF EXISTS "Owner reads orders files" ON storage.objects;
DROP POLICY IF EXISTS "Owner reads avatar object" ON storage.objects;
DROP POLICY IF EXISTS "Merchant reads own store media" ON storage.objects;
DROP POLICY IF EXISTS "Merchant reads own product media" ON storage.objects;

CREATE POLICY "Owner uploads avatars" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND public.is_current_user_operational()
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE FALSE
  END
);
CREATE POLICY "Owner updates avatars" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_current_user_operational()
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND public.is_current_user_operational()
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE FALSE
  END
);
CREATE POLICY "Owner reads avatar object" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_current_user_operational()
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Merchant uploads store media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'stores'
  -- Onboarding uploads the logo/banner before creating the pending profile.
  AND public.is_current_user_operational('merchant')
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] IN ('logos','banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE FALSE
  END
);
CREATE POLICY "Merchant updates store media" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'stores'
  AND public.is_current_user_operational('merchant')
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] IN ('logos','banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'stores'
  AND public.is_current_user_operational('merchant')
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] IN ('logos','banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE FALSE
  END
);
-- Storage upsert needs SELECT visibility for the conflicting owned row. This
-- remains authenticated/owner scoped and does not restore public bucket listing.
CREATE POLICY "Merchant reads own store media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'stores'
  AND public.is_current_user_operational('merchant')
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] IN ('logos','banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
);

CREATE POLICY "Merchant uploads product media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'products'
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE FALSE
  END
);
CREATE POLICY "Merchant updates product media" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'products'
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
)
WITH CHECK (
  bucket_id = 'products'
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE FALSE
  END
);
CREATE POLICY "Merchant reads own product media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'products'
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
);

CREATE POLICY "Owner uploads complaint evidence" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'complaints'
  AND public.is_current_user_operational()
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png|pdf)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png','application/pdf')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE FALSE
  END
);
CREATE POLICY "Owner or admin reads complaint evidence" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'complaints'
  AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT public.is_admin()))
);

CREATE POLICY "Order participants read delivery proof" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'orders'
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[2] IN ('delivery-proofs','delivery-signatures')
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[3]
      AND (
        o.customer_id = (SELECT auth.uid())
        OR public.is_current_merchant_profile_owner(o.merchant_id)
        OR EXISTS (
          SELECT 1 FROM public.delivery_profiles dp
          WHERE dp.id = o.delivery_id AND dp.user_id = (SELECT auth.uid())
        )
        OR (SELECT public.is_admin())
      )
  )
);

-- -----------------------------------------------------------------------------
-- Replace permissive/duplicated policies on the security-owned tables.
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'users','customer_profiles','merchant_profiles','delivery_profiles','addresses',
        'products','product_variants','reviews','chat_conversations','chat_messages',
        'notifications','device_tokens','referral_codes','api_keys','system_settings','saved_payment_methods',
        'complaints','complaint_messages','coupons','coupon_usage',
        'categories','advertisements','product_images','wishlists','store_follows',
        'merchant_working_hours','merchant_daily_stats','loyalty_transactions','cancellation_reasons',
        'service_areas','app_banners','admin_permissions',
        'orders','order_items','order_tracking','order_groups','delivery_proofs',
        'delivery_earnings','delivery_location_history','order_settlements',
        'delivery_cod_collections','marketplace_ledger_entries','order_operation_audit',
        'inventory_logs'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END;
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_cod_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_operation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'users','customer_profiles','merchant_profiles','delivery_profiles','addresses',
    'products','product_variants','reviews','chat_conversations','chat_messages',
    'notifications','device_tokens','referral_codes','api_keys','system_settings','saved_payment_methods',
    'complaints','complaint_messages','coupons','coupon_usage',
    'categories','advertisements','product_images','wishlists','store_follows',
    'merchant_working_hours','merchant_daily_stats','loyalty_transactions','cancellation_reasons',
    'service_areas','app_banners','admin_permissions',
    'orders','order_items','order_tracking','order_groups','delivery_proofs',
    'delivery_earnings','delivery_location_history'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY admin_full_access ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()))',
      v_table
    );
  END LOOP;
END;
$$;

CREATE POLICY users_own_select ON public.users FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));
CREATE POLICY users_own_insert ON public.users FOR INSERT TO authenticated
WITH CHECK (
  id = (SELECT auth.uid())
  AND role IN ('customer','merchant','delivery')
  AND is_active IS TRUE
  AND COALESCE(is_blocked, false) IS FALSE
  AND blocked_until IS NULL
);
CREATE POLICY users_own_update ON public.users FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()) AND public.is_current_user_operational())
WITH CHECK (id = (SELECT auth.uid()) AND public.is_current_user_operational());
CREATE POLICY users_authorized_contact_select ON public.users FOR SELECT TO authenticated
USING (public.can_view_user_contact(id));

CREATE POLICY customer_profiles_own_select ON public.customer_profiles FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY merchant_profiles_public_select ON public.merchant_profiles FOR SELECT TO anon, authenticated
USING (
  is_approved IS TRUE AND is_active IS TRUE
  AND public.is_merchant_publicly_available(id)
);
CREATE POLICY merchant_profiles_own_select ON public.merchant_profiles FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY merchant_profiles_own_insert ON public.merchant_profiles FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.is_current_user_operational('merchant')
);
CREATE POLICY merchant_profiles_own_update ON public.merchant_profiles FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.is_current_user_operational('merchant')
) WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.is_current_user_operational('merchant')
);

CREATE POLICY delivery_profiles_own_select ON public.delivery_profiles FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY delivery_profiles_own_insert ON public.delivery_profiles FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.is_current_user_operational('delivery')
  AND (is_online IS NOT TRUE OR is_approved IS TRUE)
);
CREATE POLICY delivery_profiles_own_update ON public.delivery_profiles FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.is_current_user_operational('delivery')
) WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.is_current_user_operational('delivery')
  AND (is_online IS NOT TRUE OR is_approved IS TRUE)
);

CREATE POLICY addresses_own_select ON public.addresses FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY addresses_own_insert ON public.addresses FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));
CREATE POLICY addresses_own_update ON public.addresses FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'))
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));
CREATE POLICY addresses_own_delete ON public.addresses FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));
CREATE POLICY addresses_order_parties_select ON public.addresses FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o WHERE o.address_id = addresses.id AND (
    public.is_current_merchant_profile_owner(o.merchant_id)
    OR EXISTS (SELECT 1 FROM public.delivery_profiles dp WHERE dp.id = o.delivery_id AND dp.user_id = (SELECT auth.uid()))
  )
));

-- Orders are immutable from PostgREST. Customers, the owning merchant, the
-- assigned courier and admins may read them; all state changes go through the
-- transactional RPCs defined by the preceding migrations.
CREATE POLICY orders_participant_select ON public.orders FOR SELECT TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  OR public.is_current_merchant_profile_owner(orders.merchant_id)
  OR EXISTS (
    SELECT 1 FROM public.delivery_profiles dp
    WHERE dp.id = orders.delivery_id AND dp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY order_items_participant_select ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id));

CREATE POLICY order_tracking_participant_select ON public.order_tracking FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_tracking.order_id));

CREATE POLICY order_groups_customer_select ON public.order_groups FOR SELECT TO authenticated
USING (customer_id = (SELECT auth.uid()));

CREATE POLICY delivery_proofs_participant_select ON public.delivery_proofs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = delivery_proofs.order_id));

CREATE POLICY delivery_earnings_owner_select ON public.delivery_earnings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_profiles dp
  WHERE dp.id = delivery_earnings.delivery_id AND dp.user_id = (SELECT auth.uid())
));

CREATE POLICY delivery_location_participant_select ON public.delivery_location_history FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id = delivery_location_history.order_id
));

CREATE POLICY delivery_location_assigned_insert ON public.delivery_location_history FOR INSERT TO authenticated
WITH CHECK (
  public.is_current_user_operational('delivery')
  AND
  EXISTS (
    SELECT 1
    FROM public.delivery_profiles dp
    JOIN public.orders o ON o.id = delivery_location_history.order_id
    WHERE dp.id = delivery_location_history.delivery_id
      AND dp.user_id = (SELECT auth.uid())
      AND dp.is_approved IS TRUE
      AND dp.is_online IS TRUE
      AND o.delivery_id = dp.id
      AND o.status IN ('assigned','picked_up','on_the_way')
  )
);

CREATE POLICY coupons_public_active_select ON public.coupons FOR SELECT TO anon, authenticated
USING (
  is_active IS TRUE
  AND (start_date IS NULL OR start_date <= now())
  AND (end_date IS NULL OR end_date >= now())
  AND (merchant_id IS NULL OR public.is_merchant_publicly_available(merchant_id))
);
CREATE POLICY coupons_merchant_select ON public.coupons FOR SELECT TO authenticated
USING (public.is_current_merchant_profile_owner(coupons.merchant_id));
CREATE POLICY coupons_merchant_insert ON public.coupons FOR INSERT TO authenticated
WITH CHECK (
  coupons.merchant_id IS NOT NULL
  AND public.is_current_merchant_profile_operational(coupons.merchant_id)
);
CREATE POLICY coupons_merchant_update ON public.coupons FOR UPDATE TO authenticated
USING (
  coupons.merchant_id IS NOT NULL
  AND public.is_current_merchant_profile_operational(coupons.merchant_id)
)
WITH CHECK (
  coupons.merchant_id IS NOT NULL
  AND public.is_current_merchant_profile_operational(coupons.merchant_id)
);
CREATE POLICY coupons_merchant_delete ON public.coupons FOR DELETE TO authenticated
USING (
  coupons.merchant_id IS NOT NULL
  AND public.is_current_merchant_profile_operational(coupons.merchant_id)
);

CREATE POLICY categories_active_select ON public.categories FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

CREATE POLICY advertisements_active_select ON public.advertisements FOR SELECT TO anon, authenticated
USING (
  is_active IS TRUE
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now())
);

CREATE POLICY product_images_visible_select ON public.product_images FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND p.is_active IS TRUE
    AND p.is_approved IS TRUE
    AND public.is_merchant_publicly_available(p.merchant_id)
));
CREATE POLICY product_images_merchant_insert ON public.product_images FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
));
CREATE POLICY product_images_merchant_update ON public.product_images FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
));
CREATE POLICY product_images_merchant_delete ON public.product_images FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
));

CREATE POLICY wishlists_owner_select ON public.wishlists FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY wishlists_owner_insert ON public.wishlists FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));
CREATE POLICY wishlists_owner_delete ON public.wishlists FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));

CREATE POLICY store_follows_owner_select ON public.store_follows FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY store_follows_owner_insert ON public.store_follows FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));
CREATE POLICY store_follows_owner_delete ON public.store_follows FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));

CREATE POLICY working_hours_public_select ON public.merchant_working_hours FOR SELECT TO anon, authenticated
USING (public.is_merchant_publicly_available(merchant_id));
CREATE POLICY working_hours_merchant_update ON public.merchant_working_hours FOR UPDATE TO authenticated
USING (public.is_current_merchant_profile_operational(merchant_working_hours.merchant_id))
WITH CHECK (public.is_current_merchant_profile_operational(merchant_working_hours.merchant_id));

CREATE POLICY merchant_daily_stats_owner_select ON public.merchant_daily_stats FOR SELECT TO authenticated
USING (public.is_current_merchant_profile_owner(merchant_daily_stats.merchant_id));

CREATE POLICY loyalty_transactions_owner_select ON public.loyalty_transactions FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY cancellation_reasons_active_select ON public.cancellation_reasons FOR SELECT TO authenticated
USING (is_active IS TRUE);

CREATE POLICY service_areas_active_select ON public.service_areas FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

CREATE POLICY app_banners_active_select ON public.app_banners FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

CREATE POLICY admin_permissions_own_select ON public.admin_permissions FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND (SELECT public.is_admin()));

CREATE POLICY products_public_select ON public.products FOR SELECT TO anon, authenticated
USING (
  is_active IS TRUE
  AND is_approved IS TRUE
  AND public.is_merchant_publicly_available(merchant_id)
);
CREATE POLICY products_merchant_select ON public.products FOR SELECT TO authenticated
USING (public.is_current_merchant_profile_owner(products.merchant_id));
CREATE POLICY products_merchant_insert ON public.products FOR INSERT TO authenticated
WITH CHECK (public.is_current_merchant_profile_operational(products.merchant_id));
CREATE POLICY products_merchant_update ON public.products FOR UPDATE TO authenticated
USING (public.is_current_merchant_profile_operational(products.merchant_id))
WITH CHECK (public.is_current_merchant_profile_operational(products.merchant_id));
CREATE POLICY products_merchant_delete ON public.products FOR DELETE TO authenticated
USING (public.is_current_merchant_profile_operational(products.merchant_id));

CREATE POLICY variants_public_select ON public.product_variants FOR SELECT TO anon, authenticated
USING (is_active IS TRUE AND EXISTS (
  SELECT 1 FROM public.products p JOIN public.merchant_profiles mp ON mp.id = p.merchant_id
  WHERE p.id = product_variants.product_id AND p.is_active IS TRUE AND p.is_approved IS TRUE
    AND mp.is_approved IS TRUE AND mp.is_active IS TRUE
    AND public.is_merchant_publicly_available(mp.id)
));
CREATE POLICY variants_merchant_select ON public.product_variants FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND public.is_current_merchant_profile_owner(p.merchant_id)
));
CREATE POLICY variants_merchant_insert ON public.product_variants FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
));
CREATE POLICY variants_merchant_update ON public.product_variants FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
));
CREATE POLICY variants_merchant_delete ON public.product_variants FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id
    AND public.is_current_merchant_profile_operational(p.merchant_id)
));

CREATE POLICY reviews_public_select ON public.reviews FOR SELECT TO anon, authenticated
USING (is_verified IS TRUE);
CREATE POLICY reviews_owner_select ON public.reviews FOR SELECT TO authenticated
USING (reviewer_id = (SELECT auth.uid()));

CREATE POLICY chat_conversations_participant_select ON public.chat_conversations FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (customer_id, merchant_id));
CREATE POLICY chat_messages_participant_select ON public.chat_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.chat_conversations c
  WHERE c.id = chat_messages.conversation_id AND (SELECT auth.uid()) IN (c.customer_id, c.merchant_id)
));

CREATE POLICY notifications_own_select ON public.notifications FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_own_read_update ON public.notifications FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational())
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_current_user_operational());

CREATE POLICY referral_codes_own_select ON public.referral_codes FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY api_keys_own_select ON public.api_keys FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY api_keys_own_update ON public.api_keys FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational())
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_current_user_operational());
CREATE POLICY api_keys_own_delete ON public.api_keys FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational());

CREATE POLICY system_settings_public_select ON public.system_settings FOR SELECT TO anon, authenticated
USING (setting_key IN ('app_commission_percent','delivery_fee','min_order_amount','tax_percent'));

CREATE POLICY saved_payment_methods_own_select ON public.saved_payment_methods FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY saved_payment_methods_own_insert ON public.saved_payment_methods FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));
CREATE POLICY saved_payment_methods_own_delete ON public.saved_payment_methods FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.is_current_user_operational('customer'));

CREATE POLICY complaints_participant_select ON public.complaints FOR SELECT TO authenticated
USING (complainant_id = (SELECT auth.uid()) OR against_id = (SELECT auth.uid()));
CREATE POLICY complaint_messages_participant_select ON public.complaint_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.complaints c
  WHERE c.id = complaint_messages.complaint_id
    AND ((SELECT auth.uid()) IN (c.complainant_id, c.against_id))
));

-- -----------------------------------------------------------------------------
-- Table grants are a separate boundary from RLS. Start every current public
-- table from zero and expose only the commands used by the application. This
-- also closes legacy tables that were not part of the original focused audit.
-- -----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'users','customer_profiles','merchant_profiles','delivery_profiles','addresses',
    'products','product_variants','reviews','chat_conversations','chat_messages',
    'notifications','device_tokens','referral_codes','api_keys','system_settings','saved_payment_methods',
    'complaints','complaint_messages'
  ]
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END;
$$;

-- Core order, handoff and settlement grants. Authenticated clients receive
-- read-only access to participant data; creation and mutations remain RPC-only.
REVOKE ALL PRIVILEGES ON TABLE
  public.orders,
  public.order_items,
  public.order_tracking,
  public.order_groups,
  public.delivery_proofs,
  public.delivery_earnings,
  public.delivery_location_history,
  public.order_settlements,
  public.delivery_cod_collections,
  public.marketplace_ledger_entries,
  public.order_operation_audit,
  public.inventory_logs,
  public.merchant_daily_stats
FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.orders,
  public.order_items,
  public.order_tracking,
  public.order_groups,
  public.delivery_proofs,
  public.delivery_earnings,
  public.delivery_location_history,
  public.order_settlements,
  public.delivery_cod_collections,
  public.marketplace_ledger_entries,
  public.order_operation_audit,
  public.inventory_logs,
  public.merchant_daily_stats
TO service_role;
GRANT SELECT ON TABLE
  public.orders,
  public.order_items,
  public.order_tracking,
  public.order_groups,
  public.delivery_proofs,
  public.delivery_earnings,
  public.delivery_location_history,
  public.merchant_daily_stats
TO authenticated;
GRANT INSERT (delivery_id, order_id, latitude, longitude, speed)
  ON public.delivery_location_history TO authenticated;

GRANT SELECT ON TABLE
  public.categories,
  public.advertisements,
  public.product_images,
  public.merchant_working_hours,
  public.service_areas,
  public.app_banners
TO anon, authenticated;
GRANT SELECT ON TABLE
  public.wishlists,
  public.store_follows,
  public.loyalty_transactions,
  public.cancellation_reasons,
  public.admin_permissions
TO authenticated;
GRANT INSERT (product_id, image_url, is_primary, sort_order)
  ON public.product_images TO authenticated;
GRANT UPDATE (image_url, is_primary, sort_order)
  ON public.product_images TO authenticated;
GRANT DELETE ON public.product_images TO authenticated;
GRANT INSERT (user_id, product_id) ON public.wishlists TO authenticated;
GRANT DELETE ON public.wishlists TO authenticated;
GRANT INSERT (user_id, merchant_id) ON public.store_follows TO authenticated;
GRANT DELETE ON public.store_follows TO authenticated;
GRANT UPDATE (open_time, close_time, is_closed)
  ON public.merchant_working_hours TO authenticated;
GRANT INSERT (city, is_active, delivery_available)
  ON public.service_areas TO authenticated;
GRANT UPDATE (city, is_active, delivery_available)
  ON public.service_areas TO authenticated;
GRANT INSERT (id, title, image_url, target_url, is_active, sort_order)
  ON public.app_banners TO authenticated;
GRANT UPDATE (title, image_url, target_url, is_active, sort_order)
  ON public.app_banners TO authenticated;
GRANT DELETE ON public.app_banners TO authenticated;

-- Coupon counters are settlement data. Merchants/admins may define campaigns,
-- but only order RPCs may mutate usage ledgers and counters.
REVOKE ALL PRIVILEGES ON TABLE public.coupons, public.coupon_usage FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.coupons, public.coupon_usage TO service_role;
GRANT SELECT (
  id, merchant_id, code, type, value, min_order_amount,
  max_discount_amount, start_date, end_date
) ON public.coupons TO anon, authenticated;
GRANT INSERT (
  merchant_id, code, type, value, min_order_amount, max_discount_amount,
  usage_limit, per_user_limit, start_date, end_date, is_active, max_uses
) ON public.coupons TO authenticated;
GRANT UPDATE (
  code, type, value, min_order_amount, max_discount_amount,
  usage_limit, per_user_limit, start_date, end_date, is_active, max_uses
) ON public.coupons TO authenticated;
GRANT DELETE ON public.coupons TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.platform_settings TO service_role;

REVOKE ALL PRIVILEGES ON TABLE
  public.refund_requests,
  public.withdrawal_requests,
  public.wallet_transactions,
  public.support_tickets,
  public.support_messages,
  public.broadcast_notifications,
  public.admin_activity_logs
FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.refund_requests,
  public.withdrawal_requests,
  public.wallet_transactions,
  public.support_tickets,
  public.support_messages,
  public.broadcast_notifications,
  public.admin_activity_logs
TO service_role;
GRANT SELECT ON TABLE
  public.support_tickets,
  public.support_messages,
  public.broadcast_notifications,
  public.admin_activity_logs
TO authenticated;
GRANT SELECT (
  id, order_id, customer_id, reason, description, evidence_images,
  refund_amount, refund_method, status, merchant_response, decision_reason,
  merchant_responded_at, processed_at, created_at, updated_at
) ON public.refund_requests TO authenticated;
GRANT SELECT (
  id, user_id, amount, status, notes, requester_notes, admin_notes,
  payout_destination, external_reference, reserved_at, released_at,
  processed_at, paid_at, created_at, updated_at
) ON public.withdrawal_requests TO authenticated;
GRANT SELECT (
  id, user_id, type, amount, source, reference_id, balance_after, notes, created_at
) ON public.wallet_transactions TO authenticated;

GRANT SELECT (id, phone, full_name, avatar_url, role, is_active, is_verified, created_at, updated_at)
  ON public.users TO authenticated;
GRANT INSERT (id, email, phone, full_name, avatar_url, role)
  ON public.users TO authenticated;
GRANT UPDATE (email, full_name, avatar_url, updated_at)
  ON public.users TO authenticated;

GRANT SELECT ON public.customer_profiles TO authenticated;

GRANT SELECT (
  id, store_name, store_slug, store_logo_url, store_banner_url,
  store_description, store_category, address, city, latitude, longitude,
  rating, total_reviews, is_approved, store_phone, whatsapp, is_active,
  is_open, pause_reason, created_at
) ON public.merchant_profiles TO anon, authenticated;

GRANT SELECT (
  id, user_id, vehicle_type, vehicle_plate, current_latitude, current_longitude,
  is_online, is_approved, rating, total_deliveries, created_at
) ON public.delivery_profiles TO authenticated;
-- Vehicle identity/settings are RPC-only. These three columns remain writable
-- because the courier runtime continuously publishes presence and coordinates.
GRANT UPDATE (current_latitude, current_longitude, is_online)
  ON public.delivery_profiles TO authenticated;

GRANT SELECT, DELETE ON public.addresses TO authenticated;

GRANT SELECT (
  id, merchant_id, category_id, name, name_ar, description, description_ar,
  base_price, sale_price, sku, is_active, is_approved, is_featured, weight,
  total_sold, rating, tags, share_url, og_image_url, stock_quantity,
  created_at, updated_at
) ON public.products TO anon, authenticated;
GRANT INSERT (
  merchant_id, category_id, name, name_ar, description, description_ar,
  base_price, sale_price, sku, is_active, weight, meta_title, meta_description,
  tags, share_url, og_image_url, stock_quantity
) ON public.products TO authenticated;
GRANT UPDATE (
  category_id, name, name_ar, description, description_ar, base_price,
  sale_price, sku, is_active, weight, meta_title, meta_description, tags,
  share_url, og_image_url, stock_quantity
) ON public.products TO authenticated;
GRANT DELETE ON public.products TO authenticated;

GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT (product_id, size, color, color_hex, additional_price, stock_qty, sku, is_active, name_ar, price_modifier)
  ON public.product_variants TO authenticated;
GRANT UPDATE (size, color, color_hex, additional_price, stock_qty, sku, is_active, name_ar, price_modifier)
  ON public.product_variants TO authenticated;
GRANT DELETE ON public.product_variants TO authenticated;

GRANT SELECT (
  id, target_type, target_id, rating, comment, images,
  is_verified, from_merchant, created_at
) ON public.reviews TO anon;
GRANT SELECT (
  id, reviewer_id, target_type, target_id, rating, comment, images,
  is_verified, from_merchant, created_at
) ON public.reviews TO authenticated;

GRANT SELECT ON public.chat_conversations, public.chat_messages TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT SELECT, DELETE ON public.api_keys TO authenticated;
GRANT UPDATE (is_active) ON public.api_keys TO authenticated;
GRANT SELECT (setting_key, setting_value) ON public.system_settings TO anon, authenticated;
GRANT INSERT (setting_key, setting_value) ON public.system_settings TO authenticated;
GRANT UPDATE (setting_value, updated_at) ON public.system_settings TO authenticated;
GRANT SELECT (id, user_id, type, card_last4, card_brand, card_expiry, is_default, created_at)
  ON public.saved_payment_methods TO authenticated;
GRANT INSERT (user_id, type, card_last4, card_brand, card_expiry, is_default)
  ON public.saved_payment_methods TO authenticated;
GRANT DELETE ON public.saved_payment_methods TO authenticated;
GRANT SELECT ON public.complaints, public.complaint_messages TO authenticated;

-- -----------------------------------------------------------------------------
-- Functions default to PUBLIC EXECUTE in Postgres. Remove that inherited API and
-- explicitly restore only the RPC surface used by the app. Internal settlement,
-- trigger, stock, pricing, and legacy status functions remain uncallable.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'is_admin','is_current_user_blocked','is_current_user_operational','is_merchant_publicly_available',
      'is_current_merchant_profile_owner','is_current_merchant_profile_operational','get_current_merchant_profile_id',
      'set_default_address','create_address','create_my_merchant_profile','update_my_merchant_profile',
      'create_my_delivery_profile','update_my_delivery_profile',
      'place_order','place_order_group',
      'preview_coupon','cancel_order','transition_order_status','claim_delivery_order',
      'create_order_review','has_reviewed_order',
      'list_available_delivery_orders','complete_delivery_with_proof',
      'create_refund_request','respond_refund_request','process_refund_request',
      'request_withdrawal','process_withdrawal_request','create_support_ticket',
      'reply_support_ticket','update_support_ticket_status','review_merchant_application',
      'set_merchant_operational_status','review_delivery_application',
      'admin_set_delivery_online','create_broadcast_campaign','get_or_create_conversation',
      'send_chat_message','mark_conversation_read','register_device_token',
      'deactivate_device_token','deactivate_current_session_device_tokens',
      'get_or_create_referral','get_store_followers_count','can_view_user_contact','create_api_key','delete_my_account','admin_get_user_details',
      'admin_dashboard_stats','get_my_user_profile','get_my_merchant_profile','get_my_delivery_profile',
      'get_my_merchant_coupons','admin_list_coupons',
      'admin_list_merchants','admin_list_drivers','admin_list_users',
      'admin_set_user_block','admin_set_user_active','admin_update_user_profile',
      'admin_list_refund_requests'
    ])
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.signature || ' TO authenticated';
  END LOOP;
END;
$$;

-- Public storefront policies need only the merchant-scoped availability bit;
-- they never expose arbitrary user role/block state.
GRANT EXECUTE ON FUNCTION public.is_merchant_publicly_available(uuid) TO anon;

-- Realtime is a delivery mechanism, never an authorization mechanism. Every
-- published table above has RLS and participant/owner policies.
DO $$
DECLARE v_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'orders','order_tracking','notifications','chat_conversations','chat_messages',
    'support_tickets','support_messages','refund_requests','withdrawal_requests',
    'complaints','complaint_messages','delivery_profiles','delivery_location_history',
    'delivery_earnings'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$$;
