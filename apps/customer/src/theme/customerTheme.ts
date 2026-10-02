// Customer-facing identity for Darb: deep navy from the mark, ivory paper and a
// single warm sand accent taken from the campaign banners. Everything on the
// customer home stack should read from here instead of hardcoding colors.
export const CT = {
  navy: '#111C3F',
  navyDeep: '#0B1228',
  navySoft: '#EEF1F8',
  navyTint: '#D9DFEE',
  sand: '#C8A36A',
  sandSoft: '#F7F1E6',
  ivory: '#F8F6F1',
  paper: '#F6F6F4',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F2F4',
  hairline: '#E7E9EE',
  ink: '#151A2D',
  inkSecondary: '#5C657A',
  inkMuted: '#8E96A8',
  star: '#D9A441',
  danger: '#C8463F',
  success: '#1F8A5B',
} as const;

export const CT_RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

// Soft, low-contrast elevation that works on both web and native.
export const CT_SHADOW = {
  card: {
    shadowColor: '#0B1228',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  floating: {
    shadowColor: '#0B1228',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
} as const;

// Prices are displayed with Western digits and thousands separators (39,000).
export function formatAmount(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(amount));
}
