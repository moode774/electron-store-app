-- Product moderation closes the gap between merchant catalog writes and the
-- order-placement approval guard introduced by the marketplace repair.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

UPDATE public.products
SET approval_status = CASE WHEN is_approved IS TRUE THEN 'approved' ELSE 'pending' END
WHERE approval_status IS NULL;

UPDATE public.products
SET approved_at = COALESCE(approved_at, created_at, now())
WHERE approval_status = 'approved' AND approved_at IS NULL;

ALTER TABLE public.products
  ALTER COLUMN approval_status SET DEFAULT 'pending',
  ALTER COLUMN approval_status SET NOT NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_approval_status_check;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_approval_consistency_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_approval_status_check
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD CONSTRAINT products_approval_consistency_check
    CHECK ((approval_status = 'approved') = is_approved);

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

CREATE INDEX IF NOT EXISTS idx_products_approval_queue
  ON public.products (approval_status, created_at DESC);

-- Material catalog edits require a new review. Stock and availability toggles
-- remain operational changes and do not hide an already-approved listing.
CREATE OR REPLACE FUNCTION public.reset_product_approval_after_merchant_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.merchant_profiles mp
       WHERE mp.id = NEW.merchant_id AND mp.user_id = (SELECT auth.uid())
     )
     AND (
       NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.name_ar IS DISTINCT FROM OLD.name_ar
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.description_ar IS DISTINCT FROM OLD.description_ar
       OR NEW.base_price IS DISTINCT FROM OLD.base_price
       OR NEW.sale_price IS DISTINCT FROM OLD.sale_price
       OR NEW.sku IS DISTINCT FROM OLD.sku
       OR NEW.weight IS DISTINCT FROM OLD.weight
       OR NEW.meta_title IS DISTINCT FROM OLD.meta_title
       OR NEW.meta_description IS DISTINCT FROM OLD.meta_description
       OR NEW.tags IS DISTINCT FROM OLD.tags
       OR NEW.share_url IS DISTINCT FROM OLD.share_url
       OR NEW.og_image_url IS DISTINCT FROM OLD.og_image_url
     ) THEN
    NEW.approval_status := 'pending';
    NEW.is_approved := false;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_product_approval_after_merchant_edit ON public.products;
CREATE TRIGGER trg_reset_product_approval_after_merchant_edit
BEFORE UPDATE OF
  category_id, name, name_ar, description, description_ar, base_price,
  sale_price, sku, weight, meta_title, meta_description, tags, share_url,
  og_image_url
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.reset_product_approval_after_merchant_edit();

CREATE OR REPLACE FUNCTION public.reset_product_approval_after_image_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.product_id;
  ELSE
    v_product_id := NEW.product_id;
  END IF;
  IF (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.products p
       JOIN public.merchant_profiles mp ON mp.id = p.merchant_id
       WHERE p.id = v_product_id AND mp.user_id = (SELECT auth.uid())
     ) THEN
    UPDATE public.products
    SET approval_status = 'pending',
        is_approved = false,
        approved_by = NULL,
        approved_at = NULL,
        approval_note = NULL
    WHERE id = v_product_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_product_approval_after_image_edit ON public.product_images;
CREATE TRIGGER trg_reset_product_approval_after_image_edit
AFTER INSERT OR UPDATE OR DELETE ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.reset_product_approval_after_image_edit();

CREATE OR REPLACE FUNCTION public.admin_list_products(p_filter text DEFAULT 'pending')
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_filter text := lower(COALESCE(NULLIF(btrim(p_filter), ''), 'pending'));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF v_filter NOT IN ('all','pending','approved','rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid product approval filter';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', p.id,
    'merchant_id', p.merchant_id,
    'name', p.name,
    'name_ar', p.name_ar,
    'description', p.description,
    'description_ar', p.description_ar,
    'base_price', p.base_price,
    'sale_price', p.sale_price,
    'stock_quantity', p.stock_quantity,
    'is_active', p.is_active,
    'is_approved', p.is_approved,
    'approval_status', p.approval_status,
    'approval_note', p.approval_note,
    'approved_at', p.approved_at,
    'created_at', p.created_at,
    'merchant_profiles', jsonb_build_object(
      'id', mp.id,
      'store_name', mp.store_name,
      'user_id', mp.user_id
    ),
    'primary_image', (
      SELECT pi.image_url
      FROM public.product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.is_primary DESC, pi.sort_order, pi.id
      LIMIT 1
    )
  )
  FROM public.products p
  JOIN public.merchant_profiles mp ON mp.id = p.merchant_id
  WHERE v_filter = 'all' OR p.approval_status = v_filter
  ORDER BY
    CASE WHEN p.approval_status = 'pending' THEN 0 ELSE 1 END,
    p.created_at DESC
  LIMIT 300;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_product(
  p_product_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_decision text := lower(btrim(COALESCE(p_decision, '')));
  v_note text := NULLIF(btrim(p_note), '');
  v_product public.products%ROWTYPE;
  v_merchant_user uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF v_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision must be approved or rejected';
  END IF;
  IF v_decision = 'rejected' AND (v_note IS NULL OR length(v_note) < 3) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rejection reason is required';
  END IF;
  IF length(COALESCE(v_note, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product review note is too long';
  END IF;

  SELECT p.* INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'product not found';
  END IF;

  IF v_product.approval_status = v_decision
     AND (v_decision = 'approved' OR v_product.approval_note IS NOT DISTINCT FROM v_note) THEN
    RETURN jsonb_build_object(
      'id', v_product.id,
      'approval_status', v_product.approval_status,
      'is_approved', v_product.is_approved,
      'idempotent_replay', true
    );
  END IF;

  SELECT mp.user_id INTO v_merchant_user
  FROM public.merchant_profiles mp
  WHERE mp.id = v_product.merchant_id;
  IF v_merchant_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'product merchant is missing';
  END IF;

  UPDATE public.products
  SET approval_status = v_decision,
      is_approved = (v_decision = 'approved'),
      approved_by = v_actor,
      approved_at = now(),
      approval_note = CASE WHEN v_decision = 'rejected' THEN v_note ELSE NULL END
  WHERE id = p_product_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'product_' || v_decision,
    'product',
    p_product_id,
    jsonb_build_object(
      'previous_status', v_product.approval_status,
      'decision', v_decision,
      'note', v_note,
      'merchant_id', v_product.merchant_id
    )
  );

  INSERT INTO public.notifications (user_id, title, body, type, channel, data, event_key)
  VALUES (
    v_merchant_user,
    CASE WHEN v_decision = 'approved' THEN 'تم اعتماد المنتج' ELSE 'يحتاج المنتج إلى تعديل' END,
    CASE
      WHEN v_decision = 'approved' THEN 'أصبح منتجك متاحًا للعملاء.'
      ELSE 'راجع سبب الرفض وعدّل المنتج ثم سيعود إلى قائمة المراجعة.'
    END,
    'product_review',
    'in_app',
    jsonb_build_object('product_id', p_product_id, 'status', v_decision, 'reason', v_note),
    'product-review:' || p_product_id::text || ':' || v_decision || ':' || txid_current()::text
  );

  RETURN jsonb_build_object(
    'id', p_product_id,
    'approval_status', v_decision,
    'is_approved', v_decision = 'approved',
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_product_moderation()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'operational merchant authorization required';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', p.id,
    'approval_status', p.approval_status,
    'approval_note', p.approval_note,
    'approved_at', p.approved_at
  )
  FROM public.products p
  JOIN public.merchant_profiles mp ON mp.id = p.merchant_id
  WHERE mp.user_id = v_actor
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_product_approval_after_merchant_edit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_product_approval_after_image_edit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_products(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_product(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_product_moderation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_products(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_product(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_product_moderation() TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT SELECT (approval_status) ON public.products TO authenticated;
