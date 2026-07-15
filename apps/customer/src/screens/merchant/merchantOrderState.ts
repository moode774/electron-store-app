import { ORDER_STATUS } from '@marketplace/shared-utils';

export const ACTIVE_MERCHANT_ORDER_STATUSES = new Set<string>([
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.RESCHEDULED,
]);

export const HISTORY_MERCHANT_ORDER_STATUSES = new Set<string>([
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED_DELIVERY,
  ORDER_STATUS.PARTIAL_DELIVERY,
  ORDER_STATUS.DISPUTED,
]);

export const DELIVERY_HANDOFF_STATUSES = new Set<string>([
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.RESCHEDULED,
]);

export interface MerchantOrderStatusInfo {
  label: string;
  color: string;
  background: string;
  icon: string;
}

const STATUS_INFO: Record<string, MerchantOrderStatusInfo> = {
  [ORDER_STATUS.PENDING]: {
    label: 'بانتظار القبول', color: '#D97706', background: '#FEF3C7', icon: 'time-outline',
  },
  [ORDER_STATUS.CONFIRMED]: {
    label: 'تم التأكيد', color: '#2563EB', background: '#DBEAFE', icon: 'checkmark-circle-outline',
  },
  [ORDER_STATUS.PREPARING]: {
    label: 'قيد التجهيز', color: '#2563EB', background: '#DBEAFE', icon: 'restaurant-outline',
  },
  [ORDER_STATUS.READY]: {
    label: 'جاهز للمندوب', color: '#7C3AED', background: '#EDE9FE', icon: 'bag-check-outline',
  },
  [ORDER_STATUS.ASSIGNED]: {
    label: 'أُسند إلى مندوب', color: '#0369A1', background: '#E0F2FE', icon: 'person-outline',
  },
  [ORDER_STATUS.PICKED_UP]: {
    label: 'استلمه المندوب', color: '#0369A1', background: '#E0F2FE', icon: 'cube-outline',
  },
  [ORDER_STATUS.ON_THE_WAY]: {
    label: 'في الطريق للعميل', color: '#0369A1', background: '#E0F2FE', icon: 'bicycle-outline',
  },
  [ORDER_STATUS.RESCHEDULED]: {
    label: 'أُعيدت الجدولة', color: '#B45309', background: '#FEF3C7', icon: 'calendar-outline',
  },
  [ORDER_STATUS.DELIVERED]: {
    label: 'تم التسليم', color: '#059669', background: '#D1FAE5', icon: 'checkmark-done-circle-outline',
  },
  [ORDER_STATUS.CANCELLED]: {
    label: 'ملغي', color: '#DC2626', background: '#FEE2E2', icon: 'close-circle-outline',
  },
  [ORDER_STATUS.RETURNED]: {
    label: 'مُرتجع', color: '#B45309', background: '#FEF3C7', icon: 'return-down-back-outline',
  },
  [ORDER_STATUS.FAILED_DELIVERY]: {
    label: 'تعذر التسليم', color: '#DC2626', background: '#FEE2E2', icon: 'warning-outline',
  },
  [ORDER_STATUS.PARTIAL_DELIVERY]: {
    label: 'تسليم جزئي', color: '#B45309', background: '#FEF3C7', icon: 'alert-circle-outline',
  },
  [ORDER_STATUS.DISPUTED]: {
    label: 'محل نزاع', color: '#DC2626', background: '#FEE2E2', icon: 'chatbox-ellipses-outline',
  },
};

export function getMerchantOrderStatusInfo(status: string): MerchantOrderStatusInfo {
  return STATUS_INFO[status] ?? {
    label: status || 'غير محدد', color: '#4B5563', background: '#F3F4F6', icon: 'ellipse-outline',
  };
}

export function getOrderTransitionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('انتقال حالة غير مسموح') || message.includes('غير مسموح لهذه الجهة')) {
    return 'لا يمكن تنفيذ هذا الانتقال من حالة الطلب الحالية. تم تحديث البيانات من الخادم.';
  }
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return 'تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.';
  }
  return 'تعذر تحديث حالة الطلب. لم يتم تغيير الحالة المعروضة.';
}

export function merchantOrderProgress(status: string): number {
  if (status === ORDER_STATUS.DELIVERED) return 5;
  if (status === ORDER_STATUS.ASSIGNED || status === ORDER_STATUS.PICKED_UP || status === ORDER_STATUS.ON_THE_WAY) return 4;
  if (status === ORDER_STATUS.READY) return 3;
  if (status === ORDER_STATUS.PREPARING || status === ORDER_STATUS.CONFIRMED) return 2;
  if (status === ORDER_STATUS.PENDING) return 1;
  return 0;
}
