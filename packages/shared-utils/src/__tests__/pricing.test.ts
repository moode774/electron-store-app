import {
  calculateDeliveryFee,
  calculateOrderTotals,
  computeCouponDiscount,
  calculatePlatformCommission,
  merchantPayout,
  calculateDeliveryEarning,
  loyaltyPointsEarned,
  loyaltyPointsValue,
} from '../pricing';
import { PRICING } from '../constants';

describe('calculateDeliveryFee', () => {
  it('returns free delivery above the threshold', () => {
    const r = calculateDeliveryFee({ subtotal: PRICING.FREE_DELIVERY_THRESHOLD + 1, zone: 'sanaa' });
    expect(r.isFree).toBe(true);
    expect(r.fee).toBe(0);
  });

  it('falls back to zone base fee without coordinates (clamped to min/max)', () => {
    const r = calculateDeliveryFee({ subtotal: 5000, zone: 'aden' });
    expect(r.distanceKm).toBeNull();
    expect(r.fee).toBeGreaterThanOrEqual(PRICING.MIN_DELIVERY_FEE);
    expect(r.fee).toBeLessThanOrEqual(PRICING.MAX_DELIVERY_FEE);
  });

  it('adds per-km fee beyond the free radius when coordinates are present', () => {
    const near = calculateDeliveryFee({
      subtotal: 5000, zone: 'sanaa',
      origin: { latitude: 15.35, longitude: 44.2 },
      destination: { latitude: 15.36, longitude: 44.21 },
    });
    const far = calculateDeliveryFee({
      subtotal: 5000, zone: 'sanaa',
      origin: { latitude: 15.35, longitude: 44.2 },
      destination: { latitude: 15.5, longitude: 44.4 },
    });
    expect(far.fee).toBeGreaterThan(near.fee);
    expect(far.distanceKm).toBeGreaterThan(0);
  });
});

describe('calculateOrderTotals', () => {
  it('never produces negative totals and caps discount at subtotal', () => {
    const t = calculateOrderTotals({ subtotal: 1000, deliveryFee: 500, discount: 5000 });
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(500); // subtotal - discount(=subtotal) + delivery
  });

  it('applies tax on the discounted subtotal', () => {
    const t = calculateOrderTotals({ subtotal: 1000, deliveryFee: 0, discount: 0, taxRate: 10 });
    expect(t.tax).toBe(100);
    expect(t.total).toBe(1100);
  });
});

describe('computeCouponDiscount', () => {
  it('computes percentage discounts and respects the max cap', () => {
    const r = computeCouponDiscount({ type: 'percentage', value: 50, max_discount_amount: 300 }, 1000);
    expect(r.discount).toBe(300);
    expect(r.ok).toBe(true);
  });

  it('rejects when below the minimum order amount', () => {
    const r = computeCouponDiscount({ type: 'fixed', value: 100, min_order_amount: 500 }, 200);
    expect(r.ok).toBe(false);
    expect(r.discount).toBe(0);
  });
});

describe('commission, payout, earnings, loyalty', () => {
  it('commission and payout are complementary', () => {
    expect(calculatePlatformCommission(1000, 10)).toBe(100);
    expect(merchantPayout(1000, 10)).toBe(900);
  });

  it('delivery earning is the courier share plus tip', () => {
    const fee = 1000;
    expect(calculateDeliveryEarning(fee, 200)).toBe(Math.round(fee * PRICING.DELIVERY_BASE_EARNING_RATE) + 200);
  });

  it('loyalty points accrue per unit and convert back to value', () => {
    const pts = loyaltyPointsEarned(550); // floor(550/100)=5
    expect(pts).toBe(5);
    expect(loyaltyPointsValue(pts)).toBe(5 * PRICING.LOYALTY_POINT_VALUE);
  });

  it('clamps negatives to zero', () => {
    expect(loyaltyPointsEarned(-100)).toBe(0);
    expect(calculatePlatformCommission(-100)).toBe(0);
  });
});
