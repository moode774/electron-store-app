import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Platform, TextInput,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
// Expo 54 keeps the URI-based helpers used by CSV export in the legacy module.
// Importing them from the main entrypoint compiles incorrectly and throws at runtime.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect, Line } from 'react-native-svg';
import { getAdminStats, AdminStats, useAuthStore, getAdminOrders } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

// Admin semantic aliases keep the operational data contract separate from presentation.
const UI = {
  bg: COLORS.background,
  bgMobile: COLORS.background,
  card: COLORS.surface,
  cardSoft: COLORS.surfaceMuted,
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  lime: COLORS.secondary,
  limeSoft: COLORS.secondarySoft,
  coral: COLORS.accentCoral,
  coralSoft: COLORS.accentCoralSoft,
  mint: COLORS.accentMint,
  mintSoft: COLORS.accentMintSoft,
  green: COLORS.success,
  greenLight: COLORS.accentMintSoft,
  textDark: COLORS.textPrimary,
  textGrey: COLORS.textSecondary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
} as const;

const softShadow = {
  shadowColor: COLORS.primaryDark,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.07,
  shadowRadius: 24,
  elevation: 4,
} as const;

const ORDER_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'جديد', color: '#F59E0B' },
  confirmed: { label: 'مؤكد', color: '#3B82F6' },
  preparing: { label: 'قيد التجهيز', color: '#8B5CF6' },
  ready: { label: 'جاهز للمندوب', color: '#0EA5E9' },
  assigned: { label: 'تم تعيين مندوب', color: '#6366F1' },
  picked_up: { label: 'استلمه المندوب', color: '#0891B2' },
  on_the_way: { label: 'في الطريق', color: '#2563EB' },
  rescheduled: { label: 'أعيدت الجدولة', color: '#D97706' },
  failed_delivery: { label: 'تعذّر التسليم', color: '#DC2626' },
  delivered: { label: 'مكتمل', color: UI.green },
  cancelled: { label: 'ملغي', color: '#EF4444' },
  returned: { label: 'مرتجع', color: '#64748B' },
};

// ---- SVG Line Chart (matching Merchant) ----
function LineChart({ w, h, points, color }: { w: number; h: number; points: number[]; color: string }) {
  const data = points && points.length > 1 ? points : [0, 0];
  const max = Math.max(...data, 1) * 1.15;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => ({ x: i * stepX, y: h - (v / max) * h }));

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const dFill = `${d} L ${pts[pts.length - 1].x} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.15" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={dFill} fill="url(#fill)" />
      <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={last.x} cy={last.y} r={4} fill={color} />
    </Svg>
  );
}

// ---- SVG Bar Chart (matching Merchant) ----
function BarChart({ w, h, points, color }: { w: number; h: number; points: number[]; color: string }) {
  const data = points && points.length > 0 ? points : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...data, 1);
  const barWidth = 30;
  const gap = (w - (data.length * barWidth)) / (data.length - 1 || 1);

  return (
    <Svg width={w} height={h}>
      {data.map((val, i) => {
        const barH = Math.max((val / max) * h, 10);
        const x = i * (barWidth + gap);
        const y = h - barH;
        const isMax = val === max && max > 0;
        return (
          <React.Fragment key={i}>
            <Rect
              x={x} y={y} width={barWidth} height={barH} rx={10}
              fill={isMax ? color : '#9CA3AF'} opacity={isMax ? 1 : 0.4}
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export default function AdminDashboardScreen({ navigation }: any) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { user } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isCompact = width < BREAKPOINTS.compact;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, orders] = await Promise.all([
        getAdminStats(),
        getAdminOrders()
      ]);
      setStats(s);
      setOrders(orders);
      setRecentOrders(orders.slice(0, 5));
    } catch (e) {
      console.error('Failed to load the admin dashboard:', e);
      setError('تعذر تحميل بيانات لوحة الإدارة. تحقق من الاتصال ثم أعد المحاولة.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  const exportReport = async () => {
    if (!stats || !orders.length) {
      Alert.alert('خطأ', 'لا توجد بيانات كافية للتصدير');
      return;
    }
    try {
      const header = 'Order ID,Date,Amount,Status,Merchant,Customer,Driver\n';
      const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const rows = orders.map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-US');
        const merchant = o.merchant_profiles?.store_name ?? '';
        const customer = o.customer?.full_name ?? o.users?.full_name ?? '';
        const driver = o.delivery_profiles?.users?.full_name ?? o.drivers?.full_name ?? '';
        return [o.order_number ?? o.id, date, o.total_amount ?? 0, o.status, merchant, customer, driver].map(csvCell).join(',');
      }).join('\n');

      const csv = '\uFEFF' + header + rows;
      const filename = `orders_report_${new Date().getTime()}.csv`;
      if (Platform.OS === 'web') {
        const WebBlob = (globalThis as any).Blob;
        const blob = new WebBlob([csv], { type: 'text/csv;charset=utf-8' });
        const webUrl = (globalThis as any).URL.createObjectURL(blob);
        const anchor = (globalThis as any).document.createElement('a');
        anchor.href = webUrl;
        anchor.download = filename;
        anchor.click();
        (globalThis as any).URL.revokeObjectURL(webUrl);
        return;
      }
      const documentDirectory = (FileSystem as any).documentDirectory;
      if (!documentDirectory) throw new Error('Document directory is unavailable');
      const uri = documentDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: 'public.comma-separated-values-text', mimeType: 'text/csv' });
      } else {
        Alert.alert('تم', 'تم إنشاء الملف، ولكن لا يمكن مشاركته على هذا الجهاز');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('خطأ', 'حدث خطأ أثناء إنشاء التقرير');
    }
  };

  // ── Responsive widths ──
  // Desktop chrome = floating rail (72 + 16) + main horizontal padding (32).
  const desktopChromeWidth = 120;
  const screenPadding = isCompact ? 32 : 48;
  const dashboardWidth = Math.min(
    isDesktop ? Math.max(width - desktopChromeWidth, 320) : width,
    BREAKPOINTS.wide,
  );
  const usableWidth = Math.max(
    dashboardWidth - screenPadding,
    288,
  );
  const gap = 20;
  const col3Width = isDesktop ? (usableWidth - (gap * 2)) / 3 : usableWidth;

  // ── Chart data ──
  const chartPoints = stats?.chartData?.map(d => d.count) ?? [];
  const chartLabels = stats?.chartData?.map(d =>
    new Date(`${d.date}T12:00:00+03:00`).toLocaleDateString(getLocale(), { weekday: 'short' })
  ) ?? [];
  const chartTotal = chartPoints.reduce((s, v) => s + v, 0);

  // ── Order row render ──
  const renderOrderRow = (item: any, index: number) => {
    const statusMeta = ORDER_STATUS_META[item.status] ?? { label: item.status || 'حالة غير معروفة', color: UI.textMuted };
    const statusLabel = statusMeta.label;
    const statusColor = statusMeta.color;
    const d = new Date(item.created_at);
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.tableRow}
        onPress={() => navigation.navigate('AdminOrders', { initialSearch: item.order_number ?? item.id })}
        accessibilityRole="button"
        accessibilityLabel={t('فتح تفاصيل الطلب {0}', [item.order_number ?? item.id])}
      >
        {isDesktop ? (
          <>
            <View style={[{ flex: 2, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }]}>
              <View style={styles.avatarMiniList}><Ionicons name="receipt" size={14} color={UI.textDark} /></View>
              <View>
                <Text style={styles.tdTextBold}>#{tv(item.order_number ?? item.id.slice(0, 8))}</Text>
                <Text style={styles.tdSub}>{t('طلب جديد')}</Text>
              </View>
            </View>
            <Text style={[styles.td, { flex: 2 }]}>{tv(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))}</Text>
            <Text style={[styles.td, { flex: 2 }]}>{tv(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))}</Text>
            <Text style={[styles.td, { flex: 2 }]}>{tv(item.merchant_profiles?.store_name ?? '—')}</Text>
            <Text style={[styles.td, { flex: 2 }]}>{tv(item.customer?.full_name ?? item.users?.full_name ?? t('عميل جديد'))}</Text>
            <View style={[{ flex: 2, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }]}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
              <Text style={[styles.tdTextBold, { color: UI.textDark }]}>{tv(statusLabel)}</Text>
            </View>
            <Text style={[styles.td, styles.tdTextBold, { flex: 2, textAlign: 'left' }]}>{t('{0} ر.ي', [item.total_amount?.toLocaleString()])}</Text>
          </>
        ) : (
          <>
            <View style={styles.avatarMiniList}><Ionicons name="receipt" size={16} color={UI.textDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tdTextBold}>#{tv(item.order_number ?? item.id.slice(0, 8))}</Text>
              <Text style={styles.tdSub}>{tv(d.toLocaleDateString('en-GB'))} • {tv(item.merchant_profiles?.store_name ?? '—')}</Text>
            </View>
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={styles.tdTextBold}>{t('{0} ر.ي', [item.total_amount?.toLocaleString()])}</Text>
              <Text style={[styles.tdSub, { color: statusColor }]}>{tv(statusLabel)}</Text>
            </View>
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderTrend = (val?: number) => {
    if (val === undefined || val === null) return null;
    const isUp = val >= 0;
    const color = isUp ? UI.green : '#EF4444';
    const icon = isUp ? 'trending-up' : 'trending-down';
    return (
      <View style={styles.trendRow}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.trendText, { color }]}>{t('{0}% عن الأسبوع السابق', [Math.abs(val).toFixed(1)])}</Text>
      </View>
    );
  };

  const containerStyle = [styles.container, { backgroundColor: isDesktop ? UI.bg : UI.bgMobile }];

  return (
    <View style={containerStyle}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { width: dashboardWidth }, isCompact && styles.scrollContentCompact]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
      >

        {/* ===== Welcome Section ===== */}
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.eyebrow}>{t('مركز العمليات')}</Text>
            <Text style={styles.welcomeText}>{t('مرحباً بك،')}{' '}<Text style={styles.welcomeName}>{tv(user?.full_name ?? t('المدير العام'))}</Text></Text>
          </View>
          <View style={styles.welcomeActions}>
            <TouchableOpacity style={styles.exportBtn} onPress={exportReport} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('تصدير جميع الطلبات إلى ملف CSV')}>
              <Ionicons name="download-outline" size={16} color={UI.primary} />
              <Text style={styles.addBtnText}>{t('تصدير التقرير')}</Text>
            </TouchableOpacity>
            <View style={styles.datePicker}>
              <Ionicons name="calendar-outline" size={16} color={UI.textDark} />
              <Text style={styles.dateText}>{tv(new Date().toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }))}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={UI.primary} />
            <Text style={{ color: UI.textMuted, marginTop: 12, fontWeight: '600' }}>{t('جاري تحميل البيانات...')}</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={36} color="#DC2626" />
            <Text style={styles.errorText}>{tv(error)}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button">
              <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ===== Top Widgets Grid ===== */}
            <View style={[styles.gridRow, { flexDirection: isDesktop ? 'row-reverse' : 'column' }]}>

              {/* Column 1: Hero Card + Quick Stat */}
              <View style={[styles.column, { width: col3Width }]}>
                <View style={[styles.card, styles.heroCard]}>
                  <View pointerEvents="none" style={styles.heroOrbLime} />
                  <View pointerEvents="none" style={styles.heroOrbCoral} />
                  <View style={styles.heroContent}>
                    <View style={styles.heroTop}>
                      <Text style={styles.heroLogo}>{t('لوحة الإدارة')}</Text>
                      <View style={styles.heroIconWrap}>
                        <Ionicons name="shield-checkmark" size={20} color={UI.primary} />
                      </View>
                    </View>
                    <Text style={styles.heroSubtitle}>{t('إجمالي صافي قيمة الطلبات المسدّدة')}</Text>
                    <Text style={styles.heroBalance}>{t('{0} ر.ي', [stats?.netSettledGmv.toLocaleString() ?? 0])}</Text>
                    <View style={styles.heroBottom}>
                      <Text style={styles.heroText}>{t('المستخدمين: {0}', [stats?.totalUsers.toLocaleString()])}</Text>
                      <Text style={styles.heroText}>{t('الطلبات: {0}', [stats?.totalOrders.toLocaleString()])}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.card, styles.limeCard]}>
                  <Text style={styles.cardTitleSoft}>{t('تجار قيد الانتظار')}</Text>
                  <View style={styles.statRow}>
                    <Text style={styles.statValue}>+{tv(stats?.pendingMerchants ?? 0)}</Text>
                    <View style={styles.badgeOrange}>
                      <Text style={styles.badgeOrangeText}>{t('بانتظار المراجعة')}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Column 2: Bar Chart */}
              <View style={[styles.column, { width: col3Width }]}>
                <View style={[styles.card, { flex: 1 }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.iconBox}><Ionicons name="bar-chart" size={16} color={UI.textDark} /></View>
                      <Text style={styles.cardTitle}>{t('طلبات آخر 7 أيام')}</Text>
                    </View>
                    <View style={styles.togglePills}>
                      <Text style={styles.togglePill}>{t('أسبوعي')}</Text>
                      <Text style={styles.togglePillActive}>{t('شهري')}</Text>
                    </View>
                  </View>
                  <View style={styles.chartAreaCentered}>
                    <BarChart w={col3Width - 48} h={160} points={chartPoints} color={UI.primary} />
                    <View style={styles.chartLabelsX}>
                      {chartLabels.map((lbl, i) => (
                        <Text key={i} style={styles.chartLabel}>{tv(lbl)}</Text>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* Column 3: Line Chart + Quick Stats */}
              <View style={[styles.column, { width: col3Width }]}>
                <View style={[styles.card, styles.mintCard]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={styles.cardTitle}>{t('اتجاه الطلبات')}</Text>
                    </View>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('AdminOrders')} accessibilityRole="button" accessibilityLabel={t('فتح كل الطلبات')}><Ionicons name="arrow-up-outline" size={16} color={UI.textDark} /></TouchableOpacity>
                  </View>
                  <Text style={styles.chartTotalValue}>{t('{0} طلب', [chartTotal.toLocaleString()])}</Text>
                  <View style={{ marginTop: 20, alignItems: 'center' }}>
                    <LineChart w={col3Width - 48} h={80} points={chartPoints} color={UI.primary} />
                  </View>
                </View>

                <View style={styles.card}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={styles.iconBox}><Ionicons name="analytics-outline" size={16} color={UI.textDark} /></View>
                    <Text style={styles.cardTitleSoft}>{t('نظرة سريعة')}</Text>
                  </View>
                  <View style={{ marginTop: 14, gap: 10 }}>
                    <View style={styles.quickStatRow}>
                      <Text style={styles.quickStatLabel}>{t('طلبات نشطة')}</Text>
                      <Text style={styles.quickStatValue}>{tv(stats?.activeOrders ?? 0)}</Text>
                    </View>
                    <View style={styles.quickStatRow}>
                      <Text style={styles.quickStatLabel}>{t('سائقين متصلين')}</Text>
                      <Text style={styles.quickStatValue}>{tv(stats?.onlineDrivers ?? 0)}</Text>
                    </View>
                    <View style={styles.quickStatRow}>
                      <Text style={styles.quickStatLabel}>{t('متوسط صافي التسوية')}</Text>
                      <Text style={styles.quickStatValue}>{t('{0} ر.ي', [stats?.averageOrderValue?.toFixed(2) ?? '0.00'])}</Text>
                    </View>
                    <View style={styles.quickStatRow}>
                      <Text style={styles.quickStatLabel}>{t('معدل إتمام الطلبات')}</Text>
                      <View style={styles.completionWrap}>
                        <Text style={styles.quickStatValue}>{tv(stats?.completionRate?.toFixed(1) ?? '0.0')}%</Text>
                        <View style={styles.progressBar}>
                          <View style={[styles.progressFill, { width: `${Math.min(stats?.completionRate ?? 0, 100)}%` as any }]} />
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

            </View>

            {/* ===== Stat Summary Cards ===== */}
            <View style={[styles.statCardsRow, { flexDirection: isDesktop ? 'row-reverse' : 'column' }]}>
              <View style={styles.statSummaryCard}>
                <View style={[styles.statSummaryIcon, { backgroundColor: UI.coralSoft }]}>
                  <Ionicons name="flash" size={20} color={UI.coral} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.statSummaryValue}>{tv(stats?.activeOrders ?? 0)}</Text>
                  <Text style={styles.statSummaryLabel}>{t('طلبات نشطة')}</Text>
                </View>
              </View>

              <View style={styles.statSummaryCard}>
                <View style={[styles.statSummaryIcon, { backgroundColor: UI.mintSoft }]}>
                  <Ionicons name="receipt" size={20} color={UI.green} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.statSummaryValue}>{tv(stats?.totalOrders.toLocaleString() ?? 0)}</Text>
                  <Text style={styles.statSummaryLabel}>{t('إجمالي الطلبات')}</Text>
                </View>
                {renderTrend(stats?.trends?.orders)}
              </View>

              <View style={styles.statSummaryCard}>
                <View style={[styles.statSummaryIcon, { backgroundColor: UI.primaryLight }]}>
                  <Ionicons name="people" size={20} color={UI.primary} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.statSummaryValue}>{tv(stats?.totalUsers.toLocaleString() ?? 0)}</Text>
                  <Text style={styles.statSummaryLabel}>{t('إجمالي المستخدمين')}</Text>
                </View>
                {renderTrend(stats?.trends?.users)}
              </View>

              <View style={styles.statSummaryCard}>
                <View style={[styles.statSummaryIcon, { backgroundColor: UI.limeSoft }]}>
                  <Ionicons name="navigate" size={20} color="#617A0C" />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.statSummaryValue}>{tv(stats?.onlineDrivers ?? 0)}</Text>
                  <Text style={styles.statSummaryLabel}>{t('سائقين متصلين')}</Text>
                </View>
              </View>
            </View>

            {/* ===== Orders Table ===== */}
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableTitle}>{t('سجل الطلبات الأحدث')}</Text>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('AdminOrders')} accessibilityRole="button" accessibilityLabel={t('فتح كل الطلبات')}><Ionicons name="arrow-up-outline" size={16} color={UI.textDark} /></TouchableOpacity>
              </View>

              {isDesktop ? (
                <View style={styles.tableWrapper}>
                  <View style={styles.tableRowHeader}>
                    <Text style={[styles.th, { flex: 2 }]}>{t('رقم الطلب')}</Text>
                    <Text style={[styles.th, { flex: 2 }]}>{t('التاريخ')}</Text>
                    <Text style={[styles.th, { flex: 2 }]}>{t('الوقت')}</Text>
                    <Text style={[styles.th, { flex: 2 }]}>{t('المتجر')}</Text>
                    <Text style={[styles.th, { flex: 2 }]}>{t('العميل')}</Text>
                    <Text style={[styles.th, { flex: 2 }]}>{t('الحالة')}</Text>
                    <Text style={[styles.th, { flex: 2, textAlign: 'left' }]}>{t('المبلغ')}</Text>
                  </View>
                  {recentOrders.map(renderOrderRow)}
                </View>
              ) : (
                <View style={styles.mobileList}>
                  {recentOrders.map(renderOrderRow)}
                </View>
              )}

              {recentOrders.length === 0 && (
                <Text style={{ textAlign: 'center', color: UI.textMuted, padding: 30 }}>{t('لا يوجد طلبات بعد')}</Text>
              )}
            </View>
          </>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { maxWidth: BREAKPOINTS.wide, alignSelf: 'center', padding: 24, paddingBottom: 112 },
  scrollContentCompact: { paddingHorizontal: 16, paddingTop: 18 },
  loadingCenter: { height: 300, alignItems: 'center', justifyContent: 'center' },
  errorCard: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: UI.card, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: UI.coralSoft, padding: 24, ...softShadow },
  errorText: { maxWidth: 520, color: COLORS.error, fontSize: 15, fontFamily: FONTS.semiBold, textAlign: 'center', lineHeight: 24 },
  retryBtn: { backgroundColor: UI.primary, borderRadius: RADIUS.full, paddingHorizontal: 22, paddingVertical: 12, minHeight: 46, minWidth: 160, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontFamily: FONTS.semiBold },

  // Welcome Section
  welcomeRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  welcomeCopy: { alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 11, fontFamily: FONTS.semiBold, color: UI.primary, textAlign: 'right', letterSpacing: 0.8 },
  welcomeText: { fontSize: 27, fontFamily: FONTS.bold, color: UI.textDark, textAlign: 'right' },
  welcomeName: { fontFamily: FONTS.medium, color: UI.textGrey },
  welcomeActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  exportBtn: { minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: UI.card, paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.full, borderWidth: 1, borderColor: UI.border, ...softShadow },
  addBtnText: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textDark },
  datePicker: { minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: UI.card, paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.full, borderWidth: 1, borderColor: UI.border, ...softShadow },
  dateText: { fontSize: 13, fontFamily: FONTS.medium, color: UI.textDark },

  // Trend
  trendRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  trendText: { fontSize: 11, fontFamily: FONTS.semiBold },

  // Grid
  gridRow: { gap: 20, marginBottom: 20, flexDirection: 'row-reverse' },
  column: { gap: 20 },

  // Bento cards
  card: { backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 20, borderWidth: 1, borderColor: UI.border, ...softShadow },
  limeCard: { backgroundColor: UI.limeSoft, borderColor: '#DDEFA9' },
  mintCard: { backgroundColor: UI.mintSoft, borderColor: '#BEEBDD' },
  heroCard: { minHeight: 224, backgroundColor: UI.primary, padding: 24, overflow: 'hidden', borderColor: UI.primary },
  heroContent: { zIndex: 2 },
  heroOrbLime: { position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: UI.lime, left: -45, top: -52, opacity: 0.92 },
  heroOrbCoral: { position: 'absolute', width: 72, height: 72, borderRadius: 36, backgroundColor: UI.coral, right: -24, bottom: -24, opacity: 0.85 },
  heroTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  heroIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: UI.lime, alignItems: 'center', justifyContent: 'center' },
  heroLogo: { fontSize: 18, fontFamily: FONTS.bold, color: '#FFFFFF' },
  heroSubtitle: { fontSize: 12, fontFamily: FONTS.regular, color: '#DDD8FF', marginBottom: 4, textAlign: 'right' },
  heroBalance: { fontSize: 34, fontFamily: FONTS.bold, color: '#FFFFFF', marginBottom: 24, textAlign: 'right' },
  heroBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  heroText: { fontSize: 12.5, color: '#F0EDFF', fontFamily: FONTS.medium },

  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardHeaderLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  iconBox: { width: 30, height: 30, borderRadius: RADIUS.sm, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontFamily: FONTS.semiBold, color: UI.textDark },
  cardTitleSoft: { fontSize: 13, fontFamily: FONTS.medium, color: UI.textGrey, marginBottom: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, alignItems: 'center', justifyContent: 'center' },

  togglePills: { flexDirection: 'row-reverse', backgroundColor: UI.cardSoft, borderRadius: RADIUS.full, padding: 4 },
  togglePill: { fontSize: 11, fontFamily: FONTS.medium, color: UI.textGrey, paddingHorizontal: 12, paddingVertical: 6 },
  togglePillActive: { fontSize: 11, fontFamily: FONTS.semiBold, color: '#FFFFFF', backgroundColor: UI.primary, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6 },

  chartAreaCentered: { alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  chartLabelsX: { flexDirection: 'row-reverse', justifyContent: 'space-between', width: '100%', marginTop: 12, paddingHorizontal: 10 },
  chartLabel: { fontSize: 10, color: UI.textMuted, fontFamily: FONTS.medium },
  chartTotalValue: { fontSize: 29, fontFamily: FONTS.bold, color: UI.textDark },

  statRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  statValue: { fontSize: 27, fontFamily: FONTS.bold, color: UI.textDark },
  badgeOrange: { backgroundColor: UI.coralSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full },
  badgeOrangeText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.error },

  // Quick Stats inside card
  quickStatRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  quickStatLabel: { fontSize: 13, color: UI.textGrey, fontFamily: FONTS.medium },
  quickStatValue: { fontSize: 14, fontFamily: FONTS.bold, color: UI.textDark },
  completionWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  progressBar: { width: 60, height: 5, borderRadius: 3, backgroundColor: COLORS.borderStrong, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: UI.mint },

  // Stat Summary Cards Row
  statCardsRow: { gap: 16, marginBottom: 20 },
  statSummaryCard: { flex: 1, minHeight: 104, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 18, borderWidth: 1, borderColor: UI.border, ...softShadow },
  statSummaryIcon: { width: 46, height: 46, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  statSummaryValue: { fontSize: 21, fontFamily: FONTS.bold, color: UI.textDark },
  statSummaryLabel: { fontSize: 12, color: UI.textGrey, fontFamily: FONTS.medium, marginTop: 2 },

  // Orders table
  tableCard: { backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 24, borderWidth: 1, borderColor: UI.border, ...softShadow },
  tableHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  tableTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.textDark },
  tableRowHeader: { flexDirection: 'row-reverse', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: UI.border },
  th: { fontSize: 12, color: UI.textGrey, fontFamily: FONTS.medium, flex: 1, textAlign: 'right' },
  tableRow: { minHeight: 58, flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: UI.border },
  td: { fontSize: 13, color: UI.textGrey, fontFamily: FONTS.regular, textAlign: 'right' },
  tdTextBold: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textDark, textAlign: 'right' },
  tdSub: { fontSize: 11, color: UI.textGrey, fontFamily: FONTS.regular, marginTop: 4, textAlign: 'right' },
  avatarMiniList: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tableWrapper: { width: '100%' },

  mobileList: { gap: 14 },
});
