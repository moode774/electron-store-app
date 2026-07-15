ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check
CHECK (category IN ('technical','payment','delivery','order','order_complaint','general','account','other'));
