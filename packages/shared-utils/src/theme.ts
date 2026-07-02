// ============================================================
// THEME PALETTES — الوضع الفاتح والليلي
// ============================================================
export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  secondary: string;
  background: string;
  surface: string;
  card: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export const LIGHT_THEME: ThemeColors = {
  primary: '#1B2B4B',
  primaryLight: '#2A3F6F',
  secondary: '#C9A84C',
  background: '#F5F5F7',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  border: '#E8E8E8',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  success: '#2ECC71',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

export const DARK_THEME: ThemeColors = {
  primary: '#3B5BDB',
  primaryLight: '#4C6EF5',
  secondary: '#C9A84C',
  background: '#0F1420',
  surface: '#1A2032',
  card: '#1E263B',
  border: '#2A3350',
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  success: '#2ECC71',
  warning: '#F59E0B',
  error: '#F87171',
  info: '#60A5FA',
};

export const getTheme = (mode: ThemeMode): ThemeColors =>
  mode === 'dark' ? DARK_THEME : LIGHT_THEME;
