-- ============================================================
-- UX GAPS: بنية داعمة لسدّ فجوات الواجهة
--   * مناطق عمل المندوب (تفضيل لكل مندوب)
--   * صور وثائق المندوب (هوية/رخصة)
-- كل العبارات idempotent وغير مُتلِفة.
-- ============================================================

-- ---- 1) أعمدة صور وثائق المندوب ------------------------------
ALTER TABLE public.delivery_profiles
  ADD COLUMN IF NOT EXISTS id_image_url      TEXT,
  ADD COLUMN IF NOT EXISTS license_image_url TEXT;

-- سلة تخزين خاصة للوثائق الحساسة (هوية/رخصة) — غير عامة
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- سياسات: كل مستخدم يرفع/يقرأ داخل مجلده فقط (أول جزء من المسار = uid)
DROP POLICY IF EXISTS documents_insert ON storage.objects;
CREATE POLICY documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS documents_read ON storage.objects;
CREATE POLICY documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS documents_update ON storage.objects;
CREATE POLICY documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---- 2) مناطق عمل المندوب (join table) -----------------------
CREATE TABLE IF NOT EXISTS public.delivery_service_areas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_area_id UUID NOT NULL REFERENCES public.service_areas(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_id, service_area_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_service_areas_delivery
  ON public.delivery_service_areas(delivery_id);

ALTER TABLE public.delivery_service_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_areas_owner ON public.delivery_service_areas;
CREATE POLICY delivery_areas_owner ON public.delivery_service_areas
  FOR ALL TO authenticated
  USING (delivery_id = auth.uid())
  WITH CHECK (delivery_id = auth.uid());
