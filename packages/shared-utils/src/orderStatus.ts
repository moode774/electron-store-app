// ============================================================
// ORDER STATUS — تسميات وألوان وتدفّق حالات الطلب (مصدر موحّد)
// ============================================================
import { ORDER_STATUS, type OrderStatus, COLORS } from './constants';

export interface StatusMeta {
  label: string; // عربي
  color: string; // لون الشارة/النص
  bg: string; // خلفية الشارة
  icon: string; // اسم أيقونة Ionicons
  /** مرحلة التدفّق للعميل في شاشة التتبّع (1..4)، أو 0 لحالات غير خطّية */
  trackingStep: number;
}

const meta: Record<string, StatusMeta> = {
  [ORDER_STATUS.PENDING]: { label: 'بانتظار التأكيد', color: '#B45309', bg: '#FEF3C7', icon: 'time-outline', trackingStep: 1 },
  [ORDER_STATUS.CONFIRMED]: { label: 'تم التأكيد', color: '#1D4ED8', bg: '#DBEAFE', icon: 'checkmark-circle-outline', trackingStep: 1 },
  [ORDER_STATUS.PREPARING]: { label: 'قيد التجهيز', color: '#7C3AED', bg: '#EDE9FE', icon: 'restaurant-outline', trackingStep: 2 },
  [ORDER_STATUS.READY]: { label: 'جاهز للاستلام', color: '#0891B2', bg: '#CFFAFE', icon: 'cube-outline', trackingStep: 2 },
  [ORDER_STATUS.ASSIGNED]: { label: 'أُسند لمندوب', color: '#0891B2', bg: '#CFFAFE', icon: 'bicycle-outline', trackingStep: 3 },
  [ORDER_STATUS.PICKED_UP]: { label: 'استلمه المندوب', color: '#2563EB', bg: '#DBEAFE', icon: 'bag-check-outline', trackingStep: 3 },
  [ORDER_STATUS.ON_THE_WAY]: { label: 'في الطريق إليك', color: '#2563EB', bg: '#DBEAFE', icon: 'navigate-outline', trackingStep: 3 },
  [ORDER_STATUS.DELIVERED]: { label: 'تم التسليم', color: '#059669', bg: '#D1FAE5', icon: 'checkmark-done-outline', trackingStep: 4 },
  [ORDER_STATUS.CANCELLED]: { label: 'ملغي', color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle-outline', trackingStep: 0 },
  [ORDER_STATUS.RETURNED]: { label: 'مُرتجع', color: '#DC2626', bg: '#FEE2E2', icon: 'return-down-back-outline', trackingStep: 0 },
  [ORDER_STATUS.FAILED_DELIVERY]: { label: 'تعذّر التسليم', color: '#DC2626', bg: '#FEE2E2', icon: 'alert-circle-outline', trackingStep: 0 },
  [ORDER_STATUS.RESCHEDULED]: { label: 'أُعيد جدولته', color: '#B45309', bg: '#FEF3C7', icon: 'calendar-outline', trackingStep: 0 },
  [ORDER_STATUS.PARTIAL_DELIVERY]: { label: 'تسليم جزئي', color: '#B45309', bg: '#FEF3C7', icon: 'remove-circle-outline', trackingStep: 4 },
  [ORDER_STATUS.DISPUTED]: { label: 'قيد النزاع', color: '#DC2626', bg: '#FEE2E2', icon: 'warning-outline', trackingStep: 0 },
};

const fallback: StatusMeta = { label: 'غير معروف', color: COLORS.textSecondary, bg: COLORS.border, icon: 'help-circle-outline', trackingStep: 0 };

export function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return fallback;
  return meta[status] ?? fallback;
}

export function getStatusLabel(status: string | null | undefined): string {
  return getStatusMeta(status).label;
}

// ---- Status flow / transitions -----------------------------
// التسلسل الطبيعي لحالة الطلب من الإنشاء حتى التسليم
export const ORDER_FLOW: OrderStatus[] = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.DELIVERED,
];

const TERMINAL: string[] = [
  ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED, ORDER_STATUS.FAILED_DELIVERY,
];

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.includes(status);
}

/** الحالة التالية في التدفّق الطبيعي، أو null إن كانت نهائية/غير معروفة */
export function nextStatus(status: string): OrderStatus | null {
  const idx = ORDER_FLOW.indexOf(status as OrderStatus);
  if (idx === -1 || idx === ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[idx + 1];
}

/** هل يمكن للعميل إلغاء الطلب في حالته الحالية؟ (قبل التجهيز فقط) */
export function canCustomerCancel(status: string): boolean {
  return status === ORDER_STATUS.PENDING || status === ORDER_STATUS.CONFIRMED;
}

/** نسبة تقدّم الطلب 0..1 لشريط التقدّم */
export function statusProgress(status: string): number {
  const step = getStatusMeta(status).trackingStep;
  return Math.max(0, Math.min(1, step / 4));
}
