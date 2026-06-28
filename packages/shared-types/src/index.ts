// ============================================================
// DATABASE TYPES — مشتقة من 96 جدول
// TypeScript strict — بدون any
// ============================================================

import type { UserRole, OrderStatus, PaymentMethod } from '../../shared-utils/src/constants';

// ---- Shared Base -------------------------------------------
export interface BaseRecord {
  id: string;
  created_at: string;
}

// ---- 1. Users ----------------------------------------------
export interface User extends BaseRecord {
  email: string | null;
  phone: string | null;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  admin_role_id: string | null;
  updated_at: string;
}

export type UserInsert = Omit<User, 'id' | 'created_at' | 'updated_at'>;
export type UserUpdate = Partial<UserInsert>;

// ---- 2. MerchantProfile ------------------------------------
export interface MerchantProfile extends BaseRecord {
  user_id: string;
  store_name: string;
  store_slug: string;
  store_logo_url: string | null;
  store_banner_url: string | null;
  store_description: string | null;
  store_category: string | null;
  commercial_register: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  total_reviews: number;
  is_approved: boolean;
  commission_rate: number;
  bank_account: string | null;
  bank_name: string | null;
  service_area_ids: string[];
}

// ---- 3. DeliveryProfile ------------------------------------
export type VehicleType = 'motorcycle' | 'car' | 'bicycle';

export interface DeliveryProfile extends BaseRecord {
  user_id: string;
  national_id: string | null;
  vehicle_type: VehicleType | null;
  vehicle_plate: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  is_online: boolean;
  is_approved: boolean;
  rating: number;
  total_deliveries: number;
  wallet_balance: number;
}

// ---- 4. CustomerProfile ------------------------------------
export interface CustomerProfile extends BaseRecord {
  user_id: string;
  loyalty_points: number;
  wallet_balance: number;
}

// ---- 5. Address --------------------------------------------
export interface Address extends BaseRecord {
  user_id: string;
  label: string | null;
  full_address: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
}

// ---- 6. Category -------------------------------------------
export interface Category extends BaseRecord {
  name: string;
  name_ar: string | null;
  icon_url: string | null;
  parent_id: string | null;
  is_active: boolean;
}

// ---- 7. Product --------------------------------------------
export interface Product extends BaseRecord {
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
  meta_title: string | null;
  meta_description: string | null;
  tags: string[];
  share_url: string | null;
  og_image_url: string | null;
}

// ---- 8. ProductVariant -------------------------------------
export interface ProductVariant extends BaseRecord {
  product_id: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  additional_price: number;
  stock_qty: number;
  sku: string | null;
  is_active: boolean;
}

// ---- 9. ProductImage ---------------------------------------
export interface ProductImage extends BaseRecord {
  product_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
}

// ---- 10. InventoryLog --------------------------------------
export type InventoryChangeType = 'add' | 'subtract' | 'set';

export interface InventoryLog extends BaseRecord {
  variant_id: string;
  change_type: InventoryChangeType;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  created_by: string | null;
}

// ---- 11. Cart ----------------------------------------------
export interface Cart extends BaseRecord {
  user_id: string;
  merchant_id: string;
}

// ---- 12. CartItem ------------------------------------------
export interface CartItem extends BaseRecord {
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  price_at_add: number | null;
}

// ---- 13. OrderGroup ----------------------------------------
export interface OrderGroup extends BaseRecord {
  customer_id: string;
  group_number: string | null;
  total_amount: number | null;
  payment_status: 'pending' | 'paid' | 'refunded' | null;
  payment_reference: string | null;
}

// ---- 14. Order ---------------------------------------------
export interface Order extends BaseRecord {
  order_number: string;
  customer_id: string;
  merchant_id: string;
  delivery_id: string | null;
  address_id: string;
  group_id: string | null;
  status: OrderStatus;
  subtotal: number | null;
  delivery_fee: number;
  discount_amount: number;
  platform_commission: number | null;
  tax_amount: number;
  total_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_status: 'pending' | 'paid' | 'refunded';
  coupon_id: string | null;
  notes: string | null;
  is_scheduled: boolean;
  scheduled_at: string | null;
  scheduled_time_slot: string | null;
  estimated_delivery_time: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancellation_reason_id: string | null;
  updated_at: string;
}

// ---- 15. OrderItem -----------------------------------------
export interface OrderItem extends BaseRecord {
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string | null;
  variant_details: Record<string, string> | null;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
}

// ---- 16. OrderTracking -------------------------------------
export interface OrderTracking extends BaseRecord {
  order_id: string;
  status: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

// ---- 17. Coupon --------------------------------------------
export type CouponType = 'percentage' | 'fixed' | 'free_delivery';

export interface Coupon extends BaseRecord {
  merchant_id: string | null;
  code: string;
  type: CouponType | null;
  value: number | null;
  min_order_amount: number;
  max_discount_amount: number | null;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

// ---- 18. CouponUsage ---------------------------------------
export interface CouponUsage extends BaseRecord {
  coupon_id: string;
  user_id: string;
  order_id: string;
  used_at: string;
}

// ---- 19. Advertisement -------------------------------------
export type AdLinkType = 'product' | 'store' | 'category' | 'external';
export type AdStatus = 'pending' | 'active' | 'paused' | 'ended' | 'rejected';

export interface Advertisement extends BaseRecord {
  merchant_id: string | null;
  title: string | null;
  image_url: string;
  link_type: AdLinkType | null;
  link_value: string | null;
  start_date: string | null;
  end_date: string | null;
  daily_budget: number | null;
  total_budget: number | null;
  spent_amount: number;
  impressions: number;
  clicks: number;
  status: AdStatus;
  priority: number;
}

// ---- 20. Review --------------------------------------------
export type ReviewTargetType = 'product' | 'merchant' | 'delivery';

export interface Review extends BaseRecord {
  order_id: string | null;
  reviewer_id: string;
  target_type: ReviewTargetType;
  target_id: string;
  rating: number;
  comment: string | null;
  images: string[];
  is_verified: boolean;
  from_merchant: boolean;
}

// ---- 21. Notification --------------------------------------
export type NotificationChannel = 'push' | 'sms' | 'email' | 'in_app';

export interface Notification extends BaseRecord {
  user_id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  channel: NotificationChannel;
  sent_at: string | null;
  failed_reason: string | null;
}

// ---- 22. WalletTransaction ----------------------------------
export type WalletTransactionType = 'credit' | 'debit';

export interface WalletTransaction extends BaseRecord {
  user_id: string;
  type: WalletTransactionType;
  amount: number;
  source: string | null;
  reference_id: string | null;
  balance_after: number | null;
  notes: string | null;
}

// ---- 23. DeliveryZone ---------------------------------------
export interface DeliveryZone extends BaseRecord {
  merchant_id: string;
  zone_name: string | null;
  delivery_fee: number | null;
  min_order_amount: number;
  estimated_time_minutes: number | null;
  polygon_coordinates: number[][][] | null;
  is_active: boolean;
}

// ---- 24. PlatformSettings -----------------------------------
export interface PlatformSetting {
  key: string;
  value: string | null;
  description: string | null;
  updated_at: string;
}

// ---- 25. Complaint ------------------------------------------
export type ComplaintCategory =
  | 'wrong_item' | 'damaged_item' | 'not_delivered'
  | 'late_delivery' | 'bad_behavior' | 'fraud' | 'refund_issue' | 'other';

export type ComplaintStatus = 'open' | 'under_review' | 'resolved' | 'closed' | 'escalated';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ComplaintAgainstType = 'merchant' | 'delivery' | 'customer' | 'platform';

export interface Complaint extends BaseRecord {
  order_id: string | null;
  complainant_id: string;
  against_id: string | null;
  against_type: ComplaintAgainstType | null;
  category: ComplaintCategory | null;
  title: string;
  description: string | null;
  evidence_images: string[];
  status: ComplaintStatus;
  priority: ComplaintPriority;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

// ---- 27. ChatConversation -----------------------------------
export interface ChatConversation extends BaseRecord {
  order_id: string | null;
  customer_id: string;
  merchant_id: string;
  last_message: string | null;
  last_message_at: string | null;
  customer_unread: number;
  merchant_unread: number;
  is_active: boolean;
}

// ---- 28. ChatMessage ----------------------------------------
export type ChatMessageType = 'text' | 'image' | 'order_ref';

export interface ChatMessage extends BaseRecord {
  conversation_id: string;
  sender_id: string;
  message: string | null;
  message_type: ChatMessageType | null;
  attachment_url: string | null;
  is_read: boolean;
}

// ---- 29. RefundRequest --------------------------------------
export type RefundReason =
  | 'wrong_item' | 'damaged' | 'not_as_described'
  | 'changed_mind' | 'not_received' | 'other';
export type RefundMethod = 'wallet' | 'original_payment';
export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';

export interface RefundRequest extends BaseRecord {
  order_id: string;
  customer_id: string;
  reason: RefundReason | null;
  description: string | null;
  evidence_images: string[];
  refund_amount: number | null;
  refund_method: RefundMethod | null;
  status: RefundStatus;
  merchant_response: string | null;
  admin_notes: string | null;
  processed_at: string | null;
}

// ---- 30-34. Loyalty & Referral -----------------------------
export interface Wishlist extends BaseRecord {
  user_id: string;
  product_id: string;
}

export interface StoreFollow extends BaseRecord {
  user_id: string;
  merchant_id: string;
}

export type LoyaltyAction =
  | 'first_order' | 'order_complete' | 'review_left'
  | 'referral_success' | 'birthday' | 'daily_login';

export interface LoyaltyTransaction extends BaseRecord {
  user_id: string;
  action: string;
  points: number;
  reference_id: string | null;
  balance_after: number | null;
  expires_at: string | null;
}

export interface ReferralCode extends BaseRecord {
  user_id: string;
  code: string;
  total_uses: number;
  total_earned_points: number;
}

// ---- 36. MerchantPayout ------------------------------------
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface MerchantPayout extends BaseRecord {
  merchant_id: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  commission_deducted: number;
  refunds_deducted: number;
  net_amount: number;
  status: PayoutStatus;
  bank_transfer_ref: string | null;
  paid_at: string | null;
}

// ---- 37. DeliveryEarnings ----------------------------------
export interface DeliveryEarnings extends BaseRecord {
  delivery_id: string;
  order_id: string;
  base_earning: number;
  bonus_earning: number;
  tip_amount: number;
  total_earning: number;
}

// ---- 42. UserSettings --------------------------------------
export interface UserSettings {
  user_id: string;
  language: 'ar' | 'en';
  notifications_enabled: boolean;
  order_notifications: boolean;
  promo_notifications: boolean;
  dark_mode: boolean;
  updated_at: string;
}

// ---- 43. DeviceToken ----------------------------------------
export type DeviceType = 'ios' | 'android' | 'web';

export interface DeviceToken extends BaseRecord {
  user_id: string;
  token: string;
  device_type: DeviceType | null;
  is_active: boolean;
}

// ---- 49. OtpCode -------------------------------------------
export type OtpPurpose =
  | 'login' | 'register' | 'reset_password'
  | 'verify_phone' | 'confirm_order';

export interface OtpCode extends BaseRecord {
  phone: string | null;
  email: string | null;
  code: string;
  purpose: OtpPurpose;
  is_used: boolean;
  attempts: number;
  expires_at: string;
}

// ---- 66-67. Subscriptions ----------------------------------
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial';

export interface SubscriptionPlan extends BaseRecord {
  name: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  max_products: number | null;
  max_orders_per_month: number | null;
  commission_rate: number | null;
  features: string[];
  is_active: boolean;
}

export interface MerchantSubscription extends BaseRecord {
  merchant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  started_at: string | null;
  expires_at: string | null;
  auto_renew: boolean;
  payment_reference: string | null;
}

// ---- 91. SavedPaymentMethod --------------------------------
export type SavedPaymentType = 'card' | 'apple_pay' | 'stc_pay' | 'wallet';

export interface SavedPaymentMethod extends BaseRecord {
  user_id: string;
  type: SavedPaymentType;
  card_last4: string | null;
  card_brand: string | null;
  card_expiry: string | null;
  token: string | null;
  is_default: boolean;
}

// ---- Extended / Joined Types --------------------------------
export interface ProductWithImages extends Product {
  product_images: ProductImage[];
  product_variants: ProductVariant[];
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
  addresses: Address | null;
  merchant_profiles: Pick<MerchantProfile, 'store_name' | 'store_logo_url'> | null;
}

export interface CartWithItems extends Cart {
  cart_items: (CartItem & {
    products: Pick<Product, 'name' | 'name_ar' | 'base_price' | 'sale_price'> | null;
    product_variants: ProductVariant | null;
  })[];
}

// ---- API Response Wrapper ----------------------------------
export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code?: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
