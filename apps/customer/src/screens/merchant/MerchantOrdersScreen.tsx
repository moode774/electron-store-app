import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, ORDER_STATUS, RADIUS } from '@marketplace/shared-utils';
import { useAuthStore, updateOrderStatus, OrderSummary } from '@marketplace/shared-hooks';
import { useMerchantOrderFeed } from './useMerchantOrderFeed';
import {
  ACTIVE_MERCHANT_ORDER_STATUSES,
  DELIVERY_HANDOFF_STATUSES,
  getMerchantOrderStatusInfo,
  getOrderTransitionErrorMessage,
  merchantOrderProgress,
} from './merchantOrderState';
import { Banner, Chips, EmptyState, ScreenHeader, StatusPill, card, formatMoney, paymentLabel, timeAgo, ui, useIsDesktop } from './merchantUi';

type Filter = 'all' | 'pending' | 'preparing' | 'ready' | 'delivery';

// A pending order older than this is flagged so the store answers first.
const LATE_PENDING_MINUTES = 10;
const STEPS = ['استلام', 'تجهيز', 'جاهز', 'مع المندوب'];

const nextAction = (status: string) => {
  switch (status) {
    case ORDER_STATUS.PENDING: return { label: 'قبول وبدء التجهيز', next: ORDER_STATUS.PREPARING, icon: 'checkmark' as const };
    case ORDER_STATUS.CONFIRMED: return { label: 'بدء التجهيز', next: ORDER_STATUS.PREPARING, icon: 'restaurant-outline' as const };
    case ORDER_STATUS.PREPARING: return { label: 'جاهز للتسليم للمندوب', next: ORDER_STATUS.READY, icon: 'bag-check-outline' as const };
    default: return null;
  }
};

export default function MerchantOrdersScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const isDesktop = useIsDesktop();
  const [filter, setFilter] = useState<Filter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { orders: allOrders, loading, refreshing, error, realtimeError, refresh, reloadSilently } = useMerchantOrderFeed(user?.id, 'active');

  const orders = useMemo(() => allOrders.filter((o) => ACTIVE_MERCHANT_ORDER_STATUSES.has(o.status)), [allOrders]);

  const groups: Record<Filter, (o: OrderSummary) => boolean> = {
    all: () => true,
    pending: (o) => o.status === ORDER_STATUS.PENDING,
    preparing: (o) => o.status === ORDER_STATUS.PREPARING || o.status === ORDER_STATUS.CONFIRMED,
    ready: (o) => o.status === ORDER_STATUS.READY,
    delivery: (o) => DELIVERY_HANDOFF_STATUSES.has(o.status),
  };

  const filtered = useMemo(() => orders.filter(groups[filter]), [orders, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (key: Filter) => orders.filter(groups[key]).length;

  const updateStatus = async (id: string, newStatus: string) => {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      await updateOrderStatus(id, newStatus);
      await reloadSilently();
    } catch (transitionError) {
      await reloadSilently();
      Alert.alert('لم تتغير حالة الطلب', getOrderTransitionErrorMessage(transitionError));
    } finally {
      setUpdatingId(null);
    }
  };

  const renderOrder = ({ item }: { item: OrderSummary }) => {
    const info = getMerchantOrderStatusInfo(item.status);
    const action = nextAction(item.status);
    const progress = merchantOrderProgress(item.status);
    const busy = updatingId === item.id;
    const items = item.order_items?.reduce((sum, i) => sum + (i.quantity ?? 0), 0) ?? 0;
    const late = item.status === ORDER_STATUS.PENDING
      && Date.now() - new Date(item.created_at).getTime() > LATE_PENDING_MINUTES * 60000;

    return (
      <TouchableOpacity
        style={[styles.card, isDesktop && styles.cardDesktop, late && styles.cardLate]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={`فتح تفاصيل الطلب ${item.order_number}`}
      >
        <View style={styles.top}>
          <View style={styles.topCopy}>
            <Text style={styles.number}>#{item.order_number}</Text>
            <Text style={[styles.time, late && styles.timeLate]}>{late ? `متأخر · ${timeAgo(item.created_at)}` : timeAgo(item.created_at)}</Text>
          </View>
          <StatusPill label={info.label} color={info.color} background={info.background} icon={info.icon} />
        </View>

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={14} color={COLORS.inkTertiary} />
            <Text style={styles.metaText} numberOfLines={1}>{item.customer_profiles?.full_name || 'عميل'}</Text>
          </View>
          {items ? (
            <View style={styles.metaItem}>
              <Ionicons name="cube-outline" size={14} color={COLORS.inkTertiary} />
              <Text style={styles.metaText}>{items} منتج</Text>
            </View>
          ) : null}
          {item.addresses?.city ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={COLORS.inkTertiary} />
              <Text style={styles.metaText} numberOfLines={1}>{item.addresses.city}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.steps}>
          {STEPS.map((label, i) => {
            const done = progress >= i + 1;
            return (
              <View key={label} style={styles.step}>
                <View style={[styles.stepBar, done && styles.stepBarDone]} />
                <Text style={[styles.stepText, done && styles.stepTextDone]}>{label}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <View style={styles.totalWrap}>
            <Text style={styles.total}>{formatMoney(item.total_amount)} <Text style={styles.currency}>ر.ي</Text></Text>
            <Text style={styles.payment}>{paymentLabel(item.payment_method)}</Text>
          </View>
          {action ? (
            <TouchableOpacity
              style={[styles.action, (busy || !!updatingId) && styles.actionBusy]}
              onPress={() => void updateStatus(item.id, action.next)}
              disabled={!!updatingId}
              accessibilityRole="button"
              accessibilityLabel={`${action.label} للطلب ${item.order_number}`}
              accessibilityState={{ disabled: !!updatingId, busy }}
            >
              {busy ? <ActivityIndicator size="small" color={COLORS.surface} /> : <Ionicons name={action.icon} size={16} color={COLORS.surface} />}
              <Text style={styles.actionText}>{action.label}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hint}>{item.status === ORDER_STATUS.READY ? 'بانتظار وصول المندوب' : 'يتابعه المندوب'}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={ui.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenHeader
        title="الطلبات"
        subtitle={loading ? 'جاري التحميل...' : `${orders.length} طلب نشط${count('pending') ? ` · ${count('pending')} بانتظار قبولك` : ''}`}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          key={isDesktop ? 'grid' : 'list'}
          data={filtered}
          numColumns={isDesktop ? 2 : 1}
          columnWrapperStyle={isDesktop ? styles.columns : undefined}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={[ui.content, isDesktop && ui.contentDesktop]}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          ListHeaderComponent={
            <View style={styles.toolbar}>
              {realtimeError || error ? (
                <Banner
                  text={(realtimeError ?? error) as string}
                  tone={error && !orders.length ? 'error' : 'warning'}
                  actionLabel="تحديث"
                  onAction={() => void refresh()}
                />
              ) : null}
              <Chips
                items={[
                  { key: 'all', label: 'الكل', count: orders.length },
                  { key: 'pending', label: 'بانتظار القبول', count: count('pending') },
                  { key: 'preparing', label: 'قيد التجهيز', count: count('preparing') },
                  { key: 'ready', label: 'جاهزة', count: count('ready') },
                  { key: 'delivery', label: 'مع المندوب', count: count('delivery') },
                ]}
                value={filter}
                onChange={setFilter}
              />
            </View>
          }
          ListEmptyComponent={
            error && !orders.length ? null : (
              <EmptyState
                icon="checkmark-done-outline"
                title={filter === 'all' ? 'لا توجد طلبات نشطة' : 'لا توجد طلبات هنا'}
                text={filter === 'all' ? 'ستظهر الطلبات الجديدة هنا فور وصولها، مع تنبيه.' : 'اختر تصفية أخرى لعرض بقية الطلبات.'}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toolbar: { gap: 12 },
  columns: { flexDirection: 'row-reverse', gap: 14 },
  card: { ...card, padding: 14, gap: 12 },
  cardDesktop: { flex: 1 },
  cardLate: { borderColor: '#FCA5A5' },
  top: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  topCopy: { flex: 1, alignItems: 'flex-end' },
  number: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  time: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkTertiary, textAlign: 'right', marginTop: 2 },
  timeLate: { color: '#B91C1C', fontFamily: FONTS.semiBold },
  meta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, maxWidth: '60%' },
  metaText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  steps: { flexDirection: 'row-reverse', gap: 6 },
  step: { flex: 1, gap: 5 },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: COLORS.hairline },
  stepBarDone: { backgroundColor: COLORS.primary },
  stepText: { fontSize: 10, fontFamily: FONTS.medium, color: COLORS.inkTertiary, textAlign: 'center' },
  stepTextDone: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  footer: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.hairline, flexWrap: 'wrap',
  },
  totalWrap: { alignItems: 'flex-end' },
  total: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.ink },
  currency: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  payment: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.inkTertiary, marginTop: 1 },
  action: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16,
    borderRadius: RADIUS.md, backgroundColor: COLORS.primary,
  },
  actionBusy: { opacity: 0.6 },
  actionText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.surface },
  hint: { fontSize: 12, fontFamily: FONTS.semiBold, color: COLORS.inkSecondary },
});
