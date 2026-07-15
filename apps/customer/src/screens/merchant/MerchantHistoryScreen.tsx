import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator, useWindowDimensions, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ORDER_STATUS } from '@marketplace/shared-utils';
import { useAuthStore, OrderSummary } from '@marketplace/shared-hooks';
import { useMerchantOrderFeed } from './useMerchantOrderFeed';
import { getMerchantOrderStatusInfo, HISTORY_MERCHANT_ORDER_STATUSES } from './merchantOrderState';

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
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 16,
  elevation: 2,
};

export default function MerchantHistoryScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { orders: allOrders, loading, refreshing, error, realtimeError, refresh } = useMerchantOrderFeed(user?.id, 'history');
  const orders = useMemo(
    () => allOrders.filter((order) => HISTORY_MERCHANT_ORDER_STATUSES.has(order.status)),
    [allOrders],
  );

  // Group by Date + Search Logic
  const groupedOrders = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = orders.filter(o => {
      if (!query) return true;
      return o.order_number.toLowerCase().includes(query) || 
             (o.customer_profiles?.full_name || '').toLowerCase().includes(query);
    });

    const groups: { [key: string]: OrderSummary[] } = {};
    filtered.forEach(o => {
      let dateKey = 'تاريخ غير محدد';
      try {
        dateKey = new Date(o.created_at).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      } catch (e) {}
      
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(o);
    });

    return Object.keys(groups).map(date => ({
      date,
      data: groups[date]
    }));
  }, [orders, searchQuery]);

  const totalDelivered = useMemo(() => orders.filter(o => o.status === ORDER_STATUS.DELIVERED).reduce((acc, o) => acc + (o.total_amount || 0), 0), [orders]);
  const totalOrders = orders.length;

  const renderItem = ({ item, index, sectionData }: { item: OrderSummary, index: number, sectionData: OrderSummary[] }) => {
    const info = getMerchantOrderStatusInfo(item.status);
    const customerName = item.customer_profiles?.full_name || 'عميل غير مسجل';
    const payment = item.payment_method === 'cash' ? 'نقداً عند الاستلام' : 'دفع غير نقدي';
    
    let timeStr = '';
    try {
      timeStr = new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      timeStr = '';
    }

    const isLast = index === sectionData.length - 1;

    return (
      <TouchableOpacity 
        style={styles.ledgerRowWrap} 
        activeOpacity={0.8}
        onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={`فتح تفاصيل الطلب ${item.order_number}`}
      >
        {/* Timeline connector */}
        <View style={styles.timelineCol}>
          <View style={[styles.timelineNode, { borderColor: info.color }]} />
          {!isLast && <View style={styles.timelineLine} />}
        </View>

        {/* Content Row */}
        <View style={[styles.ledgerCard, isDesktop && styles.ledgerCardDesktop]}>
          <View style={styles.ledgerHeader}>
            <View>
              <Text style={styles.orderNumber}>{item.order_number}</Text>
              <Text style={styles.timeText}>{timeStr}</Text>
            </View>
            <View style={{ alignItems: 'flex-start' }}>
               <Text style={[styles.amountText, item.status === ORDER_STATUS.CANCELLED && styles.amountCancelled]}>
                 {item.total_amount} <Text style={{ fontSize: 12 }}>ر.ي</Text>
               </Text>
               <View style={styles.statusWrap}>
                 <Ionicons name={info.icon as any} size={14} color={info.color} />
                 <Text style={[styles.statusText, { color: info.color }]}>{info.label}</Text>
               </View>
            </View>
          </View>
          
          <View style={styles.ledgerDetails}>
            <View style={styles.ledgerDetailItem}>
              <Ionicons name="person-outline" size={14} color={UI.textMuted} />
              <Text style={styles.ledgerDetailText}>{customerName}</Text>
            </View>
            <View style={styles.ledgerDetailItem}>
              <Ionicons name="location-outline" size={14} color={UI.textMuted} />
              <Text style={styles.ledgerDetailText}>{payment}</Text>
            </View>
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
          <Text style={styles.headerTitleMobile}>سجل الطلبات</Text>
        </View>
      )}

      <View style={[styles.pageContent, isDesktop && styles.pageContentDesktop]}>
        
        <View style={styles.topSection}>
          {isDesktop && (
            <View style={styles.pageHeaderRow}>
              <View>
                <Text style={styles.pageTitle}>سجل الطلبات</Text>
                <Text style={styles.pageSubtitle}>الطلبات المكتملة والملغاة والمرتجعة وحالات تعذر التسليم</Text>
              </View>
            </View>
          )}

          {/* Quick Stats & Search Box */}
          <View style={[styles.dashboardCard, isDesktop && styles.dashboardCardDesktop]}>
             <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>قيمة الطلبات المسلّمة</Text>
                  <Text style={styles.statValueGreen}>{totalDelivered} ر.ي</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>عدد العمليات</Text>
                  <Text style={styles.statValueDark}>{totalOrders}</Text>
                </View>
             </View>

             <View style={styles.searchWrap}>
               <Ionicons name="search" size={20} color={UI.textMuted} style={styles.searchIcon} />
               <TextInput 
                 style={styles.searchInput}
                 placeholder="ابحث برقم الطلب أو اسم العميل..."
                 placeholderTextColor={UI.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  accessibilityLabel="البحث في سجل الطلبات"
               />
             </View>
          </View>
        </View>

        <View style={[styles.contentBox, isDesktop && styles.contentBoxDesktop]}>
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
              <Text style={styles.emptyTitle}>تعذر تحميل السجل</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="إعادة تحميل سجل الطلبات">
                <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={groupedOrders}
              keyExtractor={(item) => item.date}
              contentContainerStyle={styles.listContent}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              renderItem={({ item }) => (
                <View style={styles.dateGroup}>
                  <View style={styles.dateBadge}>
                     <Text style={styles.dateBadgeText}>{item.date}</Text>
                  </View>
                  {item.data.map((order, idx) => (
                    <View key={order.id}>
                      {renderItem({ item: order, index: idx, sectionData: item.data })}
                    </View>
                  ))}
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="documents-outline" size={64} color={UI.border} />
                  <Text style={styles.emptyTitle}>سجل الطلبات فارغ</Text>
                  <Text style={styles.emptyText}>لم يتم العثور على أي حركات متطابقة.</Text>
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
  
  topSection: { width: '100%', maxWidth: 1000, zIndex: 2 },
  
  pageHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  
  dashboardCard: { backgroundColor: '#FFFFFF', padding: 20, borderBottomWidth: 1, borderBottomColor: UI.border, gap: 20 },
  dashboardCardDesktop: { borderRadius: 20, borderWidth: 1, ...softShadow, marginBottom: 24, borderBottomWidth: 1 },
  
  statsRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', backgroundColor: UI.bg, padding: 16, borderRadius: 16 },
  statBox: { alignItems: 'center' },
  statDivider: { width: 1, height: 40, backgroundColor: UI.border },
  statLabel: { fontSize: 13, color: UI.textGrey, fontWeight: '700', marginBottom: 4 },
  statValueGreen: { fontSize: 24, fontWeight: '900', color: UI.green },
  statValueDark: { fontSize: 24, fontWeight: '900', color: UI.textDark },

  searchWrap: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border, borderRadius: 12, paddingHorizontal: 16, height: 50 },
  searchIcon: { marginLeft: 10 },
  searchInput: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: UI.textDark, height: '100%' },

  contentBox: { flex: 1, width: '100%', maxWidth: 1000 },
  contentBoxDesktop: { backgroundColor: '#FFFFFF', borderRadius: 20, ...softShadow, borderWidth: 1, borderColor: '#FFFFFF', overflow: 'hidden' },
  
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 400 },
  
  listContent: { padding: 20, paddingBottom: 120 },
  
  dateGroup: { marginBottom: 32 },
  dateBadge: { alignSelf: 'flex-end', backgroundColor: '#111827', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 100, marginBottom: 16, marginRight: 20 },
  dateBadgeText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  ledgerRowWrap: { flexDirection: 'row-reverse', alignItems: 'stretch' },
  
  timelineCol: { width: 40, alignItems: 'center' },
  timelineNode: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, backgroundColor: '#FFFFFF', zIndex: 2, marginTop: 24 },
  timelineLine: { width: 2, backgroundColor: UI.border, flex: 1, position: 'absolute', top: 38, bottom: -24, zIndex: 1 },

  ledgerCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: UI.border, marginBottom: 16 },
  ledgerCardDesktop: { padding: 24 },
  
  ledgerHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  orderNumber: { fontSize: 16, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  timeText: { fontSize: 12, color: UI.textMuted, fontWeight: '600', marginTop: 4, textAlign: 'right' },
  
  amountText: { fontSize: 18, fontWeight: '900', color: UI.primary },
  amountCancelled: { textDecorationLine: 'line-through', color: UI.textMuted },
  
  statusWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },

  ledgerDetails: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: UI.bg },
  ledgerDetailItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: UI.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  ledgerDetailText: { fontSize: 12, fontWeight: '600', color: UI.textGrey },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  emptyText: { fontSize: 14, color: UI.textMuted, textAlign: 'center' },
  retryBtn: { backgroundColor: UI.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  inlineWarning: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderBottomColor: '#FDE68A', paddingHorizontal: 18, paddingVertical: 10 },
  inlineWarningText: { flex: 1, color: '#92400E', fontSize: 12.5, fontWeight: '700', textAlign: 'right' },
});
