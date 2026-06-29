-- ============================================================
-- معالجة النزاعات: تمكين الطرف المُشتكى عليه والتاجر من الحلّ
-- ============================================================
-- الطرف المُشتكى عليه (تاجر/مندوب) يقرأ ويحلّ الشكاوى الموجَّهة إليه
DROP POLICY IF EXISTS complaints_against_party_read ON public.complaints;
CREATE POLICY complaints_against_party_read ON public.complaints
  FOR SELECT TO authenticated USING (against_id = auth.uid());

DROP POLICY IF EXISTS complaints_against_party_update ON public.complaints;
CREATE POLICY complaints_against_party_update ON public.complaints
  FOR UPDATE TO authenticated USING (against_id = auth.uid()) WITH CHECK (against_id = auth.uid());

-- التاجر يردّ على طلبات الاسترجاع الخاصة بطلباته
DROP POLICY IF EXISTS refund_requests_merchant_update ON public.refund_requests;
CREATE POLICY refund_requests_merchant_update ON public.refund_requests
  FOR UPDATE TO authenticated
  USING (order_id IN (SELECT o.id FROM public.orders o
    WHERE o.merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid())))
  WITH CHECK (order_id IN (SELECT o.id FROM public.orders o
    WHERE o.merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid())));
