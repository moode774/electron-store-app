import { rankDeliveryOffers, scoreCourierForOrder, rankCouriersForOrder } from '../assignment';

const courier = { latitude: 15.35, longitude: 44.2 };

describe('rankDeliveryOffers', () => {
  const offers = [
    { id: 'far', deliveryFee: 1000, pickup: { latitude: 15.5, longitude: 44.4 } },
    { id: 'near', deliveryFee: 1000, pickup: { latitude: 15.355, longitude: 44.205 } },
  ];

  it('ranks closer pickups first', () => {
    const ranked = rankDeliveryOffers(offers, courier, 50);
    expect(ranked[0].offer.id).toBe('near');
    expect(ranked[0].distanceKm).toBeLessThan(ranked[1].distanceKm as number);
  });

  it('excludes offers outside the radius', () => {
    const ranked = rankDeliveryOffers(offers, courier, 1); // 1km radius
    expect(ranked.every((o) => (o.distanceKm ?? 0) <= 1)).toBe(true);
  });

  it('keeps offers with unknown coordinates (neutral)', () => {
    const ranked = rankDeliveryOffers([{ id: 'x', deliveryFee: 500, pickup: null }], courier);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].distanceKm).toBeNull();
  });
});

describe('courier ranking for an order', () => {
  const pickup = { latitude: 15.35, longitude: 44.2 };

  it('penalizes active load and rewards rating', () => {
    const busy = scoreCourierForOrder({ id: 'a', location: pickup, rating: 5, activeOrders: 3 }, pickup);
    const free = scoreCourierForOrder({ id: 'b', location: pickup, rating: 5, activeOrders: 0 }, pickup);
    expect(free).toBeGreaterThan(busy);
  });

  it('drops couriers outside the radius', () => {
    const far = { id: 'c', location: { latitude: 16.5, longitude: 45.5 }, rating: 5, activeOrders: 0 };
    expect(rankCouriersForOrder([far], pickup, 5)).toHaveLength(0);
  });
});
