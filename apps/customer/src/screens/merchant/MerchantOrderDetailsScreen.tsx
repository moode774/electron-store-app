import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Linking, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, ORDER_STATUS } from '@marketplace/shared-utils';
import { getOrderById, updateOrderStatus, OrderDetail } from '@marketplace/shared-hooks';

export default function MerchantOrderDetailsScreen({ navigation, route }: any) {
  const orderId: string = route?.params?.orderId ?? route?.params?.order?.id;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(ORDER_STATUS.PENDING);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    getOrderById(orderId).then((o) => {
      setOrder(o);
      if (o) setStatus(o.status);
    }).finally(() => setLoading(false));
  }, [orderId]);

  const items = order?.order_items ?? [];
  const subtotal = order?.subtotal ?? items.reduce((s, i) => s + i.total_price, 0);
  const deliveryFee = order?.delivery_fee ?? 0;
  const customerName = order?.customer?.full_name ?? 'عميل';
  const customerPhone = order?.customer?.phone ?? '';
  const customerAddress = order?.addresses?.full_address ?? 'غير متوفر';

  const changeStatus = async (next: string) => {
    setStatus(next);
    if (orderId) await updateOrderStatus(orderId, next).catch(() => {});
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const statusInfo = (s: string) => {
    switch (s) {
      case ORDER_STATUS.PENDING: return { label: 'بانتظار القبول', color: '#D97706', bg: '#FEF3C7' };
      case ORDER_STATUS.PREPARING: return { label: 'قيد التجهيز', color: '#2563EB', bg: '#DBEAFE' };
      case ORDER_STATUS.READY: return { label: 'جاهز للتوصيل', color: '#7C3AED', bg: '#EDE9FE' };
      case ORDER_STATUS.ASSIGNED:
      case ORDER_STATUS.PICKED_UP:
      case ORDER_STATUS.ON_THE_WAY: return { label: 'مع المندوب', color: '#0891B2', bg: '#CFFAFE' };
      case ORDER_STATUS.DELIVERED: return { label: 'مكتمل', color: '#059669', bg: '#DCFCE7' };
      case ORDER_STATUS.CANCELLED: return { label: 'ملغي', color: '#EF4444', bg: '#FEE2E2' };
      default: return { label: s, color: '#6B7280', bg: '#F3F4F6' };
    }
  };

  const nextAction = () => {
    if (status === ORDER_STATUS.PENDING) return { label: 'قبول وبدء التجهيز', next: ORDER_STATUS.PREPARING };
    if (status === ORDER_STATUS.PREPARING) return { label: 'الطلب جاهز للتوصيل', next: ORDER_STATUS.READY };
    return null;
  };

  const info = statusInfo(status);
  const action = nextAction();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تفاصيل الطلب</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.orderId}>{order?.order_number ?? orderId}</Text>
              <Text style={styles.orderTime}>{order ? new Date(order.created_at).toLocaleString('ar-SA') : ''}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: info.bg }]}>
              <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
            </View>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>بيانات العميل</Text>
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Ionicons name="person" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerAddress}>{customerAddress}</Text>
            </View>
            {!!customerPhone && (
              <TouchableOpacity
                style={styles.callBtn}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(`tel:${customerPhone}`)}
              >
                <Ionicons name="call" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>المنتجات ({items.length})</Text>
          {items.map((item, i) => (
            <View key={item.id} style={[styles.itemRow, i < items.length - 1 && styles.itemRowBorder]}>
              <View style={styles.itemImage}>
                <Ionicons name="cube-outline" size={22} color="#9CA3AF" />
              </View>
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.itemName}>{item.products?.name ?? item.product_name ?? 'منتج'}</Text>
                <Text style={styles.itemQty}>الكمية: {item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>{item.total_price} ر.ي</Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>المجموع الفرعي</Text>
            <Text style={styles.summaryValue}>{subtotal} ر.ي</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>رسوم التوصيل</Text>
            <Text style={styles.summaryValue}>{deliveryFee} ر.ي</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>الإجمالي (COD)</Text>
            <Text style={styles.totalValue}>{order?.total_amount ?? (subtotal + deliveryFee)} ر.ي</Text>
          </View>
        </View>
      </ScrollView>

      {/* Actions */}
      {(action || status === ORDER_STATUS.PENDING) && (
        <View style={styles.bottomBar}>
          {status === ORDER_STATUS.PENDING && (
            <TouchableOpacity
              style={styles.rejectBtn}
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert('رفض الطلب', 'هل أنت متأكد من رفض هذا الطلب؟', [
                  { text: 'تراجع', style: 'cancel' },
                  { text: 'رفض', style: 'destructive', onPress: () => changeStatus(ORDER_STATUS.CANCELLED) },
                ])
              }
            >
              <Text style={styles.rejectBtnText}>رفض</Text>
            </TouchableOpacity>
          )}
          {action && (
            <TouchableOpacity style={styles.acceptBtn} activeOpacity={0.8} onPress={() => changeStatus(action.next)}>
              <Text style={styles.acceptBtnText}>{action.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scrollContent: { padding: 20, gap: 14, paddingBottom: 120 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 16, fontWeight: '800', color: '#111827' },
  orderTime: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827', marginBottom: 14 },
  customerRow: { flexDirection: 'row', alignItems: 'center' },
  customerAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  customerName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  customerAddress: { fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 18 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemImage: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  itemQty: { fontSize: 11.5, color: '#9CA3AF', marginTop: 3 },
  itemPrice: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryLabel: { fontSize: 13, color: '#6B7280' },
  summaryValue: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  summaryDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 8 },
  totalLabel: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10,
    backgroundColor: '#FFFFFF', padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1.5, borderTopColor: '#F3F4F6',
  },
  rejectBtn: { paddingHorizontal: 24, height: 50, borderRadius: 14, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  acceptBtn: { flex: 1, height: 50, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { fontSize: 14.5, fontWeight: '800', color: '#FFFFFF' },
});
