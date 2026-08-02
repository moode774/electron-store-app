import { supabase } from './supabaseClient';
import { TABLES } from '@marketplace/shared-utils';

const ADMIN_UPDATE_TIMEOUT_MS = 15_000;

function withRequestTimeout<T>(request: PromiseLike<T>, timeoutMs = ADMIN_UPDATE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('انتهت مهلة الاتصال بالخادم. تحقق من الإنترنت ثم حاول مرة أخرى.'));
    }, timeoutMs);

    request.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

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
  product_images?: { url: string; is_primary: boolean; sort_order: number }[];
  stock_quantity?: number;
  approval_status?: ProductApprovalStatus;
  approval_note?: string | null;
  approved_at?: string | null;
  product_variants?: { id: string; is_active?: boolean }[];
  merchant_profiles?: {
    store_name: string;
    is_active?: boolean;
    is_approved?: boolean;
    is_open?: boolean;
  } | null;
  categories?: { name: string; name_ar: string | null } | null;
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
  product_variants?: { id: string; name: string; price_modifier: number; stock_quantity: number; is_active: boolean }[];
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
  customer_id?: string | null;
  merchant_id?: string | null;
  delivery_id?: string | null;
  address_id?: string | null;
  status: string;
  total_amount: number | null;
  created_at: string;
  updated_at?: string;
  delivered_at?: string | null;
  delivery_fee?: number;
  customer_profiles?: { full_name: string | null; phone: string | null } | null;
  merchant_profiles?: { store_name: string; address?: string | null; city?: string | null } | null;
  addresses?: { full_address?: string; city: string | null } | null;
  payment_method?: string | null;
  payment_status?: string;
  order_items?: {
    id: string;
    quantity: number;
    product_name?: string;
    products?: { name: string; og_image_url?: string | null } | null;
  }[];
}

export interface OrderDetail {
  id: string;
  order_number: string;
  customer_id?: string | null;
  merchant_id?: string;
  delivery_id?: string | null;
  address_id?: string | null;
  status: string;
  subtotal: number | null;
  delivery_fee: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number | null;
  payment_method: string | null;
  payment_status: string;
  notes: string | null;
  cancel_reason?: string | null;
  created_at: string;
  updated_at: string;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  delivery_fee_amount?: number;
  addresses?: { full_address: string; city: string | null } | null;
  merchant_profiles?: { store_name: string; store_logo_url: string | null; address?: string | null; city?: string | null } | null;
  customer?: { full_name: string | null; phone: string | null } | null;
  order_items?: {
    id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_name?: string | null;
    products?: { name: string } | null;
  }[];
  order_tracking?: {
    id: string;
    status: string;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
  }[];
}

export interface Notification {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  data?: Record<string, unknown> | null;
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
    .select('id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity, product_images(url:image_url, is_primary, sort_order), merchant_profiles!inner(store_name, is_active, is_approved, is_open)')
    .eq('is_active', true)
    .eq('merchant_profiles.is_active', true)
    .eq('merchant_profiles.is_approved', true)
    .eq('merchant_profiles.is_open', true)
    .order('total_sold', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as ProductSummary[];
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from(TABLES.PRODUCTS)
    .select(`
      id, merchant_id, category_id, name, name_ar, description, description_ar,
      base_price, sale_price, sku, is_active, is_featured, weight, total_sold,
      rating, tags, og_image_url, stock_quantity, created_at,
      merchant_profiles!inner(id, store_name, store_logo_url, is_active, is_approved, is_open),
      product_images(id, url:image_url, is_primary, sort_order),
      product_variants(id, name:size, price_modifier, stock_quantity:stock_qty, is_active)
    `)
    .eq('id', id)
    .eq('is_active', true)
    .eq('merchant_profiles.is_active', true)
    .eq('merchant_profiles.is_approved', true)
    .eq('merchant_profiles.is_open', true)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ProductDetail;
}

export async function getProductsByStore(merchantId: string): Promise<ProductSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.PRODUCTS)
    .select('id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity, product_variants(id, is_active), merchant_profiles!inner(store_name, is_active, is_approved, is_open)')
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .eq('merchant_profiles.is_active', true)
    .eq('merchant_profiles.is_approved', true)
    .eq('merchant_profiles.is_open', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as ProductSummary[];
}

export async function searchProducts(query?: string, categoryId?: string, limit = 30): Promise<ProductSummary[]> {
  let q = supabase
    .from(TABLES.PRODUCTS)
    .select('id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity, merchant_profiles!inner(store_name, is_active, is_approved, is_open)')
    .eq('is_active', true)
    .eq('merchant_profiles.is_active', true)
    .eq('merchant_profiles.is_approved', true)
    .eq('merchant_profiles.is_open', true);
  if (query && query.trim()) q = q.ilike('name', `%${query.trim()}%`);
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q.order('total_sold', { ascending: false }).limit(limit);
  if (error) throw error;
  return data as unknown as ProductSummary[];
}

// ============================================================
// MERCHANT PRODUCTS (for merchant screens)
// ============================================================
export async function getMerchantProducts(merchantId: string): Promise<(ProductSummary & {
  product_variants?: { stock_quantity: number }[];
  categories?: { name: string; name_ar: string | null } | null;
})[]> {
  const [productsResult, moderation] = await Promise.all([
    supabase
      .from(TABLES.PRODUCTS)
      .select('id, merchant_id, name, name_ar, category_id, base_price, sale_price, stock_quantity, rating, total_sold, is_active, is_featured, og_image_url, categories(name, name_ar), product_variants(stock_quantity:stock_qty)')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false }),
    getMyProductModeration(),
  ]);
  const { data, error } = productsResult;
  if (error) throw error;
  const moderationByProduct = new Map(moderation.map((item) => [item.id, item]));
  return (data ?? []).map((product) => ({
    ...product,
    ...(moderationByProduct.get(product.id) ?? {
      approval_status: 'pending' as ProductApprovalStatus,
      approval_note: null,
      approved_at: null,
    }),
  })) as any;
}

/**
 * @deprecated يكتب في جدول المنتجات مباشرة بلا صور — استخدم createProductWithImages
 * التي تحفظ المنتج وصوره في معاملة واحدة ذرّية.
 */
export async function createProduct(data: {
  merchant_id: string;
  name: string;
  description?: string;
  base_price: number;
  sale_price?: number;
  category_id?: string;
  stock_quantity?: number;
  is_active?: boolean;
  tags?: string[];
  og_image_url?: string | null;
}): Promise<{ id: string } | null> {
  if (!Number.isFinite(data.base_price) || data.base_price < 0) {
    throw new Error('سعر المنتج يجب أن يكون رقمًا غير سالب.');
  }
  if (data.sale_price != null && (!Number.isFinite(data.sale_price) || data.sale_price < 0)) {
    throw new Error('سعر التخفيض يجب أن يكون رقمًا غير سالب.');
  }
  if (data.stock_quantity != null && (!Number.isInteger(data.stock_quantity) || data.stock_quantity < 0)) {
    throw new Error('المخزون يجب أن يكون عددًا صحيحًا غير سالب.');
  }
  const { data: result, error } = await supabase
    .from(TABLES.PRODUCTS)
    .insert(data)
    .select('id')
    .single();
  if (error) throw error;
  return result;
}

const PRODUCT_ERROR_MESSAGES: Record<string, string> = {
  PRODUCT_NAME_REQUIRED: 'اسم المنتج مطلوب.',
  INVALID_BASE_PRICE: 'سعر المنتج غير صالح.',
  INVALID_SALE_PRICE: 'سعر التخفيض يجب ألا يتجاوز السعر الأساسي.',
  INVALID_STOCK: 'كمية المخزون غير صالحة.',
  TOO_MANY_IMAGES: 'الحد الأقصى 10 صور للمنتج.',
  CATEGORY_NOT_FOUND: 'التصنيف المختار غير موجود.',
  MERCHANT_PROFILE_NOT_FOUND: 'لم يتم العثور على ملف المتجر المرتبط بالحساب.',
  'merchant account is not operational': 'حساب المتجر غير مفعّل حالياً.',
};

// إنشاء المنتج مع صوره في معاملة واحدة: إمّا يكتمل كل شيء أو لا يُنشأ منتج ناقص
export async function createProductWithImages(data: {
  name: string;
  base_price: number;
  description?: string;
  category_id?: string | null;
  sale_price?: number | null;
  stock_quantity?: number;
  is_active?: boolean;
  image_urls?: string[];
}): Promise<{ id: string; images: number }> {
  const { data: result, error } = await supabase.rpc('create_product_with_images', {
    p_name: data.name,
    p_base_price: data.base_price,
    p_description: data.description ?? null,
    p_category_id: data.category_id ?? null,
    p_sale_price: data.sale_price ?? null,
    p_stock_quantity: data.stock_quantity ?? 0,
    p_is_active: data.is_active ?? true,
    p_image_urls: data.image_urls ?? [],
  });
  if (error) {
    const raw = error.message ?? '';
    const match = Object.keys(PRODUCT_ERROR_MESSAGES).find((key) => raw.includes(key));
    throw new Error(match ? PRODUCT_ERROR_MESSAGES[match] : (raw || 'تعذّر حفظ المنتج.'));
  }
  return result as { id: string; images: number };
}

export async function updateProduct(id: string, updates: {
  name?: string;
  description?: string;
  base_price?: number;
  sale_price?: number | null;
  is_active?: boolean;
  tags?: string[];
}): Promise<void> {
  if (updates.base_price != null && (!Number.isFinite(updates.base_price) || updates.base_price < 0)) {
    throw new Error('سعر المنتج يجب أن يكون رقمًا غير سالب.');
  }
  if (updates.sale_price != null && (!Number.isFinite(updates.sale_price) || updates.sale_price < 0)) {
    throw new Error('سعر التخفيض يجب أن يكون رقمًا غير سالب.');
  }
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
    .eq('is_active', true)
    .eq('is_open', true)
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
    .eq('is_approved', true)
    .eq('is_active', true)
    .eq('is_open', true)
    .maybeSingle();
  if (error) throw error;
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
  // Ownership comes from auth.uid(); the RPC also serializes default changes.
  const { data: result, error } = await supabase.rpc('create_address', {
    p_label: data.label,
    p_full_address: data.full_address,
    p_city: data.city ?? null,
    p_latitude: data.latitude ?? null,
    p_longitude: data.longitude ?? null,
    p_is_default: data.is_default ?? false,
  });
  if (error) throw error;
  return result as unknown as Address;
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.ADDRESSES).delete().eq('id', id);
  if (error) throw error;
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  void userId;
  const { error } = await supabase.rpc('set_default_address', { p_address_id: addressId });
  if (error) throw error;
}

// ============================================================
// ORDERS
// ============================================================
export async function getOrders(userId: string): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, customer_id, merchant_id, delivery_id, address_id, status, total_amount, created_at, updated_at, delivered_at, payment_method, payment_status, merchant_profiles(store_name), addresses(full_address, city), order_items(id, quantity, product_name, products(name, og_image_url))')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as OrderSummary[];
}

export async function getOrderById(id: string): Promise<OrderDetail | null> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select(`
      id, order_number, customer_id, merchant_id, delivery_id, address_id, status, subtotal, delivery_fee, discount_amount,
      tax_amount, total_amount, payment_method, payment_status, notes, cancel_reason,
      delivered_at, cancelled_at, created_at, updated_at,
      addresses(full_address, city),
      merchant_profiles(store_name, store_logo_url, address, city),
      customer:users(full_name, phone),
      order_items(id, quantity, unit_price, total_price, product_name, variant_id, products(name)),
      order_tracking(id, status, notes, latitude, longitude, created_at)
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as OrderDetail;
}

export async function getMerchantOrders(merchantId: string): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, customer_id, merchant_id, delivery_id, address_id, status, total_amount, delivery_fee, created_at, updated_at, delivered_at, payment_method, payment_status, customer_profiles:users(full_name, phone), addresses(full_address, city)')
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
  coupon_code?: string;
  idempotency_key?: string;
  items: {
    product_id: string;
    variant_id?: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_name?: string;
  }[];
}): Promise<{ id: string; order_number: string }> {
  if (data.payment_method !== 'cash') {
    throw new Error('الدفع المتاح حاليًا هو الدفع عند الاستلام فقط.');
  }
  if (!data.items.length) throw new Error('السلة فارغة.');

  // لا نثق بالأسعار أو الإجماليات القادمة من الجهاز. RPC الخادم هو المسؤول
  // عن ملكية العنوان وعلاقات المتجر والمنتجات والأسعار والمخزون.
  const { data: order, error } = await supabase.rpc('place_order', {
    p_merchant_id: data.merchant_id,
    p_address_id: data.address_id,
    p_payment_method: data.payment_method,
    p_notes: data.notes ?? null,
    p_coupon_code: data.coupon_code?.trim() || null,
    p_items: data.items.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      quantity: item.quantity,
    })),
    p_idempotency_key: data.idempotency_key ?? createIdempotencyKey(),
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('inventory_logs') || msg.includes('change_type')) {
      throw new Error('حدث خطأ في تحديث سجلات المخزون. يرجى المحاولة مرة أخرى.');
    }
    if (msg.includes('MERCHANT_CLOSED')) throw new Error('هذا المتجر مغلق حالياً، حاول لاحقاً.');
    if (msg.includes('MERCHANT_UNAVAILABLE') || msg.includes('MERCHANT_NOT_FOUND'))
      throw new Error('هذا المتجر غير متاح حالياً لاستقبال الطلبات.');
    if (msg.includes('OUT_OF_STOCK')) throw new Error('نفدت كمية أحد المنتجات. حدّث السلة وحاول مجدداً.');
    if (msg.includes('INVALID_ADDRESS')) throw new Error('العنوان غير صالح لهذا الحساب. اختر عنوانًا محفوظًا وحاول مجددًا.');
    if (msg.includes('PRODUCT_UNAVAILABLE')) throw new Error('أحد المنتجات لم يعد متاحًا من هذا المتجر. حدّث السلة.');
    throw error;
  }

  if (!order || typeof order !== 'object') throw new Error('لم يُرجع الخادم بيانات الطلب.');
  return order as { id: string; order_number: string };
}

export function createIdempotencyKey(): string {
  const randomUuid = (globalThis as any)?.crypto?.randomUUID;
  if (typeof randomUuid === 'function') return randomUuid.call((globalThis as any).crypto);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function createOrderGroup(data: {
  address_id: string;
  payment_method: 'cash';
  notes?: string;
  coupon_code?: string;
  idempotency_key: string;
  stores: {
    merchant_id: string;
    items: { product_id: string; variant_id?: string | null; quantity: number }[];
  }[];
}): Promise<{ id: string; order_number: string }[]> {
  if (!data.stores.length || data.stores.some((store) => !store.items.length)) {
    throw new Error('السلة لا تحتوي على مجموعة طلبات صالحة.');
  }
  const { data: result, error } = await supabase.rpc('place_order_group', {
    p_address_id: data.address_id,
    p_payment_method: data.payment_method,
    p_stores: data.stores,
    p_coupon_code: data.coupon_code?.trim() || null,
    p_notes: data.notes?.trim() || null,
    p_idempotency_key: data.idempotency_key,
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('COUPON_INVALID') || msg.includes('INVALID_COUPON') || msg.includes('COUPON')) {
      throw new Error('كود الخصم المدخل غير صالح أو انتهت صلاحيته. احذف كود الخصم وأعد المحاولة.');
    }
    if (msg.includes('IDEMPOTENCY_CONFLICT')) throw new Error('تغيّرت بيانات الدفع بعد محاولة سابقة. راجع السلة ثم أعد المحاولة.');
    if (msg.includes('MERCHANT_CLOSED')) throw new Error('أحد المتاجر مغلق حالياً. راجع السلة وحاول لاحقاً.');
    if (msg.includes('MERCHANT_UNAVAILABLE')) throw new Error('أحد المتاجر لم يعد متاحاً لاستقبال الطلبات.');
    if (msg.includes('OUT_OF_STOCK')) throw new Error('نفدت كمية أحد المنتجات. حدّث السلة وحاول مجدداً.');
    if (msg.includes('INVALID_ADDRESS')) throw new Error('العنوان غير صالح لهذا الحساب.');
    if (msg.includes('PRODUCT_UNAVAILABLE') || msg.includes('INVALID_VARIANT')) throw new Error('أحد المنتجات أو خياراته لم يعد متاحاً. حدّث السلة.');

    if (msg.includes('inventory_logs') || msg.includes('change_type') || msg.includes('constraint')) {
      throw new Error(
        'يتطلب السيرفر تحديث قيد سجلات المخزون (inventory_logs_change_type_check) في Supabase SQL Editor للسماح بحجز الطلبات.'
      );
    }

    throw error;
  }
  const orders = Array.isArray(result) ? result : (result as any)?.orders;
  if (!Array.isArray(orders) || !orders.length) throw new Error('لم يُرجع الخادم الطلبات المنشأة.');
  return orders as { id: string; order_number: string }[];
}

// تقدير رسوم التوصيل محليًا بنفس منطق place_order في السيرفر:
// منطقة التاجر المطابقة لمدينة العنوان أولاً، وإلا منطقة المنصة العامة، وإلا 0.
// الرسوم تُحسب لكل طلب متجر على حدة ثم تُجمع.
export interface DeliveryFeeEstimate {
  total: number;
  perStore: Record<string, number>;
  /** false إذا لم تُطابق أي منطقة توصيل مدينة العنوان (السيرفر سيقرر) */
  matched: boolean;
  /** true إذا كانت المنطقة المطابقة موقوفة التوصيل — السيرفر سيرفض الطلب */
  unavailable: boolean;
}

export async function estimateDeliveryFees(
  city: string | null | undefined,
  merchantIds: string[],
): Promise<DeliveryFeeEstimate> {
  const empty: DeliveryFeeEstimate = { total: 0, perStore: {}, matched: false, unavailable: false };
  if (!city || !merchantIds.length) return empty;

  const { data, error } = await supabase
    .from(TABLES.DELIVERY_ZONES)
    .select('merchant_id, city, delivery_fee, delivery_available, is_active')
    .eq('is_active', true)
    .ilike('city', city.trim());
  if (error || !data?.length) return empty;

  const zones = data as { merchant_id: string | null; delivery_fee: number; delivery_available: boolean }[];
  const platformZone = zones.find((z) => z.merchant_id === null);
  const perStore: Record<string, number> = {};
  let total = 0;
  let matchedAny = false;
  let unavailable = false;

  for (const merchantId of merchantIds) {
    const zone = zones.find((z) => z.merchant_id === merchantId) ?? platformZone;
    if (!zone) continue;
    matchedAny = true;
    if (!zone.delivery_available) unavailable = true;
    const fee = Math.max(0, Number(zone.delivery_fee) || 0);
    perStore[merchantId] = fee;
    total += fee;
  }

  return { total, perStore, matched: matchedAny, unavailable };
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('transition_order_status', {
    p_order_id: orderId,
    p_next_status: status,
  });
  if (error) throw error;
}

// ============================================================
// DELIVERY ORDERS (حلقة المندوب)
// ============================================================
// الطلبات الجاهزة المتاحة لأي مندوب (غير مُسندة)
export async function getAvailableDeliveryOrders(): Promise<OrderSummary[]> {
  const { data, error } = await supabase.rpc('list_available_delivery_orders');
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
  const { data: profile, error: profileError } = await supabase
    .from(TABLES.DELIVERY_PROFILES)
    .select('id')
    .eq('user_id', deliveryUserId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return [];

  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, customer_id, merchant_id, delivery_id, address_id, status, total_amount, delivery_fee, created_at, updated_at, payment_method, payment_status, merchant_profiles(store_name, address, city), addresses(full_address, city)')
    .eq('delivery_id', (profile as { id: string }).id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as OrderSummary[];
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from(TABLES.NOTIFICATIONS)
    .select('id, title, body, type, data, is_read, channel, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from(TABLES.NOTIFICATIONS).update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.NOTIFICATIONS)
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

export interface NotificationPreferences {
  notifications_enabled: boolean;
  order_notifications: boolean;
  promo_notifications: boolean;
}

function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    notifications_enabled: row.notifications_enabled !== false,
    order_notifications: row.order_notifications !== false,
    promo_notifications: row.promo_notifications !== false,
  };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await withRequestTimeout(
    supabase.rpc('get_my_notification_settings'),
  );
  if (error) throw error;
  return normalizeNotificationPreferences(data);
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const { data, error } = await withRequestTimeout(
    supabase.rpc('update_my_notification_settings', {
      p_notifications_enabled: preferences.notifications_enabled,
      p_order_notifications: preferences.order_notifications,
      p_promo_notifications: preferences.promo_notifications,
    }),
  );
  if (error) throw error;
  return normalizeNotificationPreferences(data);
}

export async function registerDeviceToken(token: string, deviceType: 'ios' | 'android'): Promise<void> {
  const { error } = await supabase.rpc('register_device_token', {
    p_token: token,
    p_device_type: deviceType,
  });
  if (error) throw error;
}

export async function deactivateDeviceToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('deactivate_device_token', { p_token: token });
  if (error) throw error;
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
// ACCOUNT DELETION (متطلّب متاجر التطبيقات)
// يحذف حساب auth بالكامل عبر RPC آمنة؛ users وكل ما يتبعها
// يُحذف تلقائياً بالتسلسل (ON DELETE CASCADE)
// ============================================================
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
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
    orders: ordersRes.error ? 0 : (ordersRes.count ?? 0),
    addresses: addressesRes.error ? 0 : (addressesRes.count ?? 0),
    favorites: favoritesRes.error ? 0 : (favoritesRes.count ?? 0),
    coupons: couponsRes.error ? 0 : (couponsRes.count ?? 0),
  };
}

// ============================================================
// SUPPORT TICKETS (الدعم والشكاوى)
// ============================================================
export interface SupportTicket {
  id: string;
  user_id?: string;
  order_id?: string | null;
  subject: string;
  category: string;
  status: string;
  priority?: string | null;
  assigned_to?: string | null;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  attachments: unknown[];
  is_internal: boolean;
  created_at: string;
  users?: { full_name: string; role: string } | null;
}

export async function getSupportTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, order_id, subject, category, status, priority, assigned_to, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as SupportTicket[];
}

export async function createSupportTicket(data: {
  user_id: string; subject: string; category: string; message: string; order_id?: string;
}): Promise<string> {
  const { data: ticketId, error } = await supabase.rpc('create_support_ticket', {
    p_subject: data.subject.trim(),
    p_category: data.category,
    p_message: data.message.trim(),
    p_order_id: data.order_id ?? null,
  });
  if (error) throw error;
  return ticketId as string;
}

export async function getSupportTicketThread(ticketId: string): Promise<{
  ticket: SupportTicket;
  messages: SupportMessage[];
}> {
  const [{ data: ticket, error: ticketError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase
      .from('support_tickets')
      .select('id, user_id, order_id, subject, category, status, priority, assigned_to, created_at')
      .eq('id', ticketId)
      .single(),
    supabase
      .from('support_messages')
      .select('id, ticket_id, sender_id, message, attachments, is_internal, created_at, users(full_name, role)')
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true }),
  ]);
  if (ticketError) throw ticketError;
  if (messagesError) throw messagesError;
  return { ticket: ticket as SupportTicket, messages: (messages ?? []) as unknown as SupportMessage[] };
}

export const getAdminSupportTicketThread = getSupportTicketThread;

export async function replyToSupportTicket(ticketId: string, message: string): Promise<string> {
  const body = message.trim();
  if (!body) throw new Error('اكتب نص الرد أولًا.');
  const { data, error } = await supabase.rpc('reply_support_ticket', {
    p_ticket_id: ticketId,
    p_message: body,
  });
  if (error) throw error;
  return data as string;
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
  const { data, error } = await supabase
    .from(TABLES.CUSTOMER_PROFILES)
    .select('loyalty_points')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { loyalty_points?: number } | null)?.loyalty_points ?? 0;
}

export async function getLoyaltyHistory(userId: string): Promise<LoyaltyTransaction[]> {
  const { data, error } = await supabase
    .from('loyalty_transactions')
    .select('id, action, points, balance_after, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as LoyaltyTransaction[];
}

export async function getReferralCode(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_referral', { p_user: userId });
    if (!error && data) return data as string;
  } catch {
    // Ignore RPC missing error and fallback
  }
  return `REFD${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()}`;
}

// ============================================================
// REORDER (إعادة الطلب)
// ============================================================
export async function getReorderItems(orderId: string): Promise<{
  productId: string; variantId?: string; name: string; price: number; quantity: number;
  maxQuantity?: number; storeId: string;
}[]> {
  const { data, error } = await supabase
    .from(TABLES.ORDERS)
    .select(`
      merchant_id,
      order_items(
        product_id, variant_id, product_name, quantity, unit_price,
        products!inner(is_active, stock_quantity),
        product_variants(stock_qty, is_active)
      )
    `)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];
  const o = data as any;
  return (o.order_items ?? [])
    .filter((it: any) => {
      if (!it.products?.is_active) return false;
      if (!it.variant_id) return Number(it.products.stock_quantity ?? 0) > 0;
      return Boolean(it.product_variants?.is_active) && Number(it.product_variants.stock_qty ?? 0) > 0;
    })
    .map((it: any) => {
      const maxQuantity = Number(it.variant_id
        ? it.product_variants?.stock_qty
        : it.products?.stock_quantity) || 0;
      return {
        productId: it.product_id,
        variantId: it.variant_id ?? undefined,
        name: it.product_name ?? 'منتج',
        price: Number(it.unit_price ?? 0),
        quantity: Math.min(Number(it.quantity ?? 1), maxQuantity),
        maxQuantity,
        storeId: o.merchant_id,
      };
    });
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
  if (error) throw error;
  return data as CancellationReason[];
}

export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

export async function createRefundRequest(data: {
  order_id: string;
  customer_id: string;
  reason: string;
  description?: string;
  refund_amount?: number;
  refund_method?: 'wallet' | 'original_payment';
  evidence_images?: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('create_refund_request', {
    p_order_id: data.order_id,
    p_reason: data.reason,
    p_description: data.description?.trim() || null,
    p_refund_method: data.refund_method ?? 'original_payment',
    p_evidence_images: data.evidence_images ?? [],
  });
  if (error) throw error;
}

export type PhysicalReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'received'
  | 'inspected'
  | 'completed';

export interface PhysicalReturnItem {
  id: string;
  return_request_id: string;
  order_item_id: string;
  product_id: string;
  variant_id: string | null;
  purchased_quantity: number;
  requested_quantity: number;
  approved_quantity: number | null;
  accepted_quantity: number | null;
  unit_price: number;
  line_total: number;
  disposition: 'restock' | 'discard' | 'repair' | 'return_to_vendor' | 'rejected' | null;
  inspection_notes: string | null;
  restocked_at: string | null;
  products?: { name: string; name_ar: string | null } | null;
  order_items?: {
    product_name: string | null;
    variant_details: Record<string, string> | null;
  } | null;
}

export interface PhysicalReturnTrackingEvent {
  id: string;
  status: PhysicalReturnStatus;
  actor_role: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PhysicalReturnRequest {
  id: string;
  order_id: string;
  customer_id: string;
  status: PhysicalReturnStatus;
  reason: 'damaged' | 'not_as_described' | 'wrong_item' | 'changed_mind' | 'other';
  description: string | null;
  evidence_images: string[];
  pickup_method: 'courier_pickup' | 'customer_dropoff';
  refund_method: 'wallet' | 'original_payment';
  merchant_recommendation: 'approve' | 'reject' | null;
  merchant_response: string | null;
  review_notes: string | null;
  assigned_delivery_id: string | null;
  pickup_scheduled_at: string | null;
  picked_up_at: string | null;
  received_at: string | null;
  merchant_received_at?: string | null;
  inspected_at: string | null;
  inspection_notes: string | null;
  cancellation_reason: string | null;
  refund_request_id: string | null;
  refund_amount: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  return_items?: PhysicalReturnItem[];
  return_tracking?: PhysicalReturnTrackingEvent[];
}

export async function getMyPhysicalReturns(
  customerId: string,
  orderId?: string,
): Promise<PhysicalReturnRequest[]> {
  let query = supabase
    .from('return_requests')
    .select(`
      id, order_id, customer_id, status, reason, description, evidence_images,
      pickup_method, refund_method, merchant_recommendation, merchant_response,
      review_notes, assigned_delivery_id, pickup_scheduled_at, picked_up_at,
      received_at, inspected_at, inspection_notes, cancellation_reason,
      refund_request_id, refund_amount, completed_at, created_at, updated_at,
      return_items(
        id, return_request_id, order_item_id, product_id, variant_id,
        purchased_quantity, requested_quantity, approved_quantity,
        accepted_quantity, unit_price, line_total, disposition,
        inspection_notes, restocked_at
      ),
      return_tracking(id, status, actor_role, notes, metadata, created_at)
    `)
    .eq('customer_id', customerId);
  if (orderId) query = query.eq('order_id', orderId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PhysicalReturnRequest[];
}

export async function createPhysicalReturnRequest(data: {
  order_id: string;
  items: Array<{ order_item_id: string; quantity: number }>;
  reason: PhysicalReturnRequest['reason'];
  description: string;
  evidence_images?: string[];
  pickup_method: PhysicalReturnRequest['pickup_method'];
  refund_method?: PhysicalReturnRequest['refund_method'];
  idempotency_key?: string;
}): Promise<{ id: string; order_id: string; status: PhysicalReturnStatus; idempotent_replay: boolean }> {
  const { data: result, error } = await supabase.rpc('create_return_request', {
    p_order_id: data.order_id,
    p_items: data.items,
    p_reason: data.reason,
    p_description: data.description.trim(),
    p_evidence_images: data.evidence_images ?? [],
    p_pickup_method: data.pickup_method,
    p_refund_method: data.refund_method ?? 'original_payment',
    p_idempotency_key: data.idempotency_key ?? createIdempotencyKey(),
  });
  if (error) throw error;
  return result as { id: string; order_id: string; status: PhysicalReturnStatus; idempotent_replay: boolean };
}

export async function cancelPhysicalReturnRequest(requestId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_return_request', {
    p_request_id: requestId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

export interface MerchantPhysicalReturnProof {
  id: string;
  proof_type: 'pickup' | 'merchant_delivery';
  proof_path: string;
  created_at: string;
}

export interface MerchantPhysicalReturnTrackingEvent {
  id: string;
  status: PhysicalReturnStatus;
  actor_role: string | null;
  notes: string | null;
  created_at: string;
}

export interface MerchantPhysicalReturn extends Pick<PhysicalReturnRequest,
  | 'id'
  | 'order_id'
  | 'customer_id'
  | 'status'
  | 'reason'
  | 'description'
  | 'evidence_images'
  | 'pickup_method'
  | 'merchant_recommendation'
  | 'merchant_response'
  | 'review_notes'
  | 'pickup_scheduled_at'
  | 'picked_up_at'
  | 'received_at'
  | 'merchant_received_at'
  | 'inspected_at'
  | 'inspection_notes'
  | 'cancellation_reason'
  | 'refund_request_id'
  | 'refund_amount'
  | 'completed_at'
  | 'created_at'
  | 'updated_at'
> {
  return_items?: PhysicalReturnItem[];
  return_tracking?: MerchantPhysicalReturnTrackingEvent[];
  return_proofs?: MerchantPhysicalReturnProof[];
  orders?: {
    id: string;
    order_number: string;
    merchant_id: string;
  } | null;
  users?: { full_name: string | null; phone: string | null } | null;
}

export interface MerchantPhysicalReturnPageOptions {
  limit?: number;
  offset?: number;
}

export async function getMerchantPhysicalReturns(
  merchantProfileId: string,
  options: MerchantPhysicalReturnPageOptions = {},
): Promise<MerchantPhysicalReturn[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 100);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  const { data, error } = await supabase
    .from('return_requests')
    .select(`
      id, order_id, customer_id, status, reason, description, evidence_images,
      pickup_method, merchant_recommendation, merchant_response,
      review_notes, pickup_scheduled_at, picked_up_at,
      received_at, merchant_received_at, inspected_at, inspection_notes,
      cancellation_reason, refund_request_id, refund_amount,
      completed_at, created_at, updated_at,
      return_items(
        id, return_request_id, order_item_id, product_id, variant_id,
        purchased_quantity, requested_quantity, approved_quantity,
        accepted_quantity, unit_price, line_total, disposition,
        inspection_notes, restocked_at,
        products(name, name_ar), order_items(product_name, variant_details)
      ),
      return_tracking(id, status, actor_role, notes, created_at),
      return_proofs(id, proof_type, proof_path, created_at),
      orders!inner(id, order_number, merchant_id),
      users:customer_id(full_name, phone)
    `)
    .eq('orders.merchant_id', merchantProfileId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as unknown as MerchantPhysicalReturn[];
}

export async function respondPhysicalReturnRequest(
  requestId: string,
  recommendation: 'approve' | 'reject',
  response: string,
): Promise<void> {
  const { error } = await supabase.rpc('respond_return_request', {
    p_request_id: requestId,
    p_recommendation: recommendation,
    p_response: response.trim(),
  });
  if (error) throw error;
}

export async function merchantReceivePhysicalReturn(requestId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('merchant_receive_return', {
    p_request_id: requestId,
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
}

export async function inspectPhysicalReturn(data: {
  request_id: string;
  items: Array<{
    return_item_id: string;
    accepted_quantity: number;
    disposition: 'restock' | 'discard' | 'repair' | 'return_to_vendor' | 'rejected';
    notes?: string;
  }>;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('inspect_return_request', {
    p_request_id: data.request_id,
    p_items: data.items,
    p_notes: data.notes?.trim() || null,
  });
  if (error) throw error;
}

export interface DeliveryPhysicalReturnJob {
  id: string;
  order_id: string;
  status: 'pickup_scheduled' | 'picked_up' | 'received';
  reason: PhysicalReturnRequest['reason'];
  pickup_method: 'courier_pickup';
  scheduled_at: string;
  picked_up_at: string | null;
  received_at: string | null;
  customer_id: string;
  order_number: string;
  address_id: string;
  merchant_id: string;
  address: {
    id: string;
    label: string;
    full_address: string;
    city: string | null;
    area: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  merchant: {
    id: string;
    store_name: string;
    address: string | null;
    city: string | null;
    store_phone: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  items: Array<{
    id: string;
    order_item_id: string;
    product_id: string;
    variant_id: string | null;
    approved_quantity: number;
  }>;
}

export async function getMyDeliveryReturns(): Promise<DeliveryPhysicalReturnJob[]> {
  const { data, error } = await supabase.rpc('list_my_delivery_returns');
  if (error) throw error;
  return (data ?? []) as DeliveryPhysicalReturnJob[];
}

export async function updateDeliveryReturnStatus(data: {
  request_id: string;
  status: 'picked_up' | 'received';
  proof_path: string;
  latitude: number;
  longitude: number;
  idempotency_key: string;
}): Promise<void> {
  const { error } = await supabase.rpc('delivery_update_return_status', {
    p_request_id: data.request_id,
    p_status: data.status,
    p_proof_path: data.proof_path,
    p_latitude: data.latitude,
    p_longitude: data.longitude,
    p_idempotency_key: data.idempotency_key,
  });
  if (error) throw error;
}

export interface AdminPhysicalReturnBundle {
  return: PhysicalReturnRequest;
  order: {
    id: string;
    order_number: string;
    status: string;
    subtotal: number;
    delivery_fee: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    payment_status: string;
  };
  customer: { id: string; full_name: string | null; phone: string | null; email: string | null };
  merchant: { id: string; user_id: string; store_name: string } | null;
  delivery: { id: string; user_id: string; full_name: string | null; phone: string | null } | null;
  items: PhysicalReturnItem[];
  tracking: PhysicalReturnTrackingEvent[];
  proofs: Array<{
    id: string;
    return_request_id: string;
    delivery_profile_id: string;
    proof_type: 'pickup' | 'merchant_delivery';
    proof_path: string;
    latitude: number;
    longitude: number;
    captured_by: string;
    created_at: string;
  }>;
  refund: Record<string, unknown> | null;
}

export async function getAdminPhysicalReturns(status?: PhysicalReturnStatus): Promise<AdminPhysicalReturnBundle[]> {
  const { data, error } = await supabase.rpc('admin_list_return_requests', {
    p_status: status ?? null,
    p_limit: 200,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminPhysicalReturnBundle[];
}

export interface PhysicalReturnEvidenceLink {
  path: string;
  signedUrl: string;
}

async function getPhysicalReturnStorageLinks(
  bucket: 'return-evidence' | 'return-proofs',
  paths: string[],
): Promise<PhysicalReturnEvidenceLink[]> {
  const uniquePaths = [...new Set(paths.filter((path) => typeof path === 'string' && path.trim()))];
  const links = await Promise.all(uniquePaths.map(async (path) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 10 * 60);
    if (error) throw error;
    return { path, signedUrl: data.signedUrl };
  }));
  return links;
}

export async function getPhysicalReturnEvidenceLinks(paths: string[]): Promise<PhysicalReturnEvidenceLink[]> {
  return getPhysicalReturnStorageLinks('return-evidence', paths);
}

export async function getPhysicalReturnProofLinks(paths: string[]): Promise<PhysicalReturnEvidenceLink[]> {
  return getPhysicalReturnStorageLinks('return-proofs', paths);
}

export async function adminReviewPhysicalReturn(data: {
  request_id: string;
  decision: 'approved' | 'rejected';
  approved_items?: Array<{ return_item_id: string; approved_quantity: number }>;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_review_return_request', {
    p_request_id: data.request_id,
    p_decision: data.decision,
    p_approved_items: data.approved_items ?? [],
    p_notes: data.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function adminSchedulePhysicalReturn(data: {
  request_id: string;
  delivery_profile_id?: string | null;
  scheduled_at: string;
  notes?: string;
  idempotency_key?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_schedule_return_pickup', {
    p_request_id: data.request_id,
    p_delivery_profile_id: data.delivery_profile_id ?? null,
    p_scheduled_at: data.scheduled_at,
    p_notes: data.notes?.trim() || null,
    p_idempotency_key: data.idempotency_key ?? createIdempotencyKey(),
  });
  if (error) throw error;
}

export async function adminCompletePhysicalReturn(data: {
  request_id: string;
  external_reference?: string;
  notes?: string;
  idempotency_key?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_complete_return', {
    p_request_id: data.request_id,
    p_external_reference: data.external_reference?.trim() || null,
    p_notes: data.notes?.trim() || null,
    p_idempotency_key: data.idempotency_key ?? createIdempotencyKey(),
  });
  if (error) throw error;
}

export async function getMyRefundRequests(customerId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('refund_requests')
    .select('id, order_id, reason, status, decision_reason, refund_amount, created_at, orders(order_number)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as any[];
}

export async function getMerchantRefundRequests(merchantProfileId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('refund_requests')
    .select('id, order_id, customer_id, reason, description, evidence_images, refund_amount, refund_method, status, merchant_response, decision_reason, processed_at, created_at, orders!inner(order_number, merchant_id, total_amount, payment_method, payment_status, delivered_at, order_items(product_name, variant_details, quantity, unit_price, total_price)), users:customer_id(full_name)')
    .eq('orders.merchant_id', merchantProfileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function respondToRefundRequest(requestId: string, response: string): Promise<void> {
  const body = response.trim();
  if (!body) throw new Error('اكتب رد التاجر أولاً.');
  if (body.length > 2000) throw new Error('الرد طويل جداً؛ الحد الأقصى 2000 حرف.');
  const { error } = await supabase.rpc('respond_refund_request', {
    p_request_id: requestId,
    p_response: body,
  });
  if (error) throw error;
}

// ============================================================
// PRODUCT VARIANTS (خيارات المنتج)
// ملاحظة: الأعمدة موحّدة مع schema الجدول (name, price_modifier,
// stock_quantity) — نفس الشكل الذي يرجعه getProductById
// ============================================================
export interface ProductVariant {
  id: string;
  name: string;
  name_ar: string | null;
  price_modifier: number;
  stock_quantity: number;
  is_active: boolean;
}

export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, name:size, name_ar, price_modifier, stock_quantity:stock_qty, is_active')
    .eq('product_id', productId)
    .eq('is_active', true);
  if (error) throw error;
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
  if (error) throw error;
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
export async function getOrCreateConversation(_customerId: string, merchantRef: string, orderId?: string): Promise<string> {
  // The database derives the customer from auth.uid(), resolves profile/user IDs,
  // and validates order participation. Client-supplied identities are never trusted.
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_merchant_ref: merchantRef,
    p_order_id: orderId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function getConversations(userId: string, asMerchant: boolean): Promise<ChatConversation[]> {
  const col = asMerchant ? 'merchant_id' : 'customer_id';
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, order_id, customer_id, merchant_id, last_message, last_message_at, customer_unread, merchant_unread, merchant_user:users!merchant_id(full_name), customer:users!customer_id(full_name)')
    .eq(col, userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data as unknown as ChatConversation[];
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, message, message_type, is_read, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return [...(data as ChatMessage[])].reverse();
}

export async function sendMessage(conversationId: string, _senderId: string, message: string): Promise<void> {
  const body = message.trim();
  if (!body) throw new Error('اكتب نص الرسالة أولاً.');
  if (body.length > 2000) throw new Error('الرسالة طويلة جداً؛ الحد الأقصى 2000 حرف.');
  const { error } = await supabase.rpc('send_chat_message', {
    p_conversation_id: conversationId,
    p_message: body,
  });
  if (error) throw error;
}

export async function markConversationRead(conversationId: string, _asMerchant: boolean): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
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
  const { data, error } = await supabase.rpc('get_store_followers_count', {
    p_merchant_id: merchantId,
  });
  if (error) throw error;
  return Number(data ?? 0);
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
  if (error) throw error;
  return data as ServiceArea[];
}

export async function getAllServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await supabase
    .from('service_areas')
    .select('id, city, is_active, delivery_available')
    .order('city');
  if (error) throw error;
  return data as ServiceArea[];
}

export async function createServiceArea(data: { city: string; is_active?: boolean; delivery_available?: boolean }): Promise<void> {
  const { error } = await supabase.from('service_areas').insert(data);
  if (error) throw error;
}

export async function updateServiceArea(id: string, updates: Partial<ServiceArea>): Promise<void> {
  const { error } = await supabase.from('service_areas').update(updates).eq('id', id);
  if (error) throw error;
}

// ============================================================
// COUPONS / OFFERS (العروض والكوبونات)
// ============================================================
export interface Coupon {
  id: string;
  merchant_id?: string | null;
  code: string;
  type: string;
  value: number;
  min_order_amount: number | null;
  max_discount_amount?: number | null;
  start_date?: string | null;
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
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error('قيمة السلة غير صالحة.');
  const { data, error } = await supabase.rpc('preview_coupon', {
    p_code: code.trim().toUpperCase(),
    p_subtotal: subtotal,
  });
  if (error) throw error;
  const result = (data ?? {}) as { valid?: boolean; discount?: number; message?: string; coupon_id?: string };
  return {
    valid: result.valid === true,
    discount: Number(result.discount ?? 0),
    message: result.message ?? (result.valid ? 'تم تطبيق الخصم' : 'كود الخصم غير صالح'),
  };
}

export async function getActiveCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, merchant_id, code, type, value, min_order_amount, max_discount_amount, start_date, end_date, merchant_profiles:merchant_id(store_name)')
    .limit(50);
  if (error) throw error;
  return data as unknown as Coupon[];
}

// جلب كل الصفوف على دفعات لتجاوز حد Supabase الافتراضي (1000 صف)
async function fetchAllRows<T>(
  buildQuery: () => any,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

// أكثر منتجات التاجر مبيعاً — من عناصر الطلبات الفعلية خلال الفترة
// (الكمية والإيراد بأسعار البيع الحقيقية وقت الطلب، مع استبعاد الملغي/المرتجع)
export async function getMerchantTopProducts(merchantId: string, limit = 5, days?: number): Promise<{
  id: string; name: string; total_sold: number; revenue: number; og_image_url: string | null;
}[]> {
  let since: string | null = null;
  if (days && days > 0) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    since = d.toISOString();
  }

  const rows = await fetchAllRows<{
    product_id: string | null;
    product_name: string | null;
    quantity: number;
    total_price: number;
    products?: { og_image_url: string | null } | null;
  }>(() => {
    let q = supabase
      .from(TABLES.ORDER_ITEMS)
      .select('product_id, product_name, quantity, total_price, products(og_image_url), orders!inner(merchant_id, status, created_at)')
      .eq('orders.merchant_id', merchantId)
      .not('orders.status', 'in', '(cancelled,returned)')
      .order('order_id');
    if (since) q = q.gte('orders.created_at', since);
    return q;
  });

  const byProduct = new Map<string, { id: string; name: string; total_sold: number; revenue: number; og_image_url: string | null }>();
  for (const row of rows) {
    const key = row.product_id ?? row.product_name ?? 'unknown';
    const entry = byProduct.get(key) ?? {
      id: key,
      name: row.product_name ?? 'منتج',
      total_sold: 0,
      revenue: 0,
      og_image_url: row.products?.og_image_url ?? null,
    };
    entry.total_sold += row.quantity ?? 0;
    entry.revenue += Number(row.total_price ?? 0);
    if (!entry.og_image_url && row.products?.og_image_url) entry.og_image_url = row.products.og_image_url;
    byProduct.set(key, entry);
  }

  return [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

// مبيعات التاجر اليومية لآخر N أيام (لرسم بياني حقيقي)
export async function getMerchantSalesChart(merchantId: string, days = 8): Promise<number[]> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  // ترقيم الصفحات لتجاوز حد الصفوف (1000) عند كثرة الطلبات
  const data = await fetchAllRows<{ total_amount: number | null; created_at: string }>(() =>
    supabase
      .from(TABLES.ORDERS)
      .select('total_amount, created_at')
      .eq('merchant_id', merchantId)
      .eq('status', 'delivered')
      .gte('created_at', since.toISOString())
      .order('created_at'),
  );

  const buckets = new Array(days).fill(0);
  data.forEach((o: { total_amount: number | null; created_at: string }) => {
    const d = new Date(o.created_at);
    d.setHours(0, 0, 0, 0);
    const idx = Math.floor((d.getTime() - since.getTime()) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx] += o.total_amount ?? 0;
  });
  return buckets;
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
      .select('total_amount, status')
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
  const todayRevenue = ordersRes.data
    ?.filter((order) => order.status === 'delivered')
    .reduce((sum, order) => sum + (order.total_amount ?? 0), 0) ?? 0;

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
  link_url: string | null;
  target_type: string | null;
  target_id: string | null;
  sort_order: number;
}

export async function getActiveAds(): Promise<Advertisement[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLES.ADVERTISEMENTS)
    .select('id, title, image_url, link_url, target_type, target_id, sort_order')
    .eq('is_active', true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order('sort_order');
  if (error) throw error;
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
  // Web image pickers return blob: URLs such as
  // blob:https://example.app/<uuid>; the domain suffix is not a file extension.
  const uriExt = uri.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const isPng = blob.type.toLowerCase() === 'image/png'
    || (!blob.type && uriExt === 'png');
  const ext = isPng ? 'png' : 'jpg';
  const contentType = isPng ? 'image/png' : 'image/jpeg';
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(`${filePath}.${ext}`, blob, { contentType, upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function uploadPrivateFileToStorage(data: {
  bucket: string;
  objectPath: string;
  uri: string;
  contentType: 'image/jpeg' | 'image/png' | 'application/pdf';
  upsert?: boolean;
}): Promise<string> {
  const response = await fetch(data.uri);
  if (!response.ok) throw new Error('تعذّر قراءة الملف المحدد قبل رفعه.');
  const blob = await response.blob();
  if (blob.size < 1 || blob.size > 10 * 1024 * 1024) {
    throw new Error('حجم الملف يجب أن يكون بين 1 بايت و10 ميجابايت.');
  }
  const { error } = await supabase.storage
    .from(data.bucket)
    .upload(data.objectPath, blob, { contentType: data.contentType, upsert: data.upsert ?? false });
  if (error) throw error;
  return data.objectPath;
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
  is_open?: boolean;
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
  store_logo_url?: string | null; store_category?: string | null; is_open?: boolean | null;
  store_phone?: string | null; whatsapp?: string | null; owner_name?: string | null;
  national_id?: string | null; commercial_register?: string | null; tax_number?: string | null;
  bank_name?: string | null; bank_account?: string | null; bank_account_name?: string | null;
  is_active?: boolean | null; pause_reason?: string | null;
} | null> {
  void userId;
  const { data, error } = await supabase.rpc('get_my_merchant_profile');
  if (error) throw error;
  return data as {
    id: string; store_name: string; is_approved: boolean;
    store_description?: string | null; address?: string | null; city?: string | null;
    store_logo_url?: string | null; store_category?: string | null; is_open?: boolean | null;
    store_phone?: string | null; whatsapp?: string | null; owner_name?: string | null;
    national_id?: string | null; commercial_register?: string | null; tax_number?: string | null;
    bank_name?: string | null; bank_account?: string | null; bank_account_name?: string | null;
    is_active?: boolean | null; pause_reason?: string | null;
  } | null;
}

export async function createMerchantProfile(data: MerchantProfileData): Promise<void> {
  const { user_id: _userId, ...profile } = data;
  const { error } = await supabase.rpc('create_my_merchant_profile', { p_profile: profile });
  if (error) throw error;
}

export async function updateMerchantProfileByUser(
  userId: string,
  updates: Partial<Omit<MerchantProfileData, 'user_id' | 'store_slug'>>,
): Promise<void> {
  void userId;
  const { error } = await supabase.rpc('update_my_merchant_profile', { p_updates: updates });
  if (error) throw error;
}

// ============================================================
// ONBOARDING - DELIVERY PROFILE
// ============================================================
export async function getDeliveryProfile(userId: string): Promise<{ id: string; vehicle_type: string | null; vehicle_plate: string | null; national_id: string | null; is_approved: boolean } | null> {
  void userId;
  const { data, error } = await supabase.rpc('get_my_delivery_profile');
  if (error) throw error;
  return data as { id: string; vehicle_type: string | null; vehicle_plate: string | null; national_id: string | null; is_approved: boolean } | null;
}

export async function updateDeliveryProfileByUser(
  userId: string,
  updates: { vehicle_type?: string; vehicle_plate?: string },
): Promise<void> {
  void userId;
  const { error } = await supabase.rpc('update_my_delivery_profile', { p_updates: updates });
  if (error) throw error;
}

export async function createDeliveryProfile(data: {
  user_id: string;
  national_id?: string;
  vehicle_type?: string;
  vehicle_plate?: string;
}): Promise<void> {
  const { user_id: _userId, ...profile } = data;
  const { error } = await supabase.rpc('create_my_delivery_profile', { p_profile: profile });
  if (error) throw error;
}

export async function saveDeliveryOnboardingDocuments(data: {
  workCity: string;
  nationalIdImagePath?: string;
  licenseImagePath?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('save_my_delivery_onboarding_documents', {
    p_work_city: data.workCity.trim(),
    p_national_id_image_path: data.nationalIdImagePath ?? null,
    p_license_image_path: data.licenseImagePath ?? null,
  });
  if (error) throw error;
}

export async function getDeliveryOnboardingDocumentLinks(paths: string[]): Promise<Array<{
  path: string;
  signedUrl: string;
}>> {
  const uniquePaths = [...new Set(paths.filter((path) => typeof path === 'string' && path.trim()))];
  return Promise.all(uniquePaths.map(async (path) => {
    const { data, error } = await supabase.storage
      .from('delivery-onboarding-documents')
      .createSignedUrl(path, 10 * 60);
    if (error) throw error;
    return { path, signedUrl: data.signedUrl };
  }));
}

// ============================================================
// WALLET (محفظة التاجر/المندوب/العميل)
// ============================================================
export interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  source: string | null;
  reference_id: string | null;
  balance_after: number | null;
  notes: string | null;
  created_at: string;
}

export async function getWalletTransactions(userId: string): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, type, amount, source, reference_id, balance_after, notes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as WalletTransaction[];
}

// رصيد محفظة التاجر
export async function getMerchantWalletBalance(userId: string): Promise<number> {
  void userId;
  const { data, error } = await supabase.rpc('get_my_merchant_profile');
  if (error) throw error;
  if (!data) throw new Error('تعذّر العثور على ملف التاجر المرتبط بهذا الحساب.');
  return Number((data as { wallet_balance?: number }).wallet_balance ?? 0);
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
  /** العدد الحقيقي الكامل لسجلات الأرباح (وليس طول القائمة المحدودة بـ50) */
  recordedCount: number;
  earnings: DeliveryEarning[];
}> {
  void deliveryUserId;
  const { data: profile, error: profileError } = await supabase.rpc('get_my_delivery_profile');
  if (profileError) throw profileError;
  if (!profile) throw new Error('تعذّر العثور على ملف المندوب المرتبط بهذا الحساب.');

  const p = profile as { id: string; wallet_balance?: number; total_deliveries?: number };
  const [{ data, error }, countRes] = await Promise.all([
    supabase
      .from('delivery_earnings')
      .select('id, base_earning, bonus_earning, tip_amount, total_earning, created_at')
      .eq('delivery_id', p.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('delivery_earnings')
      .select('id', { count: 'exact', head: true })
      .eq('delivery_id', p.id),
  ]);
  if (error) throw error;
  return {
    balance: Number(p.wallet_balance ?? 0),
    totalDeliveries: Number(p.total_deliveries ?? 0),
    recordedCount: countRes.count ?? (data?.length ?? 0),
    earnings: (data ?? []) as DeliveryEarning[],
  };
}

// ============================================================
// PICKUP CONFIRMATION & OFFER REJECTIONS (إثبات الاستلام ورفض العروض)
// ============================================================

// كود الاستلام: يعرضه التاجر للمندوب عند تسليم الطلب (التاجر/الأدمن فقط)
export async function getOrderPickupCode(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_order_pickup_code', { p_order_id: orderId });
  if (error) throw error;
  return (data as string) ?? '';
}

// المندوب يؤكد استلام الطلب من المتجر بالكود — يمر عبر مسار الانتقال المعتمد
// ملاحظة: الدالة تُعيد {ok:false} بدل رفع استثناء عند الكود الخاطئ، لأن رفع
// الاستثناء يُلغي حفظ عدّاد المحاولات فيبطل الحظر. لذلك نفحص الحقل ok دائماً.
export async function confirmOrderPickup(orderId: string, code: string): Promise<void> {
  const { data, error } = await supabase.rpc('confirm_order_pickup', {
    p_order_id: orderId,
    p_code: code.trim(),
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('ORDER_NOT_ASSIGNED')) throw new Error('الطلب ليس في مرحلة تسمح بتأكيد الاستلام.');
    if (msg.includes('NOT_ASSIGNED_DELIVERY')) throw new Error('هذا الطلب غير مسند إليك.');
    throw error;
  }

  const result = (data ?? {}) as { ok?: boolean; error?: string; attempts_left?: number; locked_until?: string };
  if (result.ok === true) return;

  const minutesLeft = result.locked_until
    ? Math.max(1, Math.ceil((new Date(result.locked_until).getTime() - Date.now()) / 60000))
    : 15;

  switch (result.error) {
    case 'PICKUP_CODE_LOCKED':
      throw new Error(`تم إيقاف المحاولات مؤقتاً بعد عدة أكواد خاطئة. أعد المحاولة بعد ${minutesLeft} دقيقة.`);
    case 'PICKUP_CODE_NOT_ISSUED':
      throw new Error('لم يصدر كود لهذا الطلب بعد. اطلب من التاجر فتح الطلب لعرض الكود.');
    case 'INVALID_PICKUP_CODE':
      throw new Error(
        `كود الاستلام غير صحيح.${typeof result.attempts_left === 'number' ? ` تبقّى ${result.attempts_left} محاولات.` : ''}`,
      );
    default:
      throw new Error('تعذّر تأكيد الاستلام. حاول مجدداً.');
  }
}

// تسجيل رفض العرض في السيرفر (يبقى مخفياً عبر الأجهزة وإعادة التشغيل)
export async function rejectDeliveryOffer(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_delivery_offer', { p_order_id: orderId });
  if (error) throw error;
}

export async function getMyOfferRejections(): Promise<string[]> {
  const { data, error } = await supabase.rpc('list_my_offer_rejections');
  if (error) throw error;
  return ((data ?? []) as unknown[]).map((id) => String(id));
}

export type CodCollectionStatus = 'collected' | 'partially_remitted' | 'remitted' | 'disputed';
export type CodRemittanceStatus = 'pending' | 'approved' | 'rejected' | 'disputed';

export interface CodRemittanceSubmission {
  id: string;
  amount: number;
  reference: string;
  proof_path: string;
  status: CodRemittanceStatus;
  submitted_by?: string;
  processor_id?: string | null;
  review_note: string | null;
  ledger_entry_id?: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface CodCollection {
  id: string;
  order_id: string;
  order_number?: string;
  delivery_id: string;
  delivery_user_id?: string;
  delivery_name?: string | null;
  merchant_id?: string;
  merchant_user_id?: string;
  customer_id?: string;
  amount_collected: number;
  amount_remitted: number;
  amount_outstanding: number;
  amount_pending_review: number;
  status: CodCollectionStatus;
  collected_at: string;
  remitted_at: string | null;
  disputed_at: string | null;
  disputed_by?: string | null;
  dispute_reason: string | null;
  submissions: CodRemittanceSubmission[];
}

export interface CodRemittanceProofLink {
  path: string;
  signedUrl: string;
}

export async function getMyCodCollections(): Promise<CodCollection[]> {
  const { data, error } = await supabase.rpc('list_my_cod_collections');
  if (error) throw error;
  return (data ?? []) as CodCollection[];
}

export async function submitCodRemittance(data: {
  collection_id: string;
  amount: number;
  reference: string;
  proof_path: string;
  idempotency_key: string;
}): Promise<void> {
  const { error } = await supabase.rpc('submit_cod_remittance', {
    p_collection_id: data.collection_id,
    p_amount: data.amount,
    p_reference: data.reference.trim(),
    p_proof_path: data.proof_path,
    p_idempotency_key: data.idempotency_key,
  });
  if (error) throw error;
}

export async function getAdminCodCollections(): Promise<CodCollection[]> {
  const { data, error } = await supabase.rpc('admin_list_cod_collections');
  if (error) throw error;
  return (data ?? []) as CodCollection[];
}

export async function getCodRemittanceProofLinks(paths: string[]): Promise<CodRemittanceProofLink[]> {
  const uniquePaths = [...new Set(paths.filter((path) => typeof path === 'string' && path.trim()))];
  return Promise.all(uniquePaths.map(async (path) => {
    const { data, error } = await supabase.storage
      .from('cod-remittance-proofs')
      .createSignedUrl(path, 10 * 60);
    if (error) throw error;
    return { path, signedUrl: data.signedUrl };
  }));
}

export async function reviewCodRemittance(
  submissionId: string,
  decision: 'approved' | 'rejected' | 'disputed',
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_review_cod_remittance', {
    p_submission_id: submissionId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
}

export async function setCodCollectionDispute(
  collectionId: string,
  disputed: boolean,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_cod_collection_dispute', {
    p_collection_id: collectionId,
    p_disputed: disputed,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
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
}

export async function getReviews(targetId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at')
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
  if (!data.order_id) throw new Error('لا يمكن إضافة تقييم دون طلب مرتبط.');
  const { error } = await supabase.rpc('create_order_review', {
    p_order_id: data.order_id,
    p_target_type: data.target_type,
    p_target_id: data.target_id,
    p_rating: data.rating,
    p_comment: data.comment?.trim() || null,
  });
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

export interface AdminMerchant {
  id: string;
  user_id: string;
  store_name: string;
  owner_name: string | null;
  city: string | null;
  is_approved: boolean;
  is_active: boolean;
  pause_reason: string | null;
  wallet_balance: number;
  national_id?: string | null;
  commercial_register?: string | null;
  tax_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  created_at: string;
  users?: { full_name: string; phone: string | null };
}

export async function getAdminMerchants(filter?: 'pending' | 'approved' | 'all'): Promise<AdminMerchant[]> {
  const { data, error } = await supabase.rpc('admin_list_merchants', {
    p_filter: filter ?? 'all',
  });
  if (error) throw error;
  return data as unknown as AdminMerchant[];
}

export async function approveMerchant(merchantProfileId: string, approved: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('review_merchant_application', {
    p_profile_id: merchantProfileId,
    p_approved: approved,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}

export async function toggleMerchantActive(merchantProfileId: string, active: boolean, reason?: string): Promise<void> {
  const { error } = await withRequestTimeout(supabase.rpc('set_merchant_operational_status', {
    p_profile_id: merchantProfileId,
    p_active: active,
    p_reason: reason?.trim() || null,
  }));
  if (error) throw error;
}

export type RefundRequestStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
export type RefundDecisionStatus = Exclude<RefundRequestStatus, 'pending'>;

export interface AdminRefundRequest {
  id: string;
  order_id: string;
  customer_id: string;
  reason: string;
  description: string | null;
  evidence_images: string[] | null;
  refund_amount: number;
  refund_method: 'wallet' | 'original_payment';
  status: RefundRequestStatus;
  merchant_response: string | null;
  decision_reason: string | null;
  admin_notes: string | null;
  external_reference?: string | null;
  processed_at: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    delivered_at: string | null;
    merchant_profiles?: { store_name: string } | null;
    order_items?: Array<{
      product_name: string;
      variant_details: unknown;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
  } | null;
  users?: { full_name: string; phone: string | null } | null;
}

export async function getAdminRefundRequests(): Promise<AdminRefundRequest[]> {
  const { data, error } = await supabase.rpc('admin_list_refund_requests');
  if (error) throw error;
  return (data ?? []) as unknown as AdminRefundRequest[];
}

export async function updateRefundRequestStatus(
  id: string,
  status: RefundDecisionStatus,
  adminNotes?: string,
  externalReference?: string,
): Promise<void> {
  const { error } = await supabase.rpc('process_refund_request', {
    p_request_id: id,
    p_status: status,
    p_notes: adminNotes?.trim() || null,
    p_external_reference: externalReference?.trim() || null,
  });
  if (error) throw error;
}

export interface AdminDriver {
  id: string;
  user_id: string;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  national_id?: string | null;
  work_city?: string | null;
  national_id_image_path?: string | null;
  license_image_path?: string | null;
  application_revision: number;
  is_online?: boolean;
  is_approved: boolean;
  wallet_balance: number;
  total_deliveries: number;
  created_at: string;
  users?: { full_name: string; phone: string | null };
}

export async function getAdminDrivers(filter?: 'pending' | 'approved' | 'all'): Promise<AdminDriver[]> {
  const { data, error } = await supabase.rpc('admin_list_drivers', {
    p_filter: filter ?? 'all',
  });
  if (error) throw error;
  return data as unknown as AdminDriver[];
}

export async function approveDriver(
  driverProfileId: string,
  approved: boolean,
  expectedRevision: number,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('review_delivery_application', {
    p_profile_id: driverProfileId,
    p_approved: approved,
    p_reason: reason?.trim() || null,
    p_expected_revision: expectedRevision,
  });
  if (error) throw error;
}

export type ProductApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface AdminProductReview {
  id: string;
  merchant_id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  base_price: number;
  sale_price: number | null;
  stock_quantity: number;
  is_active: boolean;
  is_approved: boolean;
  approval_status: ProductApprovalStatus;
  approval_note: string | null;
  approved_at: string | null;
  created_at: string;
  primary_image: string | null;
  merchant_profiles?: { id: string; store_name: string; user_id: string } | null;
}

export async function getAdminProducts(
  filter: ProductApprovalStatus | 'all' = 'pending',
): Promise<AdminProductReview[]> {
  const { data, error } = await supabase.rpc('admin_list_products', { p_filter: filter });
  if (error) throw error;
  return (data ?? []) as AdminProductReview[];
}

export async function reviewAdminProduct(
  productId: string,
  decision: Exclude<ProductApprovalStatus, 'pending'>,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_review_product', {
    p_product_id: productId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
}

export async function getMyProductModeration(): Promise<Array<{
  id: string;
  approval_status: ProductApprovalStatus;
  approval_note: string | null;
  approved_at: string | null;
}>> {
  const { data, error } = await supabase.rpc('get_my_product_moderation');
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    approval_status: ProductApprovalStatus;
    approval_note: string | null;
    approved_at: string | null;
  }>;
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'paid' | 'failed';
export type WithdrawalDecisionStatus = Exclude<WithdrawalStatus, 'pending'>;

export interface AdminWithdrawal {
  id: string;
  user_id: string;
  amount: number;
  status: WithdrawalStatus;
  notes: string | null;
  requester_notes?: string | null;
  admin_notes?: string | null;
  payout_destination?: Record<string, unknown> | null;
  external_reference?: string | null;
  processed_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  users?: { full_name: string; role: string };
}

export async function getAdminWithdrawals(status?: string): Promise<AdminWithdrawal[]> {
  let q = supabase.from('withdrawal_requests').select('id, user_id, amount, status, notes, requester_notes, admin_notes, payout_destination, external_reference, processed_at, paid_at, created_at, users:users!withdrawal_requests_user_id_fkey(full_name, role)').order('created_at', { ascending: false }).limit(100);
  if (status) q = (q as any).eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as AdminWithdrawal[];
}

export async function processWithdrawal(requestId: string, status: WithdrawalDecisionStatus, notes?: string, externalReference?: string): Promise<void> {
  const { error } = await supabase.rpc('process_withdrawal_request', {
    p_request_id: requestId,
    p_status: status,
    p_notes: notes?.trim() || null,
    p_external_reference: externalReference?.trim() || null,
  });
  if (error) throw error;
}

export type LegacyReconciliationStatsState = 'already_counted' | 'not_counted';

export interface LegacyFinancialReconciliationCandidate {
  order_id: string;
  order_number: string;
  customer_id: string;
  merchant_id: string;
  merchant_name: string | null;
  delivery_id: string | null;
  delivery_name: string | null;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  stored_delivered_at: string | null;
  gross_amount: number;
  merchant_proceeds: number;
  delivery_earning: number;
  platform_commission: number;
  tax_amount: number;
  platform_amount: number;
  stored_stats_counted: boolean;
  has_active_refund: boolean;
  has_active_physical_return: boolean;
  has_completed_refund_or_reversal: boolean;
  cod_custody_requires_review: boolean;
  is_reconcilable: boolean;
  conflict_reasons: string[];
}

export interface LegacyFinancialReconciliationResult {
  reconciliation_id: string;
  order_id: string;
  settlement_id: string;
  status: 'completed';
  cod_custody_requires_review: boolean;
  idempotent_replay: boolean;
}

export async function getAdminLegacyFinancialReconciliationQueue(): Promise<LegacyFinancialReconciliationCandidate[]> {
  const { data, error } = await supabase.rpc('admin_list_legacy_financial_reconciliation');
  if (error) throw error;
  return (data ?? []) as LegacyFinancialReconciliationCandidate[];
}

export async function reconcileLegacyDeliveredOrder(input: {
  orderId: string;
  confirmOrderNumber: string;
  confirmedDeliveredAt: string;
  grossAmount: number;
  merchantProceeds: number;
  deliveryEarning: number;
  platformCommission: number;
  taxAmount: number;
  statsState: LegacyReconciliationStatsState;
  acknowledgeCodCustody: boolean;
  evidenceReference: string;
  reason: string;
  idempotencyKey: string;
}): Promise<LegacyFinancialReconciliationResult> {
  const amounts = [
    input.grossAmount,
    input.merchantProceeds,
    input.deliveryEarning,
    input.platformCommission,
    input.taxAmount,
  ];
  if (amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
    throw new Error('مبالغ المطابقة المالية غير صالحة.');
  }
  const { data, error } = await supabase.rpc('admin_reconcile_legacy_delivered_order', {
    p_order_id: input.orderId,
    p_confirm_order_number: input.confirmOrderNumber.trim(),
    p_confirmed_delivered_at: input.confirmedDeliveredAt,
    p_gross_amount: input.grossAmount,
    p_merchant_proceeds: input.merchantProceeds,
    p_delivery_earning: input.deliveryEarning,
    p_platform_commission: input.platformCommission,
    p_tax_amount: input.taxAmount,
    p_stats_state: input.statsState,
    p_acknowledge_cod_custody: input.acknowledgeCodCustody,
    p_evidence_reference: input.evidenceReference.trim(),
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data as LegacyFinancialReconciliationResult;
}

export async function getAdminSupportTickets(status?: string): Promise<any[]> {
  let q = supabase.from('support_tickets')
    .select('id, user_id, order_id, subject, category, status, priority, assigned_to, created_at, resolved_at, users:users!support_tickets_user_id_fkey(full_name, phone, role)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) q = (q as any).eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function updateSupportTicketStatus(ticketId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('update_support_ticket_status', {
    p_ticket_id: ticketId,
    p_status: status,
  });
  if (error) throw error;
}

export async function getAdminOrders(status?: string): Promise<any[]> {
  let q = supabase.from(TABLES.ORDERS)
    .select('id, order_number, customer_id, merchant_id, delivery_id, address_id, status, subtotal, delivery_fee, discount_amount, platform_commission, tax_amount, total_amount, payment_method, payment_status, notes, cancel_reason, delivered_at, cancelled_at, created_at, updated_at, customer:users!orders_customer_id_fkey(full_name, phone), merchant_profiles!orders_merchant_id_fkey(store_name, address, city), delivery_profiles!orders_delivery_id_fkey(user_id, vehicle_type, vehicle_plate, users:users!delivery_profiles_user_id_fkey(full_name, phone)), addresses!orders_address_id_fkey(full_address, city), order_items(id, product_name, quantity, unit_price, total_price), order_tracking(id, status, notes, latitude, longitude, created_at)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) q = (q as any).eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export interface AdminUser {
  id: string;
  full_name: string;
  phone: string;
  role: string;
  is_active: boolean;
  is_blocked: boolean;
  blocked_until: string | null;
  blocked_reason: string | null;
  created_at: string;
}

export async function getAdminUsers(role?: string): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_role: role ?? null,
  });
  if (error) throw error;
  return data as AdminUser[];
}

// ============================================================
// مفاتيح API الشخصية — للربط مع Claude أو أي نموذج AI
// ============================================================

export interface ApiKeyInfo {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** ينشئ مفتاحاً جديداً ويعيد المفتاح الكامل — يُعرض للمستخدم مرة واحدة فقط */
export async function createApiKey(name: string, expiresDays?: number): Promise<{ id: string; key: string }> {
  const { data, error } = await supabase.rpc('create_api_key', {
    p_name: name,
    p_expires_days: expiresDays ?? null,
  });
  if (error) throw error;
  return data as { id: string; key: string };
}

export async function getMyApiKeys(): Promise<ApiKeyInfo[]> {
  const { data, error } = await supabase.from('api_keys')
    .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ApiKeyInfo[];
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const { error } = await supabase.from('api_keys').update({ is_active: false }).eq('id', keyId);
  if (error) throw error;
}

export async function deleteApiKey(keyId: string): Promise<void> {
  const { error } = await supabase.from('api_keys').delete().eq('id', keyId);
  if (error) throw error;
}

/** عنوان API المفاتيح الشخصية؛ المصادقة تتم بمفتاح `lv_` في `x-api-key`. */
export const API_V1_URL = 'https://sghaihfjuttwqikdszgh.supabase.co/functions/v1/api-v1';

// ============================================================
// سيطرة الأدمن الكاملة على المستخدمين
// ============================================================

/** حظر دائم (durationHours = null) أو مؤقت لعدد ساعات محدد، مع سبب اختياري */
export async function adminBlockUser(userId: string, durationHours: number | null, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_block', {
    p_user_id: userId,
    p_blocked: durationHours == null,
    p_blocked_until: durationHours == null ? null : new Date(Date.now() + durationHours * 3600_000).toISOString(),
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}

/** فك الحظر (الدائم والمؤقت معاً) */
export async function adminUnblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_block', {
    p_user_id: userId,
    p_blocked: false,
    p_blocked_until: null,
    p_reason: null,
  });
  if (error) throw error;
}

/** تفعيل/تعطيل الحساب */
export async function adminSetUserActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_active', {
    p_user_id: userId,
    p_active: active,
  });
  if (error) throw error;
}

/** تعديل بيانات المستخدم الأساسية */
export async function adminUpdateUser(userId: string, fields: { full_name?: string; phone?: string; role?: string }): Promise<void> {
  const { error } = await supabase.rpc('admin_update_user_profile', {
    p_user_id: userId,
    p_full_name: fields.full_name?.trim() || null,
    p_phone: fields.phone?.trim() || null,
    p_role: fields.role ?? null,
  });
  if (error) throw error;
}

/** الملف الكامل: البروفايل، الإحصائيات، الطلبات، العناوين، البحث، المشاهدات، المحفظة، سجل التحركات، الجلسات */
export interface AdminUserDetails {
  user: any;
  is_currently_blocked: boolean;
  auth: { email: string; last_sign_in_at: string | null; created_at: string } | null;
  profile: any;
  stats: { orders_count: number; total_spent: number; cancelled_orders: number; addresses_count: number; reviews_count: number; complaints_count: number; refunds_count: number };
  recent_orders: any[];
  addresses: any[];
  recent_searches: any[];
  recent_views: any[];
  wallet_transactions: any[];
  activity: any[];
  sessions: any[];
}

export async function getAdminUserDetails(userId: string): Promise<AdminUserDetails> {
  const { data, error } = await supabase.rpc('admin_get_user_details', { p_user_id: userId });
  if (error) throw error;
  return data as AdminUserDetails;
}

/** إجبار المندوب على وضع أوفلاين/أونلاين */
export async function adminSetDriverOnline(driverProfileId: string, online: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_delivery_online', {
    p_profile_id: driverProfileId,
    p_online: online,
  });
  if (error) throw error;
}

// ============================================================
// ENTERPRISE ADMIN FEATURES
// ============================================================

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  updated_at: string;
}

export async function getSystemSettings(): Promise<Record<string, any>> {
  const { data, error } = await supabase.from('system_settings').select('setting_key, setting_value');
  if (error) throw error;
  const settings: Record<string, any> = {};
  data.forEach((row) => { settings[row.setting_key] = row.setting_value; });
  return settings;
}

export async function updateSystemSetting(key: string, value: any): Promise<void> {
  const { error } = await supabase.from('system_settings')
    .upsert({ setting_key: key, setting_value: value }, { onConflict: 'setting_key' });
  if (error) throw error;
}

export interface AppBanner {
  id: string;
  title: string;
  image_url: string;
  target_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export async function getAppBanners(adminMode = false): Promise<AppBanner[]> {
  let q = supabase.from('app_banners').select('*').order('sort_order', { ascending: true });
  if (!adminMode) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data as AppBanner[];
}

export async function upsertAppBanner(banner: Partial<AppBanner>): Promise<void> {
  const { id, ...values } = banner;
  const query = id
    ? supabase.from('app_banners').update(values).eq('id', id)
    : supabase.from('app_banners').insert(values);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteAppBanner(id: string): Promise<void> {
  const { error } = await supabase.from('app_banners').delete().eq('id', id);
  if (error) throw error;
}

export async function sendBroadcastNotification(data: { title: string; body: string; target_audience: string; user_id: string }): Promise<void> {
  void data.user_id;
  const audienceRole: Record<string, 'customer' | 'merchant' | 'delivery' | undefined> = {
    all: undefined,
    customers: 'customer',
    customer: 'customer',
    merchants: 'merchant',
    merchant: 'merchant',
    delivery: 'delivery',
    drivers: 'delivery',
  };
  const result = await broadcastNotification({
    title: data.title,
    body: data.body,
    role: audienceRole[data.target_audience],
  });
  if (result.sent === 0) throw new Error('لا يوجد مستلمون مطابقون لهذه الفئة.');
}

export async function getAdminPermissions(userId: string): Promise<any> {
  const { data, error } = await supabase.from('admin_permissions').select('permissions').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.permissions ?? null;
}

export async function getAdminCoupons(): Promise<any[]> {
  const { data, error } = await supabase.rpc('admin_list_coupons');
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function createGlobalCoupon(data: { code: string; type: 'fixed' | 'percentage'; value: number; min_order_amount: number; max_discount_amount: number | null; max_uses: number | null; end_date: string | null }): Promise<void> {
  const { error } = await supabase.from('coupons').insert({
    ...data,
    merchant_id: null,
    is_active: true,
  });
  if (error) throw error;
}

export async function getMerchantCoupons(merchantProfileId: string): Promise<any[]> {
  void merchantProfileId;
  const { data, error } = await supabase.rpc('get_my_merchant_coupons');
  if (error) throw error;
  return (data ?? []) as any[];
}

const COUPON_ERROR_MESSAGES: Record<string, string> = {
  COUPON_CODE_TAKEN: 'هذا الكود مستخدم مسبقاً. اختر كوداً آخر.',
  INVALID_COUPON_CODE: 'كود الكوبون يجب أن يكون بين 3 و32 خانة.',
  INVALID_COUPON_CODE_FORMAT: 'الكود يقبل الحروف الإنجليزية والأرقام و(-) و(_) فقط.',
  INVALID_COUPON_TYPE: 'نوع الخصم غير صالح.',
  INVALID_COUPON_VALUE: 'قيمة الخصم يجب أن تكون أكبر من صفر.',
  PERCENTAGE_ABOVE_100: 'نسبة الخصم لا يمكن أن تتجاوز 100%.',
  INVALID_MIN_ORDER: 'الحد الأدنى للطلب غير صالح.',
  INVALID_MAX_DISCOUNT: 'الحد الأقصى للخصم يجب أن يكون أكبر من صفر.',
  INVALID_MAX_USES: 'عدد مرات الاستخدام يجب أن يكون أكبر من صفر.',
  END_DATE_IN_PAST: 'تاريخ الانتهاء يجب أن يكون في المستقبل.',
  COUPON_NOT_FOUND: 'الكوبون غير موجود أو لا يخص متجرك.',
  'merchant account is not operational': 'حساب المتجر غير مفعّل حالياً.',
};

function throwCouponError(error: { message?: string }): never {
  const raw = error.message ?? '';
  const match = Object.keys(COUPON_ERROR_MESSAGES).find((key) => raw.includes(key));
  throw new Error(match ? COUPON_ERROR_MESSAGES[match] : (raw || 'تعذّر تنفيذ العملية على الكوبون.'));
}

// إنشاء كوبون التاجر عبر RPC: المتجر يُستنتج من الجلسة والقيم تُتحقق في السيرفر
export async function createMerchantCoupon(coupon: {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  min_order_amount?: number | null;
  max_discount_amount?: number | null;
  max_uses?: number | null;
  end_date?: string | null;
}): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('merchant_create_coupon', {
    p_code: coupon.code,
    p_type: coupon.type,
    p_value: coupon.value,
    p_min_order_amount: coupon.min_order_amount ?? null,
    p_max_discount_amount: coupon.max_discount_amount ?? null,
    p_max_uses: coupon.max_uses ?? null,
    p_end_date: coupon.end_date ?? null,
  });
  if (error) throwCouponError(error);
  return data as { id: string; code: string };
}

// التعديل مقصور على الحقول المسموحة؛ الكود والمتجر وعدّادات الاستخدام محميّة في السيرفر
// تمرير null صراحةً لأي حقل اختياري يعني «امسح القيمة»؛ إغفال الحقل يعني «اتركه كما هو»
export async function updateMerchantCoupon(id: string, updates: {
  is_active?: boolean;
  min_order_amount?: number | null;
  max_discount_amount?: number | null;
  max_uses?: number | null;
  end_date?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('merchant_update_coupon', {
    p_id: id,
    p_is_active: updates.is_active ?? null,
    p_min_order_amount: updates.min_order_amount ?? null,
    p_max_discount_amount: updates.max_discount_amount ?? null,
    p_max_uses: updates.max_uses ?? null,
    p_end_date: updates.end_date ?? null,
    p_clear_min_order: 'min_order_amount' in updates && updates.min_order_amount === null,
    p_clear_max_discount: 'max_discount_amount' in updates && updates.max_discount_amount === null,
    p_clear_max_uses: 'max_uses' in updates && updates.max_uses === null,
    p_clear_end_date: 'end_date' in updates && updates.end_date === null,
  });
  if (error) throwCouponError(error);
}

// الحذف: الكوبون المستخدَم في طلبات سابقة يُعطَّل بدل حذفه (سلامة السجلات)
export async function deleteMerchantCoupon(id: string): Promise<void> {
  const { error } = await supabase.rpc('merchant_delete_coupon', { p_id: id });
  if (error) throwCouponError(error);
}

export interface MerchantCoupon {
  id: string;
  merchant_id: string;
  code: string;
  type: string;
  value: number;
  min_order_amount: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  end_date: string;
}

export interface WithdrawalRequest {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  notes: string | null;
  requester_notes?: string | null;
  admin_notes?: string | null;
  payout_destination?: Record<string, unknown> | null;
  external_reference?: string | null;
  processed_at?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export async function getMyWithdrawalRequests(userId: string): Promise<WithdrawalRequest[]> {
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select('id, amount, status, notes, requester_notes, admin_notes, payout_destination, external_reference, processed_at, paid_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as WithdrawalRequest[];
}

export async function requestWithdrawal(amount: number, _userId: string, notes?: string): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('مبلغ السحب غير صالح.');
  const { error } = await supabase.rpc('request_withdrawal', {
    p_amount: amount,
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
}

export interface AdminStats {
  netSettledGmv: number;
  totalUsers: number;
  totalOrders: number;
  activeOrders: number;
  onlineDrivers: number;
  pendingMerchants: number;
  averageOrderValue: number;
  completionRate: number;
  trends: { netSettledGmv: number; users: number; orders: number };
  chartData: { date: string; count: number }[];
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_get_operational_stats');
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, any>;
  const trends = (raw.trends ?? {}) as Record<string, any>;
  return {
    netSettledGmv: Number(raw.net_settled_gmv ?? 0),
    totalUsers: Number(raw.total_users ?? 0),
    totalOrders: Number(raw.total_orders ?? 0),
    activeOrders: Number(raw.active_orders ?? 0),
    pendingMerchants: Number(raw.pending_merchants ?? 0),
    onlineDrivers: Number(raw.online_drivers ?? 0),
    averageOrderValue: Number(raw.average_order_value ?? 0),
    completionRate: Number(raw.completion_rate ?? 0),
    trends: {
      netSettledGmv: Number(trends.net_settled_gmv ?? 0),
      users: Number(trends.users ?? 0),
      orders: Number(trends.orders ?? 0),
    },
    chartData: Array.isArray(raw.chart_data)
      ? raw.chart_data.map((point: any) => ({
          date: String(point.date ?? ''),
          count: Number(point.count ?? 0),
        }))
      : [],
  };
}

export async function getUnreadNotificationsCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from(TABLES.NOTIFICATIONS)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

export async function addProductImages(productId: string, imageUrls: string[]): Promise<void> {
  const rows = imageUrls.map((url, i) => ({
    product_id: productId,
    image_url: url,
    is_primary: i === 0,
    sort_order: i,
  }));
  // حذف ثم إدخال حتى تكون الدالة آمنة عند إعادة المحاولة (لا صور مكررة)
  const { error: deleteError } = await supabase.from('product_images').delete().eq('product_id', productId);
  if (deleteError) throw deleteError;
  const { error } = await supabase.from('product_images').insert(rows);
  if (error) throw error;
}

export interface MerchantReportData {
  chart: number[];
  topProducts: { id: string; name: string; total_sold: number; revenue: number; og_image_url: string | null }[];
  stats: {
    currentRevenue: number; previousRevenue: number;
    currentOrders: number; previousOrders: number;
    deliveredCount: number; cancelledCount: number; inProgressCount: number;
  };
}

// تقرير التاجر كاملاً في استدعاء SQL واحد (merchant_sales_report) —
// التاجر يُستنتج من جلسة المصادقة في السيرفر، ولا حدود صفوف لأن التجميع يتم في القاعدة
export async function getMerchantReport(days: number): Promise<MerchantReportData> {
  const { data, error } = await supabase.rpc('merchant_sales_report', { p_days: days });
  if (error) throw error;
  const r = (data ?? {}) as any;
  const s = r.stats ?? {};
  return {
    chart: ((r.chart ?? []) as unknown[]).map((v) => Number(v) || 0),
    topProducts: ((r.top_products ?? []) as any[]).map((p) => ({
      id: String(p.id ?? ''),
      name: p.name ?? 'منتج',
      total_sold: Number(p.total_sold ?? 0),
      revenue: Number(p.revenue ?? 0),
      og_image_url: p.og_image_url ?? null,
    })),
    stats: {
      currentRevenue: Number(s.current_revenue ?? 0),
      previousRevenue: Number(s.previous_revenue ?? 0),
      currentOrders: Number(s.current_orders ?? 0),
      previousOrders: Number(s.previous_orders ?? 0),
      deliveredCount: Number(s.delivered_count ?? 0),
      cancelledCount: Number(s.cancelled_count ?? 0),
      inProgressCount: Number(s.in_progress_count ?? 0),
    },
  };
}

export async function getMerchantPeriodStats(merchantId: string, days: number): Promise<{
  currentRevenue: number; previousRevenue: number;
  currentOrders: number; previousOrders: number;
  deliveredCount: number; cancelledCount: number; inProgressCount: number;
}> {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - days);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - days);

  // ترقيم الصفحات لتجاوز حد الصفوف (1000) عند كثرة الطلبات
  const all = await fetchAllRows<{ total_amount: number | null; status: string; created_at: string }>(() =>
    supabase
      .from(TABLES.ORDERS)
      .select('total_amount, status, created_at')
      .eq('merchant_id', merchantId)
      .gte('created_at', previousStart.toISOString())
      .order('created_at'),
  );
  const current = all.filter(o => new Date(o.created_at) >= currentStart);
  const previous = all.filter(o => new Date(o.created_at) < currentStart);

  return {
    currentRevenue: current.filter((o) => o.status === 'delivered').reduce((s, o) => s + (o.total_amount ?? 0), 0),
    previousRevenue: previous.filter((o) => o.status === 'delivered').reduce((s, o) => s + (o.total_amount ?? 0), 0),
    currentOrders: current.length,
    previousOrders: previous.length,
    deliveredCount: current.filter(o => o.status === 'delivered').length,
    cancelledCount: current.filter(o => o.status === 'cancelled').length,
    inProgressCount: current.filter(o => !['delivered', 'cancelled'].includes(o.status)).length,
  };
}

export interface BroadcastCampaignResult {
  campaign_id: string;
  matched: number;
  created: number;
  push_queued: number;
}

export async function broadcastNotification(data: {
  title: string;
  body: string;
  role?: 'customer' | 'merchant' | 'delivery';
  channel?: 'in_app' | 'push';
  idempotencyKey?: string;
}): Promise<{ sent: number } & BroadcastCampaignResult> {
  const title = data.title.trim();
  const body = data.body.trim();
  if (!title || !body) throw new Error('عنوان الإشعار ومحتواه مطلوبان.');
  if (title.length > 100 || body.length > 1000) throw new Error('محتوى الإشعار أطول من الحد المسموح.');
  const { data: result, error } = await supabase.rpc('create_broadcast_campaign', {
    p_title: title,
    p_body: body,
    p_role: data.role ?? null,
    p_channel: data.channel ?? 'in_app',
    p_idempotency_key: data.idempotencyKey ?? createIdempotencyKey(),
  });
  if (error) throw error;
  const campaign = result as BroadcastCampaignResult | null;
  if (!campaign?.campaign_id) throw new Error('لم يُرجع الخادم نتيجة حملة الإشعارات.');
  return { ...campaign, sent: Number(campaign.created ?? 0) };
}

