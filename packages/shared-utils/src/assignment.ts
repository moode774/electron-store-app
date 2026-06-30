// ============================================================
// ASSIGNMENT — خوارزمية إسناد الطلبات للمندوبين وترتيب العروض
// ============================================================
import { haversineKm, type LatLng, hasValidCoords } from './geo';

// إعدادات افتراضية تُستبدل بقيم assignment_settings من القاعدة
export const ASSIGNMENT_DEFAULTS = {
  maxRadiusKm: 8,
  offerTimeoutSeconds: 30,
  maxAttempts: 5,
} as const;

// ---- ترتيب العروض من منظور المندوب ----------------------------
export interface DeliveryOffer {
  id: string;
  deliveryFee: number;
  /** موقع الاستلام (المتجر) */
  pickup?: Partial<LatLng> | null;
  createdAt?: string;
}

export interface ScoredOffer<T extends DeliveryOffer> {
  offer: T;
  distanceKm: number | null;
  score: number;
}

/**
 * درجة عرض توصيل للمندوب: قُرب المتجر (الأهم) + أجر التوصيل + أولوية الأقدم.
 * أعلى = أفضل. يُعيد score منخفضاً جداً لما هو خارج النطاق.
 */
export function scoreDeliveryOffer<T extends DeliveryOffer>(
  offer: T,
  courierLocation: Partial<LatLng> | null | undefined,
  maxRadiusKm = ASSIGNMENT_DEFAULTS.maxRadiusKm,
): ScoredOffer<T> {
  let distanceKm: number | null = null;
  if (hasValidCoords(courierLocation) && hasValidCoords(offer.pickup)) {
    distanceKm = haversineKm(courierLocation, offer.pickup);
  }

  // مكوّن القرب (0..60): كلما قرُب زاد
  let proximity = 30; // محايد عند غياب الإحداثيات
  if (distanceKm != null) {
    proximity = Math.max(0, 60 * (1 - distanceKm / Math.max(1, maxRadiusKm)));
  }

  // مكوّن الأجر (0..30): تطبيع لوغاريتمي لتفادي هيمنة الطلبات الكبيرة
  const feeScore = Math.min(30, Math.log10(Math.max(0, offer.deliveryFee) + 1) * 12);

  // مكوّن الأقدمية (0..10): الأقدم أولاً
  let ageScore = 0;
  if (offer.createdAt) {
    const ageMin = (Date.now() - new Date(offer.createdAt).getTime()) / 60000;
    ageScore = Math.min(10, ageMin / 2);
  }

  return { offer, distanceKm, score: proximity + feeScore + ageScore };
}

/**
 * ترتيب عروض التوصيل للمندوب حسب الأفضلية، مع استبعاد ما هو خارج النطاق
 * (فقط حين تتوفّر إحداثيات صالحة لكليهما).
 */
export function rankDeliveryOffers<T extends DeliveryOffer>(
  offers: T[],
  courierLocation: Partial<LatLng> | null | undefined,
  maxRadiusKm = ASSIGNMENT_DEFAULTS.maxRadiusKm,
): ScoredOffer<T>[] {
  return offers
    .map((o) => scoreDeliveryOffer(o, courierLocation, maxRadiusKm))
    .filter((s) => s.distanceKm == null || s.distanceKm <= maxRadiusKm)
    .sort((a, b) => b.score - a.score);
}

// ---- ترتيب المندوبين لطلب (إسناد من جانب الخادم) ----------------
export interface CandidateCourier {
  id: string;
  location?: Partial<LatLng> | null;
  rating?: number;
  activeOrders?: number;
}

/**
 * درجة مندوب لطلب: القرب من المتجر + التقييم - عبء الطلبات النشطة.
 * تُستخدم لاختيار أنسب مندوب أولاً عند الإسناد التلقائي.
 */
export function scoreCourierForOrder(
  courier: CandidateCourier,
  pickup: Partial<LatLng> | null | undefined,
  maxRadiusKm = ASSIGNMENT_DEFAULTS.maxRadiusKm,
): number {
  let proximity = 30;
  if (hasValidCoords(courier.location) && hasValidCoords(pickup)) {
    const d = haversineKm(courier.location, pickup);
    if (d > maxRadiusKm) return -1; // خارج النطاق
    proximity = 60 * (1 - d / Math.max(1, maxRadiusKm));
  }
  const ratingScore = Math.min(25, (courier.rating ?? 0) * 5);
  const loadPenalty = Math.min(30, (courier.activeOrders ?? 0) * 15);
  return proximity + ratingScore - loadPenalty;
}

/** ترتيب المندوبين المرشّحين لطلب من الأفضل للأسوأ (مع استبعاد خارج النطاق). */
export function rankCouriersForOrder(
  couriers: CandidateCourier[],
  pickup: Partial<LatLng> | null | undefined,
  maxRadiusKm = ASSIGNMENT_DEFAULTS.maxRadiusKm,
): CandidateCourier[] {
  return couriers
    .map((c) => ({ c, s: scoreCourierForOrder(c, pickup, maxRadiusKm) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}
