-- Enable Row Level Security on all core tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- 1. USERS: User can read their own record. Update allowed for non-sensitive fields.
CREATE POLICY "Users can view their own record" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own record" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id); -- Role field update should be prevented by a trigger or function

-- 2. PRODUCTS / CATEGORIES: Public read for active products. Merchant can write to their products.
CREATE POLICY "Public read active categories" ON categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public read active products" ON products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Merchant can view all their products" ON products
  FOR SELECT USING (auth.uid() = merchant_id);

CREATE POLICY "Merchant can insert/update their products" ON products
  FOR ALL USING (auth.uid() = merchant_id); -- is_approved should be controlled via trigger/admin

-- 3. ORDERS / ORDER_ITEMS: Only involved parties (customer, merchant, delivery) can read
CREATE POLICY "Involved parties can view orders" ON orders
  FOR SELECT USING (
    auth.uid() = customer_id OR 
    auth.uid() = merchant_id OR 
    auth.uid() = delivery_id
  );

CREATE POLICY "Involved parties can view order items" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE 
        customer_id = auth.uid() OR 
        merchant_id = auth.uid() OR 
        delivery_id = auth.uid()
    )
  );

-- No direct UPDATE or INSERT policies for customers on order status. Must go through RPC/Edge Functions

-- 4. WALLET_TRANSACTIONS: Only owner can read. Writing restricted to service_role (Edge Functions)
CREATE POLICY "Users can view their own wallet transactions" ON wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 5. PROFILES (Merchant/Delivery): Public can read. Owner can update.
CREATE POLICY "Public can view merchant profiles" ON merchant_profiles
  FOR SELECT USING (true);

CREATE POLICY "Merchant can update their profile" ON merchant_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public can view delivery profiles" ON delivery_profiles
  FOR SELECT USING (true);

CREATE POLICY "Delivery can update their profile" ON delivery_profiles
  FOR UPDATE USING (auth.uid() = id);

-- 6. REVIEWS: Public read. Customer can insert ONLY IF they have a delivered order
CREATE POLICY "Public can view reviews" ON reviews
  FOR SELECT USING (true);

CREATE POLICY "Customer can write review for delivered order" ON reviews
  FOR INSERT WITH CHECK (
    auth.uid() = customer_id AND
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.customer_id = auth.uid() 
      AND orders.status = 'delivered'
      AND (orders.merchant_id = reviews.merchant_id OR orders.delivery_id = reviews.delivery_id)
    )
  );

-- 7. COUPONS: No public list. Service role only. Checking should be done via RPC
CREATE POLICY "Only service_role can access coupons" ON coupons
  FOR ALL USING (false);

