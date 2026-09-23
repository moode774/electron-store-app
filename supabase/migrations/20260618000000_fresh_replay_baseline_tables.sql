-- =============================================================
-- Fresh-replay baseline (no-op on the live project).
--
-- The live database was created partly through the dashboard. Later
-- migrations (20260619 onwards) reference tables, columns and functions
-- that were only captured by 20260710000005_backfill_missing_tables_baseline,
-- so replaying migrations on an empty database (supabase db reset, CI,
-- staging, disaster recovery) failed at 20260619000000.
--
-- This file creates those objects up-front. Every statement is
-- IF NOT EXISTS, so on the live project (where they already exist) it
-- changes nothing. Mark it applied there instead of pushing it:
--   supabase migration repair --status applied 20260618000000
-- Constraints, indexes, RLS and policies are still owned by 20260710000005.
-- =============================================================

-- ---------- (1) الجداول ----------
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid,
  action text,
  target_type text,
  target_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
  user_id uuid NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.admin_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  permissions jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.app_banners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text NOT NULL,
  target_url text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  link_url text,
  target_type text,
  target_id text
);

CREATE TABLE IF NOT EXISTS public.app_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  app_type text,
  rating integer,
  feedback text,
  app_version text,
  platform text,
  prompted_after text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  platform text,
  app_type text,
  version text NOT NULL,
  min_required_version text,
  force_update boolean DEFAULT false,
  release_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.archive_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_name text,
  records_archived integer,
  archived_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  max_radius_km integer DEFAULT 5,
  offer_timeout_seconds integer DEFAULT 30,
  max_attempts integer DEFAULT 5,
  algorithm text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auto_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  trigger_type text,
  message text NOT NULL,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  name_ar text,
  icon_url text,
  type text,
  criteria jsonb,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  blocked_by uuid,
  user_id uuid,
  reason text,
  block_type text,
  blocked_until timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.broadcast_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  target_audience text NOT NULL DEFAULT 'all'::text,
  status text NOT NULL DEFAULT 'sent'::text,
  sent_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.bundle_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bundle_id uuid,
  product_id uuid,
  variant_id uuid,
  quantity integer DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.cancellation_reasons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reason_text_ar text,
  reason_text_en text,
  applicable_to text,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.complaint_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  complaint_id uuid,
  sender_id uuid,
  message text,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.currencies (
  code text NOT NULL,
  name text,
  symbol text,
  exchange_rate numeric(10,4),
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.daily_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date,
  total_orders integer DEFAULT 0,
  completed_orders integer DEFAULT 0,
  cancelled_orders integer DEFAULT 0,
  total_revenue numeric(10,2) DEFAULT 0,
  platform_commission numeric(10,2) DEFAULT 0,
  new_customers integer DEFAULT 0,
  new_merchants integer DEFAULT 0,
  new_deliveries integer DEFAULT 0,
  active_users integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.delivery_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  total_minutes integer,
  orders_completed integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.delivery_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_id uuid,
  order_id uuid,
  base_earning numeric(10,2),
  bonus_earning numeric(10,2) DEFAULT 0,
  tip_amount numeric(10,2) DEFAULT 0,
  total_earning numeric(10,2),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_location_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_id uuid,
  order_id uuid,
  latitude numeric(10,8),
  longitude numeric(11,8),
  speed numeric(5,2),
  recorded_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_proofs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  delivery_id uuid,
  photo_url text,
  signature_url text,
  latitude numeric(10,8),
  longitude numeric(11,8),
  delivered_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.favorite_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid,
  order_id uuid,
  nickname text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.featured_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title_ar text,
  title_en text,
  section_type text,
  product_ids jsonb DEFAULT '[]'::jsonb,
  merchant_ids jsonb DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  start_time timestamptz,
  end_time timestamptz,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  flag_type text,
  severity text,
  details jsonb,
  is_resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  invoice_number text,
  customer_id uuid,
  merchant_id uuid,
  items_details jsonb,
  subtotal numeric(10,2),
  tax numeric(10,2),
  total numeric(10,2),
  pdf_url text,
  issued_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text,
  content_ar text,
  content_en text,
  version text,
  is_active boolean DEFAULT true,
  published_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.login_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  device_info jsonb,
  ip_address text,
  refresh_token text,
  is_active boolean DEFAULT true,
  last_active_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action text,
  points_awarded integer,
  min_order_amount numeric(10,2),
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text,
  points integer,
  reference_id uuid,
  balance_after integer,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_windows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text,
  message_ar text,
  message_en text,
  affects text,
  start_time timestamptz,
  end_time timestamptz,
  is_active boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.merchant_daily_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  date date,
  orders_count integer DEFAULT 0,
  revenue numeric(10,2) DEFAULT 0,
  items_sold integer DEFAULT 0,
  new_customers integer DEFAULT 0,
  avg_order_value numeric(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.merchant_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  holiday_date date,
  reason text
);

CREATE TABLE IF NOT EXISTS public.merchant_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  period_start date,
  period_end date,
  gross_amount numeric(10,2),
  commission_deducted numeric(10,2),
  refunds_deducted numeric(10,2),
  net_amount numeric(10,2),
  status text,
  bank_transfer_ref text,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  plan_id uuid,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  auto_renew boolean DEFAULT true,
  payment_reference text
);

CREATE TABLE IF NOT EXISTS public.merchant_working_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  day_of_week integer,
  open_time time,
  close_time time,
  is_closed boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event text NOT NULL,
  title_ar text,
  body_ar text,
  title_en text,
  body_en text,
  channels jsonb DEFAULT '["push"]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.order_assignment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  delivery_id uuid,
  status text,
  offered_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  rejection_reason text
);

CREATE TABLE IF NOT EXISTS public.product_bundles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  name text,
  bundle_price numeric(10,2),
  original_price numeric(10,2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid,
  user_id uuid,
  platform text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_tag_relations (
  product_id uuid NOT NULL,
  tag_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  name_ar text,
  usage_count integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.product_views (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid,
  user_id uuid,
  source text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  title text,
  promotion_type text,
  discount_value numeric(10,2),
  start_time timestamptz,
  end_time timestamptz,
  max_uses integer,
  current_uses integer DEFAULT 0,
  applicable_products jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_order_id uuid,
  variant_id uuid,
  quantity integer,
  unit_cost numeric(10,2)
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  supplier_id uuid,
  status text,
  total_amount numeric(10,2),
  notes text,
  expected_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid,
  title text,
  body text,
  image_url text,
  target_type text,
  target_ids jsonb DEFAULT '[]'::jsonb,
  target_city text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_sent integer DEFAULT 0,
  total_opened integer DEFAULT 0,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  code text NOT NULL,
  total_uses integer DEFAULT 0,
  total_earned_points integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  type text,
  card_last4 text,
  card_brand text,
  card_expiry text,
  token text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.search_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  query text,
  results_count integer,
  clicked_product_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city text NOT NULL,
  country text DEFAULT 'SA'::text,
  is_active boolean DEFAULT true,
  launch_date date,
  delivery_available boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.short_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  short_code text,
  target_type text,
  target_id uuid,
  created_by uuid,
  click_count integer DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  variant_id uuid,
  merchant_id uuid,
  threshold integer DEFAULT 5,
  is_notified boolean DEFAULT false,
  last_notified_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.store_themes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  primary_color text DEFAULT '#000000'::text,
  secondary_color text,
  font_style text,
  banner_layout text,
  show_featured_products boolean DEFAULT true,
  show_categories boolean DEFAULT true,
  custom_sections jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  price_monthly numeric(10,2),
  price_yearly numeric(10,2),
  max_products integer,
  max_orders_per_month integer,
  commission_rate numeric(5,2),
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid,
  sender_id uuid,
  message text,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  subject text,
  category text,
  status text DEFAULT 'open'::text,
  priority text,
  assigned_to uuid,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  message text
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.tax_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  period_start date,
  period_end date,
  taxable_amount numeric(10,2),
  tax_collected numeric(10,2),
  report_file_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  vat_number text,
  tax_rate numeric(5,2) DEFAULT 15.00,
  tax_inclusive boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.time_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  day_of_week integer,
  slot_label text,
  start_time time,
  end_time time,
  max_orders integer DEFAULT 10,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.trending_products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid,
  score numeric(10,2),
  views_last_24h integer DEFAULT 0,
  orders_last_24h integer DEFAULT 0,
  calculated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_agreements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  document_id uuid,
  agreed_at timestamptz DEFAULT now(),
  ip_address text
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  badge_id uuid,
  earned_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid NOT NULL,
  language text DEFAULT 'ar'::text,
  notifications_enabled boolean DEFAULT true,
  order_notifications boolean DEFAULT true,
  promo_notifications boolean DEFAULT true,
  dark_mode boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  webhook_id uuid,
  event text,
  payload jsonb,
  response_status integer,
  response_body text,
  success boolean,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id uuid,
  url text NOT NULL,
  events jsonb DEFAULT '[]'::jsonb,
  secret_key text,
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);


-- ---------- Columns that exist on the live project but were never tracked ----------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS color_hex text;
