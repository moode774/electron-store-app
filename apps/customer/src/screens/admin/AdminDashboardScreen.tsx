import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Platform, TextInput
} from 'react-native';
import { Alert } from '../../components/appAlert';
// Expo 54 keeps the URI-based helpers used by CSV export in the legacy module.
// Importing them from the main entrypoint compiles incorrectly and throws at runtime.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { getAdminStats, AdminStats, useAuthStore, getAdminOrders } from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  bg: '#FAFAFA',
  card: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#F3F4F6',
  blueLight: '#EFF6FF',
  greenLight: '#ECFDF5',
  purpleLight: '#F5F3FF',
  orangeLight: '#FFF7ED',
};

export default function AdminDashboardScreen({ navigation }: any) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { user } = useAuthStore();

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

  const renderOrderRow = (item: any) => {
    const statusLabel = item.status === 'delivered' ? 'مكتمل' : item.status === 'cancelled' ? 'ملغي' : 'جاري التوصيل';
    const statusColor = item.status === 'delivered' ? '#10B981' : item.status === 'cancelled' ? '#EF4444' : '#F59E0B';
    const date = new Date(item.created_at).toLocaleDateString('ar-SA');
    return (
      <TouchableOpacity
        key={item.id}
        style={s.tableRow}
        onPress={() => navigation.navigate('AdminOrders', { initialSearch: item.order_number ?? item.id })}
        accessibilityRole="button"
        accessibilityLabel={`فتح تفاصيل الطلب ${item.order_number ?? item.id}`}
      >
         <Text style={s.tdAction}><Ionicons name="ellipsis-horizontal" size={20} color="#9CA3AF" /></Text>
         <Text style={s.td}>{date}</Text>
         <Text style={s.td}>{item.total_amount?.toFixed(2)} ر.ي</Text>
         <Text style={[s.td, { color: statusColor, fontWeight: '700' }]}>{statusLabel}</Text>
         <Text style={s.td}>{item.delivery_profiles?.users?.full_name ?? item.drivers?.full_name ?? '—'}</Text>
         <Text style={s.td}>{item.merchant_profiles?.store_name ?? '—'}</Text>
         <Text style={s.td}>{item.customer?.full_name ?? item.users?.full_name ?? '—'}</Text>
         <Text style={s.tdBold}>#{item.order_number ?? item.id.slice(0, 6)}</Text>
      </TouchableOpacity>
    );
  };

  const renderTrend = (val?: number) => {
    if (val === undefined || val === null) return null;
    const isUp = val >= 0;
    const color = isUp ? '#10B981' : '#EF4444';
    const icon = isUp ? 'trending-up' : 'trending-down';
    return (
      <View style={s.trendRow}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[s.trendText, {color}]}>{Math.abs(val).toFixed(1)}% عن الأسبوع السابق</Text>
      </View>
    );
  };

  const yAxisMax = stats?.chartData?.length ? Math.max(...stats.chartData.map(d => d.count), 5) : 10;
  const yAxisStep = Math.ceil(yAxisMax / 5);
  const yAxisLabels = [5, 4, 3, 2, 1, 0].map(i => i * yAxisStep);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Top Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => navigation.navigate('AdminMore', { screen: 'AdminNotifications' })}
            accessibilityRole="button"
            accessibilityLabel="فتح إشعارات الإدارة"
          >
            <Ionicons name="notifications-outline" size={20} color="#6B7280" />
          </TouchableOpacity>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={18} color="#9CA3AF" style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder="ابحث عن طلب، مستخدم، متجر..."
              placeholderTextColor="#9CA3AF"
              textAlign="right"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => {
                if (search.trim()) navigation.navigate('AdminOrders', { initialSearch: search.trim() });
              }}
              returnKeyType="search"
              accessibilityLabel="البحث في الطلبات"
            />
          </View>
        </View>
        <View style={s.headerRight}>
          <View style={s.profileText}>
            <Text style={s.profileGreeting}>مرحباً بك،</Text>
            <Text style={s.profileName}>{user?.full_name ?? 'المدير العام'}</Text>
          </View>
          <View style={s.avatar}><Ionicons name="person" size={24} color="#FFFFFF" /></View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.pageTitleRow}>
          <TouchableOpacity style={s.exportBtn} onPress={exportReport} accessibilityRole="button" accessibilityLabel="تصدير جميع الطلبات إلى ملف CSV">
            <Ionicons name="download-outline" size={16} color={UI.primary} />
            <Text style={s.exportBtnText}>تصدير التقرير</Text>
          </TouchableOpacity>
          <View style={s.datePickerBox}>
            <Ionicons name="calendar-outline" size={16} color="#9CA3AF" />
            <Text style={s.datePickerText}>{new Date().toLocaleDateString('ar-SA')}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.pageTitle}>نظرة عامة</Text>
            <Text style={s.pageSub}>ملخص الأداء العام للتطبيق وإحصائياته الرئيسية</Text>
          </View>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
        ) : error ? (
          <View style={s.errorCard} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={36} color="#DC2626" />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button">
              <Text style={s.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Stat Cards */}
            <View style={s.statsGrid}>
              <View style={s.statCard}>
                <View style={s.statCardTop}>
                   <Text style={s.statValue}>{stats?.pendingMerchants ?? 0}</Text>
                   <View style={[s.statIcon, { backgroundColor: UI.blueLight }]}><Ionicons name="storefront" size={24} color="#3B82F6" /></View>
                </View>
                <Text style={s.statLabel}>تجار قيد الانتظار</Text>
                {/* No trend for pending merchants, just showing 0 */}
                <View style={s.trendRow}><Text style={[s.trendText, {color: UI.textMuted}]}>الطلبات الحالية</Text></View>
              </View>

              <View style={s.statCard}>
                <View style={s.statCardTop}>
                   <Text style={s.statValue}>{stats?.totalOrders.toLocaleString() ?? 0}</Text>
                   <View style={[s.statIcon, { backgroundColor: UI.greenLight }]}><Ionicons name="receipt" size={24} color="#10B981" /></View>
                </View>
                <Text style={s.statLabel}>إجمالي الطلبات</Text>
                {renderTrend(stats?.trends?.orders)}
              </View>

              <View style={s.statCard}>
                <View style={s.statCardTop}>
                   <Text style={s.statValue}>{stats?.totalUsers.toLocaleString() ?? 0}</Text>
                   <View style={[s.statIcon, { backgroundColor: UI.purpleLight }]}><Ionicons name="people" size={24} color="#8B5CF6" /></View>
                </View>
                <Text style={s.statLabel}>إجمالي المستخدمين</Text>
                {renderTrend(stats?.trends?.users)}
              </View>

              <View style={s.statCard}>
                <View style={s.statCardTop}>
                   <Text style={s.statValue}>{stats?.netSettledGmv.toLocaleString() ?? 0}</Text>
                   <View style={[s.statIcon, { backgroundColor: UI.orangeLight }]}><Ionicons name="cash" size={24} color="#F59E0B" /></View>
                </View>
                <Text style={s.statLabel}>صافي قيمة الطلبات المسوّاة</Text>
                {renderTrend(stats?.trends?.netSettledGmv)}
              </View>
            </View>

            {/* Middle Section */}
            <View style={s.middleSection}>
              <View style={s.chartCard}>
                <View style={s.chartHeader}>
                  <Text style={s.sectionTitle}>طلبات آخر 7 أيام</Text>
                  <View style={s.chartFilter}><Text style={s.chartFilterText}>آخر 7 أيام</Text><Ionicons name="chevron-down" size={14} color="#6B7280" /></View>
                </View>
                <View style={s.chartArea}>
                  <View style={s.yAxis}>
                    {yAxisLabels.map(t => <Text key={t} style={s.chartLabel}>{t}</Text>)}
                  </View>
                  <View style={s.chartPlot}>
                    {[1,2,3,4,5].map(i => <View key={i} style={s.gridLine} />)}
                    <View style={s.barRow}>
                      {stats?.chartData?.map((point, index) => (
                        <View key={`${point.date}-${index}`} style={s.barColumn} accessibilityLabel={`${point.date}: ${point.count} طلب`}>
                          <Text style={s.barValue}>{point.count}</Text>
                          <View style={[s.bar, { height: `${Math.max(4, (point.count / yAxisMax) * 100)}%` as any }]} />
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={s.xAxis}>
                  {stats?.chartData?.map(d => (
                    <Text key={d.date} style={s.chartLabel}>
                      {new Date(`${d.date}T12:00:00+03:00`).toLocaleDateString('ar-SA', { weekday: 'short' })}
                    </Text>
                  ))}
                </View>
              </View>

              <View style={s.quickStatsCard}>
                <Text style={[s.sectionTitle, { marginBottom: 20 }]}>نظرة عامة سريعة</Text>
                <View style={s.quickRow}>
                   <View style={[s.quickIcon, { backgroundColor: '#EFF6FF' }]}><Ionicons name="flash" size={16} color="#3B82F6" /></View>
                   <Text style={s.quickLabel}>طلبات نشطة</Text>
                   <Text style={s.quickValue}>{stats?.activeOrders ?? 0}</Text>
                </View>
                <View style={s.quickDivider} />
                <View style={s.quickRow}>
                   <View style={[s.quickIcon, { backgroundColor: '#F5F3FF' }]}><Ionicons name="navigate" size={16} color="#8B5CF6" /></View>
                   <Text style={s.quickLabel}>سائقين متصلين</Text>
                   <Text style={s.quickValue}>{stats?.onlineDrivers ?? 0}</Text>
                </View>
                <View style={s.quickDivider} />
                <View style={s.quickRow}>
                   <View style={[s.quickIcon, { backgroundColor: '#ECFDF5' }]}><Ionicons name="stats-chart" size={16} color="#10B981" /></View>
                   <Text style={s.quickLabel}>متوسط صافي التسوية</Text>
                   <Text style={s.quickValue}>{stats?.averageOrderValue?.toFixed(2) ?? '0.00'} ر.ي</Text>
                </View>
                <View style={s.quickDivider} />
                <View style={s.quickRow}>
                   <View style={[s.quickIcon, { backgroundColor: '#FFF7ED' }]}><Ionicons name="pie-chart" size={16} color="#F59E0B" /></View>
                   <Text style={s.quickLabel}>معدل إتمام الطلبات</Text>
                   <Text style={s.quickValue}>{stats?.completionRate?.toFixed(1) ?? '0.0'}%</Text>
                </View>
              </View>
            </View>

            {/* Recent Orders Table */}
            <View style={s.tableCard}>
              <View style={s.tableHeaderWrap}>
                <TouchableOpacity style={s.viewAllBtn} onPress={() => navigation.navigate('AdminOrders')} accessibilityRole="button"><Text style={s.viewAllText}>عرض الكل</Text></TouchableOpacity>
                <Text style={s.sectionTitle}>آخر الطلبات</Text>
              </View>
              <View style={s.table}>
                <View style={s.thRow}>
                  <Text style={s.th}>الإجراءات</Text>
                  <Text style={s.th}>التاريخ</Text>
                  <Text style={s.th}>المبلغ</Text>
                  <Text style={s.th}>الحالة</Text>
                  <Text style={s.th}>السائق</Text>
                  <Text style={s.th}>المتجر</Text>
                  <Text style={s.th}>العميل</Text>
                  <Text style={s.th}>رقم الطلب</Text>
                </View>
                {recentOrders.map(renderOrderRow)}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: UI.border, zIndex: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileText: { alignItems: 'flex-end' },
  profileGreeting: { fontSize: 11, color: UI.textMuted },
  profileName: { fontSize: 14, fontWeight: '800', color: UI.text },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: UI.border, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 12, height: 40, width: 280, borderWidth: 1, borderColor: UI.border },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 13, color: UI.text },
  
  scroll: { padding: 24, paddingBottom: 60 },
  center: { height: 300, alignItems: 'center', justifyContent: 'center' },
  errorCard: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#FECACA', padding: 24 },
  errorText: { maxWidth: 520, color: '#991B1B', fontSize: 15, fontWeight: '700', textAlign: 'center', lineHeight: 24 },
  retryBtn: { backgroundColor: UI.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  
  pageTitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 12 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E0E7FF' },
  exportBtnText: { fontSize: 13, fontWeight: '700', color: UI.primary },
  datePickerBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: UI.border },
  datePickerText: { fontSize: 13, color: UI.textMuted, fontWeight: '600' },
  pageTitle: { fontSize: 24, fontWeight: '900', color: UI.text, textAlign: 'right' },
  pageSub: { fontSize: 14, color: UI.textMuted, marginTop: 4, textAlign: 'right' },

  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16, marginBottom: 24, justifyContent: 'space-between' },
  statCard: { flex: 1, minWidth: '22%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: UI.border },
  statCardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: UI.text },
  statLabel: { fontSize: 13, fontWeight: '700', color: UI.textMuted, textAlign: 'right', marginBottom: 12 },
  trendRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  trendText: { fontSize: 11, fontWeight: '700' },

  middleSection: { flexDirection: 'row-reverse', gap: 16, marginBottom: 24 },
  chartCard: { flex: 2, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: UI.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  chartHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: UI.text, textAlign: 'right' },
  chartFilter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: UI.border },
  chartFilterText: { fontSize: 12, color: UI.textMuted, fontWeight: '600' },
  chartArea: { flexDirection: 'row', height: 220 },
  yAxis: { justifyContent: 'space-between', paddingRight: 12, alignItems: 'flex-end' },
  chartLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  chartPlot: { flex: 1, position: 'relative' },
  gridLine: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flex: 1 },
  barRow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-around', paddingHorizontal: 8 },
  barColumn: { width: '10%', height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', maxWidth: 30, minHeight: 4, backgroundColor: UI.primary, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barValue: { color: UI.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  chartTooltip: { position: 'absolute', top: '25%', left: '45%', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
  tooltipDate: { fontSize: 10, color: UI.textMuted, marginBottom: 2 },
  tooltipVal: { fontSize: 12, fontWeight: '800', color: UI.text },
  xAxis: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingLeft: 40, marginTop: 12 },

  quickStatsCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: UI.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  quickRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  quickIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 14, color: UI.textMuted, fontWeight: '600', flex: 1, textAlign: 'right' },
  quickValue: { fontSize: 16, fontWeight: '900', color: UI.text },
  quickDivider: { height: 1, backgroundColor: UI.border, marginVertical: 16 },

  tableCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: UI.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  tableHeaderWrap: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  viewAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: UI.border },
  viewAllText: { fontSize: 12, color: UI.textMuted, fontWeight: '600' },
  table: { width: '100%' },
  thRow: { flexDirection: 'row-reverse', borderBottomWidth: 1, borderBottomColor: UI.border, paddingBottom: 12, marginBottom: 12 },
  th: { flex: 1, fontSize: 12, fontWeight: '700', color: '#9CA3AF', textAlign: 'right' },
  tableRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  td: { flex: 1, fontSize: 13, color: UI.text, fontWeight: '500', textAlign: 'right' },
  tdBold: { flex: 1, fontSize: 13, fontWeight: '800', color: UI.text, textAlign: 'right' },
  tdAction: { flex: 1, textAlign: 'right' },
});
