import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuthStore, getMerchantStats, getMerchantOrders, getMerchantSalesChart, OrderSummary } from '@marketplace/shared-hooks';

// ---- Constants & Colors ----
const UI = {
  bg: '#F4F6F8', // Slightly richer background
  bgMobile: '#FFFFFF',
  card: '#FFFFFF',
  cardSoft: '#F8FAFC',
  primary: '#0A1128', // Deeper rich navy
  primaryLight: '#1E293B',
  blue: '#2563EB',
  green: '#059669',
  greenLight: '#D1FAE5',
  textDark: '#0F172A',
  textGrey: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

const softShadow = {
  shadowColor: '#0A1128', // Slightly deeper and integrated shadow
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
  elevation: 3,
} as const;

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  delivered: { label: 'مكتمل', color: '#059669', bg: '#D1FAE5', icon: 'ellipse' },
  shipping: { label: 'قيد الشحن', color: '#3B82F6', bg: '#DBEAFE', icon: 'ellipse' },
  pending: { label: 'في الانتظار', color: '#D97706', bg: '#FEF3C7', icon: 'ellipse' },
  cancelled: { label: 'ملغي', color: '#DC2626', bg: '#FEE2E2', icon: 'ellipse' },
};

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

function BarChart({ w, h, points, color }: { w: number; h: number; points: number[]; color: string }) {
  const data = points && points.length > 0 ? points : [0, 0, 0, 0, 0, 0];
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

export default function MerchantDashboardScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  
  const [stats, setStats] = useState({ todayOrders: 0, todayRevenue: 0, totalProducts: 0, pendingOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [chart, setChart] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [profile, setProfile] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    import('@marketplace/shared-hooks').then(({ getMerchantProfile }) => {
      getMerchantProfile(user.id).then(setProfile).catch(() => {});
    });
    getMerchantStats(user.id).then(setStats).catch(() => {});
    getMerchantOrders(user.id).then((o) => setRecentOrders(o.slice(0, 5))).catch(() => {});
    getMerchantSalesChart(user.id, 6).then(setChart).catch(() => {});
  }, [user?.id]));

  const statusStyleFor = (status: string) =>
    STATUS_STYLE[status === 'delivered' ? 'delivered'
      : status === 'on_the_way' || status === 'ready' || status === 'assigned' ? 'shipping'
      : status === 'cancelled' ? 'cancelled' : 'pending'];

  const containerStyle = [styles.container, { backgroundColor: isDesktop ? UI.bg : UI.bgMobile }];

  // Responsive widths for columns
  const tabNavPadding = isDesktop ? 48 : 0; // 24 left + 24 right in TabNavigator
  const screenPadding = 48; // 24 left + 24 right in Dashboard ScrollView
  const sidebarWidth = 80;
  const usableWidth = isDesktop ? width - sidebarWidth - tabNavPadding - screenPadding : width - screenPadding;
  const gap = 20;
  const col3Width = isDesktop ? (usableWidth - (gap * 2)) / 3 : usableWidth;

  return (
    <View style={containerStyle}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {profile && profile.is_active === false && (
          <View style={{ backgroundColor: '#FEF2F2', padding: 16, marginHorizontal: isDesktop ? 0 : 24, borderRadius: 16, borderWidth: 1, borderColor: '#FCA5A5', marginBottom: 20, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="warning" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#DC2626', marginBottom: 4 }}>تم إيقاف متجرك</Text>
              <Text style={{ fontSize: 13, color: '#991B1B', textAlign: 'right' }}>السبب: {profile.pause_reason || 'غير محدد'}. يرجى التواصل مع الإدارة.</Text>
            </View>
          </View>
        )}

        {/* ===== Welcome Section ===== */}
        <View style={styles.welcomeRow}>
          <Text style={styles.welcomeText}>مرحباً بك، <Text style={styles.welcomeName}>{user?.full_name ?? 'التاجر'}</Text></Text>
          <View style={styles.welcomeActions}>
            <View style={styles.datePicker}>
              <Ionicons name="calendar-outline" size={16} color={UI.textDark} />
              <Text style={styles.dateText}>الشهر الحالي</Text>
              <Ionicons name="chevron-down" size={14} color={UI.textDark} />
            </View>
            {isDesktop && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('MerchantProducts', { screen: 'AddProduct' })}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={18} color={UI.textDark} />
                <Text style={styles.addBtnText}>منتج جديد</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ===== Top Widgets Grid ===== */}
        <View style={[styles.gridRow, { flexDirection: isDesktop ? 'row-reverse' : 'column' }]}>
          
          {/* Column 1: VISA Card + Small Stat */}
          <View style={[styles.column, { width: col3Width }]}>
            <View style={[styles.card, styles.visaCard]}>
              <View style={styles.visaTop}>
                <Text style={styles.visaLogo}>رصيد المتجر</Text>
                <Ionicons name="wifi" size={20} color="#FFF" style={{ transform: [{ rotate: '90deg' }] }} />
              </View>
              <Text style={styles.visaSubtitle}>إجمالي المبيعات المتاحة</Text>
              <Text style={styles.visaBalance}>$ {stats.todayRevenue.toLocaleString()}</Text>
              <View style={styles.visaBottom}>
                <Text style={styles.visaText}>الطلبات: {stats.todayOrders}</Text>
                <Text style={styles.visaText}>المنتجات: {stats.totalProducts}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitleSoft}>الطلبات المعلقة</Text>
              <View style={styles.statRow}>
                <Text style={styles.statValue}>+{stats.pendingOrders}</Text>
                <View style={styles.badgeGreen}>
                  <Text style={styles.badgeGreenText}>جديد</Text>
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
                  <Text style={styles.cardTitle}>معدل الطلبات</Text>
                </View>
                <View style={styles.togglePills}>
                  <Text style={styles.togglePill}>أسبوعي</Text>
                  <Text style={styles.togglePillActive}>شهري</Text>
                </View>
              </View>
              <View style={styles.chartAreaCentered}>
                <BarChart w={col3Width - 48} h={160} points={chart} color={UI.primary} />
                <View style={styles.chartLabelsX}>
                  {['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'].map((lbl, i) => (
                    <Text key={i} style={styles.chartLabel}>{lbl}</Text>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Column 3: Line Chart + Small Stat */}
          <View style={[styles.column, { width: col3Width }]}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardTitle}>نمو المبيعات</Text>
                </View>
                <TouchableOpacity style={styles.iconBtn}><Ionicons name="arrow-up-outline" size={16} color={UI.textDark} /></TouchableOpacity>
              </View>
              <Text style={styles.chartTotalValue}>{chart.reduce((s, v) => s + v, 0).toLocaleString()} ر.س</Text>
              <View style={{ marginTop: 20, alignItems: 'center' }}>
                 <LineChart w={col3Width - 48} h={80} points={chart} color={UI.primary} />
              </View>
            </View>

            <View style={styles.card}>
               <View style={styles.cardHeaderLeft}>
                  <View style={styles.iconBox}><Ionicons name="wallet-outline" size={16} color={UI.textDark} /></View>
                  <Text style={styles.cardTitleSoft}>إجمالي المنتجات</Text>
               </View>
               <View style={styles.statRow}>
                 <Text style={styles.statValueLarge}>{stats.totalProducts}</Text>
                 <View style={styles.badgeGreen}>
                  <Text style={styles.badgeGreenText}>نشط</Text>
                </View>
               </View>
            </View>
          </View>

        </View>

        {/* ===== Orders Table ===== */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableTitle}>سجل الطلبيات الأحدث</Text>
            <TouchableOpacity style={styles.iconBtn}><Ionicons name="arrow-up-outline" size={16} color={UI.textDark} /></TouchableOpacity>
          </View>

          {isDesktop ? (
            // Desktop Table Layout
            <View style={styles.tableWrapper}>
              <View style={styles.tableRowHeader}>
                <Text style={[styles.th, { flex: 2 }]}>رقم الطلب</Text>
                <Text style={[styles.th, { flex: 2 }]}>التاريخ</Text>
                <Text style={[styles.th, { flex: 2 }]}>الوقت</Text>
                <Text style={[styles.th, { flex: 2 }]}>الحالة</Text>
                <Text style={[styles.th, { flex: 2, textAlign: 'left' }]}>المبلغ</Text>
              </View>
              {recentOrders.map((order, i) => {
                const st = statusStyleFor(order.status);
                const d = new Date(order.created_at);
                return (
                  <TouchableOpacity key={order.id} style={styles.tableRow} onPress={() => navigation.navigate('MerchantOrders')}>
                    <View style={[{ flex: 2, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }]}>
                      <View style={styles.avatarMiniList}><Ionicons name="receipt" size={14} color={UI.textDark} /></View>
                      <View>
                        <Text style={styles.tdTextBold}>{order.order_number}</Text>
                        <Text style={styles.tdSub}>طلب جديد</Text>
                      </View>
                    </View>
                    <Text style={[styles.td, { flex: 2 }]}>{d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                    <Text style={[styles.td, { flex: 2 }]}>{d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                    <View style={[{ flex: 2, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }]}>
                       <Ionicons name={st.icon as any} size={10} color={st.color} />
                       <Text style={[styles.tdTextBold, { color: UI.textDark }]}>{st.label}</Text>
                    </View>
                    <Text style={[styles.td, styles.tdTextBold, { flex: 2, textAlign: 'left' }]}>{order.total_amount} ر.س</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            // Mobile List Layout
            <View style={styles.mobileList}>
              {recentOrders.map((order) => {
                const st = statusStyleFor(order.status);
                const d = new Date(order.created_at);
                return (
                  <TouchableOpacity key={order.id} style={styles.mobileListItem} onPress={() => navigation.navigate('MerchantOrders')}>
                    <View style={styles.avatarMiniList}><Ionicons name="receipt" size={16} color={UI.textDark} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tdTextBold}>{order.order_number}</Text>
                      <Text style={styles.tdSub}>{d.toLocaleDateString('en-GB')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text style={styles.tdTextBold}>{order.total_amount} ر.س</Text>
                      <Text style={[styles.tdSub, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {recentOrders.length === 0 && (
            <Text style={{ textAlign: 'center', color: UI.textMuted, padding: 30 }}>لا يوجد طلبات بعد</Text>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 100 },
  
  // Desktop Header
  topHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 32, position: 'relative' },
  navLinks: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 8, paddingVertical: 6, ...softShadow },
  navLink: { fontSize: 13, fontWeight: '600', color: UI.textGrey, paddingHorizontal: 16, paddingVertical: 8 },
  navLinkActive: { fontSize: 13, fontWeight: '700', color: UI.textDark, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 16 },
  headerRight: { position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...softShadow },
  avatarMini: { width: 36, height: 36, borderRadius: 18, backgroundColor: UI.primary, alignItems: 'center', justifyContent: 'center' },

  // Welcome Section
  welcomeRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  welcomeText: { fontSize: 24, color: UI.textDark, textAlign: 'right' },
  welcomeName: { fontWeight: '300', color: UI.textGrey },
  welcomeActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  datePicker: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, ...softShadow },
  dateText: { fontSize: 13, fontWeight: '600', color: UI.textDark },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, ...softShadow },
  addBtnText: { fontSize: 13, fontWeight: '600', color: UI.textDark },

  // Grid
  gridRow: { gap: 20, marginBottom: 20, flexDirection: 'row-reverse' },
  column: { gap: 20 },
  
  // Cards
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, ...softShadow },
  visaCard: { backgroundColor: UI.primary, padding: 24 },
  visaTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  visaLogo: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  visaSubtitle: { fontSize: 12, color: '#9CA3AF', marginBottom: 4, textAlign: 'right' },
  visaBalance: { fontSize: 32, fontWeight: '700', color: '#FFFFFF', marginBottom: 24, textAlign: 'right' },
  visaBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  visaText: { fontSize: 13, color: '#D1D5DB', fontWeight: '500' },

  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardHeaderLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  iconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI.textDark },
  cardTitleSoft: { fontSize: 13, fontWeight: '600', color: UI.textGrey, marginBottom: 12 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  togglePills: { flexDirection: 'row-reverse', backgroundColor: '#F3F4F6', borderRadius: 16, padding: 4 },
  togglePill: { fontSize: 11, fontWeight: '600', color: UI.textGrey, paddingHorizontal: 12, paddingVertical: 6 },
  togglePillActive: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', backgroundColor: UI.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },

  chartAreaCentered: { alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  chartLabelsX: { flexDirection: 'row-reverse', justifyContent: 'space-between', width: '100%', marginTop: 12, paddingHorizontal: 10 },
  chartLabel: { fontSize: 10, color: UI.textMuted, fontWeight: '600' },
  chartTotalValue: { fontSize: 28, fontWeight: '800', color: UI.textDark },

  statRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  statValue: { fontSize: 24, fontWeight: '700', color: UI.textDark },
  statValueLarge: { fontSize: 32, fontWeight: '800', color: UI.textDark },
  badgeGreen: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeGreenText: { fontSize: 11, fontWeight: '700', color: '#059669' },

  // Table
  tableCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, ...softShadow },
  tableHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  tableTitle: { fontSize: 16, fontWeight: '800', color: UI.textDark },
  tableRowHeader: { flexDirection: 'row-reverse', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: UI.border },
  th: { fontSize: 12, color: UI.textGrey, fontWeight: '600', flex: 1, textAlign: 'right' },
  tableRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  td: { fontSize: 13, color: UI.textGrey, textAlign: 'right' },
  tdTextBold: { fontSize: 13, fontWeight: '700', color: UI.textDark, textAlign: 'right' },
  tdSub: { fontSize: 11, color: UI.textGrey, marginTop: 4, textAlign: 'right' },
  avatarMiniList: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  tableWrapper: { width: '100%' },

  mobileList: { gap: 16 },
  mobileListItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
});
