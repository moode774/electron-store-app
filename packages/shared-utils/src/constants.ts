// ============================================================
// CONSTANTS — لا hardcoded strings في المشروع
// ============================================================

export const APP_NAME = 'متجر اليمن' as const;

// ---- Currency ----------------------------------------------
// عملة موحّدة عبر كل التطبيق (الريال اليمني)
export const CURRENCY = {
  CODE: 'YER',
  SYMBOL: 'ر.ي',
  DECIMALS: 0, // الريال اليمني لا يُكسَّر عملياً في التعامل اليومي
} as const;

// ---- Colors ------------------------------------------------
export const COLORS = {
  primary: '#1B2B4B',
  primaryLight: '#2A3F6F',
  primaryDark: '#0F1A2E',
  secondary: '#C9A84C',
  background: '#F5F5F7',
  surface: '#FFFFFF',
  border: '#E8E8E8',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  success: '#2ECC71',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  overlay: 'rgba(0,0,0,0.5)',
} as const;

// ---- Spacing -----------------------------------------------
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ---- Font Sizes --------------------------------------------
export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
} as const;

// ---- Border Radius -----------------------------------------
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// ---- User Roles --------------------------------------------
export const USER_ROLES = {
  CUSTOMER: 'customer',
  MERCHANT: 'merchant',
  DELIVERY: 'delivery',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// ---- Order Statuses ----------------------------------------
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  ON_THE_WAY: 'on_the_way',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
  FAILED_DELIVERY: 'failed_delivery',
  RESCHEDULED: 'rescheduled',
  PARTIAL_DELIVERY: 'partial_delivery',
  DISPUTED: 'disputed',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

// ---- Payment Methods ---------------------------------------
export const PAYMENT_METHOD = {
  CASH: 'cash',
  CARD: 'card',
  WALLET: 'wallet',
  COD: 'cod',
  JAWALI: 'jawali',
  ONE_CASH: 'one_cash',
  CASH_WALLET: 'cash_wallet',
  FLOOSAK: 'floosak',
  JAIB: 'jaib',
  KURAIMI: 'kuraimi',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

// ---- Payment Status ----------------------------------------
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
} as const;

// ---- Notification Channels ---------------------------------
export const NOTIFICATION_CHANNEL = {
  PUSH: 'push',
  SMS: 'sms',
  EMAIL: 'email',
  IN_APP: 'in_app',
} as const;

// ---- Vehicle Types -----------------------------------------
export const VEHICLE_TYPE = {
  MOTORCYCLE: 'motorcycle',
  CAR: 'car',
  BICYCLE: 'bicycle',
} as const;

// ---- Service Areas (Regional Pricing) ------------------------
export const SERVICE_AREAS = {
  SANAA: 'sanaa',
  ADEN: 'aden',
  IBB: 'ibb',
  TAIZ: 'taiz',
} as const;


// ---- Pricing & Delivery Defaults ---------------------------
// قيم افتراضية للخوارزميات حين لا تتوفّر إعدادات المنصّة من قاعدة البيانات
export const PRICING = {
  // رسوم التوصيل
  DEFAULT_BASE_DELIVERY_FEE: 1000, // أساس داخل المدينة
  PER_KM_FEE: 120, // لكل كيلومتر بعد المسافة المجانية
  FREE_KM_RADIUS: 2, // أول كيلومترين بلا رسوم إضافية
  MIN_DELIVERY_FEE: 700,
  MAX_DELIVERY_FEE: 5000,
  FREE_DELIVERY_THRESHOLD: 30000, // توصيل مجاني فوق هذا المبلغ
  // العمولة والولاء
  DEFAULT_COMMISSION_RATE: 10, // % عمولة المنصّة من التاجر
  TAX_RATE: 0, // لا ضريبة افتراضياً
  LOYALTY_POINTS_PER_UNIT: 1, // نقطة لكل LOYALTY_UNIT
  LOYALTY_UNIT: 100, // كل 100 ر.ي = نقطة
  LOYALTY_POINT_VALUE: 1, // قيمة النقطة عند الاستبدال (ر.ي)
  // المندوب
  DELIVERY_BASE_EARNING_RATE: 0.8, // حصة المندوب من رسوم التوصيل
} as const;

// رسوم أساسية لكل مدينة (احتياطي حين لا تتوفّر إحداثيات لحساب المسافة)
export const ZONE_BASE_FEE: Record<string, number> = {
  sanaa: 1000,
  aden: 1500,
  ibb: 1200,
  taiz: 1200,
};

// ---- Supabase Tables ---------------------------------------
export const TABLES = {
  USERS: 'users',
  MERCHANT_PROFILES: 'merchant_profiles',
  DELIVERY_PROFILES: 'delivery_profiles',
  CUSTOMER_PROFILES: 'customer_profiles',
  ADDRESSES: 'addresses',
  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  PRODUCT_VARIANTS: 'product_variants',
  PRODUCT_IMAGES: 'product_images',
  INVENTORY_LOGS: 'inventory_logs',
  CARTS: 'carts',
  CART_ITEMS: 'cart_items',
  ORDER_GROUPS: 'order_groups',
  ORDERS: 'orders',
  ORDER_ITEMS: 'order_items',
  ORDER_TRACKING: 'order_tracking',
  COUPONS: 'coupons',
  COUPON_USAGE: 'coupon_usage',
  ADVERTISEMENTS: 'advertisements',
  REVIEWS: 'reviews',
  NOTIFICATIONS: 'notifications',
  WALLET_TRANSACTIONS: 'wallet_transactions',
  DELIVERY_ZONES: 'delivery_zones',
  PLATFORM_SETTINGS: 'platform_settings',
  COMPLAINTS: 'complaints',
  CHAT_CONVERSATIONS: 'chat_conversations',
  CHAT_MESSAGES: 'chat_messages',
  REFUND_REQUESTS: 'refund_requests',
  WISHLISTS: 'wishlists',
  STORE_FOLLOWS: 'store_follows',
  OTP_CODES: 'otp_codes',
  DEVICE_TOKENS: 'device_tokens',
} as const;

// ---- Storage Buckets ----------------------------------------
export const STORAGE_BUCKETS = {
  AVATARS: 'avatars',
  PRODUCTS: 'products',
  STORES: 'stores',
  ORDERS: 'orders',
  COMPLAINTS: 'complaints',
} as const;

// ---- AsyncStorage Keys -------------------------------------
export const STORAGE_KEYS = {
  SESSION: 'marketplace_session',
  USER: 'marketplace_user',
  LANGUAGE: 'marketplace_language',
  THEME: 'marketplace_theme',
  ONBOARDING_DONE: 'marketplace_onboarding',
} as const;

// ---- API Timeouts ------------------------------------------
export const TIMEOUTS = {
  OTP_EXPIRY_SECONDS: 300,
  REQUEST_TIMEOUT_MS: 15000,
  DELIVERY_OFFER_SECONDS: 30,
} as const;

// ---- Pagination --------------------------------------------
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PRODUCTS_PAGE_SIZE: 24,
  ORDERS_PAGE_SIZE: 15,
} as const;
