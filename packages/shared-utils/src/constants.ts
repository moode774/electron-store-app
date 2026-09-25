// ============================================================
// CONSTANTS — لا hardcoded strings في المشروع
// ============================================================

export const APP_NAME = 'متجر اليمن' as const;

// ---- Colors ------------------------------------------------
export const COLORS = {
  primary: '#172554',
  primaryLight: '#29457A',
  primaryDark: '#0B1736',
  primarySoft: '#F1F5FB',
  secondary: '#315E73',
  secondarySoft: '#EEF5F7',
  accentCoral: '#E76F3C',
  accentCoralSoft: '#FFF3ED',
  accentMint: '#16856F',
  accentMintSoft: '#EAF7F3',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F1F3F5',
  border: '#E3E7EC',
  borderStrong: '#CED5DD',
  textPrimary: '#111827',
  textSecondary: '#52606D',
  textMuted: '#7A8793',
  success: '#16856F',
  warning: '#D99522',
  error: '#D84A4A',
  info: '#2F6EA3',
  overlay: 'rgba(11,23,54,0.52)',
  // Operational (driver) surfaces: calm neutral canvas, navy as the only brand
  // color, green reserved for the small "online" status signal.
  canvas: '#F6F7FB',
  ink: '#0F172A',
  inkSecondary: '#64748B',
  inkTertiary: '#94A3B8',
  statusOnline: '#16A34A',
  hairline: '#E2E8F0',
  warningSoft: '#FEF3C7',
  warningInk: '#92400E',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 30,
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
