-- ============================================================
-- MARKETPLACE — Initial Schema
-- يُشغَّل قبل migration الـ RLS
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('customer', 'merchant', 'delivery', 'admin');
CREATE TYPE vehicle_type_enum AS ENUM ('motorcycle', 'car', 'bicycle');
CREATE TYPE order_status_enum AS ENUM (
  'pending', 'confirmed', 'preparing', 'ready', 'assigned',
  'picked_up', 'on_the_way', 'delivered', 'cancelled', 'returned',
  'failed_delivery', 'rescheduled', 'partial_delivery', 'disputed'
);
CREATE TYPE payment_method_enum AS ENUM (
  'cash', 'card', 'wallet', 'cod', 'jawali', 'one_cash',
  'cash_wallet', 'floosak', 'jaib', 'kuraimi'
);
CREATE TYPE payment_status_enum AS ENUM ('pending', 'paid', 'refunded');
CREATE TYPE notification_channel_enum AS ENUM ('push', 'sms', 'email', 'in_app');
CREATE TYPE wallet_tx_type_enum AS ENUM ('credit', 'debit');
CREATE TYPE wallet_tx_status_enum AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE complaint_status_enum AS ENUM ('open', 'in_review', 'resolved', 'closed');
CREATE TYPE refund_status_enum AS ENUM ('pending', 'approved', 'rejected', 'processed');

-- ============================================================
-- TRIGGER FUNCTION: auto update_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS  (mirror of auth.users)
-- ============================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  phone       TEXT,
  full_name   TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT,
  role        user_role NOT NULL DEFAULT 'customer',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  admin_role_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user row on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, phone, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- MERCHANT PROFILES
-- id = user's auth UUID (same as user_id, 1-to-1)
-- ============================================================
CREATE TABLE merchant_profiles (
  id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_name          TEXT NOT NULL,
  store_slug          TEXT NOT NULL UNIQUE,
  store_logo_url      TEXT,
  store_banner_url    TEXT,
  store_description   TEXT,
  store_category      TEXT,
  commercial_register TEXT,
  address             TEXT,
  city                TEXT,
  latitude            NUMERIC,
  longitude           NUMERIC,
  rating              NUMERIC NOT NULL DEFAULT 0,
  total_reviews       INTEGER NOT NULL DEFAULT 0,
  is_approved         BOOLEAN NOT NULL DEFAULT false,
  commission_rate     NUMERIC NOT NULL DEFAULT 10,
  bank_account        TEXT,
  bank_name           TEXT,
  service_area_ids    TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mp_id_matches_user CHECK (id = user_id)
);

-- ============================================================
-- DELIVERY PROFILES
-- id = user's auth UUID (same as user_id, 1-to-1)
-- ============================================================
CREATE TABLE delivery_profiles (
  id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  national_id       TEXT,
  vehicle_type      vehicle_type_enum,
  vehicle_plate     TEXT,
  current_latitude  NUMERIC,
  current_longitude NUMERIC,
  is_online         BOOLEAN NOT NULL DEFAULT false,
  is_approved       BOOLEAN NOT NULL DEFAULT false,
  rating            NUMERIC NOT NULL DEFAULT 0,
  total_deliveries  INTEGER NOT NULL DEFAULT 0,
  wallet_balance    NUMERIC NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dp_id_matches_user CHECK (id = user_id)
);

-- ============================================================
-- CUSTOMER PROFILES
-- ============================================================
CREATE TABLE customer_profiles (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  wallet_balance NUMERIC NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ADDRESSES
-- ============================================================
CREATE TABLE addresses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT 'home',
  full_address TEXT NOT NULL,
  city         TEXT,
  area         TEXT,
  latitude     NUMERIC,
  longitude    NUMERIC,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  name_ar     TEXT,
  icon_url    TEXT,
  parent_id   UUID REFERENCES categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id),
  name            TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  description_ar  TEXT,
  base_price      NUMERIC NOT NULL DEFAULT 0,
  sale_price      NUMERIC,
  sku             TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_approved     BOOLEAN NOT NULL DEFAULT false,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  weight          NUMERIC,
  total_sold      INTEGER NOT NULL DEFAULT 0,
  rating          NUMERIC NOT NULL DEFAULT 0,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  share_url       TEXT,
  og_image_url    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_products_merchant   ON products(merchant_id);
CREATE INDEX idx_products_category   ON products(category_id);
CREATE INDEX idx_products_is_active  ON products(is_active);
CREATE INDEX idx_products_name_trgm  ON products USING gin(name gin_trgm_ops);

CREATE TABLE product_variants (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  name_ar        TEXT,
  price_modifier NUMERIC NOT NULL DEFAULT 0,
  sku            TEXT,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_text    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id    UUID NOT NULL REFERENCES products(id),
  variant_id    UUID REFERENCES product_variants(id),
  change_amount INTEGER NOT NULL,
  reason        TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CARTS
-- ============================================================
CREATE TABLE carts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, merchant_id)
);

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_cart_user ON carts(user_id);

CREATE TABLE cart_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id    UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE order_groups (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID NOT NULL REFERENCES users(id),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number             TEXT NOT NULL UNIQUE,
  customer_id              UUID NOT NULL REFERENCES users(id),
  merchant_id              UUID NOT NULL REFERENCES users(id),
  delivery_id              UUID REFERENCES users(id),
  address_id               UUID NOT NULL REFERENCES addresses(id),
  group_id                 UUID REFERENCES order_groups(id),
  status                   order_status_enum NOT NULL DEFAULT 'pending',
  subtotal                 NUMERIC,
  delivery_fee             NUMERIC NOT NULL DEFAULT 0,
  discount_amount          NUMERIC NOT NULL DEFAULT 0,
  platform_commission      NUMERIC,
  tax_amount               NUMERIC NOT NULL DEFAULT 0,
  total_amount             NUMERIC,
  payment_method           payment_method_enum,
  payment_status           payment_status_enum NOT NULL DEFAULT 'pending',
  coupon_id                UUID,
  notes                    TEXT,
  is_scheduled             BOOLEAN NOT NULL DEFAULT false,
  scheduled_at             TIMESTAMPTZ,
  estimated_delivery_time  TIMESTAMPTZ,
  delivered_at             TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  cancel_reason            TEXT,
  cancellation_reason_id   UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_merchant  ON orders(merchant_id);
CREATE INDEX idx_orders_delivery  ON orders(delivery_id);
CREATE INDEX idx_orders_status    ON orders(status);
CREATE INDEX idx_orders_created   ON orders(created_at DESC);

CREATE TABLE order_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  variant_id       UUID REFERENCES product_variants(id),
  quantity         INTEGER NOT NULL DEFAULT 1,
  unit_price       NUMERIC NOT NULL DEFAULT 0,
  total_price      NUMERIC NOT NULL DEFAULT 0,
  product_snapshot JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_tracking (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     order_status_enum NOT NULL,
  note       TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COUPONS
-- ============================================================
CREATE TABLE coupons (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code           TEXT NOT NULL UNIQUE,
  discount_type  TEXT NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  min_order_amount NUMERIC,
  max_uses       INTEGER,
  used_count     INTEGER NOT NULL DEFAULT 0,
  merchant_id    UUID REFERENCES users(id),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coupon_usage (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id  UUID NOT NULL REFERENCES coupons(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  order_id   UUID NOT NULL REFERENCES orders(id),
  used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ADVERTISEMENTS
-- ============================================================
CREATE TABLE advertisements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  image_url   TEXT NOT NULL,
  link_url    TEXT,
  target_type TEXT,
  target_id   UUID,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID NOT NULL REFERENCES users(id),
  merchant_id  UUID REFERENCES users(id),
  delivery_id  UUID REFERENCES users(id),
  product_id   UUID REFERENCES products(id),
  order_id     UUID REFERENCES orders(id),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT,
  body          TEXT,
  type          TEXT,
  data          JSONB,
  is_read       BOOLEAN NOT NULL DEFAULT false,
  channel       notification_channel_enum NOT NULL DEFAULT 'in_app',
  sent_at       TIMESTAMPTZ,
  failed_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- WALLET TRANSACTIONS
-- ============================================================
CREATE TABLE wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id),
  type          wallet_tx_type_enum NOT NULL,
  amount        NUMERIC NOT NULL DEFAULT 0,
  balance_after NUMERIC NOT NULL DEFAULT 0,
  description   TEXT,
  reference_id  UUID,
  status        wallet_tx_status_enum NOT NULL DEFAULT 'completed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_user ON wallet_transactions(user_id);

-- ============================================================
-- DELIVERY ZONES
-- ============================================================
CREATE TABLE delivery_zones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  name_ar     TEXT,
  city        TEXT NOT NULL,
  base_fee    NUMERIC NOT NULL DEFAULT 0,
  per_km_fee  NUMERIC NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PLATFORM SETTINGS
-- ============================================================
CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPLAINTS
-- ============================================================
CREATE TABLE complaints (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id),
  order_id       UUID REFERENCES orders(id),
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  attachment_url TEXT,
  status         complaint_status_enum NOT NULL DEFAULT 'open',
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CHAT
-- ============================================================
CREATE TABLE chat_conversations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID REFERENCES orders(id),
  participant_ids  UUID[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  body            TEXT,
  attachment_url  TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REFUND REQUESTS
-- ============================================================
CREATE TABLE refund_requests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  amount      NUMERIC NOT NULL DEFAULT 0,
  status      refund_status_enum NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WISHLISTS & STORE FOLLOWS
-- ============================================================
CREATE TABLE wishlists (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE store_follows (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, merchant_id)
);

-- ============================================================
-- OTP CODES
-- ============================================================
CREATE TABLE otp_codes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  is_used    BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_phone ON otp_codes(phone, expires_at);

-- ============================================================
-- DEVICE TOKENS  (Push Notifications)
-- ============================================================
CREATE TABLE device_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  platform   TEXT NOT NULL DEFAULT 'unknown',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

-- ============================================================
-- VIEWS
-- ============================================================
CREATE VIEW v_order_summary AS
SELECT
  o.id,
  o.order_number,
  o.status::TEXT,
  o.total_amount,
  o.platform_commission,
  o.created_at,
  u_c.full_name  AS customer_name,
  u_c.phone      AS customer_phone,
  mp.store_name,
  u_d.full_name  AS delivery_name,
  a.full_address AS delivery_address
FROM orders o
LEFT JOIN users            u_c ON o.customer_id  = u_c.id
LEFT JOIN merchant_profiles mp  ON o.merchant_id  = mp.id
LEFT JOIN users            u_d ON o.delivery_id  = u_d.id
LEFT JOIN addresses          a  ON o.address_id   = a.id;

CREATE VIEW v_developer_earnings AS
SELECT
  DATE(created_at)         AS date,
  SUM(platform_commission) AS daily_commission,
  COUNT(*)                 AS orders_count
FROM orders
WHERE status = 'delivered' AND platform_commission IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================
-- STORAGE BUCKETS  (Public/Private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars',    'avatars',    true),
  ('products',   'products',   true),
  ('stores',     'stores',     true),
  ('orders',     'orders',     false),
  ('complaints', 'complaints', false)
ON CONFLICT (id) DO NOTHING;
