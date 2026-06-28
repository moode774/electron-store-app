-- ============================================================
-- SECURITY HARDENING: RLS lockdown + financial-integrity fixes
-- Applied to live DB 2026-06-19.
-- Safe for the client app: it accesses the DB only via api.ts,
-- which touches NONE of the 55 newly-locked tables directly.
-- SECURITY DEFINER functions/triggers bypass RLS and keep working.
-- ============================================================

-- ---- Part 1: fix permissive (always-true) INSERT policies ----
-- Clients must never mint wallet transactions or order tracking;
-- those are written by SECURITY DEFINER functions / triggers.
DROP POLICY IF EXISTS wallet_transactions_insert ON public.wallet_transactions;
DROP POLICY IF EXISTS order_tracking_insert      ON public.order_tracking;

-- Order items: insertable only for an order the caller owns.
DROP POLICY IF EXISTS order_items_insert ON public.order_items;
CREATE POLICY order_items_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid()));

-- ---- Part 2: enable RLS on every currently-exposed table ----
ALTER TABLE public.admin_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_groups               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_availability      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_views              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_holidays          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_location_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_versions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_agreements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_proofs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bundles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_assignment_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tag_relations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_links                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_windows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_sections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_ratings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_themes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_replies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_reports                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_shares             ENABLE ROW LEVEL SECURITY;

-- ---- Part 3: public-read policies for non-sensitive reference data ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'delivery_zones','loyalty_rules','promotions','merchant_holidays','app_versions',
    'currencies','subscription_plans','badges','user_badges','legal_documents',
    'product_bundles','bundle_items','product_tags','product_tag_relations','short_links',
    'maintenance_windows','trending_products','featured_sections','store_themes','time_slots'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true);', t||'_public_read', t);
  END LOOP;
END $$;
