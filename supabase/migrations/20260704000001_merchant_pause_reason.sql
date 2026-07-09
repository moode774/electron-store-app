-- سبب إيقاف المتجر — يظهر للتاجر في لوحته وللأدمن في شاشة التجار
-- (كان مُطبَّقاً يدوياً عبر SQL Editor؛ سُجِّل رسمياً في تاريخ الميغريشنات بتاريخ 2026-07-04)
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS pause_reason text;
