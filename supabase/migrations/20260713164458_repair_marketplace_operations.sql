-- Core marketplace repair: authoritative order placement, handoff, proof and settlement.
-- This migration intentionally does not backfill settlements for already-delivered orders:
-- historical proof and cash custody cannot be reconstructed safely.

-- -----------------------------------------------------------------------------
-- Normalize the columns used by the live application and by the transactional
-- RPCs. Every ADD is replay-safe; semantic backfills copy only equivalent legacy
-- columns and never invent financial history.
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

-- A temporary suspension is a real block even when the permanent flag is
-- false. Keep one canonical predicate so every order, courier and settlement
-- path applies the same rule.
CREATE OR REPLACE FUNCTION public.is_user_blocked(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.id = p_user_id
      AND (
        COALESCE(u.is_blocked, false)
        OR (u.blocked_until IS NOT NULL AND u.blocked_until > now())
      )
  )
$function$;

-- API/RLS-safe wrapper: authenticated users may ask only about their own
-- current block state. The UUID-accepting predicate remains internal.
CREATE OR REPLACE FUNCTION public.is_current_user_blocked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NULL
    OR public.is_user_blocked((SELECT auth.uid()))
$function$;

ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pause_reason text;

ALTER TABLE public.delivery_profiles
  ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deliveries integer NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sold integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_approved boolean,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

-- Production historically exposed active products without a separate approval
-- column. Preserve those legacy decisions once, while every newly inserted
-- product starts unapproved until the admin workflow accepts it.
UPDATE public.products
SET is_approved = COALESCE(is_active, false)
WHERE is_approved IS NULL;
ALTER TABLE public.products
  ALTER COLUMN is_approved SET DEFAULT false,
  ALTER COLUMN is_approved SET NOT NULL;

DO $product_approval_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_approved_by_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END;
$product_approval_fk$;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS stock_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_modifier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.inventory_logs
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS change_amount integer,
  ADD COLUMN IF NOT EXISTS change_type text,
  ADD COLUMN IF NOT EXISTS quantity_before integer,
  ADD COLUMN IF NOT EXISTS quantity_after integer;

DO $inventory_order_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.inventory_logs'::regclass
      AND conname = 'inventory_logs_order_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_logs
      ADD CONSTRAINT inventory_logs_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END;
$inventory_order_fk$;

DO $normalize_variant_stock$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'stock_quantity'
  ) THEN
    EXECUTE $sql$
      UPDATE public.product_variants
      SET stock_qty = stock_quantity
      WHERE stock_quantity IS NOT NULL AND stock_qty = 0
    $sql$;
  END IF;
END;
$normalize_variant_stock$;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS variant_details jsonb;

ALTER TABLE public.order_tracking
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

DO $normalize_tracking_notes$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_tracking' AND column_name = 'note'
  ) THEN
    EXECUTE $sql$
      UPDATE public.order_tracking SET notes = note WHERE notes IS NULL AND note IS NOT NULL
    $sql$;
  END IF;
END;
$normalize_tracking_notes$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS inventory_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_actor_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_actor_role text,
  ADD COLUMN IF NOT EXISTS stats_counted boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_groups
  ADD COLUMN IF NOT EXISTS group_number text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_hash text;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS max_uses integer,
  ADD COLUMN IF NOT EXISTS used_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_limit integer,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_user_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS max_discount_amount numeric;

DO $normalize_coupon_columns$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'discount_type'
  ) THEN
    EXECUTE 'UPDATE public.coupons SET type = discount_type WHERE type IS NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'discount_value'
  ) THEN
    EXECUTE 'UPDATE public.coupons SET value = discount_value WHERE value IS NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'max_uses'
  ) THEN
    EXECUTE 'UPDATE public.coupons SET usage_limit = max_uses WHERE usage_limit IS NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'used_count'
  ) THEN
    EXECUTE 'UPDATE public.coupons SET usage_count = GREATEST(usage_count, COALESCE(used_count, 0))';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'expires_at'
  ) THEN
    EXECUTE 'UPDATE public.coupons SET end_date = expires_at WHERE end_date IS NULL';
  END IF;
  UPDATE public.coupons SET type = 'percentage' WHERE type IS NULL;
  UPDATE public.coupons SET value = 0 WHERE value IS NULL;
  UPDATE public.coupons SET max_uses = usage_limit
  WHERE max_uses IS NULL AND usage_limit IS NOT NULL;
  UPDATE public.coupons SET used_count = usage_count
  WHERE used_count IS DISTINCT FROM usage_count;
END;
$normalize_coupon_columns$;

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS notes text;

DO $normalize_wallet_notes$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'description'
  ) THEN
    EXECUTE $sql$
      UPDATE public.wallet_transactions SET notes = description WHERE notes IS NULL AND description IS NOT NULL
    $sql$;
  END IF;
END;
$normalize_wallet_notes$;

ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS merchant_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric,
  ADD COLUMN IF NOT EXISTS min_order_amount numeric,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_available boolean NOT NULL DEFAULT true;

DO $normalize_zone_fee$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'delivery_zones' AND column_name = 'base_fee'
  ) THEN
    EXECUTE 'UPDATE public.delivery_zones SET delivery_fee = base_fee WHERE delivery_fee IS NULL';
  END IF;
END;
$normalize_zone_fee$;

ALTER TABLE public.delivery_proofs
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS proof_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key text;

-- The local history uses enums for order status/payment while production uses
-- text. RPCs below use typed literals (and a dynamic literal for the one
-- variable transition) so both layouts work without altering columns that are
-- already referenced by policies and views.

-- -----------------------------------------------------------------------------
-- Immutable settlement, COD custody, double-entry references and audit trail.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  merchant_id uuid NOT NULL REFERENCES public.merchant_profiles(id),
  delivery_id uuid REFERENCES public.delivery_profiles(id),
  payment_method text NOT NULL,
  gross_amount numeric NOT NULL CHECK (gross_amount >= 0),
  merchant_proceeds numeric NOT NULL CHECK (merchant_proceeds >= 0),
  delivery_earning numeric NOT NULL CHECK (delivery_earning >= 0),
  platform_commission numeric NOT NULL CHECK (platform_commission >= 0),
  tax_amount numeric NOT NULL CHECK (tax_amount >= 0),
  platform_amount numeric NOT NULL CHECK (platform_amount >= 0),
  settlement_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'settled' CHECK (status IN ('settled','partially_reversed','reversed')),
  reversed_amount numeric NOT NULL DEFAULT 0 CHECK (reversed_amount >= 0),
  settled_by uuid REFERENCES public.users(id),
  settled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_settlements_reversal_bound CHECK (reversed_amount <= gross_amount),
  CONSTRAINT order_settlements_balanced CHECK (
    abs(gross_amount - merchant_proceeds - delivery_earning - platform_amount) <= 0.01
  ),
  CONSTRAINT order_settlements_platform_components CHECK (
    abs(platform_amount - platform_commission - tax_amount) <= 0.01
  )
);

CREATE TABLE IF NOT EXISTS public.delivery_cod_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  delivery_id uuid REFERENCES public.delivery_profiles(id),
  collected_by uuid NOT NULL REFERENCES public.users(id),
  amount_collected numeric NOT NULL CHECK (amount_collected >= 0),
  amount_remitted numeric NOT NULL DEFAULT 0 CHECK (amount_remitted >= 0),
  status text NOT NULL DEFAULT 'collected' CHECK (status IN ('collected','remitted','disputed')),
  collected_at timestamptz NOT NULL DEFAULT now(),
  remitted_at timestamptz,
  CONSTRAINT delivery_cod_remittance_bound CHECK (amount_remitted <= amount_collected)
);

CREATE TABLE IF NOT EXISTS public.marketplace_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  entry_type text NOT NULL,
  debit_account text NOT NULL,
  debit_owner_id uuid,
  credit_account text NOT NULL,
  credit_owner_id uuid,
  amount numeric NOT NULL CHECK (amount >= 0),
  reversal_of uuid REFERENCES public.marketplace_ledger_entries(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_operation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  event_key text NOT NULL,
  operation text NOT NULL,
  actor_id uuid REFERENCES public.users(id),
  actor_role text,
  old_status text,
  new_status text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_cod_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_operation_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_settlements FROM anon, authenticated;
REVOKE ALL ON TABLE public.delivery_cod_collections FROM anon, authenticated;
REVOKE ALL ON TABLE public.marketplace_ledger_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.order_operation_audit FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_idempotency_uq
  ON public.orders(customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_groups_customer_idempotency_uq
  ON public.order_groups(customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_groups_group_number_uq
  ON public.order_groups(group_number) WHERE group_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_tracking_event_uq
  ON public.order_tracking(order_id, event_key) WHERE event_key IS NOT NULL;

-- Some live legacy orders have no tracking row at all. Preserve only the
-- current state as an explicitly labelled snapshot; do not infer or fabricate
-- the transitions that may have happened before this migration. The dynamic
-- untyped status literal supports both the clean enum schema and live text
-- schema without altering either column type.
DO $backfill_legacy_tracking_snapshots$
DECLARE
  v_order record;
BEGIN
  FOR v_order IN
    SELECT o.id, o.status::text AS status, COALESCE(o.created_at, now()) AS created_at
    FROM public.orders AS o
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.order_tracking AS existing
      WHERE existing.order_id = o.id
    )
  LOOP
    EXECUTE format($sql$
      INSERT INTO public.order_tracking(
        order_id, status, notes, created_by, actor_role,
        event_key, metadata, created_at
      )
      VALUES (
        $1,
        %L,
        'Legacy current-state snapshot only; no historical transitions were reconstructed.',
        NULL,
        'system',
        'legacy-snapshot:' || $1::text,
        jsonb_build_object(
          'snapshot_only', true,
          'history_reconstructed', false,
          'captured_status', $2,
          'source', 'legacy_order_without_tracking'
        ),
        $3
      )
      ON CONFLICT (order_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
    $sql$, v_order.status)
    USING v_order.id, v_order.status, v_order.created_at;
  END LOOP;
END;
$backfill_legacy_tracking_snapshots$;

CREATE UNIQUE INDEX IF NOT EXISTS order_operation_audit_event_uq
  ON public.order_operation_audit(order_id, event_key);
CREATE UNIQUE INDEX IF NOT EXISTS order_settlements_order_uq ON public.order_settlements(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS order_settlements_key_uq ON public.order_settlements(settlement_key);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_cod_collections_order_uq ON public.delivery_cod_collections(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_ledger_operation_uq ON public.marketplace_ledger_entries(operation_key);
CREATE INDEX IF NOT EXISTS marketplace_ledger_order_idx ON public.marketplace_ledger_entries(order_id, created_at);
CREATE INDEX IF NOT EXISTS marketplace_ledger_reversal_idx ON public.marketplace_ledger_entries(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_earnings_order_uq
  ON public.delivery_earnings(order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_business_reference_uq
  ON public.wallet_transactions(user_id, source, reference_id, type)
  WHERE source IS NOT NULL AND reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_proofs_order_uq
  ON public.delivery_proofs(order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_proofs_idempotency_uq
  ON public.delivery_proofs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coupon_usage_order_uq
  ON public.coupon_usage(coupon_id, user_id, order_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_profiles_user_id_uq
  ON public.customer_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS merchant_profiles_user_id_uq
  ON public.merchant_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_profiles_user_id_uq
  ON public.delivery_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_logs_order_idx
  ON public.inventory_logs(order_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_event_uq
  ON public.notifications(user_id, event_key) WHERE event_key IS NOT NULL;

-- Keep existing user intent while repairing the only safe invariant: one
-- default address per user. A later unique index can then serialize all paths.
WITH ranked_defaults AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) AS position
  FROM public.addresses
  WHERE is_default IS TRUE AND user_id IS NOT NULL
)
UPDATE public.addresses AS a
SET is_default = false
FROM ranked_defaults AS r
WHERE a.id = r.id AND r.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_per_user_uq
  ON public.addresses(user_id) WHERE is_default IS TRUE AND user_id IS NOT NULL;

-- The legacy delivered trigger writes unbalanced commission transactions and
-- recursively updates orders. Settlement below replaces it atomically.
DROP TRIGGER IF EXISTS trigger_commission ON public.orders;
-- Production also had a live-only daily-stat trigger. Move that aggregation
-- into the once-only settlement transaction so clean/local and live behavior
-- are identical and retries cannot double count.
DROP TRIGGER IF EXISTS trg_bump_mds ON public.orders;
DROP TRIGGER IF EXISTS trg_order_insert_notify ON public.orders;
DROP TRIGGER IF EXISTS trg_order_update_notify ON public.orders;
DROP TRIGGER IF EXISTS trg_notify_couriers_ready ON public.orders;

-- -----------------------------------------------------------------------------
-- Shared internal helpers. All are schema-qualified, run with an empty search
-- path, and are revoked from API roles below.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marketplace_setting_numeric(
  p_key text,
  p_default numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_value text;
  v_number numeric;
BEGIN
  SELECT to_jsonb(s.setting_value) #>> '{}' INTO v_value
  FROM public.system_settings AS s
  WHERE s.setting_key = p_key
  LIMIT 1;

  IF v_value IS NULL THEN
    SELECT to_jsonb(s.value) #>> '{}' INTO v_value
    FROM public.platform_settings AS s
    WHERE s.key = p_key
    LIMIT 1;
  END IF;

  BEGIN
    v_number := v_value::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_number := NULL;
  END;

  RETURN COALESCE(v_number, p_default);
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_uuid_from_text(p_value text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT (
    substr(md5(p_value), 1, 8) || '-' ||
    substr(md5(p_value), 9, 4) || '-' ||
    substr(md5(p_value), 13, 4) || '-' ||
    substr(md5(p_value), 17, 4) || '-' ||
    substr(md5(p_value), 21, 12)
  )::uuid
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_actor_role(p_actor_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT u.role::text INTO v_role
  FROM public.users AS u
  WHERE u.id = p_actor_id
    AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id);

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ACTOR_NOT_ACTIVE';
  END IF;
  RETURN v_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_record_order_event(
  p_order_id uuid,
  p_event_key text,
  p_operation text,
  p_actor_id uuid,
  p_actor_role text,
  p_old_status text,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- %L is an untyped SQL literal and is therefore coerced by PostgreSQL to
  -- either the local enum column or the live text column.
  EXECUTE format($sql$
    INSERT INTO public.order_tracking(
      order_id, status, notes, created_by, actor_role, event_key, metadata
    )
    VALUES ($1, %L, $2, $3, $4, $5, $6)
    ON CONFLICT (order_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
  $sql$, p_new_status)
  USING
    p_order_id,
    NULLIF(trim(COALESCE(p_reason, '')), ''),
    p_actor_id,
    p_actor_role,
    p_event_key,
    COALESCE(p_metadata, '{}'::jsonb);

  INSERT INTO public.order_operation_audit(
    order_id, event_key, operation, actor_id, actor_role,
    old_status, new_status, reason, metadata
  )
  VALUES (
    p_order_id, p_event_key, p_operation, p_actor_id, p_actor_role,
    p_old_status, p_new_status, NULLIF(trim(COALESCE(p_reason, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (order_id, event_key) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_notify_order_event(
  p_order_id uuid,
  p_event_key text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NULLIF(trim(COALESCE(p_event_key, '')), '') IS NULL THEN RETURN; END IF;
  BEGIN
    WITH order_context AS (
      SELECT o.*, mp.user_id AS merchant_user_id, dp.user_id AS delivery_user_id
      FROM public.orders AS o
      LEFT JOIN public.merchant_profiles AS mp ON mp.id = o.merchant_id
      LEFT JOIN public.delivery_profiles AS dp ON dp.id = o.delivery_id
      WHERE o.id = p_order_id
    ), recipients AS (
      SELECT oc.customer_id AS user_id, 'customer'::text AS recipient_role
      FROM order_context AS oc
      UNION
      SELECT oc.merchant_user_id, 'merchant'
      FROM order_context AS oc
      WHERE oc.merchant_user_id IS NOT NULL
        AND p_status IN ('pending', 'assigned', 'delivered', 'cancelled', 'failed_delivery', 'disputed')
      UNION
      SELECT oc.delivery_user_id, 'delivery'
      FROM order_context AS oc
      WHERE oc.delivery_user_id IS NOT NULL
        AND p_status IN ('assigned', 'cancelled', 'failed_delivery', 'rescheduled', 'delivered')
      UNION
      SELECT dp.user_id, 'delivery_offer'
      FROM public.delivery_profiles AS dp
      JOIN public.users AS u ON u.id = dp.user_id
      WHERE p_status = 'ready'
        AND COALESCE(dp.is_approved, false)
        AND COALESCE(dp.is_online, false)
        AND COALESCE(u.is_active, true)
        AND NOT public.is_user_blocked(u.id)
    )
    INSERT INTO public.notifications(user_id, title, body, type, data, event_key, channel)
    SELECT
      r.user_id,
      CASE
        WHEN r.recipient_role = 'merchant' AND p_status = 'pending' THEN 'طلب جديد'
        WHEN r.recipient_role = 'delivery_offer' THEN 'طلب جاهز للتوصيل'
        WHEN p_status = 'preparing' THEN 'جاري تجهيز طلبك'
        WHEN p_status = 'ready' THEN 'طلبك جاهز'
        WHEN p_status = 'assigned' THEN 'تم إسناد مندوب'
        WHEN p_status = 'picked_up' THEN 'استلم المندوب الطلب'
        WHEN p_status = 'on_the_way' THEN 'طلبك في الطريق'
        WHEN p_status = 'delivered' THEN 'تم تسليم الطلب'
        WHEN p_status = 'cancelled' THEN 'تم إلغاء الطلب'
        WHEN p_status = 'failed_delivery' THEN 'تعذر التسليم'
        ELSE 'تحديث على الطلب'
      END,
      CASE
        WHEN r.recipient_role = 'delivery_offer'
          THEN 'يوجد طلب جاهز ومتاح للقبول الآن'
        ELSE 'الطلب رقم ' || oc.order_number || ' حالته الآن: ' || p_status
      END,
      CASE WHEN r.recipient_role = 'delivery_offer' THEN 'delivery_offer' ELSE 'order' END,
      jsonb_build_object('order_id', p_order_id, 'status', p_status),
      p_event_key,
      'push'
    FROM recipients AS r
    CROSS JOIN order_context AS oc
    WHERE r.user_id IS NOT NULL
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Notification transport/data must never turn a committed business
    -- operation into a partially retried order operation.
    RETURN;
  END;
END;
$function$;

-- Server-owned price snapshots. This is defense in depth for every insertion
-- path, including service code: product/variant relationships and prices are
-- never accepted from a client payload.
CREATE OR REPLACE FUNCTION public.enforce_order_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order_merchant uuid;
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_variant_add numeric := 0;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity < 1 OR NEW.quantity > 1000 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  SELECT o.merchant_id INTO v_order_merchant
  FROM public.orders AS o
  WHERE o.id = NEW.order_id;
  IF v_order_merchant IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  SELECT p.* INTO v_product
  FROM public.products AS p
  WHERE p.id = NEW.product_id
    AND p.merchant_id = v_order_merchant
    AND COALESCE(p.is_active, false)
    AND COALESCE(p.is_approved, false);
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE'; END IF;

  IF NEW.variant_id IS NOT NULL THEN
    SELECT pv.* INTO v_variant
    FROM public.product_variants AS pv
    WHERE pv.id = NEW.variant_id
      AND pv.product_id = NEW.product_id
      AND COALESCE(pv.is_active, false);
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_VARIANT'; END IF;
    v_variant_add := COALESCE(NULLIF(v_variant.price_modifier, 0), v_variant.additional_price, 0);
    NEW.variant_details := jsonb_build_object(
      'id', v_variant.id,
      'name_ar', v_variant.name_ar,
      'price_modifier', v_variant_add
    );
  ELSE
    NEW.variant_details := NULL;
  END IF;

  NEW.product_name := COALESCE(v_product.name_ar, v_product.name);
  NEW.unit_price := GREATEST(0, COALESCE(v_product.sale_price, v_product.base_price, 0) + v_variant_add);
  NEW.total_price := round(NEW.unit_price * NEW.quantity, 2);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order_id uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_order public.orders%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax_rate numeric := 0;
  v_commission_rate numeric := 0;
BEGIN
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(oi.total_price), 0) INTO v_subtotal
  FROM public.order_items AS oi WHERE oi.order_id = v_order_id;

  IF v_order.coupon_id IS NOT NULL THEN
    SELECT c.* INTO v_coupon FROM public.coupons AS c WHERE c.id = v_order.coupon_id;
    IF FOUND
      AND COALESCE(v_coupon.is_active, false)
      AND v_coupon.type IN ('percentage', 'fixed')
      AND (v_coupon.min_order_amount IS NULL OR v_subtotal >= v_coupon.min_order_amount)
    THEN
      v_discount := CASE
        WHEN v_coupon.type = 'percentage' THEN round(v_subtotal * COALESCE(v_coupon.value, 0) / 100, 2)
        ELSE COALESCE(v_coupon.value, 0)
      END;
      IF v_coupon.max_discount_amount IS NOT NULL THEN
        v_discount := LEAST(v_discount, v_coupon.max_discount_amount);
      END IF;
      v_discount := LEAST(v_subtotal, GREATEST(0, v_discount));
    END IF;
  END IF;

  v_tax_rate := LEAST(100, GREATEST(0, public.marketplace_setting_numeric('tax_percent', 0)));
  SELECT LEAST(100, GREATEST(0, COALESCE(mp.commission_rate, public.marketplace_setting_numeric('app_commission_percent', 10))))
    INTO v_commission_rate
  FROM public.merchant_profiles AS mp WHERE mp.id = v_order.merchant_id;

  UPDATE public.orders
  SET subtotal = round(v_subtotal, 2),
      discount_amount = round(v_discount, 2),
      tax_amount = round((v_subtotal - v_discount) * v_tax_rate / 100, 2),
      platform_commission = round((v_subtotal - v_discount) * COALESCE(v_commission_rate, 10) / 100, 2),
      total_amount = round(
        v_subtotal + GREATEST(0, COALESCE(v_order.delivery_fee, 0)) - v_discount
        + ((v_subtotal - v_discount) * v_tax_rate / 100),
        2
      )
  WHERE id = v_order_id;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_commission_rate numeric;
BEGIN
  SELECT LEAST(100, GREATEST(0, COALESCE(mp.commission_rate, public.marketplace_setting_numeric('app_commission_percent', 10))))
    INTO v_commission_rate
  FROM public.merchant_profiles AS mp WHERE mp.id = NEW.merchant_id;
  NEW.subtotal := GREATEST(0, COALESCE(NEW.subtotal, 0));
  NEW.delivery_fee := GREATEST(0, COALESCE(NEW.delivery_fee, 0));
  NEW.discount_amount := LEAST(NEW.subtotal, GREATEST(0, COALESCE(NEW.discount_amount, 0)));
  NEW.tax_amount := GREATEST(0, COALESCE(NEW.tax_amount, 0));
  NEW.platform_commission := round(
    (NEW.subtotal - NEW.discount_amount) * COALESCE(v_commission_rate, 10) / 100,
    2
  );
  NEW.total_amount := round(
    NEW.subtotal + NEW.delivery_fee - NEW.discount_amount + NEW.tax_amount,
    2
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_item_price ON public.order_items;
CREATE TRIGGER trg_enforce_item_price
  BEFORE INSERT OR UPDATE OF product_id, variant_id, quantity
  ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_price();

DROP TRIGGER IF EXISTS trg_recalc_order_totals ON public.order_items;
CREATE TRIGGER trg_recalc_order_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();

DROP TRIGGER IF EXISTS before_order_insert ON public.orders;
CREATE TRIGGER before_order_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.calculate_order_totals();

-- API roles cannot bypass the transactional functions by mutating business
-- rows directly. SECURITY DEFINER RPCs execute as their owner and remain able
-- to perform the atomic operation.
CREATE OR REPLACE FUNCTION public.protect_direct_business_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'DIRECT_BUSINESS_WRITE_FORBIDDEN';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_order_core_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
    NEW.merchant_id IS DISTINCT FROM OLD.merchant_id OR
    NEW.delivery_id IS DISTINCT FROM OLD.delivery_id OR
    NEW.address_id IS DISTINCT FROM OLD.address_id OR
    NEW.group_id IS DISTINCT FROM OLD.group_id OR
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
    NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee OR
    NEW.discount_amount IS DISTINCT FROM OLD.discount_amount OR
    NEW.platform_commission IS DISTINCT FROM OLD.platform_commission OR
    NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
    NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
    NEW.coupon_id IS DISTINCT FROM OLD.coupon_id OR
    NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
    NEW.request_hash IS DISTINCT FROM OLD.request_hash OR
    NEW.inventory_released_at IS DISTINCT FROM OLD.inventory_released_at OR
    NEW.settled_at IS DISTINCT FROM OLD.settled_at OR
    NEW.cancellation_actor_id IS DISTINCT FROM OLD.cancellation_actor_id OR
    NEW.cancellation_actor_role IS DISTINCT FROM OLD.cancellation_actor_role OR
    NEW.stats_counted IS DISTINCT FROM OLD.stats_counted
  ) THEN
    RAISE EXCEPTION 'DIRECT_ORDER_UPDATE_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_merchant_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR
    NEW.rating IS DISTINCT FROM OLD.rating OR
    NEW.total_reviews IS DISTINCT FROM OLD.total_reviews OR
    NEW.commission_rate IS DISTINCT FROM OLD.commission_rate OR
    NEW.is_approved IS DISTINCT FROM OLD.is_approved OR
    NEW.is_active IS DISTINCT FROM OLD.is_active
  ) THEN RAISE EXCEPTION 'PROTECTED_MERCHANT_PROFILE_FIELD'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_delivery_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR
    NEW.rating IS DISTINCT FROM OLD.rating OR
    NEW.total_deliveries IS DISTINCT FROM OLD.total_deliveries OR
    NEW.is_approved IS DISTINCT FROM OLD.is_approved
  ) THEN RAISE EXCEPTION 'PROTECTED_DELIVERY_PROFILE_FIELD'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_customer_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR
    NEW.loyalty_points IS DISTINCT FROM OLD.loyalty_points
  ) THEN RAISE EXCEPTION 'PROTECTED_CUSTOMER_PROFILE_FIELD'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_coupon_limits_and_protect_usage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('anon', 'authenticated')
       AND (COALESCE(NEW.usage_count, 0) <> 0 OR COALESCE(NEW.used_count, 0) <> 0) THEN
      RAISE EXCEPTION 'COUPON_USAGE_COUNTER_SERVER_OWNED';
    END IF;
    IF NEW.usage_limit IS NOT NULL AND NEW.max_uses IS NOT NULL
       AND NEW.usage_limit IS DISTINCT FROM NEW.max_uses THEN
      RAISE EXCEPTION 'COUPON_LIMIT_CONFLICT';
    END IF;
    NEW.usage_limit := COALESCE(NEW.usage_limit, NEW.max_uses);
    NEW.max_uses := NEW.usage_limit;
    NEW.usage_count := COALESCE(NEW.usage_count, NEW.used_count, 0);
    NEW.used_count := NEW.usage_count;
    RETURN NEW;
  END IF;

  IF current_user IN ('anon', 'authenticated') AND (
    NEW.usage_count IS DISTINCT FROM OLD.usage_count OR
    NEW.used_count IS DISTINCT FROM OLD.used_count
  ) THEN
    RAISE EXCEPTION 'COUPON_USAGE_COUNTER_SERVER_OWNED';
  END IF;

  IF NEW.usage_limit IS DISTINCT FROM OLD.usage_limit
     AND NEW.max_uses IS DISTINCT FROM OLD.max_uses
     AND NEW.usage_limit IS DISTINCT FROM NEW.max_uses THEN
    RAISE EXCEPTION 'COUPON_LIMIT_CONFLICT';
  ELSIF NEW.usage_limit IS DISTINCT FROM OLD.usage_limit THEN
    NEW.max_uses := NEW.usage_limit;
  ELSIF NEW.max_uses IS DISTINCT FROM OLD.max_uses THEN
    NEW.usage_limit := NEW.max_uses;
  END IF;

  IF NEW.usage_count IS DISTINCT FROM OLD.usage_count
     AND NEW.used_count IS NOT DISTINCT FROM OLD.used_count THEN
    NEW.used_count := NEW.usage_count;
  ELSIF NEW.used_count IS DISTINCT FROM OLD.used_count
     AND NEW.usage_count IS NOT DISTINCT FROM OLD.usage_count THEN
    NEW.usage_count := NEW.used_count;
  ELSIF NEW.used_count IS DISTINCT FROM NEW.usage_count THEN
    RAISE EXCEPTION 'COUPON_USAGE_COUNTER_CONFLICT';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_direct_order_insert ON public.orders;
CREATE TRIGGER trg_block_direct_order_insert BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_protect_order_core_fields ON public.orders;
CREATE TRIGGER trg_protect_order_core_fields BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_core_fields();
DROP TRIGGER IF EXISTS trg_block_direct_order_item_insert ON public.order_items;
CREATE TRIGGER trg_block_direct_order_item_insert BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_order_item_change ON public.order_items;
CREATE TRIGGER trg_block_direct_order_item_change BEFORE UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_order_group_insert ON public.order_groups;
CREATE TRIGGER trg_block_direct_order_group_insert BEFORE INSERT ON public.order_groups
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_order_group_change ON public.order_groups;
CREATE TRIGGER trg_block_direct_order_group_change BEFORE UPDATE OR DELETE ON public.order_groups
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_coupon_usage_insert ON public.coupon_usage;
CREATE TRIGGER trg_block_direct_coupon_usage_insert BEFORE INSERT ON public.coupon_usage
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_coupon_usage_change ON public.coupon_usage;
CREATE TRIGGER trg_block_direct_coupon_usage_change BEFORE UPDATE OR DELETE ON public.coupon_usage
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_delivery_proof_insert ON public.delivery_proofs;
CREATE TRIGGER trg_block_direct_delivery_proof_insert BEFORE INSERT ON public.delivery_proofs
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_wallet_transaction_insert ON public.wallet_transactions;
CREATE TRIGGER trg_block_direct_wallet_transaction_insert BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_delivery_earning_insert ON public.delivery_earnings;
CREATE TRIGGER trg_block_direct_delivery_earning_insert BEFORE INSERT ON public.delivery_earnings
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();
DROP TRIGGER IF EXISTS trg_block_direct_inventory_log_insert ON public.inventory_logs;
CREATE TRIGGER trg_block_direct_inventory_log_insert BEFORE INSERT ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.protect_direct_business_insert();

DROP TRIGGER IF EXISTS trg_protect_merchant_profile_fields ON public.merchant_profiles;
CREATE TRIGGER trg_protect_merchant_profile_fields BEFORE UPDATE ON public.merchant_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_merchant_profile_fields();
DROP TRIGGER IF EXISTS trg_protect_delivery_profile_fields ON public.delivery_profiles;
CREATE TRIGGER trg_protect_delivery_profile_fields BEFORE UPDATE ON public.delivery_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_delivery_profile_fields();
DROP TRIGGER IF EXISTS trg_protect_customer_profile_fields ON public.customer_profiles;
CREATE TRIGGER trg_protect_customer_profile_fields BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_customer_profile_fields();

DROP TRIGGER IF EXISTS trg_sync_coupon_limits_and_usage ON public.coupons;
CREATE TRIGGER trg_sync_coupon_limits_and_usage
  BEFORE INSERT OR UPDATE OF usage_limit, max_uses, usage_count, used_count
  ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.sync_coupon_limits_and_protect_usage();

-- -----------------------------------------------------------------------------
-- Private delivery-proof uploads. The former live policy allowed every signed-in
-- user to upload any object into the orders bucket. Only the courier currently
-- assigned to an on-the-way order may create the deterministic proof object.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Auth users upload orders" ON storage.objects;
DROP POLICY IF EXISTS "Assigned courier uploads delivery proof" ON storage.objects;
CREATE POLICY "Assigned courier uploads delivery proof"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'orders'
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] IN ('delivery-proofs', 'delivery-signatures')
  AND storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg', 'image/png')
  AND CASE
        WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
          THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
        ELSE false
      END
  AND EXISTS (
    SELECT 1
    FROM public.orders AS o
    JOIN public.delivery_profiles AS dp ON dp.id = o.delivery_id
    JOIN public.users AS u ON u.id = dp.user_id
    WHERE o.id::text = (storage.foldername(name))[3]
      AND o.status = 'on_the_way'
      AND dp.user_id = (SELECT auth.uid())
      AND COALESCE(dp.is_approved, false)
      AND COALESCE(u.is_active, true)
      AND NOT public.is_current_user_blocked()
  )
);

-- -----------------------------------------------------------------------------
-- Authoritative coupon preview and order placement.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_coupon(
  p_code text,
  p_subtotal numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer uuid := auth.uid();
  v_coupon public.coupons%ROWTYPE;
  v_discount numeric := 0;
  v_user_uses integer := 0;
BEGIN
  IF p_subtotal IS NULL OR p_subtotal < 0 THEN
    RAISE EXCEPTION 'INVALID_SUBTOTAL';
  END IF;
  IF NULLIF(trim(COALESCE(p_code, '')), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'discount', 0, 'message', 'COUPON_CODE_REQUIRED');
  END IF;

  SELECT c.* INTO v_coupon
  FROM public.coupons AS c
  WHERE upper(c.code) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND OR NOT COALESCE(v_coupon.is_active, false) THEN
    RETURN jsonb_build_object('valid', false, 'discount', 0, 'message', 'COUPON_INVALID');
  END IF;
  IF v_coupon.type NOT IN ('percentage', 'fixed') OR COALESCE(v_coupon.value, 0) <= 0 THEN
    RETURN jsonb_build_object('valid', false, 'discount', 0, 'message', 'COUPON_TYPE_UNSUPPORTED');
  END IF;
  IF v_coupon.start_date IS NOT NULL AND v_coupon.start_date > now() THEN
    RETURN jsonb_build_object('valid', false, 'discount', 0, 'message', 'COUPON_NOT_STARTED');
  END IF;
  IF v_coupon.end_date IS NOT NULL AND v_coupon.end_date < now() THEN
    RETURN jsonb_build_object('valid', false, 'discount', 0, 'message', 'COUPON_EXPIRED');
  END IF;
  IF v_coupon.usage_limit IS NOT NULL
     AND COALESCE(v_coupon.usage_count, 0) >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'discount', 0, 'message', 'COUPON_EXHAUSTED');
  END IF;
  IF v_coupon.min_order_amount IS NOT NULL AND p_subtotal < v_coupon.min_order_amount THEN
    RETURN jsonb_build_object(
      'valid', false, 'discount', 0, 'message', 'COUPON_MINIMUM_NOT_MET',
      'minimum', v_coupon.min_order_amount
    );
  END IF;

  IF v_customer IS NOT NULL AND v_coupon.per_user_limit IS NOT NULL THEN
    SELECT count(*)::integer INTO v_user_uses
    FROM public.coupon_usage AS cu
    WHERE cu.coupon_id = v_coupon.id AND cu.user_id = v_customer;
    IF v_user_uses >= v_coupon.per_user_limit THEN
      RETURN jsonb_build_object('valid', false, 'discount', 0, 'message', 'COUPON_USER_LIMIT');
    END IF;
  END IF;

  v_discount := CASE v_coupon.type
    WHEN 'percentage' THEN round(p_subtotal * v_coupon.value / 100, 2)
    ELSE v_coupon.value
  END;
  IF v_coupon.max_discount_amount IS NOT NULL THEN
    v_discount := LEAST(v_discount, v_coupon.max_discount_amount);
  END IF;
  v_discount := round(LEAST(p_subtotal, GREATEST(0, v_discount)), 2);

  RETURN jsonb_build_object(
    'valid', true,
    'discount', v_discount,
    'message', 'COUPON_VALID',
    'coupon_id', v_coupon.id,
    'merchant_id', v_coupon.merchant_id,
    'type', v_coupon.type,
    'value', v_coupon.value
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.place_order(uuid, uuid, text, jsonb, text, text);
CREATE OR REPLACE FUNCTION public.place_order(
  p_merchant_id uuid,
  p_address_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_coupon_code text,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer uuid := auth.uid();
  v_actor_role text;
  v_request_hash text;
  v_existing public.orders%ROWTYPE;
  v_address public.addresses%ROWTYPE;
  v_merchant public.merchant_profiles%ROWTYPE;
  v_merchant_user public.users%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_zone record;
  v_item jsonb;
  v_validated_items jsonb := '[]'::jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_variant_price numeric;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_minimum numeric := 0;
  v_discount numeric := 0;
  v_tax_rate numeric := 0;
  v_commission_rate numeric := 0;
  v_tax numeric := 0;
  v_commission numeric := 0;
  v_total numeric := 0;
  v_coupon_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_actor_role := public.marketplace_actor_role(v_customer);
  IF v_actor_role <> 'customer' THEN RAISE EXCEPTION 'CUSTOMER_ROLE_REQUIRED'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF lower(trim(COALESCE(p_payment_method, ''))) <> 'cash' THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_UNAVAILABLE';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'TOO_MANY_ITEMS'; END IF;
  IF length(COALESCE(p_notes, '')) > 2000 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e(value)
    GROUP BY e.value ->> 'product_id', COALESCE(e.value ->> 'variant_id', '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ITEM';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'merchant_id', p_merchant_id,
    'address_id', p_address_id,
    'payment_method', lower(trim(p_payment_method)),
    'items', p_items,
    'coupon_code', upper(NULLIF(trim(COALESCE(p_coupon_code, '')), '')),
    'notes', NULLIF(trim(COALESCE(p_notes, '')), '')
  )::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_customer::text || ':' || p_idempotency_key::text, 0)
  );

  SELECT o.* INTO v_existing
  FROM public.orders AS o
  WHERE o.customer_id = v_customer AND o.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    PERFORM public.marketplace_notify_order_event(
      v_existing.id, 'order-created:' || p_idempotency_key::text, 'pending'
    );
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'total', v_existing.total_amount,
      'idempotent_replay', true
    );
  END IF;

  SELECT a.* INTO v_address
  FROM public.addresses AS a
  WHERE a.id = p_address_id AND a.user_id = v_customer
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ADDRESS'; END IF;

  SELECT mp.* INTO v_merchant
  FROM public.merchant_profiles AS mp
  WHERE mp.id = p_merchant_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;

  SELECT u.* INTO v_merchant_user
  FROM public.users AS u
  WHERE u.id = v_merchant.user_id
  FOR SHARE;
  IF NOT FOUND
     OR NOT COALESCE(v_merchant_user.is_active, true)
     OR public.is_user_blocked(v_merchant_user.id)
     OR NOT COALESCE(v_merchant.is_approved, false)
     OR NOT COALESCE(v_merchant.is_active, true) THEN
    RAISE EXCEPTION 'MERCHANT_UNAVAILABLE';
  END IF;
  IF NOT COALESCE(v_merchant.is_open, true) THEN RAISE EXCEPTION 'MERCHANT_CLOSED'; END IF;

  v_delivery_fee := GREATEST(0, public.marketplace_setting_numeric('delivery_fee', 0));
  v_minimum := GREATEST(0, public.marketplace_setting_numeric('min_order_amount', 0));
  SELECT dz.* INTO v_zone
  FROM public.delivery_zones AS dz
  WHERE (dz.merchant_id = p_merchant_id OR dz.merchant_id IS NULL)
    AND lower(COALESCE(dz.city, '')) = lower(COALESCE(v_address.city, ''))
  ORDER BY (dz.merchant_id = p_merchant_id) DESC, dz.id
  LIMIT 1;
  IF FOUND THEN
    IF NOT COALESCE(v_zone.is_active, false)
       OR NOT COALESCE(v_zone.delivery_available, false) THEN
      RAISE EXCEPTION 'DELIVERY_NOT_AVAILABLE';
    END IF;
    v_delivery_fee := GREATEST(0, COALESCE(v_zone.delivery_fee, v_delivery_fee));
    v_minimum := GREATEST(v_minimum, COALESCE(v_zone.min_order_amount, 0));
  END IF;

  -- Lock inventory in deterministic product/variant order to avoid deadlocks
  -- between two large concurrent carts.
  FOR v_item IN
    SELECT e.value
    FROM jsonb_array_elements(p_items) AS e(value)
    ORDER BY e.value ->> 'product_id', COALESCE(e.value ->> 'variant_id', '')
  LOOP
    BEGIN
      v_product_id := NULLIF(trim(v_item ->> 'product_id'), '')::uuid;
      v_variant_id := NULLIF(trim(COALESCE(v_item ->> 'variant_id', '')), '')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 100 THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END IF;

    SELECT p.* INTO v_product
    FROM public.products AS p
    WHERE p.id = v_product_id
      AND p.merchant_id = p_merchant_id
      AND COALESCE(p.is_active, false)
      AND COALESCE(p.is_approved, false)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', v_product_id; END IF;

    v_variant_price := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT pv.* INTO v_variant
      FROM public.product_variants AS pv
      WHERE pv.id = v_variant_id
        AND pv.product_id = v_product_id
        AND COALESCE(pv.is_active, false)
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_VARIANT:%', v_variant_id; END IF;
      IF COALESCE(v_variant.stock_qty, 0) < v_quantity THEN
        RAISE EXCEPTION 'OUT_OF_STOCK_VARIANT:%', v_variant_id;
      END IF;
      v_variant_price := COALESCE(NULLIF(v_variant.price_modifier, 0), v_variant.additional_price, 0);
      UPDATE public.product_variants
      SET stock_qty = stock_qty - v_quantity
      WHERE id = v_variant_id;
      UPDATE public.products
      SET total_sold = COALESCE(total_sold, 0) + v_quantity
      WHERE id = v_product_id;
    ELSE
      IF COALESCE(v_product.stock_quantity, 0) < v_quantity THEN
        RAISE EXCEPTION 'OUT_OF_STOCK:%', v_product_id;
      END IF;
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_quantity,
          total_sold = COALESCE(total_sold, 0) + v_quantity
      WHERE id = v_product_id;
    END IF;

    v_unit_price := GREATEST(
      0,
      COALESCE(v_product.sale_price, v_product.base_price, 0) + v_variant_price
    );
    v_subtotal := v_subtotal + round(v_unit_price * v_quantity, 2);
    v_validated_items := v_validated_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'variant_id', v_variant_id,
      'quantity', v_quantity,
      'quantity_before', CASE
        WHEN v_variant_id IS NOT NULL THEN COALESCE(v_variant.stock_qty, 0)
        ELSE COALESCE(v_product.stock_quantity, 0)
      END,
      'quantity_after', CASE
        WHEN v_variant_id IS NOT NULL THEN COALESCE(v_variant.stock_qty, 0) - v_quantity
        ELSE COALESCE(v_product.stock_quantity, 0) - v_quantity
      END
    ));
  END LOOP;
  v_subtotal := round(v_subtotal, 2);
  IF v_subtotal < v_minimum THEN
    RAISE EXCEPTION 'MINIMUM_ORDER_NOT_MET:%', v_minimum;
  END IF;

  IF NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT c.* INTO v_coupon
    FROM public.coupons AS c
    WHERE upper(c.code) = upper(trim(p_coupon_code))
    FOR UPDATE;
    IF NOT FOUND OR NOT COALESCE(v_coupon.is_active, false) THEN
      RAISE EXCEPTION 'COUPON_INVALID';
    END IF;
    IF v_coupon.type NOT IN ('percentage', 'fixed') OR COALESCE(v_coupon.value, 0) <= 0 THEN
      RAISE EXCEPTION 'COUPON_TYPE_UNSUPPORTED';
    END IF;
    IF v_coupon.merchant_id IS NOT NULL AND v_coupon.merchant_id <> p_merchant_id THEN
      RAISE EXCEPTION 'COUPON_WRONG_MERCHANT';
    END IF;
    IF v_coupon.start_date IS NOT NULL AND v_coupon.start_date > now() THEN
      RAISE EXCEPTION 'COUPON_NOT_STARTED';
    END IF;
    IF v_coupon.end_date IS NOT NULL AND v_coupon.end_date < now() THEN
      RAISE EXCEPTION 'COUPON_EXPIRED';
    END IF;
    IF v_coupon.usage_limit IS NOT NULL
       AND COALESCE(v_coupon.usage_count, 0) >= v_coupon.usage_limit THEN
      RAISE EXCEPTION 'COUPON_EXHAUSTED';
    END IF;
    IF v_coupon.per_user_limit IS NOT NULL
       AND (
         SELECT count(*) FROM public.coupon_usage AS cu
         WHERE cu.coupon_id = v_coupon.id AND cu.user_id = v_customer
       ) >= v_coupon.per_user_limit THEN
      RAISE EXCEPTION 'COUPON_USER_LIMIT';
    END IF;
    IF v_coupon.min_order_amount IS NOT NULL AND v_subtotal < v_coupon.min_order_amount THEN
      RAISE EXCEPTION 'COUPON_MINIMUM_NOT_MET:%', v_coupon.min_order_amount;
    END IF;
    v_discount := CASE v_coupon.type
      WHEN 'percentage' THEN round(v_subtotal * v_coupon.value / 100, 2)
      ELSE v_coupon.value
    END;
    IF v_coupon.max_discount_amount IS NOT NULL THEN
      v_discount := LEAST(v_discount, v_coupon.max_discount_amount);
    END IF;
    v_discount := round(LEAST(v_subtotal, GREATEST(0, v_discount)), 2);
    v_coupon_id := v_coupon.id;
  END IF;

  v_tax_rate := LEAST(100, GREATEST(0, public.marketplace_setting_numeric('tax_percent', 0)));
  v_commission_rate := LEAST(100, GREATEST(
    0,
    COALESCE(v_merchant.commission_rate, public.marketplace_setting_numeric('app_commission_percent', 10))
  ));
  v_tax := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_commission := round((v_subtotal - v_discount) * v_commission_rate / 100, 2);
  v_total := round(v_subtotal + v_delivery_fee - v_discount + v_tax, 2);
  v_order_number := 'ORD-' || upper(substr(md5(v_customer::text || ':' || p_idempotency_key::text), 1, 16));

  INSERT INTO public.orders(
    id, order_number, customer_id, merchant_id, address_id, status,
    subtotal, delivery_fee, discount_amount, platform_commission, tax_amount,
    total_amount, payment_method, payment_status, coupon_id, notes,
    idempotency_key, request_hash
  )
  VALUES (
    v_order_id, v_order_number, v_customer, p_merchant_id, p_address_id, 'pending',
    v_subtotal, v_delivery_fee, v_discount, v_commission, v_tax,
    v_total, 'cash', 'pending', v_coupon_id,
    NULLIF(trim(COALESCE(p_notes, '')), ''), p_idempotency_key, v_request_hash
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items(
      order_id, product_id, variant_id, quantity, unit_price, total_price
    )
    VALUES (
      v_order_id,
      (v_item ->> 'product_id')::uuid,
      NULLIF(v_item ->> 'variant_id', '')::uuid,
      (v_item ->> 'quantity')::integer,
      0,
      0
    );
    INSERT INTO public.inventory_logs(
      product_id, variant_id, order_id, change_amount, change_type,
      quantity_before, quantity_after, reason, created_by
    )
    VALUES (
      (v_item ->> 'product_id')::uuid,
      NULLIF(v_item ->> 'variant_id', '')::uuid,
      v_order_id,
      -(v_item ->> 'quantity')::integer,
      'reservation',
      (v_item ->> 'quantity_before')::integer,
      (v_item ->> 'quantity_after')::integer,
      'order_reservation',
      v_customer
    );
  END LOOP;

  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_usage(coupon_id, user_id, order_id)
    VALUES (v_coupon_id, v_customer, v_order_id);
    UPDATE public.coupons
    SET usage_count = COALESCE(usage_count, 0) + 1,
        used_count = COALESCE(used_count, 0) + 1
    WHERE id = v_coupon_id;
  END IF;

  PERFORM public.marketplace_record_order_event(
    v_order_id,
    'order-created:' || p_idempotency_key::text,
    'place_order',
    v_customer,
    v_actor_role,
    NULL,
    'pending',
    NULL,
    jsonb_build_object('idempotency_key', p_idempotency_key)
  );
  PERFORM public.marketplace_notify_order_event(
    v_order_id, 'order-created:' || p_idempotency_key::text, 'pending'
  );

  SELECT o.total_amount, o.platform_commission, o.tax_amount
  INTO v_total, v_commission, v_tax
  FROM public.orders AS o WHERE o.id = v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_delivery_fee,
    'tax', v_tax,
    'total', v_total,
    'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_order_group(
  p_address_id uuid,
  p_payment_method text,
  p_stores jsonb,
  p_coupon_code text,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer uuid := auth.uid();
  v_role text;
  v_request_hash text;
  v_existing public.order_groups%ROWTYPE;
  v_group_id uuid := gen_random_uuid();
  v_group_number text;
  v_store jsonb;
  v_merchant_id uuid;
  v_child_key uuid;
  v_child jsonb;
  v_order_id uuid;
  v_orders jsonb := '[]'::jsonb;
  v_total numeric := 0;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_role := public.marketplace_actor_role(v_customer);
  IF v_role <> 'customer' THEN RAISE EXCEPTION 'CUSTOMER_ROLE_REQUIRED'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF lower(trim(COALESCE(p_payment_method, ''))) <> 'cash' THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_UNAVAILABLE';
  END IF;
  IF p_stores IS NULL OR jsonb_typeof(p_stores) <> 'array'
     OR jsonb_array_length(p_stores) = 0 THEN
    RAISE EXCEPTION 'EMPTY_STORE_GROUP';
  END IF;
  IF jsonb_array_length(p_stores) > 20 THEN RAISE EXCEPTION 'TOO_MANY_STORES'; END IF;
  IF jsonb_array_length(p_stores) > 1
     AND NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    -- A coupon has one funding/usage event. Silently multiplying it across
    -- merchants would over-discount and corrupt settlement allocation.
    RAISE EXCEPTION 'GROUP_COUPON_REQUIRES_SINGLE_STORE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_stores) AS s(value)
    GROUP BY s.value ->> 'merchant_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_MERCHANT_IN_GROUP';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'address_id', p_address_id,
    'payment_method', lower(trim(p_payment_method)),
    'stores', p_stores,
    'coupon_code', upper(NULLIF(trim(COALESCE(p_coupon_code, '')), '')),
    'notes', NULLIF(trim(COALESCE(p_notes, '')), '')
  )::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('group:' || v_customer::text || ':' || p_idempotency_key::text, 0)
  );
  SELECT og.* INTO v_existing
  FROM public.order_groups AS og
  WHERE og.customer_id = v_customer AND og.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'order_number', o.order_number,
          'status', o.status,
          'total', o.total_amount
        ) ORDER BY o.created_at, o.id
      ),
      '[]'::jsonb
    ) INTO v_orders
    FROM public.orders AS o
    WHERE o.group_id = v_existing.id;
    RETURN jsonb_build_object(
      'group_id', v_existing.id,
      'group_number', v_existing.group_number,
      'total', v_existing.total_amount,
      'orders', v_orders,
      'idempotent_replay', true
    );
  END IF;

  -- Validate ownership before reserving any store inventory. place_order repeats
  -- this check inside each child transaction boundary for defense in depth.
  IF NOT EXISTS (
    SELECT 1 FROM public.addresses AS a
    WHERE a.id = p_address_id AND a.user_id = v_customer
  ) THEN
    RAISE EXCEPTION 'INVALID_ADDRESS';
  END IF;

  v_group_number := 'GRP-' || upper(substr(md5(v_customer::text || ':' || p_idempotency_key::text), 1, 16));
  INSERT INTO public.order_groups(
    id, customer_id, group_number, total_amount, payment_status,
    idempotency_key, request_hash
  )
  VALUES (
    v_group_id, v_customer, v_group_number, 0, 'pending',
    p_idempotency_key, v_request_hash
  );

  FOR v_store IN
    SELECT s.value
    FROM jsonb_array_elements(p_stores) AS s(value)
    ORDER BY s.value ->> 'merchant_id'
  LOOP
    BEGIN
      v_merchant_id := NULLIF(trim(v_store ->> 'merchant_id'), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_MERCHANT';
    END;
    IF v_merchant_id IS NULL
       OR jsonb_typeof(v_store -> 'items') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_store -> 'items') = 0 THEN
      RAISE EXCEPTION 'INVALID_STORE_GROUP';
    END IF;

    v_child_key := public.marketplace_uuid_from_text(
      'group-child:' || p_idempotency_key::text || ':' || v_merchant_id::text
    );
    v_child := public.place_order(
      v_merchant_id,
      p_address_id,
      'cash',
      v_store -> 'items',
      CASE WHEN jsonb_array_length(p_stores) = 1 THEN p_coupon_code ELSE NULL END,
      p_notes,
      v_child_key
    );
    v_order_id := (v_child ->> 'id')::uuid;
    UPDATE public.orders SET group_id = v_group_id WHERE id = v_order_id;
    v_total := v_total + COALESCE((v_child ->> 'total')::numeric, 0);
    v_orders := v_orders || jsonb_build_array(v_child - 'idempotent_replay');
  END LOOP;

  UPDATE public.order_groups
  SET total_amount = round(v_total, 2)
  WHERE id = v_group_id;

  RETURN jsonb_build_object(
    'group_id', v_group_id,
    'group_number', v_group_number,
    'total', round(v_total, 2),
    'orders', v_orders,
    'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_default_address(p_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  PERFORM public.marketplace_actor_role(v_user_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('default-address:' || v_user_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.addresses AS a
    WHERE a.id = p_address_id AND a.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'INVALID_ADDRESS';
  END IF;
  UPDATE public.addresses
  SET is_default = (id = p_address_id)
  WHERE user_id = v_user_id
    AND is_default IS DISTINCT FROM (id = p_address_id);
END;
$function$;

-- -----------------------------------------------------------------------------
-- Cancellation and status ownership. Inventory and coupon usage are restored
-- exactly once; delivered is deliberately absent from the generic state API.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marketplace_release_inventory_once(
  p_order_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_usage_deleted integer := 0;
  v_stock_before integer;
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.inventory_released_at IS NOT NULL THEN RETURN false; END IF;
  IF v_order.settled_at IS NOT NULL OR v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'SETTLED_ORDER_INVENTORY_IMMUTABLE';
  END IF;

  FOR v_item IN
    SELECT oi.*
    FROM public.order_items AS oi
    WHERE oi.order_id = p_order_id
    ORDER BY oi.product_id, oi.variant_id NULLS FIRST, oi.id
  LOOP
    SELECT COALESCE(p.stock_quantity, 0) INTO v_stock_before
    FROM public.products AS p WHERE p.id = v_item.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_MISSING_DURING_RELEASE'; END IF;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT COALESCE(pv.stock_qty, 0) INTO v_stock_before
      FROM public.product_variants AS pv
      WHERE pv.id = v_item.variant_id AND pv.product_id = v_item.product_id
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'VARIANT_MISSING_DURING_RELEASE'; END IF;
      UPDATE public.product_variants
      SET stock_qty = COALESCE(stock_qty, 0) + v_item.quantity
      WHERE id = v_item.variant_id AND product_id = v_item.product_id;
    ELSE
      UPDATE public.products
      SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity
      WHERE id = v_item.product_id;
    END IF;
    UPDATE public.products
    SET total_sold = GREATEST(0, COALESCE(total_sold, 0) - v_item.quantity)
    WHERE id = v_item.product_id;
    INSERT INTO public.inventory_logs(
      product_id, variant_id, order_id, change_amount, change_type,
      quantity_before, quantity_after, reason, created_by
    )
    VALUES (
      v_item.product_id, v_item.variant_id, p_order_id, v_item.quantity,
      'release', v_stock_before, v_stock_before + v_item.quantity,
      'order_release', p_actor_id
    );
  END LOOP;

  IF v_order.coupon_id IS NOT NULL THEN
    DELETE FROM public.coupon_usage
    WHERE coupon_id = v_order.coupon_id
      AND user_id = v_order.customer_id
      AND order_id = p_order_id;
    GET DIAGNOSTICS v_usage_deleted = ROW_COUNT;
    IF v_usage_deleted > 0 THEN
      UPDATE public.coupons
      SET usage_count = GREATEST(0, COALESCE(usage_count, 0) - 1),
          used_count = GREATEST(0, COALESCE(used_count, 0) - 1)
      WHERE id = v_order.coupon_id;
    END IF;
  END IF;

  UPDATE public.orders SET inventory_released_at = now() WHERE id = p_order_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_cancel_order_as(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role text;
  v_is_owner boolean := false;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'ACTOR_REQUIRED'; END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CANCELLATION_REASON_REQUIRED';
  END IF;
  IF length(p_reason) > 1000 THEN RAISE EXCEPTION 'CANCELLATION_REASON_TOO_LONG'; END IF;
  v_role := public.marketplace_actor_role(p_actor_id);

  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'cancelled' THEN
    v_is_owner :=
      (v_role = 'customer' AND v_order.customer_id = p_actor_id) OR
      (v_role = 'merchant' AND EXISTS (
        SELECT 1 FROM public.merchant_profiles AS mp
        WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
      )) OR
      v_role = 'admin';
    IF NOT v_is_owner THEN RAISE EXCEPTION 'CANCELLATION_NOT_ALLOWED'; END IF;
    PERFORM public.marketplace_notify_order_event(
      p_order_id, 'order-cancelled:' || p_order_id::text, 'cancelled'
    );
    RETURN jsonb_build_object(
      'id', v_order.id, 'status', v_order.status,
      'cancel_reason', v_order.cancel_reason, 'idempotent_replay', true
    );
  END IF;
  IF v_order.status = 'delivered' OR v_order.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'DELIVERED_ORDER_CANNOT_BE_CANCELLED';
  END IF;

  IF v_role = 'customer' THEN
    v_is_owner := v_order.customer_id = p_actor_id
      AND v_order.status IN ('pending', 'confirmed', 'preparing');
  ELSIF v_role = 'merchant' THEN
    v_is_owner := v_order.status IN ('pending', 'confirmed', 'preparing')
      AND EXISTS (
        SELECT 1 FROM public.merchant_profiles AS mp
        WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
      );
  ELSIF v_role = 'admin' THEN
    v_is_owner := v_order.status IN ('pending', 'confirmed', 'preparing', 'ready');
  END IF;
  IF NOT v_is_owner THEN RAISE EXCEPTION 'CANCELLATION_NOT_ALLOWED'; END IF;

  IF v_order.group_id IS NOT NULL THEN
    PERFORM 1 FROM public.order_groups AS og
    WHERE og.id = v_order.group_id FOR UPDATE;
  END IF;

  PERFORM public.marketplace_release_inventory_once(p_order_id, p_actor_id);
  PERFORM set_config('app.order_transition', '1', true);
  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = trim(p_reason),
      cancellation_actor_id = p_actor_id,
      cancellation_actor_role = v_role
  WHERE id = p_order_id;

  IF v_order.group_id IS NOT NULL THEN
    UPDATE public.order_groups AS og
    SET total_amount = COALESCE((
          SELECT round(sum(COALESCE(child.total_amount, 0)), 2)
          FROM public.orders AS child
          WHERE child.group_id = og.id AND child.status <> 'cancelled'
        ), 0),
        payment_status = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.orders AS child
            WHERE child.group_id = og.id AND child.status <> 'cancelled'
          ) THEN 'cancelled'
          WHEN NOT EXISTS (
            SELECT 1 FROM public.orders AS child
            WHERE child.group_id = og.id
              AND child.status <> 'cancelled'
              AND child.payment_status <> 'paid'
          ) THEN 'paid'
          ELSE 'pending'
        END
    WHERE og.id = v_order.group_id;
  END IF;

  PERFORM public.marketplace_record_order_event(
    p_order_id,
    'order-cancelled:' || p_order_id::text,
    'cancel_order',
    p_actor_id,
    v_role,
    v_order.status::text,
    'cancelled',
    trim(p_reason),
    '{}'::jsonb
  );
  PERFORM public.marketplace_notify_order_event(
    p_order_id, 'order-cancelled:' || p_order_id::text, 'cancelled'
  );

  RETURN jsonb_build_object(
    'id', p_order_id, 'status', 'cancelled',
    'cancel_reason', trim(p_reason), 'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_result := public.marketplace_cancel_order_as(p_order_id, auth.uid(), p_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_transition_order_as(
  p_order_id uuid,
  p_actor_id uuid,
  p_next_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role text;
  v_allowed boolean := false;
  v_is_participant boolean := false;
  v_next text := lower(trim(COALESCE(p_next_status, '')));
  v_event_key text;
  v_event_metadata jsonb := '{}'::jsonb;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'ACTOR_REQUIRED'; END IF;
  IF v_next = '' THEN RAISE EXCEPTION 'NEXT_STATUS_REQUIRED'; END IF;
  IF length(COALESCE(p_reason, '')) > 1000 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  IF v_next = 'delivered' THEN RAISE EXCEPTION 'DELIVERY_PROOF_REQUIRED'; END IF;
  IF v_next = 'cancelled' THEN
    RETURN public.marketplace_cancel_order_as(p_order_id, p_actor_id, p_reason);
  END IF;

  v_role := public.marketplace_actor_role(p_actor_id);
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  v_is_participant :=
    (v_role = 'customer' AND v_order.customer_id = p_actor_id) OR
    (v_role = 'merchant' AND EXISTS (
      SELECT 1 FROM public.merchant_profiles AS mp
      WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
    )) OR
    (v_role = 'delivery' AND EXISTS (
      SELECT 1 FROM public.delivery_profiles AS dp
      WHERE dp.id = v_order.delivery_id AND dp.user_id = p_actor_id
    )) OR
    v_role = 'admin';
  IF v_order.status::text = v_next THEN
    IF NOT v_is_participant THEN RAISE EXCEPTION 'STATUS_TRANSITION_NOT_ALLOWED'; END IF;
    RETURN jsonb_build_object(
      'id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'idempotent_replay', true
    );
  END IF;
  IF v_order.status IN ('cancelled', 'returned') OR v_order.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_STATE_TERMINAL';
  END IF;

  IF v_role = 'merchant' AND EXISTS (
    SELECT 1 FROM public.merchant_profiles AS mp
    WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
  ) THEN
    v_allowed :=
      (v_order.status = 'pending' AND v_next IN ('confirmed', 'preparing')) OR
      (v_order.status = 'confirmed' AND v_next = 'preparing') OR
      (v_order.status = 'preparing' AND v_next = 'ready');
  ELSIF v_role = 'delivery' AND EXISTS (
    SELECT 1 FROM public.delivery_profiles AS dp
    WHERE dp.id = v_order.delivery_id AND dp.user_id = p_actor_id
  ) THEN
    v_allowed :=
      (v_order.status = 'assigned' AND v_next = 'picked_up') OR
      (v_order.status = 'picked_up' AND v_next = 'on_the_way') OR
      (v_order.status IN ('assigned', 'picked_up', 'on_the_way') AND v_next = 'failed_delivery');
  ELSIF v_role = 'admin' THEN
    v_allowed :=
      (v_order.status = 'pending' AND v_next IN ('confirmed', 'preparing')) OR
      (v_order.status = 'confirmed' AND v_next = 'preparing') OR
      (v_order.status = 'preparing' AND v_next = 'ready') OR
      (v_order.status = 'assigned' AND v_next = 'picked_up') OR
      (v_order.status = 'picked_up' AND v_next = 'on_the_way') OR
      (v_order.status IN ('assigned', 'picked_up', 'on_the_way') AND v_next = 'failed_delivery') OR
      (v_order.status = 'failed_delivery' AND v_next IN ('rescheduled', 'disputed')) OR
      (v_order.status = 'rescheduled' AND v_next = 'ready');
  END IF;

  IF v_next IN ('failed_delivery', 'rescheduled', 'disputed')
     AND NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'STATUS_REASON_REQUIRED';
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'STATUS_TRANSITION_NOT_ALLOWED'; END IF;

  PERFORM set_config('app.order_transition', '1', true);
  IF v_order.status = 'rescheduled' AND v_next = 'ready' THEN
    -- Preserve old location/audit history, but release the failed assignment so
    -- the ready order can be offered and claimed by another courier.
    UPDATE public.orders
    SET status = 'ready', delivery_id = NULL
    WHERE id = p_order_id;
    v_event_metadata := jsonb_build_object(
      'released_delivery_id', v_order.delivery_id,
      'assignment_released', true
    );
  ELSE
    EXECUTE format('UPDATE public.orders SET status = %L WHERE id = $1', v_next)
    USING p_order_id;
  END IF;
  v_event_key := 'status-transition:' || p_order_id::text || ':' ||
    txid_current()::text || ':' || v_order.status::text || ':' || v_next;
  PERFORM public.marketplace_record_order_event(
    p_order_id,
    v_event_key,
    'transition_order_status',
    p_actor_id,
    v_role,
    v_order.status::text,
    v_next,
    p_reason,
    v_event_metadata
  );
  PERFORM public.marketplace_notify_order_event(p_order_id, v_event_key, v_next);

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_next,
    'previous_status', v_order.status::text,
    'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id uuid,
  p_next_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_result := public.marketplace_transition_order_as(
    p_order_id, auth.uid(), p_next_status, NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_transition_order_status(
  p_actor_id uuid,
  p_order_id uuid,
  p_next_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED';
  END IF;
  RETURN public.marketplace_transition_order_as(
    p_order_id, p_actor_id, p_next_status, p_reason
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- Courier offer visibility and race-safe claim.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_available_delivery_orders()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_profile public.delivery_profiles%ROWTYPE;
  v_active integer := 0;
  v_capacity integer := 3;
  v_offer record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_role := public.marketplace_actor_role(v_user_id);
  IF v_role <> 'delivery' THEN RAISE EXCEPTION 'DELIVERY_ROLE_REQUIRED'; END IF;

  SELECT dp.* INTO v_profile
  FROM public.delivery_profiles AS dp
  WHERE dp.user_id = v_user_id;
  IF NOT FOUND
     OR NOT COALESCE(v_profile.is_approved, false)
     OR NOT COALESCE(v_profile.is_online, false) THEN
    RAISE EXCEPTION 'DELIVERY_PROFILE_UNAVAILABLE';
  END IF;

  v_capacity := GREATEST(
    1,
    LEAST(20, public.marketplace_setting_numeric('delivery_max_active_orders', 3)::integer)
  );
  SELECT count(*)::integer INTO v_active
  FROM public.orders AS o
  WHERE o.delivery_id = v_profile.id
    AND o.status IN ('assigned', 'picked_up', 'on_the_way');
  IF v_active >= v_capacity THEN RETURN; END IF;

  FOR v_offer IN
    SELECT
      o.id,
      o.order_number,
      o.merchant_id,
      o.status,
      o.delivery_fee,
      o.payment_method,
      o.created_at,
      mp.store_name,
      mp.address AS merchant_address,
      mp.city AS merchant_city,
      a.city AS delivery_city
    FROM public.orders AS o
    JOIN public.merchant_profiles AS mp ON mp.id = o.merchant_id
    JOIN public.addresses AS a ON a.id = o.address_id
    WHERE o.status = 'ready'
      AND o.delivery_id IS NULL
      AND o.inventory_released_at IS NULL
    ORDER BY o.created_at, o.id
    LIMIT 50
  LOOP
    RETURN NEXT jsonb_build_object(
      'id', v_offer.id,
      'order_number', v_offer.order_number,
      'merchant_id', v_offer.merchant_id,
      'status', v_offer.status,
      'delivery_fee', v_offer.delivery_fee,
      'payment_method', v_offer.payment_method,
      'created_at', v_offer.created_at,
      'merchant_profiles', jsonb_build_object(
        'store_name', v_offer.store_name,
        'address', v_offer.merchant_address,
        'city', v_offer.merchant_city
      ),
      'addresses', jsonb_build_object('city', v_offer.delivery_city)
    );
  END LOOP;
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_delivery_order(
  p_order_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_profile public.delivery_profiles%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_active integer := 0;
  v_capacity integer := 3;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_user_id IS DISTINCT FROM v_user_id THEN RAISE EXCEPTION 'ACTOR_MISMATCH'; END IF;
  v_role := public.marketplace_actor_role(v_user_id);
  IF v_role <> 'delivery' THEN RAISE EXCEPTION 'DELIVERY_ROLE_REQUIRED'; END IF;

  SELECT dp.* INTO v_profile
  FROM public.delivery_profiles AS dp
  WHERE dp.user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_PROFILE_UNAVAILABLE'; END IF;

  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_order.delivery_id = v_profile.id
     AND v_order.status IN ('assigned', 'picked_up', 'on_the_way') THEN
    PERFORM public.marketplace_notify_order_event(
      p_order_id, 'delivery-claimed:' || p_order_id::text, 'assigned'
    );
    RETURN true;
  END IF;
  IF NOT COALESCE(v_profile.is_approved, false)
     OR NOT COALESCE(v_profile.is_online, false) THEN
    RAISE EXCEPTION 'DELIVERY_PROFILE_UNAVAILABLE';
  END IF;

  v_capacity := GREATEST(
    1,
    LEAST(20, public.marketplace_setting_numeric('delivery_max_active_orders', 3)::integer)
  );

  SELECT count(*)::integer INTO v_active
  FROM public.orders AS o
  WHERE o.delivery_id = v_profile.id
    AND o.status IN ('assigned', 'picked_up', 'on_the_way');
  IF v_active >= v_capacity THEN RAISE EXCEPTION 'DELIVERY_CAPACITY_REACHED'; END IF;
  IF v_order.status <> 'ready' OR v_order.delivery_id IS NOT NULL
     OR v_order.inventory_released_at IS NOT NULL THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.order_transition', '1', true);
  UPDATE public.orders
  SET delivery_id = v_profile.id,
      status = 'assigned'
  WHERE id = p_order_id;

  PERFORM public.marketplace_record_order_event(
    p_order_id,
    'delivery-claimed:' || p_order_id::text,
    'claim_delivery_order',
    v_user_id,
    v_role,
    'ready',
    'assigned',
    NULL,
    jsonb_build_object('delivery_profile_id', v_profile.id)
  );
  PERFORM public.marketplace_notify_order_event(
    p_order_id, 'delivery-claimed:' || p_order_id::text, 'assigned'
  );
  RETURN true;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Atomic proof completion and once-only settlement.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marketplace_settle_order_once(
  p_order_id uuid,
  p_actor_id uuid,
  p_settlement_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.order_settlements%ROWTYPE;
  v_merchant public.merchant_profiles%ROWTYPE;
  v_delivery public.delivery_profiles%ROWTYPE;
  v_settlement_id uuid;
  v_merchant_amount numeric;
  v_delivery_amount numeric;
  v_platform_amount numeric;
  v_merchant_balance numeric;
  v_delivery_balance numeric;
  v_physical_cash_account text;
  v_allocation_source text;
  v_funding_state text;
  v_actor_role text;
  v_items_sold integer := 0;
  v_new_customer integer := 0;
  v_stats_date date;
BEGIN
  IF p_actor_id IS NULL OR p_settlement_key IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_AND_KEY_REQUIRED';
  END IF;
  v_actor_role := public.marketplace_actor_role(p_actor_id);

  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  SELECT s.* INTO v_existing
  FROM public.order_settlements AS s
  WHERE s.order_id = p_order_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_actor_role <> 'admin'
       AND NOT (
         v_actor_role = 'delivery'
         AND EXISTS (
           SELECT 1 FROM public.delivery_profiles AS dp
           WHERE dp.id = v_existing.delivery_id AND dp.user_id = p_actor_id
         )
       ) THEN
      RAISE EXCEPTION 'SETTLEMENT_ACTOR_NOT_ALLOWED';
    END IF;
    RETURN jsonb_build_object(
      'settlement_id', v_existing.id,
      'order_id', v_existing.order_id,
      'gross_amount', v_existing.gross_amount,
      'merchant_proceeds', v_existing.merchant_proceeds,
      'delivery_earning', v_existing.delivery_earning,
      'platform_amount', v_existing.platform_amount,
      'status', v_existing.status,
      'idempotent_replay', true
    );
  END IF;
  IF v_order.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'SETTLED_TIMESTAMP_WITHOUT_SETTLEMENT';
  END IF;
  IF v_order.payment_status::text = 'refunded'
     OR EXISTS (
       SELECT 1
       FROM public.refund_requests AS refund
       WHERE refund.order_id = p_order_id
         AND (
           refund.status::text = 'completed'
           OR COALESCE(refund.reversal_amount, 0) > 0
           OR refund.reversal_applied_at IS NOT NULL
         )
     ) THEN
    RAISE EXCEPTION 'ORDER_HAS_COMPLETED_REFUND_OR_REVERSAL';
  END IF;
  IF v_order.status <> 'delivered' OR v_order.delivered_at IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_DELIVERED';
  END IF;
  IF v_order.delivery_id IS NULL THEN RAISE EXCEPTION 'DELIVERY_ASSIGNMENT_REQUIRED'; END IF;
  IF COALESCE(v_order.total_amount, 0) < 0 THEN RAISE EXCEPTION 'INVALID_ORDER_TOTAL'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS customer
    WHERE customer.id = v_order.customer_id AND customer.role::text = 'customer'
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_ROLE_RELATIONSHIP_INVALID';
  END IF;
  IF v_order.group_id IS NOT NULL THEN
    PERFORM 1 FROM public.order_groups AS og
    WHERE og.id = v_order.group_id FOR UPDATE;
  END IF;

  SELECT mp.* INTO v_merchant
  FROM public.merchant_profiles AS mp
  JOIN public.users AS merchant_user
    ON merchant_user.id = mp.user_id AND merchant_user.role::text = 'merchant'
  WHERE mp.id = v_order.merchant_id
  FOR UPDATE;
  IF NOT FOUND OR v_merchant.user_id IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROFILE_MISSING'; END IF;

  SELECT dp.* INTO v_delivery
  FROM public.delivery_profiles AS dp
  JOIN public.users AS delivery_user
    ON delivery_user.id = dp.user_id AND delivery_user.role::text = 'delivery'
  WHERE dp.id = v_order.delivery_id
  FOR UPDATE;
  IF NOT FOUND OR v_delivery.user_id IS NULL THEN RAISE EXCEPTION 'DELIVERY_PROFILE_MISSING'; END IF;
  IF v_actor_role <> 'admin'
     AND NOT (v_actor_role = 'delivery' AND v_delivery.user_id = p_actor_id) THEN
    RAISE EXCEPTION 'SETTLEMENT_ACTOR_NOT_ALLOWED';
  END IF;

  v_merchant_amount := round(
    COALESCE(v_order.subtotal, 0)
      - COALESCE(v_order.discount_amount, 0)
      - COALESCE(v_order.platform_commission, 0),
    2
  );
  v_delivery_amount := round(COALESCE(v_order.delivery_fee, 0), 2);
  v_platform_amount := round(
    COALESCE(v_order.platform_commission, 0) + COALESCE(v_order.tax_amount, 0),
    2
  );
  IF v_merchant_amount < 0 OR v_delivery_amount < 0 OR v_platform_amount < 0
     OR abs(
       COALESCE(v_order.total_amount, 0)
       - v_merchant_amount - v_delivery_amount - v_platform_amount
     ) > 0.01 THEN
    RAISE EXCEPTION 'SETTLEMENT_NOT_BALANCED';
  END IF;

  INSERT INTO public.order_settlements(
    order_id, merchant_id, delivery_id, payment_method, gross_amount,
    merchant_proceeds, delivery_earning, platform_commission, tax_amount,
    platform_amount, settlement_key, status, settled_by
  )
  VALUES (
    p_order_id, v_order.merchant_id, v_order.delivery_id,
    COALESCE(v_order.payment_method::text, 'cash'), v_order.total_amount,
    v_merchant_amount, v_delivery_amount,
    COALESCE(v_order.platform_commission, 0), COALESCE(v_order.tax_amount, 0),
    v_platform_amount, p_settlement_key, 'settled', p_actor_id
  )
  RETURNING id INTO v_settlement_id;

  IF lower(COALESCE(v_order.payment_method::text, 'cash')) IN ('cash', 'cod') THEN
    INSERT INTO public.delivery_cod_collections(
      order_id, delivery_id, collected_by, amount_collected, status
    )
    VALUES (
      p_order_id, v_order.delivery_id, v_delivery.user_id, v_order.total_amount, 'collected'
    );
    -- Keep physical custody separate from economic allocation. Wallet credits
    -- are receivables while the courier still holds the cash; remittance later
    -- moves delivery_cash_custody exactly once into platform_cash_clearing.
    v_physical_cash_account := 'delivery_cash_custody';
    v_allocation_source := 'cod_settlement_receivable';
    v_funding_state := 'held_in_delivery_cash_custody';
  ELSE
    v_physical_cash_account := 'payment_clearing';
    v_allocation_source := 'payment_clearing';
    v_funding_state := 'cleared';
  END IF;

  UPDATE public.merchant_profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + v_merchant_amount
  WHERE id = v_order.merchant_id
  RETURNING wallet_balance INTO v_merchant_balance;

  UPDATE public.delivery_profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + v_delivery_amount,
      -- Legacy reconciliations explicitly record whether operational counters
      -- were already applied.  Normal proof-backed orders always arrive here
      -- with stats_counted=false, while a verified historical order can set it
      -- true before settlement to avoid double-counting the courier trip.
      total_deliveries = COALESCE(total_deliveries, 0)
        + CASE WHEN COALESCE(v_order.stats_counted, false) THEN 0 ELSE 1 END
  WHERE id = v_order.delivery_id
  RETURNING wallet_balance INTO v_delivery_balance;

  IF v_merchant_amount > 0 THEN
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, source, reference_id, balance_after, notes
    )
    VALUES (
      v_merchant.user_id, 'credit', v_merchant_amount,
      'order_merchant_proceeds', p_order_id, v_merchant_balance,
      'Merchant proceeds for delivered order ' || p_order_id::text
    );
  END IF;
  IF v_delivery_amount > 0 THEN
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, source, reference_id, balance_after, notes
    )
    VALUES (
      v_delivery.user_id, 'credit', v_delivery_amount,
      'order_delivery_earning', p_order_id, v_delivery_balance,
      'Delivery earning for delivered order ' || p_order_id::text
    );
  END IF;

  INSERT INTO public.delivery_earnings(
    delivery_id, order_id, base_earning, bonus_earning, tip_amount, total_earning
  )
  VALUES (
    v_order.delivery_id, p_order_id, v_delivery_amount, 0, 0, v_delivery_amount
  )
  ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING;

  IF NOT COALESCE(v_order.stats_counted, false) THEN
    SELECT COALESCE(sum(oi.quantity), 0)::integer INTO v_items_sold
    FROM public.order_items AS oi
    WHERE oi.order_id = p_order_id;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.orders AS previous_order
      WHERE previous_order.merchant_id = v_order.merchant_id
        AND previous_order.customer_id = v_order.customer_id
        AND previous_order.id <> p_order_id
        AND previous_order.status = 'delivered'
    ) THEN 0 ELSE 1 END
    INTO v_new_customer;
    v_stats_date := (COALESCE(v_order.delivered_at, now()) AT TIME ZONE 'Asia/Aden')::date;

    INSERT INTO public.merchant_daily_stats(
      merchant_id, date, orders_count, revenue, items_sold, new_customers, avg_order_value
    )
    VALUES (
      v_order.merchant_id, v_stats_date, 1, v_order.total_amount,
      v_items_sold, v_new_customer, v_order.total_amount
    )
    ON CONFLICT (merchant_id, date) DO UPDATE
    SET orders_count = COALESCE(public.merchant_daily_stats.orders_count, 0) + 1,
        revenue = COALESCE(public.merchant_daily_stats.revenue, 0) + EXCLUDED.revenue,
        items_sold = COALESCE(public.merchant_daily_stats.items_sold, 0) + EXCLUDED.items_sold,
        new_customers = COALESCE(public.merchant_daily_stats.new_customers, 0) + EXCLUDED.new_customers,
        avg_order_value = round(
          (COALESCE(public.merchant_daily_stats.revenue, 0) + EXCLUDED.revenue)
          / NULLIF(COALESCE(public.merchant_daily_stats.orders_count, 0) + 1, 0),
          2
        );
  END IF;

  INSERT INTO public.marketplace_ledger_entries(
    operation_key, order_id, entry_type, debit_account, debit_owner_id,
    credit_account, credit_owner_id, amount, metadata, created_by
  )
  VALUES
    (
      'settlement:' || p_order_id::text || ':cod_collection',
      p_order_id, 'cod_collection',
      CASE WHEN v_physical_cash_account = 'delivery_cash_custody' THEN 'customer_cash' ELSE 'customer_payment' END,
      v_order.customer_id,
      v_physical_cash_account,
      CASE WHEN v_physical_cash_account = 'delivery_cash_custody' THEN v_delivery.user_id ELSE NULL END,
      v_order.total_amount,
      jsonb_build_object(
        'settlement_key', p_settlement_key,
        'funding_state', v_funding_state,
        'physical_cash_account', v_physical_cash_account
      ), p_actor_id
    ),
    (
      'settlement:' || p_order_id::text || ':merchant_proceeds',
      p_order_id, 'merchant_proceeds',
      v_allocation_source,
      CASE WHEN v_physical_cash_account = 'delivery_cash_custody' THEN v_delivery.user_id ELSE NULL END,
      'merchant_wallet', v_merchant.user_id, v_merchant_amount,
      jsonb_build_object(
        'settlement_key', p_settlement_key,
        'funding_state', v_funding_state,
        'physical_cash_account', v_physical_cash_account
      ), p_actor_id
    ),
    (
      'settlement:' || p_order_id::text || ':delivery_earning',
      p_order_id, 'delivery_earning',
      v_allocation_source,
      CASE WHEN v_physical_cash_account = 'delivery_cash_custody' THEN v_delivery.user_id ELSE NULL END,
      'delivery_wallet', v_delivery.user_id, v_delivery_amount,
      jsonb_build_object(
        'settlement_key', p_settlement_key,
        'funding_state', v_funding_state,
        'physical_cash_account', v_physical_cash_account
      ), p_actor_id
    ),
    (
      'settlement:' || p_order_id::text || ':platform_revenue',
      p_order_id, 'platform_revenue',
      v_allocation_source,
      CASE WHEN v_physical_cash_account = 'delivery_cash_custody' THEN v_delivery.user_id ELSE NULL END,
      'platform_revenue', NULL, v_platform_amount,
      jsonb_build_object(
        'settlement_key', p_settlement_key,
        'commission', COALESCE(v_order.platform_commission, 0),
        'tax', COALESCE(v_order.tax_amount, 0),
        'funding_state', v_funding_state,
        'physical_cash_account', v_physical_cash_account
      ), p_actor_id
    );

  UPDATE public.orders
  SET settled_at = now(),
      payment_status = 'paid',
      stats_counted = true
  WHERE id = p_order_id;

  IF v_order.group_id IS NOT NULL THEN
    UPDATE public.order_groups AS og
    SET total_amount = COALESCE((
          SELECT round(sum(COALESCE(child.total_amount, 0)), 2)
          FROM public.orders AS child
          WHERE child.group_id = og.id AND child.status <> 'cancelled'
        ), 0),
        payment_status = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.orders AS child
            WHERE child.group_id = og.id
              AND child.status <> 'cancelled'
              AND child.payment_status <> 'paid'
          ) THEN 'paid'
          ELSE og.payment_status
        END
    WHERE og.id = v_order.group_id;
  END IF;

  PERFORM public.marketplace_record_order_event(
    p_order_id,
    'order-settled:' || p_order_id::text,
    'settle_order',
    p_actor_id,
    v_actor_role,
    'delivered',
    'delivered',
    NULL,
    jsonb_build_object('settlement_id', v_settlement_id, 'settlement_key', p_settlement_key)
  );

  RETURN jsonb_build_object(
    'settlement_id', v_settlement_id,
    'order_id', p_order_id,
    'gross_amount', v_order.total_amount,
    'merchant_proceeds', v_merchant_amount,
    'delivery_earning', v_delivery_amount,
    'platform_amount', v_platform_amount,
    'status', 'settled',
    'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_validate_delivery_proof_object(
  p_path text,
  p_actor_id uuid,
  p_order_id uuid,
  p_idempotency_key uuid,
  p_folder text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_metadata jsonb;
  v_mimetype text;
  v_size_text text;
  v_expected_pattern text;
BEGIN
  IF p_folder NOT IN ('delivery-proofs', 'delivery-signatures') THEN
    RAISE EXCEPTION 'INVALID_PROOF_FOLDER';
  END IF;
  v_expected_pattern := format(
    '^%s/%s/%s/%s[.](jpg|jpeg|png)$',
    p_actor_id::text, p_folder, p_order_id::text, p_idempotency_key::text
  );
  IF p_path IS NULL OR p_path !~* v_expected_pattern THEN
    RAISE EXCEPTION 'INVALID_PROOF_PATH';
  END IF;

  SELECT so.metadata INTO v_metadata
  FROM storage.objects AS so
  WHERE so.bucket_id = 'orders'
    AND so.name = p_path
    AND COALESCE(so.owner_id, so.owner::text) = p_actor_id::text
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_OBJECT_NOT_FOUND_OR_NOT_OWNED'; END IF;

  v_mimetype := lower(COALESCE(v_metadata ->> 'mimetype', ''));
  v_size_text := COALESCE(v_metadata ->> 'size', '');
  IF NOT (
    (lower(p_path) ~ '[.]png$' AND v_mimetype = 'image/png') OR
    (lower(p_path) ~ '[.](jpg|jpeg)$' AND v_mimetype = 'image/jpeg')
  ) THEN
    RAISE EXCEPTION 'INVALID_PROOF_MIME_TYPE';
  END IF;
  IF v_size_text !~ '^[0-9]+$'
     OR v_size_text::bigint < 1
     OR v_size_text::bigint > 10485760 THEN
    RAISE EXCEPTION 'INVALID_PROOF_FILE_SIZE';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_delivery_with_proof(
  p_order_id uuid,
  p_photo_url text,
  p_latitude numeric,
  p_longitude numeric,
  p_idempotency_key uuid,
  p_signature_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_order public.orders%ROWTYPE;
  v_delivery public.delivery_profiles%ROWTYPE;
  v_address public.addresses%ROWTYPE;
  v_existing public.delivery_proofs%ROWTYPE;
  v_proof_id uuid;
  v_settlement jsonb;
  v_distance_m double precision;
  v_allowed_radius_m numeric;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  v_role := public.marketplace_actor_role(v_actor);
  IF v_role <> 'delivery' THEN RAISE EXCEPTION 'DELIVERY_ROLE_REQUIRED'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('delivery-proof:' || p_idempotency_key::text, 0)
  );
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  SELECT dp.* INTO v_delivery
  FROM public.delivery_profiles AS dp
  WHERE dp.id = v_order.delivery_id AND dp.user_id = v_actor
  FOR SHARE;
  IF NOT FOUND OR NOT COALESCE(v_delivery.is_approved, false) THEN
    RAISE EXCEPTION 'ORDER_NOT_ASSIGNED_TO_DELIVERY';
  END IF;

  SELECT proof.* INTO v_existing
  FROM public.delivery_proofs AS proof
  WHERE proof.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.order_id IS DISTINCT FROM p_order_id
       OR v_existing.delivery_id IS DISTINCT FROM v_delivery.id
       OR v_existing.photo_url IS DISTINCT FROM p_photo_url
       OR v_existing.signature_url IS DISTINCT FROM NULLIF(trim(COALESCE(p_signature_url, '')), '')
       OR v_existing.latitude IS DISTINCT FROM round(p_latitude, 8)
       OR v_existing.longitude IS DISTINCT FROM round(p_longitude, 8) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    v_settlement := public.marketplace_settle_order_once(
      p_order_id, v_actor, p_idempotency_key
    );
    PERFORM public.marketplace_notify_order_event(
      p_order_id, 'delivery-proof:' || p_idempotency_key::text, 'delivered'
    );
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'status', v_order.status,
      'proof_id', v_existing.id,
      'settlement', v_settlement,
      'idempotent_replay', true
    );
  END IF;

  IF v_order.payment_status::text = 'refunded'
     OR EXISTS (
       SELECT 1 FROM public.refund_requests refund
       WHERE refund.order_id = p_order_id
         AND (
           refund.status::text = 'completed'
           OR COALESCE(refund.reversal_amount, 0) > 0
           OR refund.reversal_applied_at IS NOT NULL
         )
     ) THEN
    RAISE EXCEPTION 'ORDER_REFUNDED_BEFORE_DELIVERY_COMPLETION';
  END IF;

  IF p_latitude IS NULL OR p_latitude < -90 OR p_latitude > 90
     OR p_longitude IS NULL OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_LOCATION';
  END IF;
  IF v_order.status = 'delivered' THEN RAISE EXCEPTION 'DELIVERY_ALREADY_COMPLETED'; END IF;
  IF v_order.status <> 'on_the_way' THEN RAISE EXCEPTION 'ORDER_NOT_READY_FOR_PROOF'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.delivery_proofs AS proof WHERE proof.order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'DELIVERY_PROOF_ALREADY_EXISTS';
  END IF;

  SELECT a.* INTO v_address
  FROM public.addresses AS a
  WHERE a.id = v_order.address_id;
  IF FOUND AND v_address.latitude IS NOT NULL AND v_address.longitude IS NOT NULL THEN
    v_distance_m := 6371000 * 2 * asin(sqrt(LEAST(1, GREATEST(0,
      power(sin(radians((p_latitude - v_address.latitude)::double precision) / 2), 2)
      + cos(radians(v_address.latitude::double precision))
        * cos(radians(p_latitude::double precision))
        * power(sin(radians((p_longitude - v_address.longitude)::double precision) / 2), 2)
    ))));
    v_allowed_radius_m := GREATEST(
      50,
      LEAST(5000, public.marketplace_setting_numeric('delivery_proof_radius_m', 1000))
    );
    IF v_distance_m > v_allowed_radius_m::double precision THEN
      RAISE EXCEPTION 'DELIVERY_LOCATION_TOO_FAR:%', round(v_distance_m::numeric, 0);
    END IF;
  END IF;

  PERFORM public.marketplace_validate_delivery_proof_object(
    p_photo_url, v_actor, p_order_id, p_idempotency_key, 'delivery-proofs'
  );
  IF NULLIF(trim(COALESCE(p_signature_url, '')), '') IS NOT NULL THEN
    PERFORM public.marketplace_validate_delivery_proof_object(
      p_signature_url, v_actor, p_order_id, p_idempotency_key, 'delivery-signatures'
    );
  END IF;

  INSERT INTO public.delivery_proofs(
    order_id, delivery_id, photo_url, signature_url, latitude, longitude,
    delivered_at, idempotency_key, proof_type, created_by, metadata
  )
  VALUES (
    p_order_id, v_delivery.id, p_photo_url,
    NULLIF(trim(COALESCE(p_signature_url, '')), ''), p_latitude, p_longitude,
    now(), p_idempotency_key, 'delivery', v_actor,
    jsonb_build_object(
      'bucket', 'orders',
      'verified_owner', v_actor,
      'address_coordinates_available', v_address.latitude IS NOT NULL AND v_address.longitude IS NOT NULL,
      'distance_m', CASE WHEN v_distance_m IS NULL THEN NULL ELSE round(v_distance_m::numeric, 1) END
    )
  )
  RETURNING id INTO v_proof_id;

  PERFORM set_config('app.order_transition', '1', true);
  UPDATE public.orders
  SET status = 'delivered',
      delivered_at = now(),
      payment_status = CASE
        WHEN payment_status::text = 'refunded' THEN payment_status
        WHEN lower(COALESCE(payment_method::text, 'cash')) IN ('cash', 'cod') THEN 'paid'
        ELSE payment_status
      END
  WHERE id = p_order_id;

  PERFORM public.marketplace_record_order_event(
    p_order_id,
    'delivery-proof:' || p_idempotency_key::text,
    'complete_delivery_with_proof',
    v_actor,
    v_role,
    v_order.status::text,
    'delivered',
    NULL,
    jsonb_build_object(
      'proof_id', v_proof_id,
      'latitude', p_latitude,
      'longitude', p_longitude,
      'distance_m', CASE WHEN v_distance_m IS NULL THEN NULL ELSE round(v_distance_m::numeric, 1) END
    )
  );
  PERFORM public.marketplace_notify_order_event(
    p_order_id, 'delivery-proof:' || p_idempotency_key::text, 'delivered'
  );

  v_settlement := public.marketplace_settle_order_once(
    p_order_id, v_actor, p_idempotency_key
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', 'delivered',
    'proof_id', v_proof_id,
    'settlement', v_settlement,
    'idempotent_replay', false
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- Function privileges. SECURITY DEFINER is never an authorization substitute:
-- every callable entry point is explicit and every helper remains private.
-- -----------------------------------------------------------------------------

DO $revoke_internal_functions$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'marketplace\_%' ESCAPE '\'
        OR p.proname IN (
          'enforce_order_item_price',
          'recalc_order_totals',
          'calculate_order_totals',
          'protect_direct_business_insert',
          'protect_order_core_fields',
          'protect_merchant_profile_fields',
          'protect_delivery_profile_fields',
          'protect_customer_profile_fields',
          'sync_coupon_limits_and_protect_usage',
          'create_order_with_items',
          'decrement_product_stock',
          'calculate_commission'
        )
      )
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_function.signature || ' FROM PUBLIC, anon, authenticated';
  END LOOP;
END;
$revoke_internal_functions$;

REVOKE ALL ON FUNCTION public.set_default_address(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_user_blocked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_current_user_blocked() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_coupon(text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_order(uuid, uuid, text, jsonb, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_order_group(uuid, text, jsonb, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_order_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_transition_order_status(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_available_delivery_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_delivery_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_delivery_with_proof(uuid, text, numeric, numeric, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_default_address(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_blocked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_coupon(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, uuid, text, jsonb, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_group(uuid, text, jsonb, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_available_delivery_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_delivery_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery_with_proof(uuid, text, numeric, numeric, uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.api_transition_order_status(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_settle_order_once(uuid, uuid, uuid) TO service_role;
