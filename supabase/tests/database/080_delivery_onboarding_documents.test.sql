begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select no_plan();

select has_column('public', 'delivery_profiles', 'work_city', 'delivery work city is persisted');
select has_column('public', 'delivery_profiles', 'national_id_image_path', 'national ID evidence path is persisted');
select has_column('public', 'delivery_profiles', 'license_image_path', 'driver licence evidence path is persisted');
select has_column('public', 'delivery_profiles', 'application_revision', 'delivery application snapshot revision is persisted');
select is(
  (select public from storage.buckets where id = 'delivery-onboarding-documents'),
  false,
  'delivery onboarding documents bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'delivery-onboarding-documents'),
  10485760::bigint,
  'delivery onboarding documents have a 10 MB ceiling'
);
select ok(
  to_regprocedure('public.save_my_delivery_onboarding_documents(text,text,text)') is not null,
  'delivery onboarding document attachment RPC exists'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc
     where oid = to_regprocedure('public.save_my_delivery_onboarding_documents(text,text,text)') $$,
  $$ values (array[
       'p_work_city','p_national_id_image_path','p_license_image_path'
     ]::text[]) $$,
  'document attachment named arguments match the client contract'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.save_my_delivery_onboarding_documents(text,text,text)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.save_my_delivery_onboarding_documents(text,text,text)', 'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.marketplace_validate_delivery_onboarding_document(text,uuid,text)',
    'execute'
  ),
  'only the authorized attachment entry point is exposed'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Delivery uploads onboarding documents'
      and cmd = 'INSERT'
      and with_check ilike '%is_current_user_operational%'
      and with_check ilike '%is_approved IS NOT TRUE%'
      and with_check ilike '%10485760%'
  ),
  'upload policy binds owner, delivery role, path, MIME and size'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Delivery updates onboarding documents'
  ),
  'delivery verification objects are insert-only and cannot be replaced in place'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Delivery or admin reads onboarding documents'
      and cmd = 'SELECT'
      and qual ilike '%is_admin%'
  ),
  'only the owning courier or an admin can read onboarding documents'
);
select ok(
  not has_column_privilege(
    'authenticated', 'public.delivery_profiles', 'national_id_image_path', 'select'
  )
  and not has_column_privilege(
    'authenticated', 'public.delivery_profiles', 'license_image_path', 'select'
  ),
  'new document columns are not exposed through direct Data API grants'
);

select ok(
  pg_get_functiondef(
    'public.review_delivery_application(uuid,boolean,text,bigint)'::regprocedure
  ) ilike '%marketplace_validate_delivery_onboarding_document%'
  and pg_get_functiondef(
    'public.review_delivery_application(uuid,boolean,text,bigint)'::regprocedure
  ) ilike '%length(v_reason) >= 20%'
  and pg_get_functiondef(
    'public.review_delivery_application(uuid,boolean,text,bigint)'::regprocedure
  ) ilike '%work_city%'
  and pg_get_functiondef(
    'public.review_delivery_application(uuid,boolean,text,bigint)'::regprocedure
  ) ilike '%national_id%'
  and pg_get_functiondef(
    'public.review_delivery_application(uuid,boolean,text,bigint)'::regprocedure
  ) ilike '%vehicle_plate%'
  and pg_get_functiondef(
    'public.review_delivery_application(uuid,boolean,text,bigint)'::regprocedure
  ) ilike '%application changed since review%',
  'delivery approval boundary revalidates the exact reviewed revision, core fields and private evidence'
);
select ok(
  to_regprocedure('public.review_delivery_application(uuid,boolean,text)') is null,
  'the legacy approval overload without an expected revision is removed'
);

-- Approval behavior. Historical approved profiles remain grandfathered until
-- an admin actively rejects them; every new transition to approved is guarded.
insert into public.users (
  id, email, phone, full_name, role, is_active, is_verified, is_blocked
) values
  ('a8000000-0000-4000-8000-000000000001', 'delivery-review-admin@test.invalid', '780000001', 'Delivery Review Admin', 'admin', true, true, false),
  ('d8000000-0000-4000-8000-000000000001', 'delivery-incomplete@test.invalid', '780000002', 'Incomplete Courier', 'delivery', true, true, false),
  ('d8000000-0000-4000-8000-000000000002', 'delivery-documents@test.invalid', '780000003', 'Document Courier', 'delivery', true, true, false),
  ('d8000000-0000-4000-8000-000000000003', 'delivery-external@test.invalid', '780000004', 'External Courier', 'delivery', true, true, false),
  ('d8000000-0000-4000-8000-000000000004', 'delivery-legacy@test.invalid', '780000005', 'Legacy Courier', 'delivery', true, true, false);

insert into public.delivery_profiles (
  id, user_id, national_id, vehicle_type, vehicle_plate, work_city,
  national_id_image_path, license_image_path, is_approved, is_online
) values
  (
    'd8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'NATIONAL-INCOMPLETE', 'motorcycle', 'INC-1', null, null, null, false, false
  ),
  (
    'd8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000002',
    'NATIONAL-DOCUMENTS', 'car', 'DOC-2', 'صنعاء',
    'd8000000-0000-4000-8000-000000000002/onboarding/national-id-81000000-0000-4000-8000-000000000001.jpg',
    'd8000000-0000-4000-8000-000000000002/onboarding/driver-license-82000000-0000-4000-8000-000000000001.png',
    false, false
  ),
  (
    'd8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000003',
    'NATIONAL-EXTERNAL', 'pickup', 'EXT-3', 'عدن', null, null, false, false
  ),
  (
    'd8000000-0000-4000-8000-000000000004', 'd8000000-0000-4000-8000-000000000004',
    null, null, null, null, null, null, true, false
  );

insert into storage.objects (id, bucket_id, name, owner, metadata)
values (
  '83000000-0000-4000-8000-000000000001',
  'delivery-onboarding-documents',
  'd8000000-0000-4000-8000-000000000002/onboarding/national-id-81000000-0000-4000-8000-000000000001.jpg',
  'd8000000-0000-4000-8000-000000000002',
  '{"mimetype":"image/jpeg","size":"2048"}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_delivery_application(
      'd8000000-0000-4000-8000-000000000004', true, null, 1
    )$$,
  'replaying an old approval does not subject the legacy courier to new evidence requirements'
);
select ok(
  (select (payload ->> 'is_approved')::boolean
   from public.admin_list_drivers('approved') as driver(payload)
   where payload ->> 'id' = 'd8000000-0000-4000-8000-000000000004'),
  'legacy courier remains approved'
);
select throws_ok(
  $$select public.review_delivery_application(
      'd8000000-0000-4000-8000-000000000001', true,
      'External verification note long enough for evidence fallback.', 1
    )$$,
  '22023', 'delivery approval requires complete core profile fields',
  'external evidence cannot bypass missing core delivery profile fields'
);
select throws_ok(
  $$select public.review_delivery_application(
      'd8000000-0000-4000-8000-000000000003', true, 'too short', 1
    )$$,
  '22023',
  'approval requires both stored delivery documents or an external verification note of at least 20 characters',
  'approval without both documents requires a meaningful external verification note'
);
select throws_ok(
  $$select public.review_delivery_application(
      'd8000000-0000-4000-8000-000000000002', true, null, 1
    )$$,
  'P0002', 'delivery document is missing or not owned',
  'stored document paths do not count when one private object is missing'
);
reset role;

-- Simulate a courier changing a reviewed field after the admin opened revision 1.
update public.delivery_profiles
set vehicle_plate = 'DOC-2-UPDATED'
where id = 'd8000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.review_delivery_application(
      'd8000000-0000-4000-8000-000000000002', true, null, 1
    )$$,
  '40001', 'delivery application changed since review; reload the evidence',
  'approval fails closed when the profile revision changed after the admin snapshot'
);
reset role;

insert into storage.objects (id, bucket_id, name, owner, metadata)
values (
  '83000000-0000-4000-8000-000000000002',
  'delivery-onboarding-documents',
  'd8000000-0000-4000-8000-000000000002/onboarding/driver-license-82000000-0000-4000-8000-000000000001.png',
  'd8000000-0000-4000-8000-000000000002',
  '{"mimetype":"image/png","size":"3072"}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_delivery_application(
      'd8000000-0000-4000-8000-000000000002', true, null, 2
    )$$,
  'admin approves a complete courier after both owned private objects survive validation'
);
select is(
  (select payload ->> 'is_approved'
   from public.admin_list_drivers('approved') as driver(payload)
   where payload ->> 'id' = 'd8000000-0000-4000-8000-000000000002'),
  'true',
  'document-backed approval is persisted'
);
select is(
  (select details ->> 'verification_method'
   from public.admin_activity_logs
   where target_type = 'delivery_profile'
     and target_id = 'd8000000-0000-4000-8000-000000000002'
   order by created_at desc limit 1),
  'private_documents',
  'document-backed approval records its verification method in the audit log'
);
select lives_ok(
  $$select public.review_delivery_application(
      'd8000000-0000-4000-8000-000000000003', true,
      'Verified against the external government registry.', 1
    )$$,
  'admin may use a documented external verification instead of private images'
);
select is(
  (select payload ->> 'approval_review_reason'
   from public.admin_list_drivers('approved') as driver(payload)
   where payload ->> 'id' = 'd8000000-0000-4000-8000-000000000003'),
  'Verified against the external government registry.',
  'external verification evidence is retained on the profile review record'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd8000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.update_my_delivery_profile('{"vehicle_plate":"REPLACED-AFTER-APPROVAL"}'::jsonb)$$,
  '22023', 'approved delivery identity changes require admin re-verification',
  'approved courier cannot change reviewed vehicle identity without re-verification'
);
select is(
  (with changed as (
     update storage.objects
     set metadata = '{"mimetype":"image/jpeg","size":"4096"}'::jsonb
     where bucket_id = 'delivery-onboarding-documents'
       and name = 'd8000000-0000-4000-8000-000000000002/onboarding/national-id-81000000-0000-4000-8000-000000000001.jpg'
     returning 1
   ) select count(*) from changed),
  0::bigint,
  'approved courier cannot replace the private identity evidence after review'
);
reset role;

select * from finish();
rollback;
