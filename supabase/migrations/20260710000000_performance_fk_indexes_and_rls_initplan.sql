-- =============================================================
-- تحسينات أداء (نتيجة فحص Supabase Performance Advisor — 2026-07-10)
--   • حذف فهرس مكرر في merchant_daily_stats
--   • فهارس تغطية لـ 110 مفتاحاً أجنبياً بدون فهرس
--   • تقييم is_admin() مرة واحدة لكل استعلام بدل كل صف (auth_rls_initplan)
-- =============================================================

-- (1) حذف الفهرس المكرر (البقاء على فهرس القيد الفريد)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_mds_merchant_date')
     AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='merchant_daily_stats_merchant_id_date_key') THEN
    BEGIN
      EXECUTE 'DROP INDEX public.uq_mds_merchant_date';
    EXCEPTION WHEN dependent_objects_still_exist OR undefined_object OR feature_not_supported THEN
      BEGIN
        EXECUTE 'ALTER TABLE public.merchant_daily_stats DROP CONSTRAINT uq_mds_merchant_date';
      EXCEPTION WHEN others THEN NULL;
      END;
    END;
  END IF;
END $$;

-- (2) فهارس تغطية لكل المفاتيح الأجنبية أحادية العمود غير المفهرسة
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl,
           a.attname AS col,
           a.attnum
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = r.tbl::regclass AND i.indkey[0] = r.attnum
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_fk_%s_%s ON %s (%I)',
                     replace(r.tbl, 'public.', ''), r.col, r.tbl, r.col);
    END IF;
  END LOOP;
END $$;

-- (3) سياسات admin_full_access: تقييم is_admin() مرة واحدة لكل استعلام
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'admin_full_access'
  LOOP
    EXECUTE format(
      'ALTER POLICY admin_full_access ON public.%I USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()))',
      r.tablename
    );
  END LOOP;
END $$;
