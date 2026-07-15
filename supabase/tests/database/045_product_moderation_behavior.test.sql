begin;

select plan(14);

select has_column('public', 'products', 'approval_status', 'products expose an approval state');
select col_default_is('public', 'products', 'approval_status', '''pending''::text', 'new products start pending');
select has_function('public', 'admin_list_products', array['text'], 'admin product queue RPC exists');
select has_function('public', 'admin_review_product', array['uuid','text','text'], 'admin product review RPC exists');
select has_function('public', 'get_my_product_moderation', array[]::text[], 'merchant moderation RPC exists');

select function_privs_are(
  'public', 'admin_review_product', array['uuid','text','text'], 'anon', array[]::text[],
  'anonymous users cannot review products'
);
select function_privs_are(
  'public', 'admin_review_product', array['uuid','text','text'], 'authenticated', array['EXECUTE'],
  'signed-in callers reach the role-checking review RPC'
);
select function_privs_are(
  'public', 'reset_product_approval_after_merchant_edit', array[]::text[], 'authenticated', array[]::text[],
  'catalog approval trigger is not callable through the Data API'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_approval_consistency_check'
  ),
  'approval state and approval boolean cannot diverge'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.products'::regclass
      and tgname = 'trg_reset_product_approval_after_merchant_edit'
      and not tgisinternal
  ),
  'material merchant edits return products to review'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.product_images'::regclass
      and tgname = 'trg_reset_product_approval_after_image_edit'
      and not tgisinternal
  ),
  'merchant image edits return products to review'
);

select ok(
  has_column_privilege('anon', 'public.products', 'id', 'SELECT')
  and has_column_privilege('anon', 'public.products', 'name', 'SELECT'),
  'anonymous catalog reads remain available through RLS and column grants'
);
select ok(
  not has_column_privilege('anon', 'public.products', 'approved_by', 'SELECT')
  and not has_column_privilege('anon', 'public.products', 'approval_note', 'SELECT'),
  'anonymous catalog readers cannot inspect moderation internals'
);
select ok(
  not has_column_privilege('authenticated', 'public.products', 'approved_by', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.products', 'approval_status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.products', 'approval_note', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.products', 'is_featured', 'UPDATE'),
  'merchants cannot approve or feature their own products with direct column updates'
);

select * from finish();
rollback;
