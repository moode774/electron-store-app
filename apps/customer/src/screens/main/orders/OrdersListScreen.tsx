import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, ORDER_STATUS, FONTS } from '@marketplace/shared-utils';
import { Card, Badge } from '@marketplace/shared-ui';
import { useAuthStore, useCartStore, getOrders, getReorderItems, OrderSummary, supabase } from '@marketplace/shared-hooks';
import { Alert } from '../../../components/appAlert';

export default function OrdersListScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addToCart);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const reorder = async (orderId: string, storeName: string) => {
    try {
      const items = await getReorderItems(orderId);
      if (items.length === 0) {
        Alert.alert('لا توجد عناصر متاحة', 'المنتجات السابقة غير متوفرة حالياً.');
        return;
      }
      items.forEach((it) => addToCart({
        id: `${it.productId}-${it.variantId ?? 'default'}`, productId: it.productId, variantId: it.variantId, name: it.name,
        price: it.price, emoji: '🛍️', quantity: it.quantity, maxQuantity: it.maxQuantity, storeId: it.storeId, storeName,
      }));
      navigation.navigate('Cart' as any, { screen: 'CartMain' });
    } catch (error: any) {
      Alert.alert('تعذّرت إعادة الطلب', error?.message ?? 'تعذّر تحميل عناصر الطلب. حاول مرة أخرى.');
    }
  };

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (!user?.id) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true);
    setErrorMessage('');
    try {
      const data = await getOrders(user.id);
      setOrders(data);
    } catch (error: any) {
      setErrorMessage(error?.message ?? 'تعذّر تحميل طلباتك. تحقق من الاتصال وحاول مجدداً.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    loadOrders();
  }, [loadOrders]));

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`customer-orders-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${user.id}`,
      }, () => { loadOrders(); })
      .subscribe();
    const fallback = setInterval(() => { void loadOrders(); }, 30000);

    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [loadOrders, user?.id]);
  const getStatusLabel = (status: string) => {
    switch (status) {
      case ORDER_STATUS.PENDING: return { text: 'بانتظار تأكيد المتجر', color: 'warning' };
      case ORDER_STATUS.CONFIRMED: return { text: 'تم تأكيد الطلب', color: 'info' };
      case ORDER_STATUS.PREPARING: return { text: 'جاري التجهيز', color: 'info' };
      case ORDER_STATUS.READY: return { text: 'جاهز وبانتظار المندوب', color: 'info' };
      case ORDER_STATUS.ASSIGNED: return { text: 'تم إسناده للمندوب', color: 'primary' };
      case ORDER_STATUS.PICKED_UP: return { text: 'استلمه المندوب', color: 'primary' };
      case ORDER_STATUS.ON_THE_WAY: return { text: 'في الطريق إليك', color: 'primary' };
      case ORDER_STATUS.DELIVERED: return { text: 'مكتمل', color: 'success' };
      case ORDER_STATUS.CANCELLED: return { text: 'ملغي', color: 'error' };
      case ORDER_STATUS.RETURNED: return { text: 'تم الإرجاع', color: 'warning' };
      case ORDER_STATUS.FAILED_DELIVERY: return { text: 'تعذّر التوصيل', color: 'error' };
      case ORDER_STATUS.RESCHEDULED: return { text: 'أُعيدت جدولة التوصيل', color: 'warning' };
      case ORDER_STATUS.PARTIAL_DELIVERY: return { text: 'تم التسليم جزئياً', color: 'warning' };
      case ORDER_STATUS.DISPUTED: return { text: 'الطلب محل نزاع', color: 'error' };
      default: return { text: status, color: 'default' };
    }
  };

  const renderOrder = ({ item }: { item: OrderSummary }) => {
    const statusData = getStatusLabel(item.status);
    const storeName = item.merchant_profiles?.store_name ?? 'المتجر';
    const date = new Date(item.created_at).toLocaleDateString('ar-SA');

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={`فتح الطلب ${item.order_number}، ${statusData.text}`}
      >
        <Card style={styles.orderCard} variant="outlined">
          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.storeName}>🏪 {storeName}</Text>
              <Text style={styles.orderId}>رقم الطلب: {item.order_number}</Text>
            </View>
            <Badge label={statusData.text} variant={statusData.color as any} />
          </View>
          <View style={styles.orderFooter}>
            <Text style={styles.orderDate}>{date}</Text>
            <Text style={styles.orderTotal}>{item.total_amount ?? 0} ر.ي</Text>
          </View>
          {item.status === ORDER_STATUS.DELIVERED && (
            <TouchableOpacity style={styles.reorderBtn} onPress={(event) => { event.stopPropagation(); reorder(item.id, storeName); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`إعادة الطلب ${item.order_number}`}>
              <Text style={styles.reorderBtnText}>🔁 أعد الطلب</Text>
            </TouchableOpacity>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>طلباتي</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadOrders(true)} tintColor={COLORS.primary} />}
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 14, color: errorMessage ? '#B91C1C' : COLORS.textMuted }}>{errorMessage || 'لا توجد طلبات حتى الآن'}</Text>
              {errorMessage ? (
                <TouchableOpacity style={styles.retryBtn} onPress={() => loadOrders()} accessibilityRole="button" accessibilityLabel="إعادة تحميل الطلبات">
                  <Text style={styles.retryText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.md, paddingTop: 60, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.bold, textAlign: 'center' },
  listContent: { padding: SPACING.md, paddingBottom: 100 },
  orderCard: { marginBottom: SPACING.md },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  storeName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  orderId: { fontSize: 12, color: COLORS.textMuted },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  orderDate: { fontSize: 12, color: COLORS.textSecondary },
  orderTotal: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  reorderBtn: { marginTop: 12, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: `${COLORS.primary}12`, alignItems: 'center' },
  reorderBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  retryBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.primary },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});
