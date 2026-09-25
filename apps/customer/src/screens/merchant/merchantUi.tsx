import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

// Shared building blocks for the merchant workspace so every screen uses the
// same header, cards, chips and empty states (navy brand, RTL on web too).

export const card = {
  backgroundColor: COLORS.surface,
  borderRadius: RADIUS.lg,
  borderWidth: 1,
  borderColor: COLORS.hairline,
} as const;

export const formatMoney = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export const formatDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return withTime ? `${date} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : date;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'الدفع عند الاستلام',
  cod: 'الدفع عند الاستلام',
  jawali: 'محفظة جوالي',
  one_cash: 'ون كاش',
  cash_wallet: 'كاش',
  floosak: 'فلوسك',
  jaib: 'جيب',
  kuraimi: 'الكريمي',
  card: 'بطاقة بنكية',
  wallet: 'المحفظة',
};

export const paymentLabel = (method: string | null | undefined) =>
  (method && PAYMENT_LABELS[method]) || 'غير محدد';

export const isCashPayment = (method: string | null | undefined) => method === 'cash' || method === 'cod';

export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return formatDate(iso);
};

const backIcon = Platform.OS === 'web' ? 'arrow-forward' : 'arrow-back';

export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return width >= BREAKPOINTS.desktop;
}

export function ScreenHeader({
  title, subtitle, onBack, right,
}: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  return (
    <View style={[ui.header, { paddingTop: isDesktop ? 18 : insets.top + 10 }]}>
      {onBack ? (
        <TouchableOpacity style={ui.iconBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name={backIcon} size={20} color={COLORS.ink} />
        </TouchableOpacity>
      ) : null}
      <View style={ui.headerCopy}>
        <Text style={ui.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={ui.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  icon, label, onPress, primary, badge,
}: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; primary?: boolean; badge?: boolean }) {
  return (
    <TouchableOpacity style={[ui.iconBtn, primary && ui.iconBtnPrimary]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={primary ? COLORS.surface : COLORS.ink} />
      {badge ? <View style={ui.dot} /> : null}
    </TouchableOpacity>
  );
}

export function Chips<T extends string>({
  items, value, onChange,
}: { items: { key: T; label: string; count?: number }[]; value: T; onChange: (key: T) => void }) {
  return (
    <View style={ui.chips}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <TouchableOpacity
            key={item.key}
            style={[ui.chip, active && ui.chipActive]}
            onPress={() => onChange(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <Text style={[ui.chipText, active && ui.chipTextActive]}>{item.label}</Text>
            {item.count != null ? (
              <View style={[ui.chipCount, active && ui.chipCountActive]}>
                <Text style={[ui.chipCountText, active && ui.chipCountTextActive]}>{item.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function StatusPill({ label, color, background, icon }: { label: string; color: string; background: string; icon?: string }) {
  return (
    <View style={[ui.pill, { backgroundColor: background }]}>
      {icon ? <Ionicons name={icon as any} size={12} color={color} /> : null}
      <Text style={[ui.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon, title, text, action,
}: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={ui.empty}>
      <View style={ui.emptyIcon}><Ionicons name={icon} size={26} color={COLORS.primary} /></View>
      <Text style={ui.emptyTitle}>{title}</Text>
      {text ? <Text style={ui.emptyText}>{text}</Text> : null}
      {action ? (
        <TouchableOpacity style={ui.emptyBtn} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={ui.emptyBtnText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Banner({ text, tone = 'warning', actionLabel, onAction }: { text: string; tone?: 'warning' | 'error' | 'info'; actionLabel?: string; onAction?: () => void }) {
  const palette = {
    warning: { bg: '#FFF8E8', border: '#FDE3A7', fg: '#8A5400', icon: 'cloud-offline-outline' },
    error: { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B', icon: 'alert-circle-outline' },
    info: { bg: COLORS.primarySoft, border: COLORS.hairline, fg: COLORS.primary, icon: 'information-circle-outline' },
  }[tone];
  return (
    <View style={[ui.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Ionicons name={palette.icon as any} size={18} color={palette.fg} />
      <Text style={[ui.bannerText, { color: palette.fg }]}>{text}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={ui.bannerAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={ui.sectionHead}>
      <Text style={ui.sectionTitle}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={ui.sectionLink}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: 16, paddingBottom: 120, gap: 14 },
  contentDesktop: { padding: 24, paddingBottom: 48 },

  header: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: COLORS.canvas, borderBottomWidth: 1, borderBottomColor: COLORS.hairline,
  },
  headerCopy: { flex: 1, alignItems: 'flex-end' },
  headerTitle: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  headerSub: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'right', marginTop: 2 },
  iconBtn: {
    ...card, width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  iconBtnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error, borderWidth: 1.5, borderColor: COLORS.surface },

  card: { ...card, padding: 16 },
  cardTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  text: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'right' },
  muted: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkTertiary, textAlign: 'right' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  divider: { height: 1, backgroundColor: COLORS.hairline },

  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 13,
    borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.hairline,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  chipTextActive: { color: COLORS.surface, fontFamily: FONTS.semiBold },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: COLORS.canvas, alignItems: 'center', justifyContent: 'center' },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  chipCountText: { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.inkSecondary },
  chipCountTextActive: { color: COLORS.surface },

  pill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  pillText: { fontSize: 11, fontFamily: FONTS.semiBold },

  empty: { ...card, alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20, gap: 6 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'center' },
  emptyText: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { marginTop: 10, minHeight: 44, paddingHorizontal: 20, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, justifyContent: 'center' },
  emptyBtnText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.surface },

  banner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADIUS.md, padding: 12 },
  bannerText: { flex: 1, fontSize: 12, fontFamily: FONTS.semiBold, textAlign: 'right', lineHeight: 19 },
  bannerAction: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.primary, padding: 4 },

  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  sectionLink: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.primary, paddingVertical: 4 },

  primaryBtn: {
    minHeight: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, paddingHorizontal: 18,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryBtnText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.surface },
  secondaryBtn: {
    ...card, minHeight: 48, borderRadius: RADIUS.md, paddingHorizontal: 18,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.ink },

  input: {
    minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.hairline, backgroundColor: COLORS.canvas,
    paddingHorizontal: 14, fontSize: 14, fontFamily: FONTS.medium, color: COLORS.ink, textAlign: 'right',
    outlineStyle: 'none' as any,
  },
  label: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right', marginBottom: 7 },
});
