-- المنح الافتراضي أعطى anon صلاحية التنفيذ؛ التقرير خاص بالتاجر المصادَق عليه فقط.
REVOKE EXECUTE ON FUNCTION public.merchant_sales_report(integer) FROM anon;
