import { supabase } from './supabaseClient';
import { TABLES } from '@marketplace/shared-utils';

// ============================================================
// TYPES
// ============================================================
export interface Category {
  id: string;
  name: string;
  name_ar: string | null;
  icon_url: string | null;
  parent_id: string | null;
  sort_order?: number;
  is_active: boolean;
}

export interface ProductSummary {
  id: string;
  merchant_id: string;
  name: string;
  name_ar: string | null;
  base_price: number;
  sale_price: number | null;
  rating: number;
  total_sold: number;
  is_active: boolean;
  is_featured: boolean;
  category_id: string | null;
  og_image_url: string | null;
  stock_quantity?: number;
  merchant_profiles?: { store_name: string } | null;
}

export interface ProductDetail {
  id: string;
  merchant_id: string;
  category_id: string | null;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  base_price: number;
  sale_price: number | null;
  sku: string | null;
  is_active: boolean;
  is_featured: boolean;
  weight: number | null;
  total_sold: number;
  rating: number;
  tags: string[];
  og_image_url: string | null;
  stock_quantity?: number;
  created_at: string;
  merchant_profiles?: { store_name: string; id: string; store_logo_url: string | null } | null;
  product_images?: { id: string; url: string; is_primary: boolean; sort_order: number }[];
  product_variants?: { id: string; size: string | null; color: string | null; color_hex: string | null; additional_price: number; stock_qty: number; is_active: boolean }[];
}

export interface StoreSummary {
  id: string;
  store_name: string;
  store_logo_url: string | null;
  store_category: string | null;
  store_description: string | null;
  city: string | null;
  rating: number;
  total_reviews: number;
  is_approved: boolean;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  full_address: string;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  total_amount: number | null;
  created_at: string;
  delivery_fee?: number;
  customer_profiles?: { full_name: string | null; phone: string | null } | null;
  merchant_profiles?: { store_name: string; address?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null } | null;
  addresses?: { full_address: string; city: string | null; latitude?: number | null; longitude?: number | null } | null;
  payment_method?: string | null;
  payment_status?: string;
}

export interface OrderDetail {
  id: string;
  order_number: string;
  merchant_id?: string;
  status: string;
  subtotal: number | null;
  delivery_fee: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number | null;
  payment_method: string | null;
  payment_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  delivery_fee_amount?: number;
  addresses?: { full_address: string; city: string | null; latitude?: number | null; longitude?: number | null } | null;
  merchant_profiles?: { store_name: string; store_logo_url: string | null } | null;
  customer?: { full_name: string | null; phone: string | null } | null;
  order_items?: {
    id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_name?: string | null;
    products?: { name: string } | null;
  }[];
}

export interface Notification {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  is_read: boolean;
  channel: string;
  created_at: string;
}

export interface WishlistItem {
  id: string;
  product_id: string;
  products?: ProductSummary | null;
}

// ============================================================
// CATEGORIES
// ============================================================
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from(TABLES.CATEGORIES)
    .select('id, name, name_ar, icon_url, parent_id, is_active')
    .eq('is_active', true)
    .is('parent_id', null)
    .order('name');
  if (error) throw error;
  return data as Category[];
}

// ============================================================
// PRODUCTS
// ============================================================
export async function getFeaturedProducts(limit = 10): Promise<ProductSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.PRODUCTS)
    .select('id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity, merchant_profiles(store_name)')
    .eq('is_active', true)
    .order('total_sold', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as ProductSummary[];
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from(TABLES.PRODUCTS)
    .select(`
      *,
      merchant_profiles(id, store_name, store_logo_url),
      product_images(id, url:image_url, is_primary, sort_order),
      product_variants(id, size, color, color_hex, additional_price, stock_qty, is_active)
    `)
    .eq('id', id)
    .single();
  if (error) return null;
  return data as unknown as ProductDetail;
}

export async function getProductsByStore(merchantId: string): Promise<ProductSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.PRODUCTS)
    .select('id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity')
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ProductSummary[];
}

export async function searchProducts(query?: string, categoryId?: string, limit = 30): Promise<ProductSummary[]> {
  let q = supabase
    .from(TABLES.PRODUCTS)
    .select('id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity, merchant_profiles(store_name)')
    .eq('is_active', true);
  if (query && query.trim()) q = q.ilike('name', `%${query.trim()}%`);
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q.order('total_sold', { ascending: false }).limit(limit);
  if (error) throw error;
  return data as unknown as ProductSummary[];
}

// ============================================================
// MERCHANT PRODUCTS (for merchant screens)
// ============================================================
export async function getMerchantProducts(merchantId: string): Promise<(ProductSummary & { stock_quantity?: number })[]> {
  const { data, error } = await supabase
    .from(TABLES.PRODUCTS)
    .select('id, merchant_id, name, base_price, sale_price, rating, total_sold, is_active, is_featured, og_image_url, stock_quantity')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as any;
}

export async function createProduct(data: {
  merchant_id: string;
  name: string;
  description?: string;
  base_price: number;
  sale_price?: number;
  category_id?: string;
  is_active?: boolean;
  tags?: string[];
}): Promise<{ id: string } | null> {
  const { data: result, error } = await supabase
    .from(TABLES.PRODUCTS)
    .insert(data)
    .select('id')
    .single();
  if (error) throw error;
  return result;
}

export async function updateProduct(id: string, updates: {
  name?: string;
  description?: string;
  base_price?: number;
  sale_price?: number | null;
  is_active?: boolean;
  is_featured?: boolean;
  tags?: string[];
}): Promise<void> {
  const { error } = await supabase
    .from(TABLES.PRODUCTS)
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.PRODUCTS)
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// STORES (merchant_profiles)
// ============================================================
export async function getStores(search?: string, limit = 30): Promise<StoreSummary[]> {
  let query = supabase
    .from(TABLES.MERCHANT_PROFILES)
    .select('id, store_name, store_logo_url, store_category, store_description, city, rating, total_reviews, is_approved')
    .eq('is_approved', true)
    .order('rating', { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`store_name.ilike.%${search}%,store_category.ilike.%${search}%,city.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as StoreSummary[];
}

export async function getStoreById(id: string): Promise<StoreSummary | null> {
  const { data, error } = await supabase
    .from(TABLES.MERCHANT_PROFILES)
    .select('id, store_name, store_logo_url, store_category, store_description, city, rating, total_reviews, is_approved')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as StoreSummary;
}

// ============================================================
// ADDRESSES
// ============================================================
export async function getAddresses(userId: string): Promise<Address[]> {
  const { data, error } = await supabase
    .from(TABLES.ADDRESSES)
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false });
  if (error) throw error;
  return data as Address[];
}

export async function createAddress(data: {
  user_id: string;
  label: string;
  full_address: string;
  city?: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  is_default?: boolean;
}): Promise<Address> {
  if (data.is_default) {
    await supabase
      .from(TABLES.ADDRESSES)
      .update({ is_default: false })
      .eq('user_id', data.user_id);
  }
  const { data: result, error } = await supabase
    .from(TABLES.ADDRESSES)
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result as Address;
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.ADDRESSES).delete().eq('id', id);
  if (error) throw error;
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  await supabase.from(TABLES.ADDRESSES).update({ is_default: false }).eq('user_id', userId);
  await supabase.from(TABLES.ADDRESSES).update({ is_default: true }).eq('id', addressId);
}

// ============================================================
// ORDERS
// ============================================================
export async function getOrders(userId: string): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, status, total_amount, created_at, payment_method, payment_status, merchant_profiles(store_name)')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as OrderSummary[];
}

export async function getOrderById(id: string): Promise<OrderDetail | null> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select(`
      id, order_number, merchant_id, status, subtotal, delivery_fee, discount_amount,
      tax_amount, total_amount, payment_method, payment_status, notes, created_at, updated_at,
      addresses(full_address, city, latitude, longitude),
      merchant_profiles(store_name, store_logo_url),
      customer:users(full_name, phone),
      order_items(id, quantity, unit_price, total_price, product_name, products(name))
    `)
    .eq('id', id)
    .single();
  if (error) return null;
  return data as unknown as OrderDetail;
}

export async function getMerchantOrders(merchantId: string): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, status, total_amount, created_at, payment_method, payment_status, customer_profiles:users(full_name, phone)')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as OrderSummary[];
}

export async function createOrder(data: {
  customer_id: string;
  merchant_id: string;
  address_id: string;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string;
  notes?: string;
  items: {
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_name?: string;
  }[];
}): Promise<{ id: string; order_number: string }> {
  const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

  const { data: order, error: orderError } = await supabase
    .from(TABLES.ORDERS)
    .insert({
      order_number: orderNumber,
      customer_id: data.customer_id,
      merchant_id: data.merchant_id,
      address_id: data.address_id,
      subtotal: data.subtotal,
      delivery_fee: data.delivery_fee,
      discount_amount: data.discount_amount,
      tax_amount: data.tax_amount,
      total_amount: data.total_amount,
      payment_method: data.payment_method,
      notes: data.notes,
      status: 'pending',
      payment_status: 'pending',
    })
    .select('id, order_number')
    .single();

  if (orderError) throw orderError;

  const orderItems = data.items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name ?? '',
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
  }));

  const { error: itemsError } = await supabase.from(TABLES.ORDER_ITEMS).insert(orderItems);
  if (itemsError) throw itemsError;

  // خصم المخزون وزيادة المبيعات لكل منتج (عبر دالة آمنة تتجاوز RLS)
  await Promise.all(
    data.items.map((item) =>
      supabase.rpc('decrement_product_stock', { p_id: item.product_id, p_qty: item.quantity })
    )
  );

  return order as { id: string; order_number: string };
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.ORDERS)
    .update({ status })
    .eq('id', orderId);
  if (error) throw error;
}

// ============================================================
// DELIVERY ORDERS (حلقة المندوب)
// ============================================================
// الطلبات الجاهزة المتاحة لأي مندوب (غير مُسندة)
export async function getAvailableDeliveryOrders(): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, status, total_amount, delivery_fee, created_at, merchant_profiles(store_name, address, city, latitude, longitude), addresses(full_address, city, latitude, longitude)')
    .eq('status', 'ready')
    .is('delivery_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as OrderSummary[];
}

// قبول طلب من قِبل المندوب (يُسنده لنفسه ويغيّر حالته إلى "في الطريق")
export async function claimDeliveryOrder(orderId: string, deliveryUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_delivery_order', {
    p_order_id: orderId,
    p_user_id: deliveryUserId,
  });
  if (error) throw error;
  return data as boolean;
}

// طلبات المندوب الحالية (المُسندة له)
export async function getDeliveryOrders(deliveryUserId: string): Promise<OrderSummary[]> {
  const { data: profile } = await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .select('id')
    .eq('user_id', deliveryUserId)
    .maybeSingle();
  if (!profile) return [];

  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, status, total_amount, delivery_fee, created_at, merchant_profiles(store_name, address, city, latitude, longitude), addresses(full_address, city, latitude, longitude)')
    .eq('delivery_id', (profile as { id: string }).id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as OrderSummary[];
}

// ============================================================
// DELIVERY ASSIGNMENT (إعدادات الإسناد ومحاولات العرض)
// ============================================================
export interface AssignmentSettings {
  max_radius_km: number;
  offer_timeout_seconds: number;
  max_attempts: number;
  algorithm: string | null;
}

export async function getAssignmentSettings(): Promise<AssignmentSettings | null> {
  const { data } = await supabase
    .from('assignment_settings')
    .select('max_radius_km, offer_timeout_seconds, max_attempts, algorithm')
    .limit(1)
    .maybeSingle();
  return (data as AssignmentSettings) ?? null;
}

// تسجيل محاولة عرض/رفض طلب على مندوب (لتتبّع توزيع الطلبات)
export async function recordAssignmentAttempt(
  orderId: string,
  deliveryUserId: string,
  status: 'offered' | 'accepted' | 'rejected' | 'expired',
  rejectionReason?: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .select('id')
    .eq('user_id', deliveryUserId)
    .maybeSingle();
  if (!profile) return;
  await supabase.from('order_assignment_attempts').insert({
    order_id: orderId,
    delivery_id: (profile as { id: string }).id,
    status,
    responded_at: status === 'offered' ? null : new Date().toISOString(),
    rejection_reason: rejectionReason ?? null,
  });
}

// تحديث موقع المندوب الحالي (يُستخدم لترتيب العروض حسب القرب)
export async function updateDeliveryLocation(
  deliveryUserId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .update({ current_latitude: latitude, current_longitude: longitude })
    .eq('user_id', deliveryUserId);
}

// ============================================================
// LIVE DELIVERY TRACKING (تتبّع موقع المندوب المباشر)
// ============================================================
export interface DeliveryLocation {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

// المندوب يكتب موقعه أثناء توصيل طلب (+ تحديث موقعه الحالي في ملفه)
export async function recordDeliveryLocation(
  deliveryUserId: string,
  orderId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const { data: profile } = await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .select('id')
    .eq('user_id', deliveryUserId)
    .maybeSingle();
  if (!profile) return;
  const deliveryId = (profile as { id: string }).id;
  await supabase.from('delivery_location_history').insert({
    delivery_id: deliveryId, order_id: orderId, latitude, longitude,
  });
  await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .update({ current_latitude: latitude, current_longitude: longitude })
    .eq('id', deliveryId);
}

// آخر موقع مسجّل لطلب (احتياطي عند تعذّر البث اللحظي)
export async function getLatestDeliveryLocation(orderId: string): Promise<DeliveryLocation | null> {
  const { data } = await supabase
    .from('delivery_location_history')
    .select('latitude, longitude, recorded_at')
    .eq('order_id', orderId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DeliveryLocation) ?? null;
}

// اشتراك لحظي بموقع المندوب لطلب معيّن — يُعيد دالة لإلغاء الاشتراك
export function subscribeToDeliveryLocation(
  orderId: string,
  onLocation: (loc: DeliveryLocation) => void,
): () => void {
  const channel = supabase
    .channel(`delivery_loc_${orderId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'delivery_location_history', filter: `order_id=eq.${orderId}` },
      (payload: { new: DeliveryLocation }) => {
        if (payload?.new) onLocation(payload.new);
      },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from(TABLES.NOTIFICATIONS)
    .select('id, title, body, type, is_read, channel, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from(TABLES.NOTIFICATIONS).update({ is_read: true }).eq('id', id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from(TABLES.NOTIFICATIONS)
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}

// ============================================================
// DEVICE TOKENS (الإشعارات الفورية)
// ============================================================
// تسجيل/تحديث رمز جهاز المستخدم لاستقبال الإشعارات الفورية
export async function registerDeviceToken(
  userId: string,
  token: string,
  deviceType: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.DEVICE_TOKENS)
    .upsert(
      { user_id: userId, token, device_type: deviceType, is_active: true },
      { onConflict: 'token' },
    );
  if (error && error.code !== '23505') {
    // لا نُفشل التطبيق بسبب الإشعارات
    console.warn('[push] registerDeviceToken failed:', error.message);
  }
}

export async function deactivateDeviceToken(token: string): Promise<void> {
  await supabase.from(TABLES.DEVICE_TOKENS).update({ is_active: false }).eq('token', token);
}

// ============================================================
// WISHLIST
// ============================================================
export async function getWishlist(userId: string): Promise<WishlistItem[]> {
  const { data, error } = await supabase
    .from(TABLES.WISHLISTS)
    .select('id, product_id, products(id, name, base_price, sale_price, rating, total_sold, og_image_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as WishlistItem[];
}

export async function addToWishlist(userId: string, productId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.WISHLISTS)
    .insert({ user_id: userId, product_id: productId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.WISHLISTS)
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);
  if (error) throw error;
}

export async function isInWishlist(userId: string, productId: string): Promise<boolean> {
  const { count } = await supabase
    .from(TABLES.WISHLISTS)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('product_id', productId);
  return (count ?? 0) > 0;
}

// ============================================================
// USER PROFILE
// ============================================================
export async function updateUserProfile(userId: string, updates: {
  full_name?: string;
  email?: string;
  avatar_url?: string;
}): Promise<void> {
  const { error } = await supabase
    .from(TABLES.USERS)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// ============================================================
// ACCOUNT STATS (شاشة حساب العميل)
// ============================================================
export async function getAccountStats(userId: string): Promise<{
  orders: number;
  coupons: number;
  addresses: number;
  favorites: number;
}> {
  const now = new Date().toISOString();
  const [ordersRes, addressesRes, favoritesRes, couponsRes] = await Promise.all([
    supabase.from(TABLES.ORDERS).select('id', { count: 'exact', head: true }).eq('customer_id', userId),
    supabase.from(TABLES.ADDRESSES).select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from(TABLES.WISHLISTS).select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('coupons').select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(`end_date.is.null,end_date.gte.${now}`),
  ]);

  return {
    orders: ordersRes.count ?? 0,
    addresses: addressesRes.count ?? 0,
    favorites: favoritesRes.count ?? 0,
    coupons: couponsRes.count ?? 0,
  };
}

// ============================================================
// SUPPORT TICKETS (الدعم والشكاوى)
// ============================================================
export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
}

export async function getSupportTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, category, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data as SupportTicket[];
}

export async function createSupportTicket(data: {
  user_id: string; subject: string; category: string; message: string;
}): Promise<void> {
  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({ user_id: data.user_id, subject: data.subject, category: data.category, status: 'open', priority: 'medium' })
    .select('id')
    .single();
  if (error) throw error;
  await supabase.from('support_messages').insert({
    ticket_id: (ticket as { id: string }).id, sender_id: data.user_id, message: data.message, is_internal: false,
  });
}

// ============================================================
// COMPLAINTS (الشكاوى — ضد متجر أو مندوب، مرتبطة بطلب)
// ============================================================
export interface Complaint {
  id: string;
  order_id: string | null;
  against_type: string | null;
  category: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  resolution: string | null;
  created_at: string;
  orders?: { order_number: string } | null;
}

export async function createComplaint(data: {
  complainant_id: string;
  order_id?: string;
  against_id?: string;
  against_type?: string; // 'merchant' | 'delivery'
  category: string;
  title: string;
  description: string;
}): Promise<void> {
  const { error } = await supabase.from(TABLES.COMPLAINTS).insert({
    complainant_id: data.complainant_id,
    order_id: data.order_id ?? null,
    against_id: data.against_id ?? null,
    against_type: data.against_type ?? null,
    category: data.category,
    title: data.title,
    description: data.description,
    status: 'open',
    priority: 'medium',
  });
  if (error) throw error;
}

export async function getMyComplaints(userId: string): Promise<Complaint[]> {
  const { data, error } = await supabase
    .from(TABLES.COMPLAINTS)
    .select('id, order_id, against_type, category, title, description, status, priority, resolution, created_at, orders(order_number)')
    .eq('complainant_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data as unknown as Complaint[];
}

// ============================================================
// LOYALTY & REFERRAL (الولاء والإحالة)
// ============================================================
export interface LoyaltyTransaction {
  id: string;
  action: string;
  points: number;
  balance_after: number | null;
  created_at: string;
}

export async function getLoyaltyPoints(userId: string): Promise<number> {
  const { data } = await supabase
    .from(TABLES.CUSTOMER_PROFILES)
    .select('loyalty_points')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { loyalty_points?: number } | null)?.loyalty_points ?? 0;
}

export async function getLoyaltyHistory(userId: string): Promise<LoyaltyTransaction[]> {
  const { data, error } = await supabase
    .from('loyalty_transactions')
    .select('id, action, points, balance_after, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return data as LoyaltyTransaction[];
}

export async function getReferralCode(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_referral', { p_user: userId });
  if (error) return '';
  return (data as string) ?? '';
}

// ============================================================
// REORDER (إعادة الطلب)
// ============================================================
export async function getReorderItems(orderId: string): Promise<{
  productId: string; name: string; price: number; quantity: number; storeId: string;
}[]> {
  const { data } = await supabase
    .from(TABLES.ORDERS)
    .select('merchant_id, order_items(product_id, product_name, quantity, unit_price)')
    .eq('id', orderId)
    .maybeSingle();
  if (!data) return [];
  const o = data as any;
  return (o.order_items ?? []).map((it: any) => ({
    productId: it.product_id,
    name: it.product_name ?? 'منتج',
    price: it.unit_price,
    quantity: it.quantity,
    storeId: o.merchant_id,
  }));
}

// ============================================================
// CANCELLATION & REFUNDS (إلغاء واسترجاع)
// ============================================================
export interface CancellationReason {
  id: string;
  reason_text_ar: string | null;
  applicable_to: string | null;
}

export async function getCancellationReasons(applicableTo = 'customer'): Promise<CancellationReason[]> {
  const { data, error } = await supabase
    .from('cancellation_reasons')
    .select('id, reason_text_ar, applicable_to')
    .eq('is_active', true)
    .in('applicable_to', [applicableTo, 'system']);
  if (error) return [];
  return data as CancellationReason[];
}

export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.ORDERS)
    .update({ status: 'cancelled', cancel_reason: reason, cancelled_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

export async function createRefundRequest(data: {
  order_id: string;
  customer_id: string;
  reason: string;
  description?: string;
  refund_amount?: number;
}): Promise<void> {
  const { error } = await supabase.from('refund_requests').insert({ ...data, status: 'pending' });
  if (error) throw error;
}

export async function getMyRefundRequests(customerId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('refund_requests')
    .select('id, order_id, reason, status, refund_amount, created_at, orders(order_number)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data as any[];
}

// ============================================================
// PRODUCT VARIANTS (خيارات المنتج)
// ============================================================
export interface ProductVariant {
  id: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  additional_price: number;
  stock_qty: number;
  is_active: boolean;
}

export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, size, color, color_hex, additional_price, stock_qty, is_active')
    .eq('product_id', productId)
    .eq('is_active', true);
  if (error) return [];
  return data as ProductVariant[];
}

// ============================================================
// MERCHANT WORKING HOURS (ساعات العمل)
// ============================================================
export interface WorkingHour {
  id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export async function getWorkingHours(merchantId: string): Promise<WorkingHour[]> {
  const { data, error } = await supabase
    .from('merchant_working_hours')
    .select('id, day_of_week, open_time, close_time, is_closed')
    .eq('merchant_id', merchantId)
    .order('day_of_week');
  if (error) return [];
  return data as WorkingHour[];
}

export async function updateWorkingHour(id: string, updates: { open_time?: string; close_time?: string; is_closed?: boolean }): Promise<void> {
  const { error } = await supabase.from('merchant_working_hours').update(updates).eq('id', id);
  if (error) throw error;
}

// ============================================================
// CHAT (محادثة عميل↔تاجر)
// ============================================================
export interface ChatConversation {
  id: string;
  order_id: string | null;
  customer_id: string;
  merchant_id: string;
  last_message: string | null;
  last_message_at: string | null;
  customer_unread: number;
  merchant_unread: number;
  merchant_user?: { full_name: string | null } | null;
  customer?: { full_name: string | null } | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message: string | null;
  message_type: string | null;
  is_read: boolean;
  created_at: string;
}

// إيجاد محادثة موجودة أو إنشاؤها (merchantUserId = user_id للتاجر)
// إن مُرّر merchant_profile.id يُحوَّل تلقائياً إلى user_id
export async function getOrCreateConversation(customerId: string, merchantRef: string, orderId?: string): Promise<string> {
  // حوّل merchant_profile.id إلى user_id إن لزم
  let merchantUserId = merchantRef;
  const { data: mp } = await supabase
    .from(TABLES.MERCHANT_PROFILES)
    .select('user_id')
    .eq('id', merchantRef)
    .maybeSingle();
  if (mp && (mp as { user_id: string }).user_id) merchantUserId = (mp as { user_id: string }).user_id;

  const { data: existing } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('merchant_id', merchantUserId)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ customer_id: customerId, merchant_id: merchantUserId, order_id: orderId ?? null, is_active: true })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getConversations(userId: string, asMerchant: boolean): Promise<ChatConversation[]> {
  const col = asMerchant ? 'merchant_id' : 'customer_id';
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, order_id, customer_id, merchant_id, last_message, last_message_at, customer_unread, merchant_unread, merchant_user:users!merchant_id(full_name), customer:users!customer_id(full_name)')
    .eq(col, userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) return [];
  return data as unknown as ChatConversation[];
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, message, message_type, is_read, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at');
  if (error) return [];
  return data as ChatMessage[];
}

export async function sendMessage(conversationId: string, senderId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, message, message_type: 'text', is_read: false });
  if (error) throw error;
}

export async function markConversationRead(conversationId: string, asMerchant: boolean): Promise<void> {
  const field = asMerchant ? { merchant_unread: 0 } : { customer_unread: 0 };
  await supabase.from('chat_conversations').update(field).eq('id', conversationId);
}

// ============================================================
// STORE FOLLOWS (متابعة المتاجر)
// ============================================================
export async function isFollowingStore(userId: string, merchantId: string): Promise<boolean> {
  const { count } = await supabase
    .from('store_follows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('merchant_id', merchantId);
  return (count ?? 0) > 0;
}

export async function followStore(userId: string, merchantId: string): Promise<void> {
  const { error } = await supabase
    .from('store_follows')
    .insert({ user_id: userId, merchant_id: merchantId });
  if (error && error.code !== '23505') throw error; // تجاهل التكرار
}

export async function unfollowStore(userId: string, merchantId: string): Promise<void> {
  const { error } = await supabase
    .from('store_follows')
    .delete()
    .eq('user_id', userId)
    .eq('merchant_id', merchantId);
  if (error) throw error;
}

export async function getStoreFollowersCount(merchantId: string): Promise<number> {
  const { count } = await supabase
    .from('store_follows')
    .select('id', { count: 'exact', head: true })
    .eq('merchant_id', merchantId);
  return count ?? 0;
}

// ============================================================
// SERVICE AREAS (مناطق الخدمة)
// ============================================================
export interface ServiceArea {
  id: string;
  city: string;
  is_active: boolean;
  delivery_available: boolean;
}

export async function getServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await supabase
    .from('service_areas')
    .select('id, city, is_active, delivery_available')
    .eq('is_active', true)
    .order('city');
  if (error) return [];
  return data as ServiceArea[];
}

// ============================================================
// COUPONS / OFFERS (العروض والكوبونات)
// ============================================================
export interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order_amount: number | null;
  end_date: string | null;
  merchant_profiles?: { store_name: string } | null;
}

// التحقق من كوبون وحساب الخصم على مبلغ معيّن
export async function validateCoupon(code: string, subtotal: number): Promise<{
  valid: boolean;
  discount: number;
  message: string;
  coupon?: Coupon;
}> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('coupons')
    .select('id, code, type, value, min_order_amount, max_discount_amount, end_date, is_active')
    .eq('code', code.trim().toUpperCase())
    .eq('is_active', true)
    .maybeSingle();

  if (!data) return { valid: false, discount: 0, message: 'كود الخصم غير صحيح' };
  const c = data as any;
  if (c.end_date && c.end_date < now) return { valid: false, discount: 0, message: 'انتهت صلاحية هذا الكود' };
  if (c.min_order_amount && subtotal < c.min_order_amount) {
    return { valid: false, discount: 0, message: `الحد الأدنى للطلب ${c.min_order_amount} ر.س` };
  }

  let discount = c.type === 'percentage' ? Math.round((subtotal * c.value) / 100) : c.value;
  if (c.max_discount_amount && discount > c.max_discount_amount) discount = c.max_discount_amount;
  if (discount > subtotal) discount = subtotal;

  return { valid: true, discount, message: `تم تطبيق خصم ${discount} ر.س`, coupon: c as Coupon };
}

export async function getActiveCoupons(): Promise<Coupon[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, type, value, min_order_amount, end_date, merchant_profiles:merchant_id(store_name)')
    .eq('is_active', true)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return data as unknown as Coupon[];
}

// ============================================================
// MERCHANT COUPONS (إدارة كوبونات التاجر)
// ============================================================
export interface MerchantCoupon {
  id: string;
  code: string;
  type: string; // 'percentage' | 'fixed'
  value: number;
  min_order_amount: number | null;
  max_discount_amount: number | null;
  usage_limit: number | null;
  usage_count: number;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getMerchantCoupons(merchantId: string): Promise<MerchantCoupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, type, value, min_order_amount, max_discount_amount, usage_limit, usage_count, end_date, is_active, created_at')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data as MerchantCoupon[];
}

export async function createCoupon(data: {
  merchant_id: string;
  code: string;
  type: string;
  value: number;
  min_order_amount?: number | null;
  max_discount_amount?: number | null;
  usage_limit?: number | null;
  end_date?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('coupons').insert({
    merchant_id: data.merchant_id,
    code: data.code.trim().toUpperCase(),
    type: data.type,
    value: data.value,
    min_order_amount: data.min_order_amount ?? null,
    max_discount_amount: data.max_discount_amount ?? null,
    usage_limit: data.usage_limit ?? null,
    end_date: data.end_date ?? null,
    is_active: true,
  });
  if (error) throw error;
}

export async function setCouponActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('coupons').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deleteCoupon(id: string): Promise<void> {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) throw error;
}

// أكثر منتجات التاجر مبيعاً
export async function getMerchantTopProducts(merchantId: string, limit = 5): Promise<{
  id: string; name: string; total_sold: number; base_price: number; sale_price: number | null; og_image_url: string | null;
}[]> {
  const { data, error } = await supabase
    .from(TABLES.PRODUCTS)
    .select('id, name, total_sold, base_price, sale_price, og_image_url')
    .eq('merchant_id', merchantId)
    .order('total_sold', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data as any;
}

// مبيعات التاجر اليومية لآخر N أيام (لرسم بياني حقيقي)
export async function getMerchantSalesChart(merchantId: string, days = 8): Promise<number[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('total_amount, created_at')
    .eq('merchant_id', merchantId)
    .gte('created_at', since.toISOString());
  if (error) return new Array(days).fill(0);

  const buckets = new Array(days).fill(0);
  (data ?? []).forEach((o: { total_amount: number | null; created_at: string }) => {
    const d = new Date(o.created_at);
    d.setHours(0, 0, 0, 0);
    const idx = Math.floor((d.getTime() - since.getTime()) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx] += o.total_amount ?? 0;
  });
  return buckets;
}

// ============================================================
// MERCHANT REPORT (تقرير التاجر لفترة: مبيعات/طلبات/متوسط/اتجاه)
// ============================================================
export interface MerchantReport {
  revenue: number;
  ordersCount: number;
  avgOrderValue: number;
  trendPct: number; // نسبة التغيّر مقارنة بالفترة السابقة
  chart: number[]; // مبيعات يومية للفترة الحالية
  labels: string[]; // تسميات الأيام/الفترات
}

// يقرأ من merchant_daily_stats (سريع ومُجمّع) إن توفّرت بيانات،
// وإلا يحسب مباشرة من الطلبات (مصدر الحقيقة).
export async function getMerchantReport(merchantId: string, days = 7): Promise<MerchantReport> {
  const now = new Date();
  const startCur = new Date(now); startCur.setDate(now.getDate() - (days - 1)); startCur.setHours(0, 0, 0, 0);
  const startPrev = new Date(startCur); startPrev.setDate(startCur.getDate() - days);

  const bucketIndex = (d: Date): number => {
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    return Math.floor((day.getTime() - startCur.getTime()) / 86400000);
  };

  const chart = new Array(days).fill(0);
  let revenue = 0, ordersCount = 0, prevRevenue = 0;

  // المسار السريع: جدول الإحصائيات اليومية المُجمّع
  const { data: stats } = await supabase
    .from('merchant_daily_stats')
    .select('date, orders_count, revenue')
    .eq('merchant_id', merchantId)
    .gte('date', startPrev.toISOString().split('T')[0]);

  if (stats && stats.length > 0) {
    (stats as { date: string; orders_count: number; revenue: number }[]).forEach((r) => {
      const d = new Date(r.date);
      if (d >= startCur) { revenue += r.revenue ?? 0; ordersCount += r.orders_count ?? 0; const i = bucketIndex(d); if (i >= 0 && i < days) chart[i] += r.revenue ?? 0; }
      else { prevRevenue += r.revenue ?? 0; }
    });
  } else {
    // الاحتساب من الطلبات
    const { data: orders } = await supabase
      .from(TABLES.ORDERS)
      .select('total_amount, created_at, status')
      .eq('merchant_id', merchantId)
      .gte('created_at', startPrev.toISOString());
    (orders ?? []).forEach((o: { total_amount: number | null; created_at: string; status: string }) => {
      if (o.status === 'cancelled') return;
      const d = new Date(o.created_at);
      const amt = o.total_amount ?? 0;
      if (d >= startCur) { revenue += amt; ordersCount += 1; const i = bucketIndex(d); if (i >= 0 && i < days) chart[i] += amt; }
      else { prevRevenue += amt; }
    });
  }

  const trendPct = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : (revenue > 0 ? 100 : 0);
  const avgOrderValue = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

  return { revenue, ordersCount, avgOrderValue, trendPct, chart, labels: [] };
}

// ============================================================
// MERCHANT STATS
// ============================================================
export async function getMerchantStats(merchantId: string): Promise<{
  todayOrders: number;
  todayRevenue: number;
  totalProducts: number;
  pendingOrders: number;
}> {
  const today = new Date().toISOString().split('T')[0];

  const [ordersRes, productsRes, pendingRes] = await Promise.all([
    supabase
      .from(TABLES.ORDERS)
      .select('total_amount')
      .eq('merchant_id', merchantId)
      .gte('created_at', today),
    supabase
      .from(TABLES.PRODUCTS)
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchantId)
      .eq('is_active', true),
    supabase
      .from(TABLES.ORDERS)
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchantId)
      .eq('status', 'pending'),
  ]);

  const todayOrders = ordersRes.data?.length ?? 0;
  const todayRevenue = ordersRes.data?.reduce((sum, o) => sum + (o.total_amount ?? 0), 0) ?? 0;

  return {
    todayOrders,
    todayRevenue,
    totalProducts: productsRes.count ?? 0,
    pendingOrders: pendingRes.count ?? 0,
  };
}

// ============================================================
// ADVERTISEMENTS (banners)
// ============================================================
export interface Advertisement {
  id: string;
  title: string;
  image_url: string;
  link_type: string | null;
  link_value: string | null;
  priority: number;
}

export async function getActiveAds(): Promise<Advertisement[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLES.ADVERTISEMENTS)
    .select('id, title, image_url, link_type, link_value, priority')
    .eq('status', 'active')
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('priority', { ascending: false });
  if (error) return [];
  return data as Advertisement[];
}

// ============================================================
// STORAGE - IMAGE UPLOAD
// ============================================================
export async function uploadImageToStorage(
  bucket: string,
  filePath: string,
  uri: string,
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(`${filePath}.${ext}`, blob, { contentType, upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

// ============================================================
// ONBOARDING - MERCHANT PROFILE
// ============================================================
export interface MerchantProfileData {
  user_id: string;
  store_name: string;
  store_slug: string;
  store_description?: string;
  store_category?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  service_area_ids?: string[];
  // owner & legal
  owner_name?: string;
  national_id?: string;
  commercial_register?: string;
  tax_number?: string;
  // contact
  store_phone?: string;
  whatsapp?: string;
  // financial
  bank_name?: string;
  bank_account?: string;
  bank_account_name?: string;
  // visual
  store_logo_url?: string;
  store_banner_url?: string;
}

export async function getMerchantProfile(userId: string): Promise<{
  id: string; store_name: string; is_approved: boolean;
  store_description?: string | null; address?: string | null; city?: string | null;
  store_logo_url?: string | null;
} | null> {
  const { data } = await supabase
    .from(TABLES.MERCHANT_PROFILES)
    .select('id, store_name, is_approved, store_description, address, city, store_logo_url')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

export async function createMerchantProfile(data: MerchantProfileData): Promise<void> {
  const { error } = await supabase.from(TABLES.MERCHANT_PROFILES).insert(data);
  if (error) throw error;
}

export async function updateMerchantProfileByUser(
  userId: string,
  updates: Partial<Omit<MerchantProfileData, 'user_id' | 'store_slug'>>,
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.MERCHANT_PROFILES)
    .update(updates)
    .eq('user_id', userId);
  if (error) throw error;
}

// ============================================================
// ONBOARDING - DELIVERY PROFILE
// ============================================================
export async function getDeliveryProfile(userId: string): Promise<{ id: string; vehicle_type: string | null; vehicle_plate: string | null; national_id: string | null; is_approved: boolean } | null> {
  const { data } = await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .select('id, vehicle_type, vehicle_plate, national_id, is_approved')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

export async function updateDeliveryProfileByUser(
  userId: string,
  updates: { vehicle_type?: string; vehicle_plate?: string },
): Promise<void> {
  const { error } = await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .update(updates)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function createDeliveryProfile(data: {
  user_id: string;
  national_id?: string;
  vehicle_type?: string;
  vehicle_plate?: string;
}): Promise<void> {
  const { error } = await supabase.from(TABLES.DELIVERY_PROFILES).insert(data);
  if (error) throw error;
}

// ============================================================
// WALLET (محفظة التاجر/المندوب/العميل)
// ============================================================
export interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  source: string | null;
  balance_after: number | null;
  notes: string | null;
  created_at: string;
}

export async function getWalletTransactions(userId: string): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, type, amount, source, balance_after, notes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as WalletTransaction[];
}

// رصيد محفظة التاجر
export async function getMerchantWalletBalance(userId: string): Promise<number> {
  const { data } = await supabase
    .from(TABLES.MERCHANT_PROFILES)
    .select('wallet_balance')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { wallet_balance?: number } | null)?.wallet_balance ?? 0;
}

// ============================================================
// DELIVERY EARNINGS (أرباح المندوب)
// ============================================================
export interface DeliveryEarning {
  id: string;
  base_earning: number;
  bonus_earning: number;
  tip_amount: number;
  total_earning: number;
  created_at: string;
}

export async function getDeliveryEarnings(deliveryUserId: string): Promise<{
  balance: number;
  totalDeliveries: number;
  earnings: DeliveryEarning[];
}> {
  const { data: profile } = await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .select('id, wallet_balance, total_deliveries')
    .eq('user_id', deliveryUserId)
    .maybeSingle();
  if (!profile) return { balance: 0, totalDeliveries: 0, earnings: [] };

  const p = profile as { id: string; wallet_balance?: number; total_deliveries?: number };
  const { data, error } = await supabase
    .from('delivery_earnings')
    .select('id, base_earning, bonus_earning, tip_amount, total_earning, created_at')
    .eq('delivery_id', p.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return {
    balance: p.wallet_balance ?? 0,
    totalDeliveries: p.total_deliveries ?? 0,
    earnings: (data ?? []) as DeliveryEarning[],
  };
}

// ============================================================
// REVIEWS (التقييمات)
// ============================================================
export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  target_type?: string;
  reviewer?: { full_name: string } | null;
}

export async function getReviews(targetId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, reviewer:reviewer_id(full_name)')
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as unknown as Review[];
}

// تقييمات كتبها المستخدم
export async function getMyReviews(userId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, target_type')
    .eq('reviewer_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Review[];
}

export async function createReview(data: {
  reviewer_id: string;
  order_id?: string;
  target_type: string;
  target_id: string;
  rating: number;
  comment?: string;
}): Promise<void> {
  const { error } = await supabase.from('reviews').insert(data);
  if (error) throw error;
}

// ============================================================
// SAVED PAYMENT METHODS (طرق الدفع)
// ============================================================
export interface PaymentMethod {
  id: string;
  type: string;
  card_last4: string | null;
  card_brand: string | null;
  card_expiry: string | null;
  is_default: boolean;
}

export async function getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('saved_payment_methods')
    .select('id, type, card_last4, card_brand, card_expiry, is_default')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as PaymentMethod[];
}

export async function addPaymentMethod(data: {
  user_id: string;
  type: string;
  card_last4?: string;
  card_brand?: string;
  card_expiry?: string;
}): Promise<void> {
  const { error } = await supabase.from('saved_payment_methods').insert(data);
  if (error) throw error;
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.from('saved_payment_methods').delete().eq('id', id);
  if (error) throw error;
}
