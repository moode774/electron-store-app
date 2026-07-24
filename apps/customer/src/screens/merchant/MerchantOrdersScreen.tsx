import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { BREAKPOINTS, COLORS, FONTS, ORDER_STATUS, RADIUS } from '@marketplace/shared-utils';
import { useAuthStore, updateOrderStatus, OrderSummary } from '@marketplace/shared-hooks';
import { useMerchantOrderFeed } from './useMerchantOrderFeed';
import {
  ACTIVE_MERCHANT_ORDER_STATUSES,
  DELIVERY_HANDOFF_STATUSES,
  getMerchantOrderStatusInfo,
  getOrderTransitionErrorMessage,
} from './merchantOrderState';

const UI = {
  primary: COLORS.primary,
  bg: COLORS.background,
  bgMobile: COLORS.background,
  textDark: COLORS.textPrimary,
  textGrey: COLORS.textSecondary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  green: COLORS.success,
  red: COLORS.error,
  blue: COLORS.info,
  orange: COLORS.warning,
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 16,
  elevation: 2,
};

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: ORDER_STATUS.PENDING, label: 'بانتظار القبول' },
  { key: ORDER_STATUS.PREPARING, label: 'قيد التجهيز' },
  { key: ORDER_STATUS.READY, label: 'جاهزة' },
  { key: 'delivery', label: 'مع المندوب' },
];

export default function MerchantOrdersScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const { orders: allOrders, loading, refreshing, error, realtimeError, refresh, reloadSilently } = useMerchantOrderFeed(user?.id, 'active');

  const orders = useMemo(
    () => allOrders.filter((order) => ACTIVE_MERCHANT_ORDER_STATUSES.has(order.status)),
    [allOrders],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'delivery') return orders.filter((order) => DELIVERY_HANDOFF_STATUSES.has(order.status));
    return orders.filter((order) => order.status === filter);
  }, [filter, orders]);

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

  const nextAction = (order: OrderSummary) => {
    switch (order.status) {
      case ORDER_STATUS.PENDING: return { label: 'قبول وبدء التجهيز', next: ORDER_STATUS.PREPARING };
      case ORDER_STATUS.PREPARING: return { label: 'جاهز للتوصيل', next: ORDER_STATUS.READY };
      default: return null;
    }
  };

  const renderOrder = ({ item }: { item: OrderSummary }) => {
    const info = getMerchantOrderStatusInfo(item.status);
    const action = nextAction(item as any);
    const customerName = item.customer_profiles?.full_name || 'عميل';
    const isUpdating = updatingId === item.id;
    
    let timeStr = '';
    try {
      const d = new Date(item.created_at);
      timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      timeStr = item.created_at;
    }

    return (
      <TouchableOpacity
        style={[styles.card, isCompact && styles.cardCompact, isDesktop && styles.cardDesktop]}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={`فتح تفاصيل الطلب ${item.order_number}`}
      >
        <View style={[styles.cardHeader, isCompact && styles.cardHeaderCompact]}>
          <View style={styles.customerInfo}>
             <View style={styles.avatar}>
               <Text style={styles.avatarText}>{customerName.substring(0, 1)}</Text>
             </View>
             <View>
               <Text style={styles.customerName}>{customerName}</Text>
               <Text style={styles.orderId}>{item.order_number}</Text>
             </View>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.badge, { backgroundColor: info.background }]}>
              <View style={[styles.badgeDot, { backgroundColor: info.color }]} />
              <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
            </View>
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>
        </View>

        {/* Location & Payment Quick Info */}
        <View style={[styles.quickInfoRow, isCompact && styles.quickInfoRowCompact]}>
           <View style={styles.quickInfoItem}>
             <Ionicons name={info.icon as any} size={16} color={UI.textGrey} />
             <Text style={styles.quickInfoText}>{info.label}</Text>
           </View>
           <View style={styles.quickInfoItem}>
             <Ionicons name="card-outline" size={16} color={UI.textGrey} />
             <Text style={styles.quickInfoText}>{item.payment_method === 'cash' ? 'الدفع عند الاستلام' : 'دفع إلكتروني'}</Text>
           </View>
        </View>

        <View style={[styles.cardFooter, isCompact && styles.cardFooterCompact]}>
          <Text style={styles.total}>{item.total_amount ?? 0} <Text style={styles.currency}>ر.ي</Text></Text>
          <View style={[styles.actionsRow, isCompact && styles.actionsRowCompact]}>
            {action && (
              <TouchableOpacity
                style={[styles.acceptBtn, isUpdating && styles.buttonDisabled]}
                activeOpacity={0.8}
                onPress={() => updateStatus(item.id, action.next)}
                disabled={isUpdating || !!updatingId}
                accessibilityRole="button"
                accessibilityLabel={`${action.label} للطلب ${item.order_number}`}
                accessibilityState={{ disabled: isUpdating || !!updatingId, busy: isUpdating }}
              >
                {isUpdating ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <>
                    <Text style={styles.acceptBtnText}>{action.label}</Text>
                    <Ionicons name="chevron-back" size={16} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            )}
            {!action && (
              <Text style={styles.statusHint}>
                {item.status === ORDER_STATUS.READY ? 'بانتظار استلام المندوب' : info.label}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />
      
      {!isDesktop && (
        <View style={styles.headerMobile}>
          <Text style={styles.headerTitleMobile}>الطلبات النشطة</Text>
        </View>
      )}

      <View style={[styles.pageContent, isTablet && styles.pageContentTablet, isDesktop && styles.pageContentDesktop]}>
        
        {isDesktop && (
          <View style={styles.pageHeaderRow}>
            <View>
              <Text style={styles.pageTitle}>الطلبات النشطة</Text>
              <Text style={styles.pageSubtitle}>قم بإدارة الطلبات الجديدة والمجهزة حالياً</Text>
            </View>
          </View>
        )}

        <View style={[styles.contentBox, isDesktop && styles.contentBoxDesktop]}>
          <View style={styles.filtersWrap}>
            <FlatList
              horizontal
              inverted
              showsHorizontalScrollIndicator={false}
              data={FILTERS}
              keyExtractor={(f) => f.key}
              contentContainerStyle={styles.filtersContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`فلتر ${item.label}`}
                  accessibilityState={{ selected: filter === item.key }}
                >
                  <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>

          {realtimeError || (error && orders.length > 0) ? (
            <View style={styles.inlineWarning} accessibilityRole="alert">
              <Ionicons name="cloud-offline-outline" size={18} color="#92400E" />
              <Text style={styles.inlineWarningText}>{realtimeError ?? error}</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={UI.primary} />
            </View>
          ) : error && orders.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={56} color={UI.textMuted} />
              <Text style={styles.emptyTitle}>تعذر تحميل الطلبات</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="إعادة تحميل الطلبات">
                <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderOrder}
              contentContainerStyle={styles.listContent}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="checkmark-done-circle-outline" size={64} color={UI.border} />
                  <Text style={styles.emptyTitle}>لا توجد طلبات نشطة</Text>
                  <Text style={styles.emptyText}>{filter === 'all' ? 'لا توجد طلبات قيد التنفيذ حالياً.' : 'لا توجد طلبات ضمن هذا التصنيف.'}</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },
  
  headerMobile: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: UI.border },
  headerTitleMobile: { fontSize: 20, fontFamily: FONTS.bold, color: UI.textDark, textAlign: 'right' },
  
  pageContent: { flex: 1 },
  pageContentTablet: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 24 },
  pageContentDesktop: { paddingTop: 40, paddingBottom: 40, alignItems: 'center' },
  
  pageHeaderRow: { width: '100%', maxWidth: 1200, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  
  contentBox: { flex: 1, width: '100%', maxWidth: 1200 },
  contentBoxDesktop: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, ...softShadow, borderWidth: 1, borderColor: COLORS.surface, overflow: 'hidden' },
  
  filtersWrap: { borderBottomWidth: 1, borderBottomColor: UI.border, backgroundColor: '#FFFFFF' },
  filtersContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  filterChip: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: UI.bg, borderWidth: 1, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textGrey },
  filterTextActive: { color: '#FFFFFF' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 400 },
  
  listContent: { padding: 20, gap: 16, paddingBottom: 120 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: UI.border },
  cardCompact: { padding: 14 },
  cardDesktop: { padding: 24, borderRadius: 16 },
  
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  cardHeaderCompact: { flexDirection: 'column', gap: 12, alignItems: 'stretch' },
  customerInfo: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: UI.textGrey },
  customerName: { fontSize: 16, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  orderId: { fontSize: 13, color: UI.textMuted, marginTop: 2, textAlign: 'right', fontWeight: '600' },
  
  headerRight: { alignItems: 'flex-start', gap: 8 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  timeText: { fontSize: 12, color: UI.textMuted, fontWeight: '600', alignSelf: 'flex-start' },

  quickInfoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, marginBottom: 16, paddingHorizontal: 4 },
  quickInfoRowCompact: { flexWrap: 'wrap', gap: 10 },
  quickInfoItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  quickInfoText: { fontSize: 12.5, color: UI.textGrey, fontWeight: '600' },

  cardFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: UI.border },
  cardFooterCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 14 },
  total: { fontSize: 20, fontWeight: '800', color: UI.primary },
  currency: { fontSize: 13, fontWeight: '600', color: UI.textGrey },
  
  actionsRow: { flexDirection: 'row-reverse', gap: 10 },
  actionsRowCompact: { width: '100%' },
  acceptBtn: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: RADIUS.sm, backgroundColor: UI.primary },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.6 },
  statusHint: { fontSize: 12, fontWeight: '700', color: UI.textGrey, textAlign: 'right' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  emptyText: { fontSize: 14, color: UI.textMuted, textAlign: 'center' },
  retryBtn: { minHeight: 44, justifyContent: 'center', backgroundColor: UI.primary, borderRadius: 12, paddingHorizontal: 22 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  inlineWarning: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderBottomColor: '#FDE68A', paddingHorizontal: 18, paddingVertical: 10 },
  inlineWarningText: { flex: 1, color: '#92400E', fontSize: 12.5, fontWeight: '700', textAlign: 'right' },
});
