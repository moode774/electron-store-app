-- ============================================================
-- WITHDRAWAL REQUESTS — طلبات سحب الرصيد (تاجر/مندوب)
-- التدفق: المستخدم يقدّم الطلب → يُراجَع ويُحوَّل يدوياً (لاحقاً عبر لوحة
-- الأدمن) → تُحدَّث الحالة. لا خصم تلقائي للرصيد هنا — التسوية المالية
-- قرار إداري، فيبقى النظام آمناً من أي خصم خاطئ.
-- كل العبارات idempotent وغير مُتلِفة.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'merchant',   -- merchant | delivery
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  method       TEXT,          -- بنك الكريمي / جوالي / ون كاش / كاش ...
  account_info TEXT,          -- رقم الحساب أو المحفظة
  status       TEXT NOT NULL DEFAULT 'pending',         -- pending | approved | rejected | paid
  admin_note   TEXT,
  reviewed_by  UUID REFERENCES public.users(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON public.withdrawal_requests(user_id);

-- طلب سحب واحد قيد المراجعة لكل مستخدم (يمنع التكرار على مستوى القاعدة)
CREATE UNIQUE INDEX IF NOT EXISTS uq_withdrawals_one_pending
  ON public.withdrawal_requests(user_id) WHERE status = 'pending';

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- المستخدم يقرأ طلباته فقط
DROP POLICY IF EXISTS withdrawals_owner_read ON public.withdrawal_requests;
CREATE POLICY withdrawals_owner_read ON public.withdrawal_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ويُنشئ طلباً لنفسه بحالة pending فقط (لا تعديل ولا حذف — للإدارة فقط)
DROP POLICY IF EXISTS withdrawals_owner_insert ON public.withdrawal_requests;
CREATE POLICY withdrawals_owner_insert ON public.withdrawal_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
