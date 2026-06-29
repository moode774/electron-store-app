import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Linking, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import LiveTrackingMap from '../../components/LiveTrackingMap';
import { COLORS, ORDER_STATUS, formatPrice, isTerminalStatus, hasValidCoords } from '@marketplace/shared-utils';
import { useAuthStore, getOrderById, getDeliveryOrders, updateOrderStatus, recordDeliveryLocation, OrderDetail } from '@marketplace/shared-hooks';

// statusOnComplete = الحالة التي تُكتب عند إتمام إجراء هذه المرحلة:
//  "استلمت الطلب" => on_the_way (المندوب استلم وبدأ التوصيل، فيرى العميل "في الطريق")
//  "تم التسليم"   => delivered
const STEPS: { key: string; label: string; action: string; statusOnComplete: string | null }[] = [
  { key: 'heading_pickup', label: 'متجه للمتجر', action: 'وصلت إلى المتجر', statusOnComplete: null },
  { key: 'at_pickup', label: 'في المتجر', action: 'استلمت الطلب', statusOnComplete: ORDER_STATUS.ON_THE_WAY },
  { key: 'on_the_way', label: 'في الطريق للعميل', action: 'وصلت إلى العميل', statusOnComplete: null },
  { key: 'at_dropoff', label: 'عند العميل', action: 'تم التسليم', statusOnComplete: ORDER_STATUS.DELIVERED },
];

export default function ActiveDeliveryScreen({ navigation, route }: any) {
  const paramOrderId: string | undefined = route?.params?.orderId;
  const user = useAuthStore((s) => s.user);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [myPos, setMyPos] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    const loadOrder = async () => {
      try {
        let loaded: OrderDetail | null = null;
        if (paramOrderId) {
          loaded = await getOrderById(paramOrderId);
        } else if (user?.id) {
          // تبويب "الطلبات": اجلب الطلب النشط الحالي للمندوب
          const mine = await getDeliveryOrders(user.id);
          const active = mine.find((o) => !isTerminalStatus(o.status)) ?? mine[0];
          if (active) loaded = await getOrderById(active.id);
        }
        if (loaded) {
          setOrder(loaded);
          // استئناف من مرحلة "في الطريق للعميل" إذا كان قد استلم الطلب فعلاً
          if (loaded.status === ORDER_STATUS.PICKED_UP || loaded.status === ORDER_STATUS.ON_THE_WAY) setStepIndex(2);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    loadOrder();
  }, [paramOrderId, user?.id]);

  const orderId = order?.id ?? paramOrderId;

  // بثّ موقع المندوب المباشر أثناء التوصيل (يتوقف عند انتهاء الطلب أو مغادرة الشاشة)
  useEffect(() => {
    if (!orderId || !user?.id || !order || isTerminalStatus(order.status)) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 50 },
          (pos) => {
            setMyPos({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            recordDeliveryLocation(user.id, orderId, pos.coords.latitude, pos.coords.longitude).catch(() => {});
          },
        );
      } catch { /* تتبّع تحسيني — يُتجاهل عند الفشل */ }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [orderId, user?.id, order?.status]);

  const currentStep = STEPS[stepIndex];

  const ORDER = {
    store: order?.merchant_profiles?.store_name ?? 'المتجر',
    customer: order?.customer?.full_name ?? 'العميل',
    customerPhone: order?.customer?.phone ?? '',
    dropoff: order?.addresses?.full_address ?? 'عنوان العميل',
    items: order?.order_items?.length ?? 0,
    codAmount: order?.total_amount ?? 0,
    fee: order?.delivery_fee ?? 0,
  };

  const [updating, setUpdating] = useState(false);

  const advanceStep = async () => {
    if (updating) return;
    const step = STEPS[stepIndex];
    // اكتب الحالة أولاً؛ لا نتقدّم محلياً إلا بعد نجاح الكتابة (تفادي تباين مع الخادم)
    if (step.statusOnComplete && orderId) {
      setUpdating(true);
      try {
        await updateOrderStatus(orderId, step.statusOnComplete);
      } catch {
        setUpdating(false);
        Alert.alert('تعذّر التحديث', 'لم نتمكّن من تحديث حالة الطلب. تحقّق من اتصالك وحاول مرة أخرى.');
        return;
      }
      setUpdating(false);
    }
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      Alert.alert('أحسنت!', `تم تسليم الطلب ${order?.order_number ?? ''} بنجاح.`, [
        { text: 'العودة للطلبات', onPress: () => navigation.goBack() },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>توصيلة نشطة</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="bicycle-outline" size={48} color="#D1D5DB" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 12 }}>لا توجد توصيلة نشطة</Text>
          <Text style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4, textAlign: 'center' }}>اقبل طلباً من الرئيسية لبدء التوصيل</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>توصيلة نشطة</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Map */}
        {hasValidCoords(order?.addresses) || myPos ? (
          <LiveTrackingMap
            courier={myPos}
            destination={hasValidCoords(order?.addresses) ? { latitude: order!.addresses!.latitude!, longitude: order!.addresses!.longitude! } : null}
            height={180}
            style={{ marginBottom: 16 }}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map-outline" size={48} color="#9CA3AF" />
            <Text style={styles.mapText}>جارٍ تحديد الموقع…</Text>
          </View>
        )}

        {/* Progress Steps */}
        <View style={styles.stepsCard}>
          {STEPS.map((step, i) => {
            const isDone = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepIndicator}>
                  <View style={[styles.stepCircle, isDone && styles.stepCircleDone, isCurrent && styles.stepCircleCurrent]}>
                    {isDone ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.stepNum, isCurrent && { color: '#FFFFFF' }]}>{i + 1}</Text>
                    )}
                  </View>
                  {i < STEPS.length - 1 && <View style={[styles.stepLine, isDone && { backgroundColor: '#059669' }]} />}
                </View>
                <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent, isDone && { color: '#059669' }]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Order Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>تفاصيل الطلب {order?.order_number ?? ''}</Text>

          <View style={styles.detailRow}>
            <Ionicons name="storefront-outline" size={18} color={COLORS.primary} />
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>الاستلام من</Text>
              <Text style={styles.detailValue}>{ORDER.store}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={18} color="#059669" />
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>التسليم إلى</Text>
              <Text style={styles.detailValue}>{ORDER.customer} — {ORDER.dropoff}</Text>
            </View>
            <TouchableOpacity
              style={styles.callBtn}
              activeOpacity={0.7}
              onPress={() => Linking.openURL(`tel:${ORDER.customerPhone}`)}
            >
              <Ionicons name="call" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.codBox}>
            <Text style={styles.codLabel}>المبلغ المطلوب تحصيله (COD)</Text>
            <Text style={styles.codValue}>{formatPrice(ORDER.codAmount)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.actionBtn, updating && { opacity: 0.6 }]} onPress={advanceStep} activeOpacity={0.8} disabled={updating}>
          {updating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionBtnText}>{currentStep.action}</Text>}
        </TouchableOpacity>
      </View>
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
  scrollContent: { padding: 20, paddingBottom: 120 },
  mapPlaceholder: {
    height: 160, borderRadius: 16, backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16,
  },
  mapText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  stepsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepIndicator: { alignItems: 'center', marginLeft: 14 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  stepCircleDone: { backgroundColor: '#059669' },
  stepCircleCurrent: { backgroundColor: COLORS.primary },
  stepNum: { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },
  stepLine: { width: 2, height: 24, backgroundColor: '#E5E7EB', marginVertical: 2 },
  stepLabel: { fontSize: 14, color: '#9CA3AF', fontWeight: '600', paddingTop: 3 },
  stepLabelCurrent: { color: COLORS.primary, fontWeight: '800' },
  detailsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: '#F3F4F6' },
  detailsTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  detailInfo: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  detailValue: { fontSize: 13.5, color: '#111827', fontWeight: '600', marginTop: 2, lineHeight: 20 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  codBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginTop: 4,
  },
  codLabel: { fontSize: 12.5, fontWeight: '700', color: '#B45309' },
  codValue: { fontSize: 16, fontWeight: '800', color: '#B45309' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF',
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1.5, borderTopColor: '#F3F4F6',
  },
  actionBtn: { backgroundColor: COLORS.primary, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
