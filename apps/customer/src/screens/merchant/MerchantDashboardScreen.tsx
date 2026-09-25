import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore, getMerchantStats, getMerchantSalesChart } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useMerchantOrderFeed } from './useMerchantOrderFeed';
import { ACTIVE_MERCHANT_ORDER_STATUSES, getMerchantOrderStatusInfo } from './merchantOrderState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ORDER_STATUS } from '@marketplace/shared-utils';
import type { OrderSummary } from '@marketplace/shared-hooks';

// Orders still waiting on the store itself (accept, prepare, hand over).
const MERCHANT_ACTION_STATUSES = new Set<string>([
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
]);

const formatMoney = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

function OrderRow({ order, onPress, last }: { order: OrderSummary; onPress: () => void; last?: boolean }) {
  const st = getMerchantOrderStatusInfo(order.status);
  const items = order.order_items?.reduce((sum, item) => sum + (item.quantity ?? 0), 0) ?? 0;
  return (
    <TouchableOpacity
      style={[mobile.orderRow, !last && mobile.orderRowDivider]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`فتح الطلب ${order.order_number}`}
    >
      <View style={[mobile.orderIcon, { backgroundColor: st.background }]}>
        <Ionicons name={st.icon as any} size={18} color={st.color} />
      </View>
      <View style={mobile.orderCopy}>
        <Text style={mobile.orderNumber} numberOfLines={1}>#{order.order_number}</Text>
        <Text style={mobile.orderMeta} numberOfLines={1}>
          {order.customer_profiles?.full_name || 'عميل'}{items ? ` · ${items} منتج` : ''} · {formatTime(order.created_at)}
        </Text>
      </View>
      <View style={mobile.orderEnd}>
        <Text style={mobile.orderAmount}>{formatMoney(order.total_amount)} ر.ي</Text>
        <View style={[mobile.statusChip, { backgroundColor: st.background }]}>
          <Text style={[mobile.statusChipText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MobileDashboard({
  name, orders, stats, metricsLoading, paused, error, onRetry,
}: {
  name: string;
  orders: OrderSummary[];
  stats: { todayOrders: number; todayRevenue: number; totalProducts: number; pendingOrders: number };
  metricsLoading: boolean;
  paused: string | null;
  error: string | null;
  onRetry: () => void;
}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const needsAction = useMemo(() => orders.filter((o) => MERCHANT_ACTION_STATUSES.has(o.status)), [orders]);
  const pendingCount = useMemo(() => orders.filter((o) => o.status === ORDER_STATUS.PENDING).length, [orders]);
  const activeCount = useMemo(() => orders.filter((o) => ACTIVE_MERCHANT_ORDER_STATUSES.has(o.status)).length, [orders]);
  const recent = useMemo(() => orders.slice(0, 5), [orders]);
  const today = new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
  const openOrder = (orderId: string) => navigation.navigate('MerchantOrders', { screen: 'OrderDetails', params: { orderId } });

  const actions = [
    { label: 'منتج جديد', icon: 'add-circle-outline', onPress: () => navigation.navigate('MerchantProducts', { screen: 'AddProduct' }) },
    { label: 'الطلبات', icon: 'receipt-outline', onPress: () => navigation.navigate('MerchantOrders') },
    { label: 'المحفظة', icon: 'wallet-outline', onPress: () => navigation.navigate('MerchantAccount', { screen: 'Wallet' }) },
    { label: 'التقارير', icon: 'bar-chart-outline', onPress: () => navigation.navigate('MerchantAccount', { screen: 'Reports' }) },
  ];

  return (
    <View style={mobile.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScrollView contentContainerStyle={[mobile.content, { paddingTop: insets.top + 16 }]} showsVerticalScrollIndicator={false}>
        <View style={mobile.header}>
          <View style={mobile.headerCopy}>
            <Text style={mobile.greeting} numberOfLines={1}>مرحباً، {name}</Text>
            <Text style={mobile.date}>{today}</Text>
          </View>
          <TouchableOpacity
            style={mobile.headerBtn}
            onPress={() => navigation.navigate('MerchantAccount', { screen: 'RoleNotifications', params: { role: 'merchant' } })}
            accessibilityRole="button"
            accessibilityLabel="الإشعارات"
          >
            <Ionicons name="notifications-outline" size={20} color={COLORS.ink} />
          </TouchableOpacity>
        </View>

        {paused ? (
          <View style={styles.pausedBanner}>
            <View style={styles.pausedIcon}><Ionicons name="warning" size={20} color={COLORS.error} /></View>
            <View style={styles.pausedCopy}>
              <Text style={styles.pausedTitle}>تم إيقاف متجرك</Text>
              <Text style={styles.pausedText}>السبب: {paused}. يرجى التواصل مع الإدارة.</Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={20} color="#B45309" />
            <Text style={styles.errorBannerText}>{error}</Text>
            <TouchableOpacity onPress={onRetry} accessibilityRole="button" accessibilityLabel="إعادة المحاولة">
              <Text style={styles.errorRetryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={mobile.summary}>
          <Text style={mobile.summaryLabel}>قيمة طلبات اليوم</Text>
          <Text style={mobile.summaryValue}>
            {metricsLoading ? '—' : formatMoney(stats.todayRevenue)} <Text style={mobile.summaryCurrency}>ر.ي</Text>
          </Text>
          <View style={mobile.summaryStats}>
            {[
              { label: 'طلبات اليوم', value: stats.todayOrders },
              { label: 'بانتظار القبول', value: pendingCount },
              { label: 'قيد التنفيذ', value: activeCount },
            ].map((item, index) => (
              <React.Fragment key={item.label}>
                {index > 0 ? <View style={mobile.summaryDivider} /> : null}
                <View style={mobile.summaryStat}>
                  <Text style={mobile.summaryStatValue}>{metricsLoading && index === 0 ? '—' : item.value}</Text>
                  <Text style={mobile.summaryStatLabel}>{item.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={mobile.sectionHeader}>
          <View style={mobile.sectionTitleRow}>
            <Text style={mobile.sectionTitle}>تحتاج إجراء منك</Text>
            {needsAction.length ? <View style={mobile.countBadge}><Text style={mobile.countBadgeText}>{needsAction.length}</Text></View> : null}
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('MerchantOrders')} accessibilityRole="button" accessibilityLabel="كل الطلبات النشطة">
            <Text style={mobile.sectionLink}>كل الطلبات</Text>
          </TouchableOpacity>
        </View>
        <View style={mobile.card}>
          {needsAction.length ? (
            needsAction.slice(0, 4).map((order, i, list) => (
              <OrderRow key={order.id} order={order} last={i === list.length - 1} onPress={() => openOrder(order.id)} />
            ))
          ) : (
            <View style={mobile.empty}>
              <View style={mobile.emptyIcon}><Ionicons name="checkmark-done" size={22} color={COLORS.statusOnline} /></View>
              <Text style={mobile.emptyTitle}>لا توجد طلبات بانتظارك</Text>
              <Text style={mobile.emptyText}>ستظهر الطلبات الجديدة هنا فور وصولها.</Text>
            </View>
          )}
        </View>

        <View style={mobile.actions}>
          {actions.map((action) => (
            <TouchableOpacity key={action.label} style={mobile.action} onPress={action.onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={action.label}>
              <View style={mobile.actionIcon}><Ionicons name={action.icon as any} size={21} color={COLORS.primary} /></View>
              <Text style={mobile.actionLabel} numberOfLines={1}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={mobile.sectionHeader}>
          <Text style={mobile.sectionTitle}>أحدث الطلبات</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MerchantHistory')} accessibilityRole="button" accessibilityLabel="سجل الطلبات">
            <Text style={mobile.sectionLink}>السجل</Text>
          </TouchableOpacity>
        </View>
        <View style={mobile.card}>
          {recent.length ? (
            recent.map((order, i) => (
              <OrderRow key={order.id} order={order} last={i === recent.length - 1} onPress={() => openOrder(order.id)} />
            ))
          ) : (
            <View style={mobile.empty}>
              <Text style={mobile.emptyText}>لا توجد طلبات بعد.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const UI = {
  bg: COLORS.background,
  bgMobile: COLORS.background,
  card: COLORS.surface,
  cardSoft: COLORS.surfaceRaised,
  primary: COLORS.primary,
  primaryLight: COLORS.primaryLight,
  blue: COLORS.primary,
  green: COLORS.success,
  greenLight: COLORS.accentMintSoft,
  textDark: COLORS.textPrimary,
  textGrey: COLORS.textSecondary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
};

const softShadow = {
  shadowColor: COLORS.primaryDark,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.07,
  shadowRadius: 24,
  elevation: 4,
} as const;

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
              fill={isMax ? color : COLORS.borderStrong} opacity={isMax ? 1 : 0.55}
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
  const isCompact = width < BREAKPOINTS.compact;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;
  
  const [stats, setStats] = useState({ todayOrders: 0, todayRevenue: 0, totalProducts: 0, pendingOrders: 0 });
  const [chart, setChart] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const { orders, merchantProfile: profile, error: ordersError, realtimeError, refresh } = useMerchantOrderFeed(user?.id, 'dashboard');
  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setMetricsLoading(true);
    Promise.all([getMerchantStats(profile.id), getMerchantSalesChart(profile.id, 6)])
      .then(([nextStats, nextChart]) => {
        if (cancelled) return;
        setStats(nextStats);
        setChart(nextChart);
        setMetricsError(null);
      })
      .catch(() => {
        if (!cancelled) setMetricsError('تعذر تحديث مؤشرات المتجر.');
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });
    return () => { cancelled = true; };
  }, [orders, profile?.id]);

  if (!isTablet) {
    return (
      <MobileDashboard
        name={profile?.store_name ?? user?.full_name ?? 'التاجر'}
        orders={orders}
        stats={stats}
        metricsLoading={metricsLoading}
        paused={profile?.is_active === false ? (profile.pause_reason || 'غير محدد') : null}
        error={ordersError ?? metricsError ?? realtimeError}
        onRetry={() => void refresh()}
      />
    );
  }

  const containerStyle = [styles.container, { backgroundColor: isDesktop ? UI.bg : UI.bgMobile }];

  // Responsive widths for columns
  const tabNavPadding = isDesktop ? 48 : 0;
  const screenPadding = isCompact ? 32 : 48;
  const sidebarWidth = 80;
  const usableWidth = Math.min(
    isDesktop ? width - sidebarWidth - tabNavPadding - screenPadding : width - screenPadding,
    1392,
  );
  const gap = 20;
  const columns = isDesktop ? 3 : isTablet ? 2 : 1;
  const col3Width = (usableWidth - (gap * (columns - 1))) / columns;

  return (
    <View style={containerStyle}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />

      <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]} showsVerticalScrollIndicator={false}>

        {profile && profile.is_active === false && (
          <View style={styles.pausedBanner}>
            <View style={styles.pausedIcon}>
              <Ionicons name="warning" size={20} color={COLORS.error} />
            </View>
            <View style={styles.pausedCopy}>
              <Text style={styles.pausedTitle}>تم إيقاف متجرك</Text>
              <Text style={styles.pausedText}>السبب: {profile.pause_reason || 'غير محدد'}. يرجى التواصل مع الإدارة.</Text>
            </View>
          </View>
        )}

        {(ordersError || metricsError || realtimeError) && (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={20} color="#B45309" />
            <Text style={styles.errorBannerText}>{ordersError ?? metricsError ?? realtimeError}</Text>
            <TouchableOpacity onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="إعادة تحميل لوحة التاجر">
              <Text style={styles.errorRetryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== Welcome Section ===== */}
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.welcomeOverline}>لوحة المتجر</Text>
            <Text style={styles.welcomeText}>مرحباً، <Text style={styles.welcomeName}>{user?.full_name ?? 'التاجر'}</Text></Text>
            <Text style={styles.welcomeSubtitle}>كل ما تحتاجه لإدارة الطلبات والأداء في مكان واحد.</Text>
          </View>
          <View style={styles.welcomeActions}>
            <View style={styles.datePicker}>
              <Ionicons name="calendar-outline" size={16} color={UI.textDark} />
              <Text style={styles.dateText}>آخر 6 أيام</Text>
            </View>
            {isDesktop && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('MerchantProducts', { screen: 'AddProduct' })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="إضافة منتج جديد"
              >
                <Ionicons name="add" size={18} color={UI.textDark} />
                <Text style={styles.addBtnText}>منتج جديد</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ===== Top Widgets Grid ===== */}
        <View style={[styles.gridRow, { flexDirection: isTablet ? 'row-reverse' : 'column', flexWrap: isTablet ? 'wrap' : 'nowrap' }]}>
          
          {/* Column 1: VISA Card + Small Stat */}
          <View style={[styles.column, { width: col3Width }]}>
            <View style={[styles.card, styles.visaCard]}>
              <View style={styles.visaTop}>
                <Text style={styles.visaLogo}>قيمة طلبات اليوم</Text>
                <View style={styles.heroIcon}><Ionicons name="sparkles" size={18} color={COLORS.textPrimary} /></View>
              </View>
              <Text style={styles.visaSubtitle}>إجمالي قيمة الطلبات المسجلة اليوم</Text>
              <Text style={styles.visaBalance}>{metricsLoading ? '...' : stats.todayRevenue.toLocaleString()} ر.ي</Text>
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
                  <Text style={styles.cardTitle}>قيمة الطلبات</Text>
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
                  <Text style={styles.cardTitle}>اتجاه قيمة الطلبات</Text>
                </View>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('MerchantAccount', { screen: 'Reports' })} accessibilityRole="button" accessibilityLabel="فتح التقارير"><Ionicons name="arrow-up-outline" size={16} color={UI.textDark} /></TouchableOpacity>
              </View>
              <Text style={styles.chartTotalValue}>{chart.reduce((s, v) => s + v, 0).toLocaleString()} ر.ي</Text>
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
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('MerchantOrders')} accessibilityRole="button" accessibilityLabel="فتح كل الطلبات"><Ionicons name="arrow-up-outline" size={16} color={UI.textDark} /></TouchableOpacity>
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
                const st = getMerchantOrderStatusInfo(order.status);
                const d = new Date(order.created_at);
                return (
                  <TouchableOpacity key={order.id} style={styles.tableRow} onPress={() => navigation.navigate('MerchantOrders', { screen: 'OrderDetails', params: { orderId: order.id } })} accessibilityRole="button" accessibilityLabel={`فتح الطلب ${order.order_number}`}>
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
                    <Text style={[styles.td, styles.tdTextBold, { flex: 2, textAlign: 'left' }]}>{order.total_amount} ر.ي</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            // Mobile List Layout
            <View style={styles.mobileList}>
              {recentOrders.map((order) => {
                const st = getMerchantOrderStatusInfo(order.status);
                const d = new Date(order.created_at);
                return (
                  <TouchableOpacity key={order.id} style={styles.mobileListItem} onPress={() => navigation.navigate('MerchantOrders', { screen: 'OrderDetails', params: { orderId: order.id } })} accessibilityRole="button" accessibilityLabel={`فتح الطلب ${order.order_number}`}>
                    <View style={styles.avatarMiniList}><Ionicons name="receipt" size={16} color={UI.textDark} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tdTextBold}>{order.order_number}</Text>
                      <Text style={styles.tdSub}>{d.toLocaleDateString('en-GB')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text style={styles.tdTextBold}>{order.total_amount} ر.ي</Text>
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
  scrollContent: { width: '100%', maxWidth: 1440, alignSelf: 'center', padding: 24, paddingBottom: 112 },
  scrollContentCompact: { paddingHorizontal: 16, paddingTop: 18 },
  pausedBanner: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: COLORS.accentCoralSoft,
    borderWidth: 1, borderColor: '#FFC8C5', borderRadius: RADIUS.lg, padding: 16, marginBottom: 20,
  },
  pausedIcon: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  pausedCopy: { flex: 1, alignItems: 'flex-end' },
  pausedTitle: { color: COLORS.error, fontSize: 15, fontFamily: FONTS.bold, marginBottom: 3, textAlign: 'right' },
  pausedText: { color: '#9F3734', fontSize: 13, fontFamily: FONTS.regular, textAlign: 'right', lineHeight: 20 },
  errorBanner: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#FFF8E8',
    borderColor: '#FFE1A4', borderWidth: 1, borderRadius: RADIUS.lg, padding: 14, marginBottom: 18,
  },
  errorBannerText: { flex: 1, color: '#8A5400', fontSize: 13, fontFamily: FONTS.semiBold, textAlign: 'right' },
  errorRetryText: { color: COLORS.primary, fontSize: 13, fontFamily: FONTS.bold, padding: 4 },

  welcomeRow: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 26, flexWrap: 'wrap', gap: 18,
  },
  welcomeCopy: { alignItems: 'flex-end', flexShrink: 1 },
  welcomeOverline: {
    color: COLORS.primary, fontSize: 12, fontFamily: FONTS.bold, marginBottom: 5,
    backgroundColor: COLORS.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full,
  },
  welcomeText: { fontSize: 28, color: UI.textDark, textAlign: 'right', fontFamily: FONTS.regular },
  welcomeName: { fontFamily: FONTS.bold, color: UI.textDark },
  welcomeSubtitle: { fontSize: 13, color: UI.textGrey, textAlign: 'right', fontFamily: FONTS.regular, marginTop: 5 },
  welcomeActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  datePicker: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface,
    paddingHorizontal: 16, minHeight: 44, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
  },
  dateText: { fontSize: 13, fontFamily: FONTS.medium, color: UI.textDark },
  addBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: COLORS.secondary,
    paddingHorizontal: 18, minHeight: 44, borderRadius: RADIUS.full,
  },
  addBtnText: { fontSize: 13, fontFamily: FONTS.bold, color: UI.textDark },

  gridRow: { gap: 20, marginBottom: 20 },
  column: { gap: 20 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 21,
    borderWidth: 1, borderColor: COLORS.border, ...softShadow,
  },
  visaCard: {
    backgroundColor: UI.primary, padding: 24, borderColor: UI.primary,
    shadowColor: COLORS.primaryDark, shadowOpacity: 0.22,
  },
  visaTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  visaLogo: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.surface },
  heroIcon: {
    width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }],
  },
  visaSubtitle: { fontSize: 12, color: '#D8D2FF', marginBottom: 4, textAlign: 'right', fontFamily: FONTS.regular },
  visaBalance: { fontSize: 34, fontFamily: FONTS.bold, color: COLORS.surface, marginBottom: 24, textAlign: 'right' },
  visaBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  visaText: { fontSize: 12, color: '#E9E6FF', fontFamily: FONTS.medium },

  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardHeaderLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  iconBox: {
    width: 32, height: 32, borderRadius: 11, backgroundColor: COLORS.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontFamily: FONTS.semiBold, color: UI.textDark },
  cardTitleSoft: { fontSize: 13, fontFamily: FONTS.medium, color: UI.textGrey, marginBottom: 12 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },

  togglePills: { flexDirection: 'row-reverse', backgroundColor: COLORS.surfaceMuted, borderRadius: RADIUS.full, padding: 4 },
  togglePill: { fontSize: 10, fontFamily: FONTS.medium, color: UI.textGrey, paddingHorizontal: 10, paddingVertical: 6 },
  togglePillActive: {
    fontSize: 10, fontFamily: FONTS.semiBold, color: COLORS.surface, backgroundColor: UI.primary,
    borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6,
  },

  chartAreaCentered: { alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  chartLabelsX: { flexDirection: 'row-reverse', justifyContent: 'space-between', width: '100%', marginTop: 12, paddingHorizontal: 10 },
  chartLabel: { fontSize: 10, color: UI.textMuted, fontFamily: FONTS.medium },
  chartTotalValue: { fontSize: 30, fontFamily: FONTS.bold, color: UI.textDark },

  statRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  statValue: { fontSize: 26, fontFamily: FONTS.bold, color: UI.textDark },
  statValueLarge: { fontSize: 34, fontFamily: FONTS.bold, color: UI.textDark },
  badgeGreen: { backgroundColor: COLORS.accentMintSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full },
  badgeGreenText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.success },

  tableCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 24,
    borderWidth: 1, borderColor: COLORS.border, ...softShadow,
  },
  tableHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  tableTitle: { fontSize: 17, fontFamily: FONTS.bold, color: UI.textDark },
  tableRowHeader: {
    flexDirection: 'row-reverse', paddingVertical: 13, paddingHorizontal: 12,
    backgroundColor: COLORS.surfaceMuted, borderRadius: RADIUS.md, marginBottom: 3,
  },
  th: { fontSize: 12, color: UI.textGrey, fontFamily: FONTS.semiBold, flex: 1, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  td: { fontSize: 13, color: UI.textGrey, textAlign: 'right', fontFamily: FONTS.regular },
  tdTextBold: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textDark, textAlign: 'right' },
  tdSub: { fontSize: 11, fontFamily: FONTS.regular, color: UI.textGrey, marginTop: 4, textAlign: 'right' },
  avatarMiniList: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  tableWrapper: { width: '100%' },

  mobileList: { gap: 0 },
  mobileListItem: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
});

const mobile = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  headerCopy: { flex: 1, alignItems: 'flex-end' },
  greeting: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  date: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'right', marginTop: 3 },
  headerBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center',
  },
  summary: { backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, padding: 18, marginBottom: 22 },
  summaryLabel: { fontSize: 12, fontFamily: FONTS.medium, color: '#CBD5E1', textAlign: 'right' },
  summaryValue: { fontSize: 30, fontFamily: FONTS.bold, color: COLORS.surface, textAlign: 'right', marginTop: 4 },
  summaryCurrency: { fontSize: 14, fontFamily: FONTS.medium, color: '#CBD5E1' },
  summaryStats: {
    flexDirection: 'row-reverse', alignItems: 'center', marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)',
  },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryStatValue: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.surface },
  summaryStatLabel: { fontSize: 11, fontFamily: FONTS.regular, color: '#CBD5E1', marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.14)' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  sectionTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  sectionLink: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.primary, paddingVertical: 4 },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: COLORS.warningSoft, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 12, fontFamily: FONTS.bold, color: COLORS.warningInk },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.hairline,
    paddingHorizontal: 14, marginBottom: 22,
  },
  orderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 13 },
  orderRowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.hairline },
  orderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  orderCopy: { flex: 1, alignItems: 'flex-end' },
  orderNumber: { fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right' },
  orderMeta: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.inkTertiary, textAlign: 'right', marginTop: 3 },
  orderEnd: { alignItems: 'flex-start', gap: 5 },
  orderAmount: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.ink },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  statusChipText: { fontSize: 10, fontFamily: FONTS.semiBold },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.ink },
  emptyText: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row-reverse', gap: 10, marginBottom: 22 },
  action: {
    flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.hairline,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.ink },
});
