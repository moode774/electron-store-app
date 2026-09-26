-- Delivery proof upload RLS: keep assignment/order isolation in RLS and file limits at bucket boundary.
DROP POLICY IF EXISTS "Assigned courier uploads delivery proof" ON storage.objects;
CREATE POLICY "Assigned courier uploads delivery proof"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='orders'
  AND public.is_current_user_operational('delivery')
  AND array_length(storage.foldername(name),1)=3
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND (storage.foldername(name))[2] IN ('delivery-proofs','delivery-signatures')
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png')
  AND EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.delivery_profiles dp ON dp.id=o.delivery_id
    WHERE o.id::text=(storage.foldername(objects.name))[3]
      AND o.status='on_the_way'
      AND dp.user_id=(SELECT auth.uid())
      AND COALESCE(dp.is_approved,false)
  )
);
