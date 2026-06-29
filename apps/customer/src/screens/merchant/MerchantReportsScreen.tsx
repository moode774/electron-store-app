import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, formatPrice, formatCompactNumber } from '@marketplace/shared-utils';
import { useAuthStore, getMerchantSalesChart, getMerchantTopProducts, getMerchantReport, MerchantReport } from '@marketplace/shared-hooks';

const PERIODS: { label: string; days: number }[] = [
  { label: 'اليوم', days: 1 },
  { label: 'الأسبوع', days: 7 },
  { label: 'الشهر', days: 30 },
];
const DAY_LABELS = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

export default function MerchantReportsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState('الأسبوع');
  const [weekSales, setWeekSales] = useState<{ day: string; value: number }[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [report, setReport] = useState<MerchantReport | null>(null);
  const [loading, setLoading] = useState(true);

  const days = PERIODS.find((p) => p.label === period)?.days ?? 7;

  useFocusEffect(useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    Promise.all([
      getMerchantSalesChart(user.id, 7),
      getMerchantTopProducts(user.id, 5),
      getMerchantReport(user.id, days),
    ]).then(([chart, top, rep]) => {
      if (!active) return;
      setWeekSales(chart.map((value, i) => ({ day: DAY_LABELS[i] ?? `${i + 1}`, value })));
      setTopProducts(top);
      setReport(rep);
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, days]));

  const maxVal = Math.max(...weekSales.map((d) => d.value), 1);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>التقارير والإحصائيات</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Period Selector */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.periodChip, period === p.label && styles.periodChipActive]}
              onPress={() => setPeriod(p.label)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodText, period === p.label && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI Cards */}
        {(() => {
          const trend = report?.trendPct ?? 0;
          const up = trend >= 0;
          return (
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{formatCompactNumber(report?.revenue ?? 0)}</Text>
                <Text style={styles.kpiLabel}>المبيعات (ر.ي)</Text>
                <View style={[styles.kpiTrend, !up && styles.kpiTrendDown]}>
                  <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color={up ? '#059669' : '#DC2626'} />
                  <Text style={[styles.kpiTrendText, !up && { color: '#DC2626' }]}>{up ? '+' : ''}{trend}%</Text>
                </View>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{report?.ordersCount ?? 0}</Text>
                <Text style={styles.kpiLabel}>عدد الطلبات</Text>
                <View style={styles.kpiTrend}>
                  <Ionicons name="receipt-outline" size={12} color="#059669" />
                  <Text style={styles.kpiTrendText}>{period}</Text>
                </View>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{formatCompactNumber(report?.avgOrderValue ?? 0)}</Text>
                <Text style={styles.kpiLabel}>متوسط الطلب</Text>
                <View style={styles.kpiTrend}>
                  <Ionicons name="cart-outline" size={12} color="#059669" />
                  <Text style={styles.kpiTrendText}>ر.ي</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Sales Chart (bars) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>مبيعات آخر 7 أيام</Text>
          <View style={styles.chartRow}>
            {weekSales.map((d, idx) => (
              <View key={idx} style={styles.barCol}>
                <Text style={styles.barValue}>{(d.value / 1000).toFixed(1)}k</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${(d.value / maxVal) * 100}%` }]} />
                </View>
                <Text style={styles.barDay}>{d.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top Products */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الأكثر مبيعاً</Text>
          {topProducts.length === 0 ? (
            <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>لا توجد بيانات بعد</Text>
          ) : topProducts.map((p, i) => (
            <View key={p.id} style={[styles.productRow, i < topProducts.length - 1 && styles.productRowBorder]}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.productImage}>
                {p.og_image_url ? (
                  <Image source={{ uri: p.og_image_url }} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
                ) : (
                  <Ionicons name="cube-outline" size={20} color="#9CA3AF" />
                )}
              </View>
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.productName}>{p.name}</Text>
                <Text style={styles.productSold}>{p.total_sold} مبيعة</Text>
              </View>
              <Text style={styles.productRevenue}>{formatPrice((p.sale_price ?? p.base_price) * p.total_sold)}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scrollContent: { padding: 20, gap: 16 },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodChip: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  periodChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  periodTextActive: { color: '#FFFFFF' },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 13, borderWidth: 1.5, borderColor: '#F3F4F6' },
  kpiValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  kpiLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  kpiTrend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, backgroundColor: '#DCFCE7', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  kpiTrendDown: { backgroundColor: '#FEE2E2' },
  kpiTrendText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6' },
  sectionTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827', marginBottom: 16 },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 160 },
  barCol: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 9.5, color: '#9CA3AF', fontWeight: '600', marginBottom: 4 },
  barTrack: { width: 18, flex: 1, borderRadius: 9, backgroundColor: '#F3F4F6', justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: COLORS.primary, borderRadius: 9 },
  barDay: { fontSize: 10, color: '#6B7280', marginTop: 6, fontWeight: '600' },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  productRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rank: { width: 22, fontSize: 14, fontWeight: '800', color: '#9CA3AF', textAlign: 'center' },
  productImage: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  productName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  productSold: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  productRevenue: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
});
