import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, getMerchantStats, getMerchantOrders, getMerchantSalesChart, OrderSummary } from '@marketplace/shared-hooks';

const { width } = Dimensions.get('window');

// ---- ثوابت التصميم (نمط أزرق فاتح ناعم) ----
const UI = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  cardSoft: '#F9FAFB',
  blue: '#3B82F6',
  blueLight: '#60A5FA',
  navy: '#111827',
  textDark: '#111827',
  textGrey: '#6B7280',
  textMuted: '#9CA3AF',
};

const softShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 20,
  elevation: 4,
} as const;

const QUICK_ACTIONS = [
  { id: '1', title: 'المدفوعات', sub: 'الأرباح والمدفوعات', icon: 'wallet-outline' },
  { id: '2', title: 'العروض', sub: 'إدارة العروض', icon: 'pricetag-outline' },
  { id: '3', title: 'المنتجات', sub: 'إدارة المنتجات', icon: 'cube-outline' },
  { id: '4', title: 'التقارير', sub: 'عرض الأداء', icon: 'document-text-outline' },
];

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  delivered: { label: 'تم التسليم', color: '#059669', bg: '#E7F8F1', icon: 'checkmark-circle-outline' },
  shipping: { label: 'قيد الشحن', color: '#3B82F6', bg: '#EFF6FF', icon: 'car-outline' },
  pending: { label: 'في الانتظار', color: '#D97706', bg: '#FDF3E2', icon: 'time-outline' },
  cancelled: { label: 'ملغي', color: '#DC2626', bg: '#FDECEC', icon: 'close-circle-outline' },
};

// ---- الرسم البياني المنحني ----
function SalesChart({ w, h, points }: { w: number; h: number; points: number[] }) {
  const data = points && points.length > 1 ? points : [0, 0];
  const max = Math.max(...data, 1) * 1.15;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => ({ x: i * stepX, y: h - (v / max) * h }));

  // منحنى ناعم (cubic bezier)
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
          <Stop offset="0" stopColor={UI.blueLight} stopOpacity="0.22" />
          <Stop offset="1" stopColor={UI.blueLight} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={dFill} fill="url(#fill)" />
      <Path d={d} stroke={UI.blueLight} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={last.x} cy={last.y} r={7} fill={UI.blueLight} opacity={0.2} />
      <Circle cx={last.x} cy={last.y} r={4.5} fill="#FFFFFF" stroke={UI.blue} strokeWidth={2.5} />
    </Svg>
  );
}

export default function MerchantDashboardScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const chartW = width - 48 - 32 - 110; // الشاشة - الهوامش - عمود الإحصائيات
  const [stats, setStats] = useState({ todayOrders: 0, todayRevenue: 0, totalProducts: 0, pendingOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [chart, setChart] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);

  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    getMerchantStats(user.id).then(setStats).catch(() => {});
    getMerchantOrders(user.id).then((o) => setRecentOrders(o.slice(0, 4))).catch(() => {});
    getMerchantSalesChart(user.id, 8).then(setChart).catch(() => {});
  }, [user?.id]));

  const statusStyleFor = (status: string) =>
    STATUS_STYLE[status === 'delivered' ? 'delivered'
      : status === 'on_the_way' || status === 'ready' || status === 'assigned' ? 'shipping'
      : status === 'cancelled' ? 'cancelled' : 'pending'];

  const goQuickAction = (id: string) => {
    if (id === '1') navigation.navigate('MerchantAccount', { screen: 'Wallet' });
    else if (id === '2') navigation.navigate('MerchantAccount', { screen: 'Coupons' });
    else if (id === '3') navigation.navigate('MerchantProducts');
    else if (id === '4') navigation.navigate('MerchantAccount', { screen: 'Reports' });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={UI.bg} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ===== Header ===== */}
        <View style={styles.headerRow}>
          <View style={styles.userInfoWrap}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Ionicons name="storefront" size={24} color={UI.blue} />
              </View>
              <View style={styles.onlineDot} />
            </View>

            <View style={styles.headerTexts}>
              <Text style={styles.welcomeText}>مرحباً بعودتك</Text>
              <View style={styles.storeNameRow}>
                <Text style={styles.storeName}>{user?.full_name ?? 'متجر الأناقة'}</Text>
                <Ionicons name="checkmark-circle" size={16} color={UI.blue} />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.bellBtn}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('MerchantAccount', { screen: 'RoleNotifications', params: { role: 'merchant' } })}
          >
            <Ionicons name="notifications-outline" size={22} color={UI.navy} />
            <View style={styles.bellDot} />
          </TouchableOpacity>
        </View>

        {/* ===== Sales Overview Card ===== */}
        <View style={[styles.salesCard, softShadow]}>
          <View style={styles.salesTopRow}>
            <Text style={styles.salesLabel}>إجمالي المبيعات</Text>
            <TouchableOpacity style={styles.periodPill} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={15} color={UI.textGrey} />
              <Text style={styles.periodText}>هذا الشهر</Text>
              <Ionicons name="chevron-down" size={14} color={UI.textGrey} />
            </TouchableOpacity>
          </View>

          <View style={styles.salesValueRow}>
            <Text style={styles.salesValue}>{stats.todayRevenue.toLocaleString()}</Text>
            <Text style={styles.salesCurrency}>ر.ي</Text>
          </View>

          <View style={styles.trendPill}>
            <View style={styles.trendCircle}>
              <Ionicons name="time-outline" size={12} color="#059669" />
            </View>
            <Text style={styles.trendText}>{stats.pendingOrders} طلب بانتظار التأكيد</Text>
          </View>

          <View style={styles.chartRow}>
            {/* الرسم البياني */}
            <View style={{ flex: 1 }}>
              <SalesChart w={chartW} h={92} points={chart} />
            </View>

            {/* إحصائيات جانبية */}
            <View style={styles.sideStats}>
              <View style={styles.sideStat}>
                <View style={styles.sideStatIcon}>
                  <Ionicons name="cart-outline" size={17} color={UI.blue} />
                </View>
                <View style={styles.sideStatTexts}>
                  <Text style={styles.sideStatLabel}>طلبات اليوم</Text>
                  <Text style={styles.sideStatValue}>{stats.todayOrders}</Text>
                </View>
              </View>
              <View style={styles.sideStat}>
                <View style={styles.sideStatIcon}>
                  <Ionicons name="cube-outline" size={17} color={UI.blue} />
                </View>
                <View style={styles.sideStatTexts}>
                  <Text style={styles.sideStatLabel}>منتجاتي</Text>
                  <Text style={styles.sideStatValue}>{stats.totalProducts}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ===== Quick Actions ===== */}
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity key={a.id} style={[styles.actionCard, softShadow]} activeOpacity={0.8} onPress={() => goQuickAction(a.id)}>
              <View style={styles.actionHeader}>
                <View style={styles.actionCircle}>
                  <Ionicons name={a.icon as any} size={22} color={UI.blue} />
                </View>
                <Ionicons name="chevron-back" size={16} color="#CBD5E1" />
              </View>
              <Text style={styles.actionTitle}>{a.title}</Text>
              <Text style={styles.actionSub}>{a.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ===== Recent Orders ===== */}
        <View style={[styles.ordersCard, softShadow]}>
          <View style={styles.ordersHeader}>
            <Text style={styles.ordersTitle}>الطلبات الحديثة</Text>
            <TouchableOpacity
              style={styles.viewAllRow}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('MerchantOrders')}
            >
              <Text style={styles.viewAllText}>عرض الكل</Text>
              <Ionicons name="arrow-back" size={14} color={UI.blue} />
            </TouchableOpacity>
          </View>

          {recentOrders.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="receipt-outline" size={32} color="#D1D5DB" />
              <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>لا توجد طلبات بعد</Text>
            </View>
          ) : recentOrders.map((order, i) => {
            const st = statusStyleFor(order.status);
            return (
              <TouchableOpacity
                key={order.id}
                style={[styles.orderRow, i < recentOrders.length - 1 && styles.orderRowBorder]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('MerchantOrders')}
              >
                <View style={styles.orderThumb}>
                  <Ionicons name="cube-outline" size={24} color={UI.textGrey} />
                </View>
                <View style={styles.orderInfo}>
                  <Text style={styles.orderId}>{order.order_number}</Text>
                  <Text style={styles.orderDate}>{new Date(order.created_at).toLocaleDateString('ar-SA')}</Text>
                </View>

                <View style={styles.orderMeta}>
                  <Text style={styles.orderTotal}>{order.total_amount ?? 0} <Text style={styles.orderCurrency}>ر.ي</Text></Text>
                  <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                    <Ionicons name={st.icon as any} size={12} color={st.color} />
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-back" size={18} color="#CBD5E1" />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===== Promo Banner ===== */}
        <View style={[styles.promoCard, softShadow]}>
          <View style={styles.promoIconWrap}>
            <Ionicons name="bag-handle" size={44} color={UI.blue} />
            <View style={styles.promoMiniChart}>
              <Ionicons name="stats-chart" size={20} color={UI.blueLight} />
            </View>
          </View>
          <View style={styles.promoTexts}>
            <Text style={styles.promoTitle}>طوّر متجرك الآن</Text>
            <Text style={styles.promoSub}>اكتشف أدوات ذكية تساعدك على زيادة مبيعاتك وإدارة متجرك بكفاءة</Text>
            <TouchableOpacity
              style={styles.promoBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('MerchantAccount', { screen: 'Reports' })}
            >
              <Text style={styles.promoBtnText}>استكشاف الأدوات</Text>
              <Ionicons name="arrow-back" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bg },
  scrollContent: { padding: 20, paddingTop: Platform.OS === 'ios' ? 64 : 48, paddingBottom: 100 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  userInfoWrap: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { position: 'relative', marginLeft: 14 },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 2, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#10B981', borderWidth: 2.5, borderColor: UI.bg,
  },
  headerTexts: { flex: 1, alignItems: 'flex-start' },
  welcomeText: { fontSize: 13, color: UI.textGrey, fontWeight: '600', marginBottom: 2, textAlign: 'right' },
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeName: { fontSize: 18, fontWeight: '800', color: UI.navy, textAlign: 'right' },
  bellBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F3F4F6', ...softShadow,
  },
  bellDot: {
    position: 'absolute', top: 12, right: 12, width: 10, height: 10, borderRadius: 5,
    backgroundColor: UI.blue, borderWidth: 2, borderColor: '#FFFFFF',
  },

  // Sales Card
  salesCard: { backgroundColor: UI.cardSoft, borderRadius: 24, padding: 24, marginBottom: 20 },
  salesTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  salesLabel: { fontSize: 15, color: UI.textGrey, fontWeight: '700', textAlign: 'right' },
  periodPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  periodText: { fontSize: 13, fontWeight: '700', color: UI.textGrey, textAlign: 'right' },
  salesValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 16 },
  salesValue: { fontSize: 36, fontWeight: '800', color: UI.navy, letterSpacing: -0.5, textAlign: 'right' },
  salesCurrency: { fontSize: 16, fontWeight: '700', color: UI.textGrey, marginBottom: 6, textAlign: 'right' },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-end' },
  trendCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
  trendText: { fontSize: 13, fontWeight: '700', color: '#059669', textAlign: 'right' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 24, gap: 16 },
  sideStats: { width: 110, gap: 16 },
  sideStat: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideStatIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', ...softShadow,
  },
  sideStatTexts: { flex: 1, alignItems: 'flex-start' },
  sideStatLabel: { fontSize: 11, color: UI.textMuted, fontWeight: '600', textAlign: 'right' },
  sideStatValue: { fontSize: 16, fontWeight: '800', color: UI.navy, marginTop: 2, textAlign: 'right' },
  sideStatUnit: { fontSize: 11, fontWeight: '700', color: UI.textGrey, textAlign: 'right' },

  // Quick Actions
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24,
  },
  actionCard: {
    width: (width - 40 - 16) / 2, backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, borderWidth: 1, borderColor: '#F3F4F6', ...softShadow,
  },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  actionCircle: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  actionTitle: { fontSize: 15, fontWeight: '800', color: UI.navy, textAlign: 'right' },
  actionSub: { fontSize: 12, color: UI.textGrey, fontWeight: '500', textAlign: 'right', marginTop: 4 },

  // Recent Orders
  ordersCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#F3F4F6', ...softShadow },
  ordersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  ordersTitle: { fontSize: 18, fontWeight: '800', color: UI.navy, textAlign: 'right' },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { fontSize: 14, fontWeight: '700', color: UI.blue, textAlign: 'right' },
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 },
  orderRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  orderThumb: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: '#F9FAFB',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  orderInfo: { flex: 1, alignItems: 'flex-start' },
  orderId: { fontSize: 15, fontWeight: '800', color: UI.navy, textAlign: 'right' },
  orderDate: { fontSize: 12, color: UI.textGrey, marginTop: 4, textAlign: 'right' },
  orderMeta: { alignItems: 'flex-end', marginLeft: 4 },
  orderTotal: { fontSize: 16, fontWeight: '800', color: UI.navy, textAlign: 'left', marginBottom: 6 },
  orderCurrency: { fontSize: 12, fontWeight: '600', color: UI.textGrey, textAlign: 'right' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
  },
  statusText: { fontSize: 12, fontWeight: '700' },

  // Promo Banner
  promoCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: UI.cardSoft,
    borderRadius: 24, padding: 24, gap: 18, borderWidth: 1, borderColor: '#F3F4F6', ...softShadow,
  },
  promoIconWrap: {
    width: 80, height: 80, borderRadius: 20, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', ...softShadow,
  },
  promoMiniChart: {
    position: 'absolute', bottom: -6, left: -6, width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...softShadow,
  },
  promoTexts: { flex: 1, alignItems: 'flex-start' },
  promoTitle: { fontSize: 18, fontWeight: '800', color: UI.navy, textAlign: 'right' },
  promoSub: { fontSize: 13, color: UI.textGrey, lineHeight: 20, marginTop: 6, textAlign: 'right' },
  promoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end',
    backgroundColor: UI.navy, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 14,
  },
  promoBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
