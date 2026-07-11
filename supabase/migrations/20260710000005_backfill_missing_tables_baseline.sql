-- =============================================================
-- Baseline backfill: 67 جدولاً كانت موجودة في القاعدة البعيدة فقط
-- ولم تكن في أي migration، فكان `supabase db reset` أو أي بيئة جديدة
-- ينتج قاعدة ناقصة. هذا الملف يعيد إنشاءها كاملة (أعمدة + مفاتيح +
-- قيود + فهارس + RLS + سياسات)، مستخرَجة مباشرة من الكتالوج.
-- يعمل بعد كل تعريفات الدوال (is_admin ...) فتُحلّ كل المراجع.
-- كل الأوامر idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- (مُوثّق من الحالة الفعلية بتاريخ 2026-07-10)
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

-- ---------- (2) القيود (PK / UNIQUE / FK / CHECK) ----------
DO $$
BEGIN
  -- PKs + UNIQUEs
  ALTER TABLE public.admin_roles ADD CONSTRAINT admin_roles_name_key UNIQUE (name);
  ALTER TABLE public.daily_stats ADD CONSTRAINT daily_stats_date_key UNIQUE (date);
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);
  ALTER TABLE public.login_sessions ADD CONSTRAINT login_sessions_refresh_token_key UNIQUE (refresh_token);
  ALTER TABLE public.merchant_daily_stats ADD CONSTRAINT merchant_daily_stats_merchant_id_date_key UNIQUE (merchant_id, date);
  ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_event_key UNIQUE (event);
  ALTER TABLE public.product_tags ADD CONSTRAINT product_tags_name_key UNIQUE (name);
  ALTER TABLE public.referral_codes ADD CONSTRAINT referral_codes_code_key UNIQUE (code);
  ALTER TABLE public.short_links ADD CONSTRAINT short_links_short_code_key UNIQUE (short_code);
  ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);
  ALTER TABLE public.user_badges ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);
  ALTER TABLE public.admin_activity_logs ADD CONSTRAINT admin_activity_logs_pkey PRIMARY KEY (id);
  ALTER TABLE public.admin_permissions ADD CONSTRAINT admin_permissions_pkey PRIMARY KEY (user_id);
  ALTER TABLE public.admin_roles ADD CONSTRAINT admin_roles_pkey PRIMARY KEY (id);
  ALTER TABLE public.app_banners ADD CONSTRAINT app_banners_pkey PRIMARY KEY (id);
  ALTER TABLE public.app_ratings ADD CONSTRAINT app_ratings_pkey PRIMARY KEY (id);
  ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_pkey PRIMARY KEY (id);
  ALTER TABLE public.archive_logs ADD CONSTRAINT archive_logs_pkey PRIMARY KEY (id);
  ALTER TABLE public.assignment_settings ADD CONSTRAINT assignment_settings_pkey PRIMARY KEY (id);
  ALTER TABLE public.auto_replies ADD CONSTRAINT auto_replies_pkey PRIMARY KEY (id);
  ALTER TABLE public.badges ADD CONSTRAINT badges_pkey PRIMARY KEY (id);
  ALTER TABLE public.blocked_users ADD CONSTRAINT blocked_users_pkey PRIMARY KEY (id);
  ALTER TABLE public.broadcast_notifications ADD CONSTRAINT broadcast_notifications_pkey PRIMARY KEY (id);
  ALTER TABLE public.bundle_items ADD CONSTRAINT bundle_items_pkey PRIMARY KEY (id);
  ALTER TABLE public.cancellation_reasons ADD CONSTRAINT cancellation_reasons_pkey PRIMARY KEY (id);
  ALTER TABLE public.complaint_messages ADD CONSTRAINT complaint_messages_pkey PRIMARY KEY (id);
  ALTER TABLE public.currencies ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);
  ALTER TABLE public.daily_stats ADD CONSTRAINT daily_stats_pkey PRIMARY KEY (id);
  ALTER TABLE public.delivery_availability ADD CONSTRAINT delivery_availability_pkey PRIMARY KEY (id);
  ALTER TABLE public.delivery_earnings ADD CONSTRAINT delivery_earnings_pkey PRIMARY KEY (id);
  ALTER TABLE public.delivery_location_history ADD CONSTRAINT delivery_location_history_pkey PRIMARY KEY (id);
  ALTER TABLE public.delivery_proofs ADD CONSTRAINT delivery_proofs_pkey PRIMARY KEY (id);
  ALTER TABLE public.favorite_orders ADD CONSTRAINT favorite_orders_pkey PRIMARY KEY (id);
  ALTER TABLE public.featured_sections ADD CONSTRAINT featured_sections_pkey PRIMARY KEY (id);
  ALTER TABLE public.fraud_flags ADD CONSTRAINT fraud_flags_pkey PRIMARY KEY (id);
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
  ALTER TABLE public.legal_documents ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);
  ALTER TABLE public.login_sessions ADD CONSTRAINT login_sessions_pkey PRIMARY KEY (id);
  ALTER TABLE public.loyalty_rules ADD CONSTRAINT loyalty_rules_pkey PRIMARY KEY (id);
  ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);
  ALTER TABLE public.maintenance_windows ADD CONSTRAINT maintenance_windows_pkey PRIMARY KEY (id);
  ALTER TABLE public.merchant_daily_stats ADD CONSTRAINT merchant_daily_stats_pkey PRIMARY KEY (id);
  ALTER TABLE public.merchant_holidays ADD CONSTRAINT merchant_holidays_pkey PRIMARY KEY (id);
  ALTER TABLE public.merchant_payouts ADD CONSTRAINT merchant_payouts_pkey PRIMARY KEY (id);
  ALTER TABLE public.merchant_subscriptions ADD CONSTRAINT merchant_subscriptions_pkey PRIMARY KEY (id);
  ALTER TABLE public.merchant_working_hours ADD CONSTRAINT merchant_working_hours_pkey PRIMARY KEY (id);
  ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);
  ALTER TABLE public.order_assignment_attempts ADD CONSTRAINT order_assignment_attempts_pkey PRIMARY KEY (id);
  ALTER TABLE public.product_bundles ADD CONSTRAINT product_bundles_pkey PRIMARY KEY (id);
  ALTER TABLE public.product_shares ADD CONSTRAINT product_shares_pkey PRIMARY KEY (id);
  ALTER TABLE public.product_tag_relations ADD CONSTRAINT product_tag_relations_pkey PRIMARY KEY (product_id, tag_id);
  ALTER TABLE public.product_tags ADD CONSTRAINT product_tags_pkey PRIMARY KEY (id);
  ALTER TABLE public.product_views ADD CONSTRAINT product_views_pkey PRIMARY KEY (id);
  ALTER TABLE public.promotions ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);
  ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);
  ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);
  ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_pkey PRIMARY KEY (id);
  ALTER TABLE public.referral_codes ADD CONSTRAINT referral_codes_pkey PRIMARY KEY (id);
  ALTER TABLE public.saved_payment_methods ADD CONSTRAINT saved_payment_methods_pkey PRIMARY KEY (id);
  ALTER TABLE public.search_logs ADD CONSTRAINT search_logs_pkey PRIMARY KEY (id);
  ALTER TABLE public.service_areas ADD CONSTRAINT service_areas_pkey PRIMARY KEY (id);
  ALTER TABLE public.short_links ADD CONSTRAINT short_links_pkey PRIMARY KEY (id);
  ALTER TABLE public.stock_alerts ADD CONSTRAINT stock_alerts_pkey PRIMARY KEY (id);
  ALTER TABLE public.store_themes ADD CONSTRAINT store_themes_pkey PRIMARY KEY (id);
  ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);
  ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
  ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);
  ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
  ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);
  ALTER TABLE public.tax_reports ADD CONSTRAINT tax_reports_pkey PRIMARY KEY (id);
  ALTER TABLE public.tax_settings ADD CONSTRAINT tax_settings_pkey PRIMARY KEY (id);
  ALTER TABLE public.time_slots ADD CONSTRAINT time_slots_pkey PRIMARY KEY (id);
  ALTER TABLE public.trending_products ADD CONSTRAINT trending_products_pkey PRIMARY KEY (id);
  ALTER TABLE public.user_agreements ADD CONSTRAINT user_agreements_pkey PRIMARY KEY (id);
  ALTER TABLE public.user_badges ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);
  ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);
  ALTER TABLE public.webhook_logs ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);
  ALTER TABLE public.webhooks ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table OR duplicate_object OR invalid_table_definition THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.admin_activity_logs ADD CONSTRAINT admin_activity_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id);
  ALTER TABLE public.admin_permissions ADD CONSTRAINT admin_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE public.app_ratings ADD CONSTRAINT app_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.auto_replies ADD CONSTRAINT auto_replies_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.blocked_users ADD CONSTRAINT blocked_users_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES users(id);
  ALTER TABLE public.blocked_users ADD CONSTRAINT blocked_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.broadcast_notifications ADD CONSTRAINT broadcast_notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE public.bundle_items ADD CONSTRAINT bundle_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
  ALTER TABLE public.bundle_items ADD CONSTRAINT bundle_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id);
  ALTER TABLE public.bundle_items ADD CONSTRAINT bundle_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES product_bundles(id);
  ALTER TABLE public.complaint_messages ADD CONSTRAINT complaint_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);
  ALTER TABLE public.complaint_messages ADD CONSTRAINT complaint_messages_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES complaints(id);
  ALTER TABLE public.delivery_availability ADD CONSTRAINT delivery_availability_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES delivery_profiles(id);
  ALTER TABLE public.delivery_earnings ADD CONSTRAINT delivery_earnings_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  ALTER TABLE public.delivery_earnings ADD CONSTRAINT delivery_earnings_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES delivery_profiles(id);
  ALTER TABLE public.delivery_location_history ADD CONSTRAINT delivery_location_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  ALTER TABLE public.delivery_location_history ADD CONSTRAINT delivery_location_history_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES delivery_profiles(id);
  ALTER TABLE public.delivery_proofs ADD CONSTRAINT delivery_proofs_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES delivery_profiles(id);
  ALTER TABLE public.delivery_proofs ADD CONSTRAINT delivery_proofs_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  ALTER TABLE public.favorite_orders ADD CONSTRAINT favorite_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  ALTER TABLE public.favorite_orders ADD CONSTRAINT favorite_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id);
  ALTER TABLE public.fraud_flags ADD CONSTRAINT fraud_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id);
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  ALTER TABLE public.login_sessions ADD CONSTRAINT login_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.merchant_daily_stats ADD CONSTRAINT merchant_daily_stats_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.merchant_holidays ADD CONSTRAINT merchant_holidays_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.merchant_payouts ADD CONSTRAINT merchant_payouts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.merchant_subscriptions ADD CONSTRAINT merchant_subscriptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.merchant_subscriptions ADD CONSTRAINT merchant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
  ALTER TABLE public.merchant_working_hours ADD CONSTRAINT merchant_working_hours_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.order_assignment_attempts ADD CONSTRAINT order_assignment_attempts_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  ALTER TABLE public.order_assignment_attempts ADD CONSTRAINT order_assignment_attempts_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES delivery_profiles(id);
  ALTER TABLE public.product_bundles ADD CONSTRAINT product_bundles_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.product_shares ADD CONSTRAINT product_shares_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
  ALTER TABLE public.product_shares ADD CONSTRAINT product_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.product_tag_relations ADD CONSTRAINT product_tag_relations_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
  ALTER TABLE public.product_tag_relations ADD CONSTRAINT product_tag_relations_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES product_tags(id);
  ALTER TABLE public.product_views ADD CONSTRAINT product_views_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
  ALTER TABLE public.product_views ADD CONSTRAINT product_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.promotions ADD CONSTRAINT promotions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
  ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id);
  ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
  ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
  ALTER TABLE public.referral_codes ADD CONSTRAINT referral_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.saved_payment_methods ADD CONSTRAINT saved_payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.search_logs ADD CONSTRAINT search_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.short_links ADD CONSTRAINT short_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
  ALTER TABLE public.stock_alerts ADD CONSTRAINT stock_alerts_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id);
  ALTER TABLE public.stock_alerts ADD CONSTRAINT stock_alerts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.store_themes ADD CONSTRAINT store_themes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);
  ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id);
  ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id);
  ALTER TABLE public.tax_reports ADD CONSTRAINT tax_reports_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.tax_settings ADD CONSTRAINT tax_settings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.time_slots ADD CONSTRAINT time_slots_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
  ALTER TABLE public.trending_products ADD CONSTRAINT trending_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
  ALTER TABLE public.user_agreements ADD CONSTRAINT user_agreements_document_id_fkey FOREIGN KEY (document_id) REFERENCES legal_documents(id);
  ALTER TABLE public.user_agreements ADD CONSTRAINT user_agreements_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.user_badges ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES badges(id);
  ALTER TABLE public.user_badges ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE public.webhook_logs ADD CONSTRAINT webhook_logs_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES webhooks(id);
  ALTER TABLE public.webhooks ADD CONSTRAINT webhooks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.app_ratings ADD CONSTRAINT app_ratings_app_type_check CHECK ((app_type = ANY (ARRAY['customer'::text, 'merchant'::text, 'delivery'::text])));
  ALTER TABLE public.app_ratings ADD CONSTRAINT app_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
  ALTER TABLE public.app_ratings ADD CONSTRAINT app_ratings_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])));
  ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_app_type_check CHECK ((app_type = ANY (ARRAY['customer'::text, 'merchant'::text, 'delivery'::text])));
  ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])));
  ALTER TABLE public.assignment_settings ADD CONSTRAINT assignment_settings_algorithm_check CHECK ((algorithm = ANY (ARRAY['nearest'::text, 'rating'::text, 'least_busy'::text])));
  ALTER TABLE public.auto_replies ADD CONSTRAINT auto_replies_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['new_message'::text, 'outside_hours'::text, 'order_confirmed'::text, 'order_ready'::text])));
  ALTER TABLE public.badges ADD CONSTRAINT badges_type_check CHECK ((type = ANY (ARRAY['merchant'::text, 'delivery'::text, 'customer'::text])));
  ALTER TABLE public.blocked_users ADD CONSTRAINT blocked_users_block_type_check CHECK ((block_type = ANY (ARRAY['temporary'::text, 'permanent'::text])));
  ALTER TABLE public.cancellation_reasons ADD CONSTRAINT cancellation_reasons_applicable_to_check CHECK ((applicable_to = ANY (ARRAY['customer'::text, 'merchant'::text, 'delivery'::text, 'system'::text])));
  ALTER TABLE public.featured_sections ADD CONSTRAINT featured_sections_section_type_check CHECK ((section_type = ANY (ARRAY['flash_sale'::text, 'trending'::text, 'new_arrivals'::text, 'top_rated'::text, 'nearby_stores'::text, 'custom'::text])));
  ALTER TABLE public.fraud_flags ADD CONSTRAINT fraud_flags_flag_type_check CHECK ((flag_type = ANY (ARRAY['multiple_accounts'::text, 'fake_orders'::text, 'chargeback_abuse'::text, 'suspicious_activity'::text])));
  ALTER TABLE public.fraud_flags ADD CONSTRAINT fraud_flags_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
  ALTER TABLE public.legal_documents ADD CONSTRAINT legal_documents_type_check CHECK ((type = ANY (ARRAY['terms_customer'::text, 'terms_merchant'::text, 'terms_delivery'::text, 'privacy_policy'::text, 'refund_policy'::text])));
  ALTER TABLE public.loyalty_rules ADD CONSTRAINT loyalty_rules_action_check CHECK ((action = ANY (ARRAY['first_order'::text, 'order_complete'::text, 'review_left'::text, 'referral_success'::text, 'birthday'::text, 'daily_login'::text])));
  ALTER TABLE public.maintenance_windows ADD CONSTRAINT maintenance_windows_affects_check CHECK ((affects = ANY (ARRAY['all'::text, 'customer_app'::text, 'merchant_app'::text, 'delivery_app'::text, 'payments'::text])));
  ALTER TABLE public.merchant_payouts ADD CONSTRAINT merchant_payouts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text])));
  ALTER TABLE public.merchant_subscriptions ADD CONSTRAINT merchant_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text, 'trial'::text])));
  ALTER TABLE public.merchant_working_hours ADD CONSTRAINT merchant_working_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
  ALTER TABLE public.order_assignment_attempts ADD CONSTRAINT order_assignment_attempts_status_check CHECK ((status = ANY (ARRAY['offered'::text, 'accepted'::text, 'rejected'::text, 'timeout'::text, 'cancelled'::text])));
  ALTER TABLE public.promotions ADD CONSTRAINT promotions_promotion_type_check CHECK ((promotion_type = ANY (ARRAY['flash_sale'::text, 'buy_x_get_y'::text, 'bundle'::text, 'free_delivery'::text])));
  ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'received'::text, 'cancelled'::text])));
  ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_target_type_check CHECK ((target_type = ANY (ARRAY['all'::text, 'customers'::text, 'merchants'::text, 'delivery'::text, 'specific_city'::text, 'specific_users'::text])));
  ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sent'::text, 'failed'::text])));
  ALTER TABLE public.saved_payment_methods ADD CONSTRAINT saved_payment_methods_type_check CHECK ((type = ANY (ARRAY['card'::text, 'apple_pay'::text, 'stc_pay'::text, 'wallet'::text])));
  ALTER TABLE public.short_links ADD CONSTRAINT short_links_target_type_check CHECK ((target_type = ANY (ARRAY['product'::text, 'store'::text, 'category'::text, 'promotion'::text])));
  ALTER TABLE public.store_themes ADD CONSTRAINT store_themes_banner_layout_check CHECK ((banner_layout = ANY (ARRAY['slider'::text, 'single'::text, 'grid'::text])));
  ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'waiting_user'::text, 'resolved'::text, 'closed'::text])));
  ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check CHECK ((category = ANY (ARRAY['technical'::text, 'payment'::text, 'delivery'::text, 'account'::text, 'other'::text])));
  ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- (3) الفهارس ----------
CREATE INDEX IF NOT EXISTS idx_fk_admin_activity_logs_admin_id ON public.admin_activity_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_fk_app_ratings_user_id ON public.app_ratings (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_auto_replies_merchant_id ON public.auto_replies (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_blocked_users_user_id ON public.blocked_users (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_blocked_users_blocked_by ON public.blocked_users (blocked_by);
CREATE INDEX IF NOT EXISTS idx_fk_broadcast_notifications_created_by ON public.broadcast_notifications (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_bundle_items_bundle_id ON public.bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS idx_fk_bundle_items_product_id ON public.bundle_items (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_bundle_items_variant_id ON public.bundle_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_fk_complaint_messages_sender_id ON public.complaint_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_fk_complaint_messages_complaint_id ON public.complaint_messages (complaint_id);
CREATE INDEX IF NOT EXISTS idx_fk_delivery_availability_delivery_id ON public.delivery_availability (delivery_id);
CREATE INDEX IF NOT EXISTS idx_fk_delivery_earnings_delivery_id ON public.delivery_earnings (delivery_id);
CREATE INDEX IF NOT EXISTS idx_fk_delivery_earnings_order_id ON public.delivery_earnings (order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_location ON public.delivery_location_history (delivery_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fk_delivery_location_history_order_id ON public.delivery_location_history (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_delivery_proofs_delivery_id ON public.delivery_proofs (delivery_id);
CREATE INDEX IF NOT EXISTS idx_fk_delivery_proofs_order_id ON public.delivery_proofs (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_favorite_orders_customer_id ON public.favorite_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_favorite_orders_order_id ON public.favorite_orders (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_fraud_flags_user_id ON public.fraud_flags (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_customer_id ON public.invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_order_id ON public.invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_merchant_id ON public.invoices (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_login_sessions_user_id ON public.login_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_loyalty_transactions_user_id ON public.loyalty_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_merchant_holidays_merchant_id ON public.merchant_holidays (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_merchant_payouts_merchant_id ON public.merchant_payouts (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_merchant_subscriptions_merchant_id ON public.merchant_subscriptions (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_merchant_subscriptions_plan_id ON public.merchant_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_merchant_working_hours_merchant_id ON public.merchant_working_hours (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_order_assignment_attempts_delivery_id ON public.order_assignment_attempts (delivery_id);
CREATE INDEX IF NOT EXISTS idx_fk_order_assignment_attempts_order_id ON public.order_assignment_attempts (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_bundles_merchant_id ON public.product_bundles (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_shares_user_id ON public.product_shares (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_shares_product_id ON public.product_shares (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_tag_relations_tag_id ON public.product_tag_relations (tag_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_views_product_id ON public.product_views (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_views_user_id ON public.product_views (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_promotions_merchant_id ON public.promotions (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_order_items_purchase_order_id ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_order_items_variant_id ON public.purchase_order_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_orders_merchant_id ON public.purchase_orders (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_orders_supplier_id ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_fk_push_campaigns_created_by ON public.push_campaigns (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_referral_codes_user_id ON public.referral_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_saved_payment_methods_user_id ON public.saved_payment_methods (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_search_logs_user_id ON public.search_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_short_links_created_by ON public.short_links (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_stock_alerts_variant_id ON public.stock_alerts (variant_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_alerts_merchant_id ON public.stock_alerts (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_store_themes_merchant_id ON public.store_themes (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_suppliers_merchant_id ON public.suppliers (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_support_messages_ticket_id ON public.support_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_fk_support_messages_sender_id ON public.support_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_fk_support_tickets_user_id ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_support_tickets_assigned_to ON public.support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_fk_tax_reports_merchant_id ON public.tax_reports (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_tax_settings_merchant_id ON public.tax_settings (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_time_slots_merchant_id ON public.time_slots (merchant_id);
CREATE INDEX IF NOT EXISTS idx_fk_trending_products_product_id ON public.trending_products (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_agreements_document_id ON public.user_agreements (document_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_agreements_user_id ON public.user_agreements (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_badges_badge_id ON public.user_badges (badge_id);
CREATE INDEX IF NOT EXISTS idx_fk_webhook_logs_webhook_id ON public.webhook_logs (webhook_id);
CREATE INDEX IF NOT EXISTS idx_fk_webhooks_merchant_id ON public.webhooks (merchant_id);

-- ---------- (4) تفعيل RLS ----------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['admin_activity_logs','admin_permissions','admin_roles','app_banners','app_ratings','app_versions','archive_logs','assignment_settings','auto_replies','badges','blocked_users','broadcast_notifications','bundle_items','cancellation_reasons','complaint_messages','currencies','daily_stats','delivery_availability','delivery_earnings','delivery_location_history','delivery_proofs','favorite_orders','featured_sections','fraud_flags','invoices','legal_documents','login_sessions','loyalty_rules','loyalty_transactions','maintenance_windows','merchant_daily_stats','merchant_holidays','merchant_payouts','merchant_subscriptions','merchant_working_hours','notification_templates','order_assignment_attempts','product_bundles','product_shares','product_tag_relations','product_tags','product_views','promotions','purchase_order_items','purchase_orders','push_campaigns','referral_codes','saved_payment_methods','search_logs','service_areas','short_links','stock_alerts','store_themes','subscription_plans','suppliers','support_messages','support_tickets','system_settings','tax_reports','tax_settings','time_slots','trending_products','user_agreements','user_badges','user_settings','webhook_logs','webhooks'])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------- (5) السياسات الخاصة (own / public-read) ----------
DROP POLICY IF EXISTS "Allow admin full access admin_permissions" ON public.admin_permissions;
CREATE POLICY "Allow admin full access admin_permissions" ON public.admin_permissions FOR ALL TO public USING (public.is_admin());
DROP POLICY IF EXISTS "Allow admin full access app_banners" ON public.app_banners;
CREATE POLICY "Allow admin full access app_banners" ON public.app_banners FOR ALL TO public USING (public.is_admin());
DROP POLICY IF EXISTS "Allow public read active banners" ON public.app_banners;
CREATE POLICY "Allow public read active banners" ON public.app_banners FOR SELECT TO public USING ((is_active = true));
DROP POLICY IF EXISTS app_versions_public_read ON public.app_versions;
CREATE POLICY app_versions_public_read ON public.app_versions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS badges_public_read ON public.badges;
CREATE POLICY badges_public_read ON public.badges FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow admin full access broadcast_notifications" ON public.broadcast_notifications;
CREATE POLICY "Allow admin full access broadcast_notifications" ON public.broadcast_notifications FOR ALL TO public USING (public.is_admin());
DROP POLICY IF EXISTS bundle_items_public_read ON public.bundle_items;
CREATE POLICY bundle_items_public_read ON public.bundle_items FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS cancellation_reasons_read ON public.cancellation_reasons;
CREATE POLICY cancellation_reasons_read ON public.cancellation_reasons FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS currencies_public_read ON public.currencies;
CREATE POLICY currencies_public_read ON public.currencies FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS daily_stats_admin_read ON public.daily_stats;
CREATE POLICY daily_stats_admin_read ON public.daily_stats FOR SELECT TO public USING (public.is_admin());
DROP POLICY IF EXISTS delivery_earnings_own ON public.delivery_earnings;
CREATE POLICY delivery_earnings_own ON public.delivery_earnings FOR SELECT TO public USING ((delivery_id IN ( SELECT delivery_profiles.id FROM delivery_profiles WHERE (delivery_profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS dlh_delivery_insert ON public.delivery_location_history;
CREATE POLICY dlh_delivery_insert ON public.delivery_location_history FOR INSERT TO authenticated WITH CHECK (((delivery_id IN ( SELECT delivery_profiles.id FROM delivery_profiles WHERE (delivery_profiles.user_id = auth.uid()))) AND (EXISTS ( SELECT 1 FROM orders o WHERE ((o.id = delivery_location_history.order_id) AND (o.delivery_id = delivery_location_history.delivery_id))))));
DROP POLICY IF EXISTS dlh_parties_read ON public.delivery_location_history;
CREATE POLICY dlh_parties_read ON public.delivery_location_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM orders o WHERE ((o.id = delivery_location_history.order_id) AND ((o.customer_id = auth.uid()) OR (o.delivery_id IN ( SELECT delivery_profiles.id FROM delivery_profiles WHERE (delivery_profiles.user_id = auth.uid()))) OR (o.merchant_id IN ( SELECT merchant_profiles.id FROM merchant_profiles WHERE (merchant_profiles.user_id = auth.uid()))))))));
DROP POLICY IF EXISTS favorite_orders_own ON public.favorite_orders;
CREATE POLICY favorite_orders_own ON public.favorite_orders FOR ALL TO authenticated USING ((customer_id = auth.uid())) WITH CHECK ((customer_id = auth.uid()));
DROP POLICY IF EXISTS featured_sections_public_read ON public.featured_sections;
CREATE POLICY featured_sections_public_read ON public.featured_sections FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS legal_documents_public_read ON public.legal_documents;
CREATE POLICY legal_documents_public_read ON public.legal_documents FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS loyalty_rules_public_read ON public.loyalty_rules;
CREATE POLICY loyalty_rules_public_read ON public.loyalty_rules FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS loyalty_tx_own ON public.loyalty_transactions;
CREATE POLICY loyalty_tx_own ON public.loyalty_transactions FOR SELECT TO authenticated USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS maintenance_windows_public_read ON public.maintenance_windows;
CREATE POLICY maintenance_windows_public_read ON public.maintenance_windows FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS merchant_daily_stats_merchant_read ON public.merchant_daily_stats;
CREATE POLICY merchant_daily_stats_merchant_read ON public.merchant_daily_stats FOR SELECT TO public USING ((merchant_id IN ( SELECT merchant_profiles.id FROM merchant_profiles WHERE (merchant_profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS merchant_holidays_public_read ON public.merchant_holidays;
CREATE POLICY merchant_holidays_public_read ON public.merchant_holidays FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS merchant_payouts_insert ON public.merchant_payouts;
CREATE POLICY merchant_payouts_insert ON public.merchant_payouts FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT merchant_profiles.id FROM merchant_profiles WHERE (merchant_profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS merchant_payouts_own ON public.merchant_payouts;
CREATE POLICY merchant_payouts_own ON public.merchant_payouts FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT merchant_profiles.id FROM merchant_profiles WHERE (merchant_profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS working_hours_merchant_write ON public.merchant_working_hours;
CREATE POLICY working_hours_merchant_write ON public.merchant_working_hours FOR ALL TO authenticated USING ((merchant_id IN ( SELECT merchant_profiles.id FROM merchant_profiles WHERE (merchant_profiles.user_id = auth.uid())))) WITH CHECK ((merchant_id IN ( SELECT merchant_profiles.id FROM merchant_profiles WHERE (merchant_profiles.user_id = auth.uid()))));
DROP POLICY IF EXISTS working_hours_read ON public.merchant_working_hours;
CREATE POLICY working_hours_read ON public.merchant_working_hours FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS product_bundles_public_read ON public.product_bundles;
CREATE POLICY product_bundles_public_read ON public.product_bundles FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS product_tag_relations_public_read ON public.product_tag_relations;
CREATE POLICY product_tag_relations_public_read ON public.product_tag_relations FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS product_tags_public_read ON public.product_tags;
CREATE POLICY product_tags_public_read ON public.product_tags FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS promotions_public_read ON public.promotions;
CREATE POLICY promotions_public_read ON public.promotions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS referral_codes_own ON public.referral_codes;
CREATE POLICY referral_codes_own ON public.referral_codes FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS saved_payment_methods_own ON public.saved_payment_methods;
CREATE POLICY saved_payment_methods_own ON public.saved_payment_methods FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS service_areas_public_read ON public.service_areas;
CREATE POLICY service_areas_public_read ON public.service_areas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS short_links_public_read ON public.short_links;
CREATE POLICY short_links_public_read ON public.short_links FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS store_themes_public_read ON public.store_themes;
CREATE POLICY store_themes_public_read ON public.store_themes FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS subscription_plans_public_read ON public.subscription_plans;
CREATE POLICY subscription_plans_public_read ON public.subscription_plans FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;
CREATE POLICY support_messages_insert ON public.support_messages FOR INSERT TO public WITH CHECK ((sender_id = auth.uid()));
DROP POLICY IF EXISTS support_messages_own ON public.support_messages;
CREATE POLICY support_messages_own ON public.support_messages FOR ALL TO authenticated USING ((ticket_id IN ( SELECT support_tickets.id FROM support_tickets WHERE (support_tickets.user_id = auth.uid())))) WITH CHECK (((sender_id = auth.uid()) AND (ticket_id IN ( SELECT support_tickets.id FROM support_tickets WHERE (support_tickets.user_id = auth.uid())))));
DROP POLICY IF EXISTS support_tickets_own ON public.support_tickets;
CREATE POLICY support_tickets_own ON public.support_tickets FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Allow admin full access system_settings" ON public.system_settings;
CREATE POLICY "Allow admin full access system_settings" ON public.system_settings FOR ALL TO public USING (public.is_admin());
DROP POLICY IF EXISTS "Allow public read system_settings" ON public.system_settings;
CREATE POLICY "Allow public read system_settings" ON public.system_settings FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS time_slots_public_read ON public.time_slots;
CREATE POLICY time_slots_public_read ON public.time_slots FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS trending_products_public_read ON public.trending_products;
CREATE POLICY trending_products_public_read ON public.trending_products FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS user_badges_public_read ON public.user_badges;
CREATE POLICY user_badges_public_read ON public.user_badges FOR SELECT TO public USING (true);

-- ---------- (6) صلاحية الأدمن الكاملة على كل الجداول (تغطي الجداول أعلاه) ----------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.tablename AND policyname='admin_full_access') THEN
      EXECUTE format('CREATE POLICY admin_full_access ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()))', r.tablename);
    END IF;
  END LOOP;
END $$;
