import { getStatusMeta, getStatusLabel, nextStatus, isTerminalStatus, canCustomerCancel, statusProgress } from '../orderStatus';
import { ORDER_STATUS } from '../constants';

describe('order status helpers', () => {
  it('returns a safe fallback for unknown statuses', () => {
    const meta = getStatusMeta('totally_unknown');
    expect(meta.label).toBe('غير معروف');
    expect(getStatusLabel(null)).toBe('غير معروف');
  });

  it('maps the natural flow forward', () => {
    expect(nextStatus(ORDER_STATUS.PENDING)).toBe(ORDER_STATUS.CONFIRMED);
    expect(nextStatus(ORDER_STATUS.ON_THE_WAY)).toBe(ORDER_STATUS.DELIVERED);
    expect(nextStatus(ORDER_STATUS.DELIVERED)).toBeNull();
  });

  it('identifies terminal statuses', () => {
    expect(isTerminalStatus(ORDER_STATUS.DELIVERED)).toBe(true);
    expect(isTerminalStatus(ORDER_STATUS.CANCELLED)).toBe(true);
    expect(isTerminalStatus(ORDER_STATUS.RETURNED)).toBe(true);
    expect(isTerminalStatus(ORDER_STATUS.PREPARING)).toBe(false);
  });

  it('only allows customer cancellation before preparation', () => {
    expect(canCustomerCancel(ORDER_STATUS.PENDING)).toBe(true);
    expect(canCustomerCancel(ORDER_STATUS.CONFIRMED)).toBe(true);
    expect(canCustomerCancel(ORDER_STATUS.PREPARING)).toBe(false);
  });

  it('reports progress between 0 and 1', () => {
    expect(statusProgress(ORDER_STATUS.DELIVERED)).toBe(1);
    expect(statusProgress(ORDER_STATUS.PENDING)).toBeGreaterThan(0);
    expect(statusProgress(ORDER_STATUS.PENDING)).toBeLessThan(1);
  });
});
