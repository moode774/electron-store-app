import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, ORDER_STATUS } from '@marketplace/shared-utils';
import { useAuthStore, getMerchantOrders, updateOrderStatus, OrderSummary, supabase } from '@marketplace/shared-hooks';

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: ORDER_STATUS.PENDING, label: 'جديدة' },
  { key: ORDER_STATUS.PREPARING, label: 'قيد التجهيز' },
  { key: ORDER_STATUS.READY, label: 'جاهزة' },
  { key: ORDER_STATUS.DELIVERED, label: 'مكتملة' },
];

export default function MerchantOrdersScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try { setOrders(await getMerchantOrders(user.id)); } catch { setOrders([]); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // تحديث فوري عند وصول طلب جديد أو تغيّر حالة طلب لهذا التاجر
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`merchant-orders-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `merchant_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, load]);

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  const updateStatus = async (id: string, newStatus: string) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
    await updateOrderStatus(id, newStatus).catch(() => load());
  };

  const statusInfo = (status: string) => {
    switch (status) {
      case ORDER_STATUS.PENDING: return { label: 'بانتظار القبول', color: '#D97706', bg: '#FEF3C7' };
      case ORDER_STATUS.PREPARING: return { label: 'قيد التجهيز', color: '#2563EB', bg: '#DBEAFE' };
      case ORDER_STATUS.READY: return { label: 'جاهز للتوصيل', color: '#7C3AED', bg: '#EDE9FE' };
      case ORDER_STATUS.DELIVERED: return { label: 'مكتمل', color: '#059669', bg: '#DCFCE7' };
      default: return { label: status, color: '#6B7280', bg: '#F3F4F6' };
    }
  };

  const nextAction = (order: OrderSummary) => {
    switch (order.status) {
      case ORDER_STATUS.PENDING:
        return { label: 'قبول وبدء التجهيز', next: ORDER_STATUS.PREPARING };
      case ORDER_STATUS.PREPARING:
        return { label: 'جاهز للتوصيل', next: ORDER_STATUS.READY };
      default:
        return null;
    }
  };

  const renderOrder = ({ item }: { item: OrderSummary }) => {
    const info = statusInfo(item.status);
    const action = nextAction(item as any);
    const customerName = item.customer_profiles?.full_name ?? 'عميل';
    const date = new Date(item.created_at).toLocaleDateString('ar-SA');

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.customer}>{customerName}</Text>
            <Text style={styles.meta}>{item.order_number} · {date}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: info.bg }]}>
            <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.total}>{item.total_amount ?? 0} ر.س</Text>
          <View style={styles.actionsRow}>
            {item.status === ORDER_STATUS.PENDING && (
              <TouchableOpacity
                style={styles.rejectBtn}
                activeOpacity={0.7}
                onPress={() =>
                  Alert.alert('رفض الطلب', `هل أنت متأكد من رفض الطلب ${item.id}؟`, [
                    { text: 'تراجع', style: 'cancel' },
                    { text: 'رفض', style: 'destructive', onPress: () => updateStatus(item.id, ORDER_STATUS.CANCELLED) },
                  ])
                }
              >
                <Text style={styles.rejectBtnText}>رفض</Text>
              </TouchableOpacity>
            )}
            {action && (
              <TouchableOpacity
                style={styles.acceptBtn}
                activeOpacity={0.8}
                onPress={() => updateStatus(item.id, action.next)}
              >
                <Text style={styles.acceptBtnText}>{action.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    ); // Force cache clear
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الطلبات</Text>
      </View>

      {/* Filters */}
      <View style={styles.filtersWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f.key}
          contentContainerStyle={styles.filtersContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="file-tray-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>لا توجد طلبات في هذه الفئة</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  filtersWrap: { marginBottom: 8 },
  filtersContent: { paddingHorizontal: 24, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },
  filterTextActive: { color: '#FFFFFF' },
  listContent: { padding: 20, gap: 12, paddingBottom: 100 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  customer: { fontSize: 15, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 11.5, color: '#9CA3AF', marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  total: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  actionsRow: { flexDirection: 'row', gap: 8 },
  rejectBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: '#FEF2F2' },
  rejectBtnText: { fontSize: 12.5, fontWeight: '700', color: '#EF4444' },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.primary },
  acceptBtnText: { fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
