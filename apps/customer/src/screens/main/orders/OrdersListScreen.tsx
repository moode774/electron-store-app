import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, ORDER_STATUS, getStatusMeta, formatPrice, formatRelativeTime } from '@marketplace/shared-utils';
import { Card, Badge } from '@marketplace/shared-ui';
import { useAuthStore, useCartStore, getOrders, getReorderItems, OrderSummary } from '@marketplace/shared-hooks';

export default function OrdersListScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addToCart);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reorder = async (orderId: string, storeName: string) => {
    try {
      const items = await getReorderItems(orderId);
      items.forEach((it) => addToCart({
        id: `${it.productId}-reorder`, productId: it.productId, name: it.name,
        price: it.price, emoji: '🛍️', quantity: it.quantity, storeId: it.storeId, storeName,
      }));
      navigation.navigate('Cart' as any, { screen: 'CartMain' });
    } catch { /* ignore */ }
  };

  const loadOrders = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const data = await getOrders(user.id);
      setOrders(data);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const renderOrder = ({ item }: { item: OrderSummary }) => {
    const status = getStatusMeta(item.status);
    const storeName = item.merchant_profiles?.store_name ?? 'المتجر';
    const date = formatRelativeTime(item.created_at);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
      >
        <Card style={styles.orderCard} variant="outlined">
          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.storeName}>🏪 {storeName}</Text>
              <Text style={styles.orderId}>رقم الطلب: {item.order_number}</Text>
            </View>
            <Badge label={status.label} style={{ backgroundColor: status.bg }} textStyle={{ color: status.color }} />
          </View>
          <View style={styles.orderFooter}>
            <Text style={styles.orderDate}>{date}</Text>
            <Text style={styles.orderTotal}>{formatPrice(item.total_amount ?? 0)}</Text>
          </View>
          {item.status === ORDER_STATUS.DELIVERED && (
            <TouchableOpacity style={styles.reorderBtn} onPress={() => reorder(item.id, storeName)} activeOpacity={0.8}>
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
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 14, color: COLORS.textMuted }}>لا توجد طلبات حتى الآن</Text>
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
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.textPrimary, fontFamily: 'El Messiri', textAlign: 'center' },
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
});
