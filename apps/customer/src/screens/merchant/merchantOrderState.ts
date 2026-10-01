import { ORDER_STATUS } from '@marketplace/shared-utils';
import { translate } from '../../i18n';
import { resources } from '../../i18n/translations';

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

const STATUS_INFO: Record<string, Omit<MerchantOrderStatusInfo, 'label'> & { labelKey: string }> = {
  [ORDER_STATUS.PENDING]: { labelKey: 'merchant.statusPendingAcceptance', color: '#D97706', background: '#FEF3C7', icon: 'time-outline' },
  [ORDER_STATUS.CONFIRMED]: { labelKey: 'merchant.statusConfirmed', color: '#2563EB', background: '#DBEAFE', icon: 'checkmark-circle-outline' },
  [ORDER_STATUS.PREPARING]: { labelKey: 'merchant.statusPreparing', color: '#2563EB', background: '#DBEAFE', icon: 'restaurant-outline' },
  [ORDER_STATUS.READY]: { labelKey: 'merchant.statusReady', color: '#7C3AED', background: '#EDE9FE', icon: 'bag-check-outline' },
  [ORDER_STATUS.ASSIGNED]: { labelKey: 'merchant.statusAssigned', color: '#0369A1', background: '#E0F2FE', icon: 'person-outline' },
  [ORDER_STATUS.PICKED_UP]: { labelKey: 'merchant.statusPickedUp', color: '#0369A1', background: '#E0F2FE', icon: 'cube-outline' },
  [ORDER_STATUS.ON_THE_WAY]: { labelKey: 'merchant.statusOnWay', color: '#0369A1', background: '#E0F2FE', icon: 'bicycle-outline' },
  [ORDER_STATUS.RESCHEDULED]: { labelKey: 'merchant.statusRescheduled', color: '#B45309', background: '#FEF3C7', icon: 'calendar-outline' },
  [ORDER_STATUS.DELIVERED]: { labelKey: 'merchant.statusDelivered', color: '#059669', background: '#D1FAE5', icon: 'checkmark-done-circle-outline' },
  [ORDER_STATUS.CANCELLED]: { labelKey: 'merchant.statusCancelled', color: '#DC2626', background: '#FEE2E2', icon: 'close-circle-outline' },
  [ORDER_STATUS.RETURNED]: { labelKey: 'merchant.statusReturned', color: '#B45309', background: '#FEF3C7', icon: 'return-down-back-outline' },
  [ORDER_STATUS.FAILED_DELIVERY]: { labelKey: 'merchant.statusFailedDelivery', color: '#DC2626', background: '#FEE2E2', icon: 'warning-outline' },
  [ORDER_STATUS.PARTIAL_DELIVERY]: { labelKey: 'merchant.statusPartialDelivery', color: '#B45309', background: '#FEF3C7', icon: 'alert-circle-outline' },
  [ORDER_STATUS.DISPUTED]: { labelKey: 'merchant.statusDisputed', color: '#DC2626', background: '#FEE2E2', icon: 'chatbox-ellipses-outline' },
};

export function getMerchantOrderStatusInfo(status: string): MerchantOrderStatusInfo {
  const info = STATUS_INFO[status];
  if (info) return { ...info, label: translate(info.labelKey) };
  return { label: status || translate('customer.unspecified'), color: '#4B5563', background: '#F3F4F6', icon: 'ellipse-outline' };
}

export function getOrderTransitionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes(resources.ar.merchant.transitionDeniedDb1) || message.includes(resources.ar.merchant.transitionDeniedDb2) || message.includes(resources.en.merchant.transitionDeniedDb1) || message.includes(resources.en.merchant.transitionDeniedDb2)) {
    return translate('merchant.transitionNotAllowed');
  }
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return translate('merchant.serverConnectionFailed');
  }
  return translate('merchant.statusUpdateFailed');
}

export function merchantOrderProgress(status: string): number {
  if (status === ORDER_STATUS.DELIVERED) return 5;
  if (status === ORDER_STATUS.ASSIGNED || status === ORDER_STATUS.PICKED_UP || status === ORDER_STATUS.ON_THE_WAY) return 4;
  if (status === ORDER_STATUS.READY) return 3;
  if (status === ORDER_STATUS.PREPARING || status === ORDER_STATUS.CONFIRMED) return 2;
  if (status === ORDER_STATUS.PENDING) return 1;
  return 0;
}
