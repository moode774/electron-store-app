begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select no_plan();

select has_column('public', 'notifications', 'push_claim_token', 'push dispatch has an internal claim token');
select has_column('public', 'notifications', 'push_claimed_at', 'push dispatch records claim time');
select has_column('public', 'notifications', 'push_dispatched_at', 'push dispatch records its external boundary');
select has_column('public', 'notifications', 'push_attempt_count', 'push dispatch counts authorized attempts');
select has_function(
  'public', 'claim_push_notification', array['uuid','uuid'],
  'push workers use a database-owned claim RPC'
);
select has_function(
  'public', 'mark_push_notification_dispatched', array['uuid','uuid'],
  'push workers commit the external dispatch boundary in the database'
);
select has_function(
  'public', 'finalize_push_notification', array['uuid','uuid','integer','text'],
  'push workers finalize outcomes through a claim-bound RPC'
);

select function_privs_are(
  'public', 'claim_push_notification', array['uuid','uuid'], 'authenticated', array[]::text[],
  'ordinary users cannot claim push notifications'
);
select function_privs_are(
  'public', 'claim_push_notification', array['uuid','uuid'], 'service_role', array['EXECUTE'],
  'only the Edge service role can claim push notifications'
);
select function_privs_are(
  'public', 'mark_push_notification_dispatched', array['uuid','uuid'], 'service_role', array['EXECUTE'],
  'only the Edge service role can commit dispatch'
);
select function_privs_are(
  'public', 'finalize_push_notification', array['uuid','uuid','integer','text'], 'service_role', array['EXECUTE'],
  'only the Edge service role can finalize dispatch'
);
select function_privs_are(
  'public', 'get_my_notification_settings', array[]::text[], 'authenticated', array['EXECUTE'],
  'signed-in users can read their notification preferences through an identity-bound RPC'
);
select function_privs_are(
  'public', 'update_my_notification_settings', array['boolean','boolean','boolean'],
  'authenticated', array['EXECUTE'],
  'signed-in users can update notification preferences through an identity-bound RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_settings', 'select')
  and not has_table_privilege('authenticated', 'public.user_settings', 'insert')
  and not has_table_privilege('authenticated', 'public.user_settings', 'update'),
  'ordinary users cannot bypass the notification-preference RPCs with table access'
);
select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'select')
  and has_column_privilege('authenticated', 'public.notifications', 'title', 'select')
  and has_column_privilege('authenticated', 'public.notifications', 'is_read', 'select')
  and not has_column_privilege('authenticated', 'public.notifications', 'push_claim_token', 'select')
  and not has_column_privilege('authenticated', 'public.notifications', 'push_dispatched_at', 'select')
  and not has_column_privilege('authenticated', 'public.notifications', 'failed_reason', 'select'),
  'notification readers see app fields without internal dispatch state'
);
select ok(
  pg_get_functiondef('public.claim_push_notification(uuid,uuid)'::regprocedure) ilike '%FOR UPDATE%'
  and pg_get_functiondef('public.claim_push_notification(uuid,uuid)'::regprocedure) ilike '%push_dispatched_at%'
  and pg_get_functiondef('public.claim_push_notification(uuid,uuid)'::regprocedure) ilike '%service role required%',
  'push claims lock the row and reject already committed dispatches'
);
select ok(
  pg_get_functiondef('public.marketplace_notify_order_event(uuid,text,text)'::regprocedure)
    ilike '%event_key, channel)%'
  and pg_get_functiondef('public.marketplace_notify_order_event(uuid,text,text)'::regprocedure)
    ilike '%' || quote_literal('push') || '%',
  'order and delivery-offer events remain eligible for device Push'
);

alter table public.users disable trigger all;
insert into public.users (
  id, email, phone, full_name, role, is_active, is_verified, is_blocked
) values (
  'b1000000-0000-4000-8000-000000000001',
  'push-test@test.invalid', '709999992', 'Push Test',
  'customer', true, true, false
)
on conflict (id) do update
set is_active = true, is_blocked = false, blocked_until = null, role = 'customer';
alter table public.users enable trigger all;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.get_my_notification_settings()->>'notifications_enabled',
  'true',
  'missing settings resolve to safe enabled defaults'
);
select is(
  public.update_my_notification_settings(false, true, false)->>'promo_notifications',
  'false',
  'the current user can save all notification categories atomically'
);
reset role;

select ok(
  (select notifications_enabled is false
          and order_notifications is true
          and promo_notifications is false
   from public.user_settings
   where user_id = 'b1000000-0000-4000-8000-000000000001'),
  'notification settings persist only on the current user row'
);

insert into public.notifications (
  id, user_id, title, body, type, data, channel
) values
  (
    'b3000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'Push one', 'Concurrency fixture', 'test', '{}'::jsonb, 'push'
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'Push two', 'Recovery fixture', 'test', '{}'::jsonb, 'push'
  );

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.mark_push_notification_dispatched(
    'b3000000-0000-4000-8000-000000000001', null
  )$$,
  '22023', 'notification and claim token are required',
  'a null token can never commit an unclaimed notification'
);
select is(
  public.claim_push_notification(
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  )->>'claimed',
  'true',
  'the first worker acquires the push claim'
);
select is(
  public.claim_push_notification(
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000002'
  )->>'reason',
  'busy',
  'a concurrent worker cannot acquire a fresh claim'
);
select is(
  public.claim_push_notification(
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  )->>'claimed',
  'true',
  'the same worker can idempotently refresh its claim'
);
select ok(
  not public.mark_push_notification_dispatched(
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000002'
  ),
  'a worker cannot commit another worker claim'
);
select ok(
  public.mark_push_notification_dispatched(
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  ),
  'the claim owner commits the dispatch boundary once'
);
select ok(
  not public.mark_push_notification_dispatched(
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001'
  ),
  'the external dispatch boundary cannot be committed twice'
);
select ok(
  public.finalize_push_notification(
    'b3000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    1,
    null
  ),
  'the claim owner finalizes an accepted Expo ticket'
);
select is(
  public.claim_push_notification(
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000003'
  )->>'claimed',
  'true',
  'a second notification can be claimed independently'
);
reset role;

select is(
  (select push_attempt_count from public.notifications
   where id = 'b3000000-0000-4000-8000-000000000001'),
  1,
  'idempotent claim refresh does not inflate the attempt count'
);
select ok(
  (select sent_at is not null and push_dispatched_at is not null
          and push_claim_token is null and failed_reason is null
   from public.notifications
   where id = 'b3000000-0000-4000-8000-000000000001'),
  'accepted delivery records success and clears the claim'
);

update public.notifications
set push_claimed_at = clock_timestamp() - interval '3 minutes'
where id = 'b3000000-0000-4000-8000-000000000002';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.claim_push_notification(
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000004'
  )->>'claimed',
  'true',
  'a stale pre-dispatch claim can be recovered safely'
);
select ok(
  public.mark_push_notification_dispatched(
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000004'
  ),
  'the recovery worker commits the dispatch boundary'
);
select ok(
  public.finalize_push_notification(
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000004',
    0,
    'no active Expo tokens'
  ),
  'a terminal push skip is finalized without claiming success'
);
select is(
  public.claim_push_notification(
    'b3000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000005'
  )->>'reason',
  'already_dispatched',
  'a finalized zero-ticket attempt cannot be dispatched again'
);
reset role;

select ok(
  (select sent_at is null and push_dispatched_at is not null
          and push_claim_token is null and push_attempt_count = 2
          and failed_reason = 'no active Expo tokens'
   from public.notifications
   where id = 'b3000000-0000-4000-8000-000000000002'),
  'terminal failure remains auditable and distinct from successful delivery'
);

select * from finish();
rollback;
