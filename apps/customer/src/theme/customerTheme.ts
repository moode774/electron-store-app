import { COLORS as sharedColors } from '@marketplace/shared-utils';

// Customer storefront palette. The other roles continue to use the shared
// operational palette, so their interfaces are unaffected by this redesign.
export * from '@marketplace/shared-utils';

export const COLORS = {
  ...sharedColors,
  primary: '#1E3A8A',
  primaryLight: '#4169B4',
  primaryDark: '#101F46',
  primarySoft: '#EDF2FC',
  secondary: '#2F557F',
  secondarySoft: '#EFF5FA',
  accentCoral: '#E97853',
  accentCoralSoft: '#FFF1EB',
  background: '#F7F8FC',
  surfaceMuted: '#F2F5FA',
  border: '#E5EAF2',
  borderStrong: '#D4DCE8',
  textPrimary: '#17213A',
  textSecondary: '#59677D',
  textMuted: '#8290A3',
  overlay: 'rgba(16,31,70,0.56)',
} as const;
