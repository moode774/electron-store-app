import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  Platform, Image, useWindowDimensions, Share, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import {
  useAuthStore, getMerchantProfile, getMerchantSalesChart, getMerchantTopProducts, getMerchantPeriodStats, getMerchantReport,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { Banner, IconButton, ScreenHeader, formatMoney, ui } from './merchantUi';

const PERIODS = [
  { label: 'اليوم', days: 1 },
  { label: 'الأسبوع', days: 7 },
  { label: 'الشهر', days: 30 },
];
const DAY_LABELS = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

const UI = {
  primary: COLORS.primary,
  bg: COLORS.canvas,
  textDark: COLORS.ink,
  textGrey: COLORS.inkSecondary,
  textMuted: COLORS.inkTertiary,
  border: COLORS.hairline,
  green: '#15803D',
  red: '#B91C1C',
};

function calcTrend(current: number, previous: number): { text: string; up: boolean } {
  if (previous === 0 && current === 0) return { text: '0%', up: true };
  if (previous === 0) return { text: '+100%', up: true };
  const pct = ((current - previous) / previous) * 100;
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, up: pct >= 0 };
}

function SmoothLineChart({ w, h, points, color }: { w: number; h: number; points: number[]; color: string }) {
  const data = points && points.length > 1 ? points : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...data, 1);
  const pts = data.map((val, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - (val / max) * (h - 20) - 10,
  }));

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const dFill = `${d} L ${pts[pts.length - 1].x} ${h} L 0 ${h} Z`;

  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.12" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {[0, 1, 2, 3].map(i => {
        const y = (i / 3) * h;
        return <Path key={i} d={`M 0 ${y} L ${w} ${y}`} stroke={UI.border} strokeWidth={1} strokeDasharray="4 4" />;
      })}
      <Path d={dFill} fill="url(#fillArea)" />
      <Path d={d} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill="#FFF" stroke={color} strokeWidth={2} />
      ))}
    </Svg>
  );
}

function MiniBarChart({ w, h, points, color }: { w: number; h: number; points: number[]; color: string }) {
  const data = points && points.length > 0 ? points : [0, 0, 0, 0, 0];
  const max = Math.max(...data, 1);
  const barWidth = w / data.length - 4;
  return (
    <Svg width={w} height={h}>
      {data.map((val, i) => {
        const barH = Math.max((val / max) * h, 4);
        return <Rect key={i} x={i * (w / data.length) + 2} y={h - barH} width={barWidth} height={barH} rx={2} fill={color} opacity={0.6} />;
      })}
    </Svg>
  );
}

export default function MerchantReportsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;

  const [periodIndex, setPeriodIndex] = useState(1);
  const period = PERIODS[periodIndex];

  const [chartData, setChartData] = useState<number[]>([]);
  const [chartLabels, setChartLabels] = useState<string[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [periodStats, setPeriodStats] = useState({
    currentRevenue: 0, previousRevenue: 0,
    currentOrders: 0, previousOrders: 0,
    deliveredCount: 0, cancelledCount: 0, inProgressCount: 0,
  });
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let chart: number[];
      let top: any[];
      let ps: typeof periodStats;
      try {
        // المسار الأساسي: دالة SQL واحدة تجمع التقرير كاملاً في القاعدة
        const report = await getMerchantReport(days === 1 ? 1 : days);
        chart = report.chart;
        top = report.topProducts;
        ps = report.stats;
      } catch {
        // مسار احتياطي: التجميع في التطبيق مع ترقيم الصفحات
        const merchant = await getMerchantProfile(user.id);
        if (!merchant?.id) throw new Error('MERCHANT_PROFILE_NOT_FOUND');
        [chart, top, ps] = await Promise.all([
          getMerchantSalesChart(merchant.id, days === 1 ? 1 : days),
          getMerchantTopProducts(merchant.id, 5, days === 1 ? 1 : days),
          getMerchantPeriodStats(merchant.id, days),
        ]);
      }
      setChartData(chart);
      setChartLabels(
        days === 1
          ? ['اليوم']
          : days === 7
          ? chart.map((_, i) => DAY_LABELS[i] ?? `${i + 1}`)
          : chart.map((_, i) => `${i + 1}`)
      );
      setTopProducts(top);
      setPeriodStats(ps);
      setError(null);
    } catch (e: any) {
      // نُظهر السبب الحقيقي (صلاحيات/بيانات/شبكة) بدل رسالة عامة تخفي المشكلة
      const detail = e?.message ? ` (${e.message})` : '';
      setError(`تعذر تحميل التقرير. تحقق من الاتصال ثم أعد المحاولة.${detail}`);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(period.days); }, [load, period.days]));

  const handlePeriodChange = (idx: number) => {
    setPeriodIndex(idx);
  };

  const revenueTrend = calcTrend(periodStats.currentRevenue, periodStats.previousRevenue);
  const ordersTrend = calcTrend(periodStats.currentOrders, periodStats.previousOrders);
  const avgValue = periodStats.currentOrders > 0 ? periodStats.currentRevenue / periodStats.currentOrders : 0;
  const prevAvg = periodStats.previousOrders > 0 ? periodStats.previousRevenue / periodStats.previousOrders : 0;
  const avgTrend = calcTrend(avgValue, prevAvg);

  const total = periodStats.deliveredCount + periodStats.cancelledCount + periodStats.inProgressCount;
  const deliveredPct = total > 0 ? Math.round((periodStats.deliveredCount / total) * 100) : 0;
  const cancelledPct = total > 0 ? Math.round((periodStats.cancelledCount / total) * 100) : 0;
  const inProgressPct = total > 0 ? 100 - deliveredPct - cancelledPct : 0;

  const donutDelivered = total > 0 ? (periodStats.deliveredCount / total) * 251 : 0;
  const donutInProgress = total > 0 ? (periodStats.inProgressCount / total) * 251 : 0;
  const chartWidth = Math.min(Math.max(width - (isDesktop ? 200 : 66), 260), 900);

  const handleExportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const lines = [
        `تقرير ${period.label} — ${new Date().toLocaleDateString('ar-SA')}`,
        '',
        'قيمة الطلبات والعدد',
        `إجمالي قيمة الطلبات,${periodStats.currentRevenue.toFixed(2)} ر.ي`,
        `إجمالي الطلبات,${periodStats.currentOrders}`,
        `متوسط قيمة الطلب,${avgValue.toFixed(2)} ر.ي`,
        `مكتملة,${periodStats.deliveredCount} (${deliveredPct}%)`,
        `قيد التنفيذ,${periodStats.inProgressCount} (${inProgressPct}%)`,
        `ملغاة,${periodStats.cancelledCount} (${cancelledPct}%)`,
        '',
        'أفضل المنتجات',
        'الاسم,الكمية المباعة,الإيرادات',
        ...topProducts.map(p => `"${p.name}",${p.total_sold},${Number(p.revenue ?? 0).toFixed(2)}`),
        '',
        'مبيعات الفترة',
        chartLabels.map((l, i) => `${l}: ${chartData[i]?.toFixed(2) ?? 0} ر.ي`).join('\n'),
      ];
      const csv = lines.join('\n');

      if (Platform.OS === 'web') {
        const blob = new (Blob as any)(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = (URL as any).createObjectURL(blob);
        const a = (globalThis as any).document.createElement('a');
        a.href = url;
        a.download = `report_${period.label}_${Date.now()}.csv`;
        a.click();
        (URL as any).revokeObjectURL(url);
      } else {
        await Share.share({ message: csv, title: `تقرير ${period.label}` });
      }
    } catch (e: any) {
      Alert.alert('خطأ', `تعذّر تصدير التقرير${e?.message ? `: ${e.message}` : ''}`);
    } finally {
      setExporting(false);
    }
  };

  const KPICard = ({ title, value, icon, trend, trendUp, showChart }: any) => (
    <View style={styles.kpiCard}>
      <View style={styles.kpiHeader}>
        <View style={styles.kpiIconBox}>
          <Ionicons name={icon} size={18} color={UI.primary} />
        </View>
        <Text style={styles.kpiTitle}>{title}</Text>
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <View style={styles.kpiFooter}>
        <Text style={[styles.kpiTrendText, { color: trendUp ? UI.green : UI.red }]}>
          <Ionicons name={trendUp ? 'arrow-up' : 'arrow-down'} size={10} /> {trend}
        </Text>
        {showChart && chartData.length > 1 && (
          <MiniBarChart w={40} h={16} points={chartData.slice(-5)} color={UI.primary} />
        )}
      </View>
    </View>
  );

  return (
    <View style={ui.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenHeader
        title="التقارير"
        subtitle="قيمة الطلبات المسجلة، وليست رصيداً مسوّى"
        onBack={() => navigation.goBack()}
        right={<IconButton icon={exporting ? 'hourglass-outline' : 'download-outline'} label="تصدير التقرير CSV" onPress={() => void handleExportCSV()} />}
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact, isTablet && styles.scrollContentWide]} showsVerticalScrollIndicator={false}>

        <View style={styles.periodRow}>
          {PERIODS.map((p, idx) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.periodChip, periodIndex === idx && styles.periodChipActive]}
              onPress={() => handlePeriodChange(idx)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`عرض تقرير ${p.label}`}
              accessibilityState={{ selected: periodIndex === idx }}
            >
              <Text style={[styles.periodText, periodIndex === idx && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && <ActivityIndicator size="large" color={UI.primary} style={{ marginVertical: 24 }} />}
        {!!error && (
          <View style={styles.bannerWrap}>
            <Banner text={error} tone="error" actionLabel="إعادة المحاولة" onAction={() => void load(period.days)} />
          </View>
        )}

        {/* KPIs */}
        <View style={[styles.row, styles.kpiGrid]}>
          <View style={styles.kpiColumn}>
            <KPICard
              title="إجمالي قيمة الطلبات"
              value={`${formatMoney(periodStats.currentRevenue)} ر.ي`}
              icon="wallet-outline"
              trend={revenueTrend.text}
              trendUp={revenueTrend.up}
              showChart
            />
          </View>
          <View style={styles.kpiColumn}>
            <KPICard
              title="إجمالي الطلبات"
              value={periodStats.currentOrders.toString()}
              icon="cube-outline"
              trend={ordersTrend.text}
              trendUp={ordersTrend.up}
              showChart
            />
          </View>
          <View style={styles.kpiColumn}>
            <KPICard
              title="متوسط قيمة الطلب"
              value={`${formatMoney(avgValue)} ر.ي`}
              icon="bar-chart-outline"
              trend={avgTrend.text}
              trendUp={avgTrend.up}
              showChart={false}
            />
          </View>
          <View style={styles.kpiColumn}>
            <KPICard
              title="معدل الإتمام"
              value={`${deliveredPct}%`}
              icon="pie-chart-outline"
              trend={total > 0 ? `${total} طلب` : 'لا يوجد بيانات'}
              trendUp={deliveredPct >= 70}
              showChart={false}
            />
          </View>
        </View>

        {/* Main Chart */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>التدفق المالي — {period.label}</Text>
              <Text style={styles.cardSubtitle}>مبيعات المتجر خلال هذه الفترة بالريال</Text>
            </View>
          </View>
          <View style={{ height: 220, marginTop: 20, alignItems: 'center' }}>
            <SmoothLineChart
              w={chartWidth}
              h={220}
              points={chartData}
              color={UI.primary}
            />
          </View>
          <View style={styles.chartXAxis}>
            {chartLabels.map((l, idx) => (
              <Text key={idx} style={styles.chartLabel}>{l}</Text>
            ))}
          </View>
        </View>

        {/* Bottom Row */}
        <View style={[styles.row, { flexDirection: isDesktop ? 'row-reverse' : 'column' }]}>

          {/* Top Products */}
          <View style={[styles.card, { flex: 6 }]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>المنتجات الأعلى أداءً</Text>
                <Text style={styles.cardSubtitle}>أفضل المنتجات حسب المبيعات والإيرادات</Text>
              </View>
            </View>

            {topProducts.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد مبيعات في هذه الفترة</Text>
            ) : topProducts.map((p, i) => {
              const rev = Number(p.revenue ?? 0);
              const maxRev = Number(topProducts[0]?.revenue ?? 0);
              const progress = maxRev > 0 ? (rev / maxRev) * 100 : 0;
              return (
                <View key={p.id} style={[styles.topRow, i < topProducts.length - 1 && styles.topRowDivider]}>
                  <View style={[styles.rank, i === 0 && styles.rankFirst]}>
                    <Text style={[styles.rankText, i === 0 && styles.rankTextFirst]}>{i + 1}</Text>
                  </View>
                  <View style={styles.productImgBox}>
                    {p.og_image_url
                      ? <Image source={{ uri: p.og_image_url }} style={styles.productImg} />
                      : <Ionicons name="cube-outline" size={18} color={UI.textMuted} />}
                  </View>
                  <View style={styles.topCopy}>
                    <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.productCat}>{p.total_sold} مبيع · {formatMoney(rev)} ر.ي</Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Order Status Donut */}
          <View style={[styles.card, { flex: 4 }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>حالة الطلبات — {period.label}</Text>
            </View>

            <View style={{ alignItems: 'center', marginVertical: 20 }}>
              <View style={styles.donutBox}>
                <Svg width={180} height={180} viewBox="0 0 100 100">
                  <Circle cx="50" cy="50" r="40" stroke={UI.bg} strokeWidth="12" fill="none" />
                  <Circle
                    cx="50" cy="50" r="40" stroke={UI.primary} strokeWidth="12" fill="none"
                    strokeDasharray={`${donutDelivered} 251`} strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                  <Circle
                    cx="50" cy="50" r="40" stroke={UI.textGrey} strokeWidth="12" fill="none"
                    strokeDasharray={`${donutInProgress} 251`}
                    strokeDashoffset={-donutDelivered}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </Svg>
                <View style={styles.donutInner}>
                  <Text style={styles.donutValue}>{total}</Text>
                  <Text style={styles.donutLabel}>إجمالي</Text>
                </View>
              </View>
            </View>

            <View style={{ width: '100%', gap: 12 }}>
              <View style={styles.legendRow}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.dot, { backgroundColor: UI.primary }]} />
                  <Text style={styles.legendText}>مكتملة</Text>
                </View>
                <Text style={styles.legendValue}>{deliveredPct}% ({periodStats.deliveredCount})</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.dot, { backgroundColor: UI.textGrey }]} />
                  <Text style={styles.legendText}>قيد التنفيذ</Text>
                </View>
                <Text style={styles.legendValue}>{inProgressPct}% ({periodStats.inProgressCount})</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.dot, { backgroundColor: UI.red }]} />
                  <Text style={styles.legendText}>ملغاة</Text>
                </View>
                <Text style={styles.legendValue}>{cancelledPct}% ({periodStats.cancelledCount})</Text>
              </View>
            </View>
          </View>

        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: { marginBottom: 16 },
  kpiGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12 },
  topRowDivider: { borderBottomWidth: 1, borderBottomColor: UI.border },
  topCopy: { flex: 1, alignItems: 'flex-end', gap: 4 },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  rankFirst: { backgroundColor: COLORS.primary },
  rankText: { fontSize: 12, fontFamily: FONTS.bold, color: UI.textGrey },
  rankTextFirst: { color: COLORS.surface },
  scrollContent: { padding: 16, paddingBottom: 60 },
  scrollContentCompact: { paddingHorizontal: 14 },
  scrollContentWide: { width: '100%', maxWidth: 1240, alignSelf: 'center' },
  errorBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 18 },
  errorText: { flex: 1, color: '#991B1B', fontSize: 13, fontWeight: '700', textAlign: 'right' },
  errorRetry: { color: '#991B1B', fontSize: 13, fontWeight: '900' },

  pageHeaderRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: 28, flexWrap: 'wrap', gap: 16,
  },
  pageHeaderCompact: { flexDirection: 'column', alignItems: 'stretch' },
  pageTitle: { fontSize: 26, fontWeight: '800', color: UI.textDark, marginBottom: 6, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },

  periodRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginBottom: 16,
    backgroundColor: COLORS.surface, padding: 4, borderRadius: RADIUS.md, borderWidth: 1, borderColor: UI.border,
  },
  periodRowCompact: { flexWrap: 'wrap', justifyContent: 'center' },
  periodChip: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 },
  periodChipActive: { backgroundColor: UI.primary },
  periodText: { fontSize: 13, fontFamily: FONTS.medium, color: UI.textGrey },
  periodTextActive: { color: '#FFFFFF', fontFamily: FONTS.bold },

  downloadBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    minHeight: 44, paddingHorizontal: 14,
    borderLeftWidth: 1, borderLeftColor: UI.border, marginLeft: 4,
  },
  downloadText: { fontSize: 13, fontWeight: '700', color: UI.textDark },

  row: { gap: 20, marginBottom: 20 },
  kpiColumn: { width: '47%', flexGrow: 1 },

  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 16,
    borderWidth: 1, borderColor: UI.border, marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontFamily: FONTS.bold, color: UI.textDark, marginBottom: 4, textAlign: 'right' },
  cardSubtitle: { fontSize: 12, fontFamily: FONTS.regular, color: UI.textMuted, textAlign: 'right' },

  chartXAxis: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 10 },
  chartLabel: { fontSize: 11, color: UI.textMuted, fontWeight: '600' },

  kpiCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14,
    borderWidth: 1, borderColor: UI.border,
  },
  kpiHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  kpiTitle: { fontSize: 12, color: UI.textGrey, fontFamily: FONTS.medium, textAlign: 'right', flex: 1 },
  kpiIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 20, fontFamily: FONTS.bold, color: UI.textDark, textAlign: 'right', marginBottom: 8 },
  kpiFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  kpiTrendText: { fontSize: 12, fontFamily: FONTS.semiBold },

  tableHeader: {
    flexDirection: 'row-reverse', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: UI.border, marginBottom: 4, marginTop: 20,
  },
  tableScrollContent: { minWidth: '100%' },
  tableViewport: { width: '100%', minWidth: 620 },
  tableViewportCompact: { minWidth: 680 },
  th: { fontSize: 11, color: UI.textMuted, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row-reverse', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: UI.bg,
  },
  td: { fontSize: 14, color: UI.textDark, textAlign: 'right' },
  tdBold: { fontWeight: '700' },

  productImgBox: { width: 38, height: 38, borderRadius: 8, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productImg: { width: '100%', height: '100%' },
  productName: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textDark, textAlign: 'right' },
  productCat: { fontSize: 11, color: UI.textMuted, textAlign: 'right' },

  progressTrack: { alignSelf: 'stretch', height: 4, backgroundColor: UI.bg, borderRadius: 2, overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', backgroundColor: UI.primary, borderRadius: 2 },
  progressText: { fontSize: 11, fontWeight: '700', color: UI.textGrey, width: 32, textAlign: 'left' },

  emptyText: { textAlign: 'center', color: UI.textMuted, padding: 40, fontSize: 14 },

  donutBox: { position: 'relative', width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  donutInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutValue: { fontSize: 30, fontFamily: FONTS.bold, color: UI.textDark },
  donutLabel: { fontSize: 12, color: UI.textMuted, fontWeight: '600' },

  legendRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: UI.bg,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, fontWeight: '600', color: UI.textGrey, textAlign: 'right' },
  legendValue: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textDark },
});
