// ============================================================
// GEO — حساب المسافات والوقت المقدّر للتوصيل
// ============================================================

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * مسافة هافرسين بالكيلومتر بين نقطتين (خط مستقيم على سطح الكرة).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * مسافة الطريق التقديرية: مسافة الخط المستقيم × معامل التفافية الطرق (~1.3).
 */
export function estimateRoadKm(a: LatLng, b: LatLng, windingFactor = 1.3): number {
  return haversineKm(a, b) * windingFactor;
}

/**
 * الوقت المقدّر للتوصيل بالدقائق.
 * = وقت التجهيز + (مسافة الطريق ÷ متوسط السرعة) — مع حد أدنى منطقي.
 */
export function estimateEtaMinutes(
  distanceKm: number,
  opts: { prepMinutes?: number; avgSpeedKmh?: number; minMinutes?: number } = {},
): number {
  const { prepMinutes = 15, avgSpeedKmh = 22, minMinutes = 20 } = opts;
  const travelMinutes = (distanceKm / Math.max(1, avgSpeedKmh)) * 60;
  return Math.max(minMinutes, Math.round(prepMinutes + travelMinutes));
}

/** نطاق ETA نصّي للعرض: "25–35 دقيقة" */
export function formatEtaRange(minutes: number): string {
  const low = Math.max(10, Math.round((minutes - 5) / 5) * 5);
  const high = low + 10;
  return `${low}–${high} دقيقة`;
}

/** هل تتوفّر إحداثيات صالحة (غير صفرية وغير فارغة)؟ */
export function hasValidCoords(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.latitude === 'number' &&
    typeof p.longitude === 'number' &&
    !(p.latitude === 0 && p.longitude === 0)
  );
}
