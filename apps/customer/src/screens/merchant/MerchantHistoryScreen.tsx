import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, ORDER_STATUS, RADIUS } from '@marketplace/shared-utils';
import { useAuthStore, OrderSummary } from '@marketplace/shared-hooks';
import { useMerchantOrderFeed } from './useMerchantOrderFeed';
import { getMerchantOrderStatusInfo, HISTORY_MERCHANT_ORDER_STATUSES } from './merchantOrderState';
import { Banner, Chips, EmptyState, ScreenHeader, card, formatMoney, paymentLabel, ui, useIsDesktop } from './merchantUi';

type Filter = 'all' | 'delivered' | 'cancelled' | 'issues';
type Row = { kind: 'day'; key: string; label: string; total: number } | { kind: 'order'; key: string; order: OrderSummary; last: boolean };

const ISSUE_STATUSES = new Set<string>([
  ORDER_STATUS.RETURNED, ORDER_STATUS.FAILED_DELIVERY, ORDER_STATUS.PARTIAL_DELIVERY, ORDER_STATUS.DISPUTED,
]);

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'اليوم';
  if (d.toDateString() === yesterday.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export default function MerchantHistoryScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { orders: allOrders, loading, refreshing, error, realtimeError, refresh } = useMerchantOrderFeed(user?.id, 'history');
  const orders = useMemo(() => allOrders.filter((o) => HISTORY_MERCHANT_ORDER_STATUSES.has(o.status)), [allOrders]);

  const groups: Record<Filter, (o: OrderSummary) => boolean> = {
    all: () => true,
    delivered: (o) => o.status === ORDER_STATUS.DELIVERED,
    cancelled: (o) => o.status === ORDER_STATUS.CANCELLED,
    issues: (o) => ISSUE_STATUSES.has(o.status),
  };
  const count = (key: Filter) => orders.filter(groups[key]).length;

  const delivered = orders.filter(groups.delivered);
  const deliveredValue = delivered.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const list = orders.filter((o) => groups[filter](o) && (!q
      || o.order_number.toLowerCase().includes(q)
      || (o.customer_profiles?.full_name || '').toLowerCase().includes(q)));
    const byDay = new Map<string, OrderSummary[]>();
    list.forEach((o) => {
      const key = new Date(o.created_at).toDateString();
      byDay.set(key, [...(byDay.get(key) ?? []), o]);
    });
    const out: Row[] = [];
    byDay.forEach((dayOrders, key) => {
      out.push({
        kind: 'day',
        key: `d-${key}`,
        label: dayLabel(dayOrders[0].created_at),
        total: dayOrders.filter(groups.delivered).reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
      });
      dayOrders.forEach((order, i) => out.push({ kind: 'order', key: order.id, order, last: i === dayOrders.length - 1 }));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, query]);

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'day') {
      return (
        <View style={styles.day}>
          <Text style={styles.dayLabel}>{item.label}</Text>
          {item.total ? <Text style={styles.dayTotal}>{formatMoney(item.total)} ر.ي مسلّمة</Text> : null}
        </View>
      );
    }
    const { order } = item;
    const info = getMerchantOrderStatusInfo(order.status);
    const cancelled = order.status === ORDER_STATUS.CANCELLED;
    return (
      <TouchableOpacity
        style={[styles.row, item.last && styles.rowLast]}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('OrderDetails', { orderId: order.id })}
        accessibilityRole="button"
        accessibilityLabel={`فتح تفاصيل الطلب ${order.order_number}`}
      >
        <View style={[styles.icon, { backgroundColor: info.background }]}>
          <Ionicons name={info.icon as any} size={18} color={info.color} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.number}>#{order.order_number}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {order.customer_profiles?.full_name || 'عميل'} · {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {paymentLabel(order.payment_method)}
          </Text>
        </View>
        <View style={styles.end}>
          <Text style={[styles.amount, cancelled && styles.amountCancelled]}>{formatMoney(order.total_amount)}</Text>
          <Text style={[styles.status, { color: info.color }]}>{info.label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={ui.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenHeader title="سجل الطلبات" subtitle={loading ? 'جاري التحميل...' : `${orders.length} طلب منتهٍ`} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          contentContainerStyle={[ui.content, isDesktop && ui.contentDesktop, styles.listGap]}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          ListHeaderComponent={
            <View style={styles.toolbar}>
              {realtimeError || error ? <Banner text={(realtimeError ?? error) as string} tone="warning" actionLabel="تحديث" onAction={() => void refresh()} /> : null}
              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>قيمة الطلبات المسلّمة</Text>
                <Text style={styles.summaryValue}>{formatMoney(deliveredValue)} <Text style={styles.summaryCurrency}>ر.ي</Text></Text>
                <View style={styles.summaryStats}>
                  {[
                    { label: 'مسلّم', value: count('delivered') },
                    { label: 'ملغي', value: count('cancelled') },
                    { label: 'مرتجع / تعذّر', value: count('issues') },
                  ].map((s, i) => (
                    <React.Fragment key={s.label}>
                      {i > 0 ? <View style={styles.summaryDivider} /> : null}
                      <View style={styles.summaryStat}>
                        <Text style={styles.summaryStatValue}>{s.value}</Text>
                        <Text style={styles.summaryStatLabel}>{s.label}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </View>
              {orders.length ? (
                <>
                  <View style={styles.search}>
                    <Ionicons name="search" size={18} color={COLORS.inkTertiary} />
                    <TextInput
                      style={styles.searchInput}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="رقم الطلب أو اسم العميل"
                      placeholderTextColor={COLORS.inkTertiary}
                      accessibilityLabel="البحث في سجل الطلبات"
                    />
                  </View>
                  <Chips
                    items={[
                      { key: 'all', label: 'الكل', count: orders.length },
                      { key: 'delivered', label: 'مسلّم', count: count('delivered') },
                      { key: 'cancelled', label: 'ملغي', count: count('cancelled') },
                      { key: 'issues', label: 'مرتجع / تعذّر', count: count('issues') },
                    ]}
                    value={filter}
                    onChange={setFilter}
                  />
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="time-outline"
              title={orders.length ? 'لا توجد نتائج' : 'لا يوجد سجل بعد'}
              text={orders.length ? 'جرّب بحثاً أو تصفية مختلفة.' : 'ستظهر هنا الطلبات بعد تسليمها أو إلغائها.'}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listGap: { gap: 0 },
  toolbar: { gap: 12, marginBottom: 6 },
  summary: { backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, padding: 18 },
  summaryLabel: { fontSize: 12, fontFamily: FONTS.medium, color: '#CBD5E1', textAlign: 'right' },
  summaryValue: { fontSize: 28, fontFamily: FONTS.bold, color: COLORS.surface, textAlign: 'right', marginTop: 4 },
  summaryCurrency: { fontSize: 14, fontFamily: FONTS.medium, color: '#CBD5E1' },
  summaryStats: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryStatValue: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.surface },
  summaryStatLabel: { fontSize: 11, fontFamily: FONTS.regular, color: '#CBD5E1', marginTop: 2 },
  summaryDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.14)' },
  search: { ...card, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 46 },
  searchInput: { flex: 1, width: 0, minWidth: 0, minHeight: 44, fontSize: 14, fontFamily: FONTS.medium, color: COLORS.ink, textAlign: 'right', outlineStyle: 'none' as any },
  day: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 8, paddingHorizontal: 4 },
  dayLabel: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.ink },
  dayTotal: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  row: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.hairline, borderBottomWidth: 0,
  },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, alignItems: 'flex-end' },
  number: { fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.ink },
  meta: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.inkTertiary, textAlign: 'right', marginTop: 3 },
  end: { alignItems: 'flex-start' },
  amount: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.ink },
  amountCancelled: { color: COLORS.inkTertiary, textDecorationLine: 'line-through' },
  status: { fontSize: 11, fontFamily: FONTS.semiBold, marginTop: 3 },
});
