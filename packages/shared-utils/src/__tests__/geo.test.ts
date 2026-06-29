import { haversineKm, estimateRoadKm, estimateEtaMinutes, formatEtaRange, hasValidCoords } from '../geo';

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ latitude: 15.35, longitude: 44.2 }, { latitude: 15.35, longitude: 44.2 })).toBeCloseTo(0, 5);
  });

  it('approximates a known distance (Sanaa ~ Aden ≈ 300+ km)', () => {
    const d = haversineKm({ latitude: 15.3694, longitude: 44.191 }, { latitude: 12.7855, longitude: 45.0187 });
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(400);
  });

  it('is symmetric', () => {
    const a = { latitude: 15, longitude: 44 };
    const b = { latitude: 16, longitude: 45 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe('estimateRoadKm / ETA', () => {
  it('road distance is longer than straight line', () => {
    const a = { latitude: 15, longitude: 44 };
    const b = { latitude: 15.1, longitude: 44.1 };
    expect(estimateRoadKm(a, b)).toBeGreaterThan(haversineKm(a, b));
  });

  it('ETA respects the minimum and grows with distance', () => {
    expect(estimateEtaMinutes(0, { minMinutes: 20 })).toBe(20);
    expect(estimateEtaMinutes(30)).toBeGreaterThan(estimateEtaMinutes(5));
  });

  it('formatEtaRange returns a sensible window', () => {
    expect(formatEtaRange(30)).toMatch(/دقيقة/);
  });
});

describe('hasValidCoords', () => {
  it('rejects null, undefined and (0,0)', () => {
    expect(hasValidCoords(null)).toBe(false);
    expect(hasValidCoords(undefined)).toBe(false);
    expect(hasValidCoords({ latitude: 0, longitude: 0 })).toBe(false);
  });
  it('accepts valid coordinates including nullable fields', () => {
    expect(hasValidCoords({ latitude: 15.3, longitude: 44.2 })).toBe(true);
    expect(hasValidCoords({ latitude: 15.3, longitude: null })).toBe(false);
  });
});
