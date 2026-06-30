import { formatPrice, formatCompactNumber, normalizeYemenPhone, isValidYemenMobile, formatRelativeTime } from '../format';
import { CURRENCY } from '../constants';

describe('formatPrice', () => {
  it('adds thousands separators and the currency symbol', () => {
    expect(formatPrice(12500)).toBe(`12,500 ${CURRENCY.SYMBOL}`);
  });
  it('can omit the symbol and handles nullish', () => {
    expect(formatPrice(1000, { withSymbol: false })).toBe('1,000');
    expect(formatPrice(null)).toBe(`0 ${CURRENCY.SYMBOL}`);
  });
});

describe('formatCompactNumber', () => {
  it('compacts thousands and millions', () => {
    expect(formatCompactNumber(950)).toBe('950');
    expect(formatCompactNumber(1500)).toBe('1.5K');
    expect(formatCompactNumber(2_000_000)).toBe('2.0M');
  });
});

describe('Yemen phone helpers', () => {
  it('normalizes local and prefixed numbers to +967', () => {
    expect(normalizeYemenPhone('0771234567')).toBe('+967771234567');
    expect(normalizeYemenPhone('771234567')).toBe('+967771234567');
    expect(normalizeYemenPhone('00967771234567')).toBe('+967771234567');
    expect(normalizeYemenPhone('+967771234567')).toBe('+967771234567');
  });
  it('validates Yemeni mobile format (7 + 8 digits)', () => {
    expect(isValidYemenMobile('771234567')).toBe(true);
    expect(isValidYemenMobile('0771234567')).toBe(true);
    expect(isValidYemenMobile('12345')).toBe(false);
    expect(isValidYemenMobile('671234567')).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  it('returns "الآن" for very recent timestamps', () => {
    expect(formatRelativeTime(new Date())).toBe('الآن');
  });
  it('formats hours and days in the past', () => {
    expect(formatRelativeTime(Date.now() - 2 * 3600_000)).toContain('ساعت');
    expect(formatRelativeTime(Date.now() - 3 * 86400_000)).toContain('أيام');
  });
});
