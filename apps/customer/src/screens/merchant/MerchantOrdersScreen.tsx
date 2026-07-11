import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { ORDER_STATUS } from '@marketplace/shared-utils';
import { useAuthStore, getMerchantOrders, updateOrderStatus, OrderSummary } from '@marketplace/shared-hooks';

const UI = {
  primary: '#111827',
  bg: '#F3F4F6',
  bgMobile: '#F9FAFB',
  textDark: '#111827',
  textGrey: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  green: '#10B981',
  red: '#EF4444',
  blue: '#3B82F6',
  orange: '#F59E0B',
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
];

export default function MerchantOrdersScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try { 
      const allOrders = await getMerchantOrders(user.id);
      const activeOrders = allOrders.filter(o => 
        o.status === ORDER_STATUS.PENDING || 
        o.status === ORDER_STATUS.PREPARING || 
        o.status === ORDER_STATUS.READY
      );
      setOrders(activeOrders);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  const updateStatus = async (id: string, newStatus: string) => {
    setOrders((prev) => prev.filter(o => {
      if (newStatus === ORDER_STATUS.DELIVERED || newStatus === ORDER_STATUS.CANCELLED) return o.id !== id;
      return true;
    }).map(o => o.id === id ? { ...o, status: newStatus } : o));
    await updateOrderStatus(id, newStatus).catch(() => load());
  };

  const statusInfo = (status: string) => {
    switch (status) {
      case ORDER_STATUS.PENDING: return { label: 'بانتظار القبول', color: UI.orange, bg: `${UI.orange}15` };
      case ORDER_STATUS.PREPARING: return { label: 'قيد التجهيز', color: UI.blue, bg: `${UI.blue}15` };
      case ORDER_STATUS.READY: return { label: 'جاهز للتوصيل', color: UI.primary, bg: `${UI.primary}15` };
      default: return { label: status, color: UI.textGrey, bg: UI.bg };
    }
  };

  const nextAction = (order: OrderSummary) => {
    switch (order.status) {
      case ORDER_STATUS.PENDING: return { label: 'قبول وبدء التجهيز', next: ORDER_STATUS.PREPARING };
      case ORDER_STATUS.PREPARING: return { label: 'جاهز للتوصيل', next: ORDER_STATUS.READY };
      case ORDER_STATUS.READY: return { label: 'تسليم للمندوب', next: ORDER_STATUS.DELIVERED };
      default: return null;
    }
  };

  const renderOrder = ({ item }: { item: OrderSummary }) => {
    const info = statusInfo(item.status);
    const action = nextAction(item as any);
    const customerName = item.customer_profiles?.full_name || 'عميل';
    const city = item.addresses?.city || 'مدينة غير محددة';
    
    let timeStr = '';
    try {
      const d = new Date(item.created_at);
      timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      timeStr = item.created_at;
    }

    return (
      <TouchableOpacity
        style={[styles.card, isDesktop && styles.cardDesktop]}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}
      >
        <View style={styles.cardHeader}>
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
            <View style={[styles.badge, { backgroundColor: info.bg }]}>
              <View style={[styles.badgeDot, { backgroundColor: info.color }]} />
              <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
            </View>
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>
        </View>

        {/* Location & Payment Quick Info */}
        <View style={styles.quickInfoRow}>
           <View style={styles.quickInfoItem}>
             <Ionicons name="location-outline" size={16} color={UI.textGrey} />
             <Text style={styles.quickInfoText}>{city}</Text>
           </View>
           <View style={styles.quickInfoItem}>
             <Ionicons name="card-outline" size={16} color={UI.textGrey} />
             <Text style={styles.quickInfoText}>{item.payment_method === 'cash' ? 'الدفع عند الاستلام' : 'دفع إلكتروني'}</Text>
           </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.total}>{item.total_amount ?? 0} <Text style={styles.currency}>ر.ي</Text></Text>
          <View style={styles.actionsRow}>
            {item.status === ORDER_STATUS.PENDING && (
              <TouchableOpacity
                style={styles.rejectBtn}
                activeOpacity={0.7}
                onPress={() =>
                  Alert.alert('رفض الطلب', `هل أنت متأكد من رفض الطلب ${item.order_number}؟`, [
                    { text: 'تراجع', style: 'cancel' },
                    { text: 'رفض', style: 'destructive', onPress: () => updateStatus(item.id, ORDER_STATUS.CANCELLED) },
                  ])
                }
              >
                <Text style={styles.rejectBtnText}>رفض الطلب</Text>
              </TouchableOpacity>
            )}
            {action && (
              <TouchableOpacity style={styles.acceptBtn} activeOpacity={0.8} onPress={() => updateStatus(item.id, action.next)}>
                <Text style={styles.acceptBtnText}>{action.label}</Text>
                <Ionicons name="chevron-back" size={16} color="#FFFFFF" />
              </TouchableOpacity>
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

      <View style={[styles.pageContent, isDesktop && styles.pageContentDesktop]}>
        
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
                >
                  <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={UI.primary} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderOrder}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="checkmark-done-circle-outline" size={64} color={UI.border} />
                  <Text style={styles.emptyTitle}>لا توجد طلبات نشطة</Text>
                  <Text style={styles.emptyText}>جميع طلباتك منجزة، أحسنت عملاً!</Text>
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
  headerTitleMobile: { fontSize: 20, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  
  pageContent: { flex: 1 },
  pageContentDesktop: { padding: 40, alignItems: 'center' },
  
  pageHeaderRow: { width: '100%', maxWidth: 1000, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  
  contentBox: { flex: 1, width: '100%', maxWidth: 1000 },
  contentBoxDesktop: { backgroundColor: '#FFFFFF', borderRadius: 20, ...softShadow, borderWidth: 1, borderColor: '#FFFFFF', overflow: 'hidden' },
  
  filtersWrap: { borderBottomWidth: 1, borderBottomColor: UI.border, backgroundColor: '#FFFFFF' },
  filtersContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  filterChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100, backgroundColor: UI.bg, borderWidth: 1, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textGrey },
  filterTextActive: { color: '#FFFFFF' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 400 },
  
  listContent: { padding: 20, gap: 16, paddingBottom: 120 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: UI.border },
  cardDesktop: { padding: 24, borderRadius: 16 },
  
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
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
  quickInfoItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  quickInfoText: { fontSize: 12.5, color: UI.textGrey, fontWeight: '600' },

  cardFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: UI.border },
  total: { fontSize: 20, fontWeight: '800', color: UI.primary },
  currency: { fontSize: 13, fontWeight: '600', color: UI.textGrey },
  
  actionsRow: { flexDirection: 'row-reverse', gap: 10 },
  rejectBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: UI.textDark },
  acceptBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: UI.primary },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  emptyText: { fontSize: 14, color: UI.textMuted, textAlign: 'center' },
});
