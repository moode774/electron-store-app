begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- End-to-end order lifecycle driven only through the RPCs the apps call, each
-- step executed as the real actor (customer -> merchant -> courier -> admin).
-- This is the integration contract between the three apps: an order placed by
-- a customer must reach the store, be handed to a courier with the pickup
-- code, be delivered with proof, and settle money to every party exactly once.

-- ---------------------------------------------------------------------------
-- Fixtures: one of each actor, an approved open store with one product, a
-- delivery zone for the customer's city, and an online approved courier.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('e2e00000-0000-4000-8000-00000000000a', 'e2e-admin@test.invalid'),
  ('e2e00000-0000-4000-8000-00000000000c', 'e2e-customer@test.invalid'),
  ('e2e00000-0000-4000-8000-00000000000e', 'e2e-merchant@test.invalid'),
  ('e2e00000-0000-4000-8000-00000000000d', 'e2e-courier@test.invalid')
on conflict (id) do nothing;

insert into public.users (id, email, full_name, role, is_active, is_verified, is_blocked)
values
  ('e2e00000-0000-4000-8000-00000000000a', 'e2e-admin@test.invalid', 'E2E Admin', 'admin', true, true, false),
  ('e2e00000-0000-4000-8000-00000000000c', 'e2e-customer@test.invalid', 'E2E Customer', 'customer', true, true, false),
  ('e2e00000-0000-4000-8000-00000000000e', 'e2e-merchant@test.invalid', 'E2E Merchant', 'merchant', true, true, false),
  ('e2e00000-0000-4000-8000-00000000000d', 'e2e-courier@test.invalid', 'E2E Courier', 'delivery', true, true, false)
on conflict (id) do update set
  role = excluded.role, full_name = excluded.full_name, is_active = true,
  is_verified = true, is_blocked = false;

insert into public.merchant_profiles (
  id, user_id, store_name, store_slug, address, city,
  is_approved, is_active, is_open, wallet_balance, commission_rate,
  bank_name, bank_account, bank_account_name
) values (
  'e2e00000-0000-4000-8000-00000000000e', 'e2e00000-0000-4000-8000-00000000000e',
  'E2E Store', 'e2e-store', 'Store street', 'E2E City', true, true, true, 0, 10,
  'E2E Bank', 'E2E-ACCOUNT-001', 'E2E Merchant'
);

insert into public.delivery_profiles (
  id, user_id, national_id, vehicle_type, vehicle_plate,
  is_online, is_approved, wallet_balance
) values (
  'e2e00000-0000-4000-8000-00000000000d', 'e2e00000-0000-4000-8000-00000000000d',
  'E2E-COURIER', 'motorcycle', 'E2E-1', true, true, 0
);

insert into public.addresses (id, user_id, label, full_address, city, area, is_default)
values (
  'e2e00000-0000-4000-8000-0000000000ad', 'e2e00000-0000-4000-8000-00000000000c',
  'home', 'Customer street 1', 'E2E City', 'Center', true
);

insert into public.delivery_zones (name, merchant_id, city, delivery_fee, min_order_amount, is_active, delivery_available)
values ('E2E Zone', null, 'E2E City', 1500, 0, true, true);

insert into public.products (
  id, merchant_id, name, base_price, is_active, is_approved, approval_status,
  stock_quantity, total_sold
) values (
  'e2e00000-0000-4000-8000-0000000000f1', 'e2e00000-0000-4000-8000-00000000000e',
  'E2E Product', 7000, true, true, 'approved', 100, 0
);

update public.delivery_zones set free_delivery_threshold=14000 where city='E2E City';
insert into public.coupons(id,code,type,value,is_active,merchant_id)
values ('e2e00000-0000-4000-8000-0000000000cc','DELIVERY-THRESHOLD-TEST','fixed',7001,true,
 'e2e00000-0000-4000-8000-00000000000e');
insert into public.addresses (id,user_id,label,full_address,city,area)
values ('e2e00000-0000-4000-8000-0000000000ae', 'e2e00000-0000-4000-8000-00000000000c',
 'outside','Outside street','Unserved city','Outside');
create temp table pricing (quantity integer primary key, result jsonb);
grant all on pricing to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','e2e00000-0000-4000-8000-00000000000c',true);
insert into pricing select quantity, public.place_order(
 'e2e00000-0000-4000-8000-00000000000e','e2e00000-0000-4000-8000-0000000000ad','cash',
 jsonb_build_array(jsonb_build_object('product_id','e2e00000-0000-4000-8000-0000000000f1','quantity',quantity)),
 null,null,('e2e00000-0000-4000-8000-0000000000b' || quantity)::uuid)
from generate_series(1,3) quantity;
select is((select (result->>'delivery_fee')::numeric from pricing where quantity=1),1500::numeric,'below threshold costs 1500');
select is((select (result->>'delivery_fee')::numeric from pricing where quantity=2),1500::numeric,'exactly 14000 still costs 1500');
select is((select (result->>'delivery_fee')::numeric from pricing where quantity=3),0::numeric,'above threshold costs zero');
select is((select (result->>'total')::numeric from pricing where quantity=3),21000::numeric,'free delivery is reflected in stored total');
select is((public.place_order(
 'e2e00000-0000-4000-8000-00000000000e','e2e00000-0000-4000-8000-0000000000ad','cash',
 '[{"product_id":"e2e00000-0000-4000-8000-0000000000f1","quantity":3}]',
 'DELIVERY-THRESHOLD-TEST',null,'e2e00000-0000-4000-8000-0000000000b5')->>'delivery_fee')::numeric,
 1500::numeric,'discount reducing net products below threshold restores delivery fee');
select throws_ok($$select public.place_order(
 'e2e00000-0000-4000-8000-00000000000e','e2e00000-0000-4000-8000-0000000000ae','cash',
 '[{"product_id":"e2e00000-0000-4000-8000-0000000000f1","quantity":1}]',null,null,
 'e2e00000-0000-4000-8000-0000000000b4')$$,'P0001','DELIVERY_NOT_AVAILABLE','unserved city is rejected');
select throws_ok($$select public.admin_save_delivery_zone(null,'Test',1,1,0,true,true)$$,
 'P0001','ADMIN_REQUIRED','customer cannot change delivery pricing');
reset role;
select set_config('request.jwt.claim.sub','e2e00000-0000-4000-8000-00000000000a',true);
select lives_ok($$select public.admin_save_delivery_zone(null,'New test city',1500,14000,0,true,true)$$,'admin may add coverage');
select is((select count(*) from public.admin_activity_logs where action='delivery_zone_saved'),1::bigint,'pricing edit writes an audit record');
select throws_ok($$select public.admin_save_delivery_zone(null,'Bad fee',-1,14000,0,true,true)$$,
 'P0001','INVALID_DELIVERY_ZONE','negative fee is rejected');
select ok(not has_table_privilege('authenticated','public.delivery_zones','update'),'direct pricing writes denied');
select ok(not has_function_privilege('anon','public.admin_save_delivery_zone(uuid,text,numeric,numeric,numeric,boolean,boolean)','execute'),'anonymous cannot edit prices');
select * from finish();
rollback;


