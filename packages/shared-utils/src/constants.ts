// ============================================================
// CONSTANTS — لا hardcoded strings في المشروع
// ============================================================

export const APP_NAME = 'متجر اليمن' as const;

// ---- Colors ------------------------------------------------
export const COLORS = {
  primary: '#5B4BFF',
  primaryLight: '#7C6EFF',
  primaryDark: '#3828D6',
  primarySoft: '#EEEAFE',
  secondary: '#C8F169',
  secondarySoft: '#F3FBCF',
  accentCoral: '#FF6B66',
  accentCoralSoft: '#FFE8E6',
  accentMint: '#4AD9B0',
  accentMintSoft: '#DDF8F0',
  background: '#F8F7FB',
  surface: '#FFFFFF',
  surfaceRaised: '#FCFBFF',
  surfaceMuted: '#F0EEF6',
  border: '#E8E5F0',
  borderStrong: '#D7D2E3',
  textPrimary: '#17151F',
  textSecondary: '#625D6E',
  textMuted: '#918B9E',
  success: '#109B76',
  warning: '#F59E0B',
  error: '#E84E4A',
  info: '#5B4BFF',
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
  display: 40,
} as const;

// ---- Typography --------------------------------------------
// Use explicit families so native platforms render the intended weight instead
// of synthesizing bold glyphs from the regular Arabic font file.
export const FONTS = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semiBold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
} as const;

// ---- Border Radius -----------------------------------------
export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 36,
  full: 9999,
} as const;

// ---- Responsive layout -------------------------------------
export const BREAKPOINTS = {
  compact: 430,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
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
