// ============================================================
// PRICING — خوارزميات التسعير: التوصيل، العمولة، الولاء، الإجماليات
// ============================================================
import { PRICING, ZONE_BASE_FEE } from './constants';
import { haversineKm, type LatLng, hasValidCoords } from './geo';

// ---- Delivery fee ------------------------------------------
export interface DeliveryFeeInput {
  /** مبلغ السلة قبل التوصيل (لاحتساب التوصيل المجاني) */
  subtotal: number;
  /** مدينة/منطقة العميل لاختيار الرسوم الأساسية الاحتياطية */
  zone?: string;
  /** موقع المتجر (اختياري) */
  origin?: Partial<LatLng> | null;
  /** موقع العميل (اختياري) */
  destination?: Partial<LatLng> | null;
}

export interface DeliveryFeeResult {
  fee: number;
  distanceKm: number | null;
  isFree: boolean;
  base: number;
}

/**
 * حساب رسوم التوصيل:
 * - إن توفّرت إحداثيات الطرفين: أساس المنطقة + رسوم لكل كم بعد النطاق المجاني.
 * - وإلا: رسوم المنطقة الثابتة (احتياطي).
 * - توصيل مجاني فوق العتبة، مع حدّ أدنى وأقصى.
 */
export function calculateDeliveryFee(input: DeliveryFeeInput): DeliveryFeeResult {
  const base = (input.zone && ZONE_BASE_FEE[input.zone]) || PRICING.DEFAULT_BASE_DELIVERY_FEE;

  // توصيل مجاني فوق العتبة
  if (input.subtotal >= PRICING.FREE_DELIVERY_THRESHOLD) {
    return { fee: 0, distanceKm: null, isFree: true, base };
  }

  let distanceKm: number | null = null;
  let fee = base;

  if (hasValidCoords(input.origin) && hasValidCoords(input.destination)) {
    distanceKm = haversineKm(input.origin, input.destination);
    const billableKm = Math.max(0, distanceKm - PRICING.FREE_KM_RADIUS);
    fee = base + Math.round(billableKm * PRICING.PER_KM_FEE);
  }

  fee = Math.min(PRICING.MAX_DELIVERY_FEE, Math.max(PRICING.MIN_DELIVERY_FEE, Math.round(fee)));
  return { fee, distanceKm, isFree: false, base };
}

// ---- Order totals ------------------------------------------
export interface CartTotalsInput {
  subtotal: number;
  deliveryFee?: number;
  discount?: number;
  taxRate?: number; // نسبة مئوية
}

export interface CartTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
}

/** احتساب إجماليات الطلب بشكل موحّد (لا قيم سالبة). */
export function calculateOrderTotals(input: CartTotalsInput): CartTotals {
  const subtotal = Math.max(0, input.subtotal);
  const deliveryFee = Math.max(0, input.deliveryFee ?? 0);
  const discount = Math.max(0, Math.min(subtotal, input.discount ?? 0));
  const taxRate = input.taxRate ?? PRICING.TAX_RATE;
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * taxRate) / 100);
  const total = Math.max(0, taxable + tax + deliveryFee);
  return { subtotal, deliveryFee, discount, tax, total };
}

// ---- Coupon discount ---------------------------------------
/** خصم الكوبون مع سقف وحدّ أدنى للطلب. */
export function computeCouponDiscount(
  coupon: { type: string; value: number; min_order_amount?: number | null; max_discount_amount?: number | null },
  subtotal: number,
): { discount: number; ok: boolean; reason?: string } {
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
    return { discount: 0, ok: false, reason: `الحد الأدنى للطلب ${coupon.min_order_amount}` };
  }
  let discount = coupon.type === 'percentage'
    ? Math.round((subtotal * coupon.value) / 100)
    : coupon.value;
  if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
    discount = coupon.max_discount_amount;
  }
  discount = Math.max(0, Math.min(subtotal, discount));
  return { discount, ok: discount > 0 };
}

// ---- Platform commission -----------------------------------
/** عمولة المنصّة من التاجر على المجموع الفرعي. */
export function calculatePlatformCommission(subtotal: number, rate = PRICING.DEFAULT_COMMISSION_RATE): number {
  return Math.round((Math.max(0, subtotal) * rate) / 100);
}

/** صافي مستحقّ التاجر بعد العمولة. */
export function merchantPayout(subtotal: number, rate = PRICING.DEFAULT_COMMISSION_RATE): number {
  return Math.max(0, subtotal - calculatePlatformCommission(subtotal, rate));
}

// ---- Delivery earning --------------------------------------
/** حصّة المندوب من رسوم التوصيل (+ إكرامية اختيارية). */
export function calculateDeliveryEarning(deliveryFee: number, tip = 0): number {
  return Math.round(Math.max(0, deliveryFee) * PRICING.DELIVERY_BASE_EARNING_RATE) + Math.max(0, tip);
}

// ---- Loyalty -----------------------------------------------
/** نقاط الولاء المكتسبة من مبلغ الطلب. */
export function loyaltyPointsEarned(amount: number): number {
  return Math.floor(Math.max(0, amount) / PRICING.LOYALTY_UNIT) * PRICING.LOYALTY_POINTS_PER_UNIT;
}

/** القيمة النقدية لرصيد نقاط الولاء. */
export function loyaltyPointsValue(points: number): number {
  return Math.max(0, Math.floor(points)) * PRICING.LOYALTY_POINT_VALUE;
}
