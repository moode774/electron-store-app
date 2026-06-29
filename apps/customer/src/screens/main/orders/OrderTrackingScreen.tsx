import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LiveTrackingMap from '../../../components/LiveTrackingMap';
import { COLORS, SPACING, FONT_SIZE, RADIUS, ORDER_STATUS, formatPrice, haversineKm, estimateRoadKm, estimateEtaMinutes, formatEtaRange, formatRelativeTime, hasValidCoords } from '@marketplace/shared-utils';
import { useAuthStore, getOrderById, createReview, getCancellationReasons, cancelOrder, createRefundRequest, createComplaint, subscribeToDeliveryLocation, getLatestDeliveryLocation, CancellationReason, OrderDetail, DeliveryLocation } from '@marketplace/shared-hooks';

const TRACKING_STEPS: { status: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { status: ORDER_STATUS.PENDING, label: 'بانتظار تأكيد المتجر', icon: 'hourglass-outline' },
  { status: ORDER_STATUS.PREPARING, label: 'المتجر يجهّز الطلب', icon: 'cube-outline' },
  { status: ORDER_STATUS.READY, label: 'بانتظار المندوب', icon: 'bicycle-outline' },
  { status: ORDER_STATUS.ASSIGNED, label: 'تم قبول التوصيل', icon: 'checkmark-circle-outline' },
  { status: ORDER_STATUS.PICKED_UP, label: 'استلم المندوب الطلب', icon: 'cube-outline' },
  { status: ORDER_STATUS.ON_THE_WAY, label: 'في الطريق إليك', icon: 'navigate-outline' },
  { status: ORDER_STATUS.DELIVERED, label: 'تم التسليم', icon: 'checkmark-done-outline' },
];

export default function OrderTrackingScreen({ navigation, route }: any) {
  const { orderId } = route.params;
  const user = useAuthStore((s) => s.user);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [showCancel, setShowCancel] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showComplaint, setShowComplaint] = useState(false);
  const [courierLoc, setCourierLoc] = useState<DeliveryLocation | null>(null);

  const reload = () => getOrderById(orderId).then((data) => { setOrder(data); setLoading(false); });

  useEffect(() => {
    reload();
    getCancellationReasons('customer').then(setReasons).catch(() => {});
  }, [orderId]);

  // تتبّع موقع المندوب المباشر أثناء النقل
  const inTransit = order ? ['assigned', 'picked_up', 'on_the_way'].includes(order.status) : false;
  useEffect(() => {
    if (!inTransit) return;
    getLatestDeliveryLocation(orderId).then((l) => { if (l) setCourierLoc(l); }).catch(() => {});
    const unsub = subscribeToDeliveryLocation(orderId, setCourierLoc);
    return unsub;
  }, [orderId, inTransit]);

  // مسافة ووقت وصول المندوب للعميل (عند توفّر الإحداثيات)
  const dest = order?.addresses;
  const destPoint = hasValidCoords(dest) ? { latitude: dest.latitude!, longitude: dest.longitude! } : null;
  const courierPoint = courierLoc ? { latitude: courierLoc.latitude, longitude: courierLoc.longitude } : null;
  const liveTrack = (() => {
    if (!courierLoc || !hasValidCoords(dest)) return null;
    const km = haversineKm(courierLoc, { latitude: dest.latitude!, longitude: dest.longitude! });
    const eta = estimateEtaMinutes(estimateRoadKm(courierLoc, { latitude: dest.latitude!, longitude: dest.longitude! }), { prepMinutes: 0 });
    return { km, eta, updatedAt: courierLoc.recorded_at };
  })();

  const canCancel = order && ['pending', 'preparing'].includes(order.status);

  const doCancel = async (reason: string) => {
    setShowCancel(false);
    try { await cancelOrder(orderId, reason); await reload(); Alert.alert('تم الإلغاء', 'تم إلغاء طلبك'); }
    catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإلغاء'); }
  };

  const requestRefund = async (reason: string) => {
    if (!user?.id) return;
    setShowRefund(false);
    try {
      await createRefundRequest({ order_id: orderId, customer_id: user.id, reason, refund_amount: order?.total_amount ?? 0 });
      Alert.alert('تم الإرسال', 'تم إرسال طلب الاسترجاع وسيُراجَع قريباً');
    } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإرسال'); }
  };

  const REFUND_REASONS = [
    { value: 'damaged', label: 'المنتج تالف' },
    { value: 'not_as_described', label: 'مختلف عن الوصف' },
    { value: 'not_received', label: 'لم يصلني الطلب' },
    { value: 'wrong_item', label: 'منتج خاطئ' },
    { value: 'other', label: 'سبب آخر' },
  ];

  const COMPLAINT_CATEGORIES = [
    { value: 'late_delivery', label: 'تأخّر في التوصيل' },
    { value: 'product_quality', label: 'جودة المنتج' },
    { value: 'bad_service', label: 'سوء تعامل' },
    { value: 'missing_items', label: 'نقص في الطلب' },
    { value: 'other', label: 'أخرى' },
  ];

  const submitComplaint = async (category: string, label: string) => {
    if (!user?.id) return;
    setShowComplaint(false);
    // شكاوى التوصيل تُوجَّه للمندوب (إن وُجد)، والباقي للمتجر
    const isDeliveryIssue = (category === 'late_delivery' || category === 'bad_service') && !!order?.delivery_id;
    try {
      await createComplaint({
        complainant_id: user.id,
        order_id: orderId,
        against_id: isDeliveryIssue ? (order?.delivery_id ?? undefined) : order?.merchant_id,
        against_type: isDeliveryIssue ? 'delivery' : 'merchant',
        category,
        title: `شكوى: ${label}`,
        description: `شكوى بخصوص الطلب ${order?.order_number ?? orderId} — ${label}`,
      });
      Alert.alert('تم استلام شكواك', 'سنراجع شكواك ونعود إليك في أقرب وقت');
    } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال الشكوى'); }
  };

  const submitReview = async () => {
    if (!user?.id || !order?.merchant_id || rating === 0) return;
    setSubmittingReview(true);
    try {
      await createReview({
        reviewer_id: user.id,
        order_id: order.id,
        target_type: 'merchant',
        target_id: order.merchant_id,
        rating,
      });
      setReviewed(true);
      Alert.alert('شكراً لك', 'تم إرسال تقييمك بنجاح');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال التقييم');
    } finally {
      setSubmittingReview(false);
    }
  };

  const statusIndex = TRACKING_STEPS.findIndex((s) => s.status === (order?.status ?? ORDER_STATUS.PENDING));
  const currentStatusIndex = statusIndex >= 0 ? statusIndex : 0;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-forward" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تتبع الطلب</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* Map / Live Tracking */}
        <View style={styles.mapContainer}>
          {destPoint ? (
            <LiveTrackingMap courier={courierPoint} destination={destPoint} height={250} style={styles.mapFill} />
          ) : null}
          {/* بديل أو طبقة معلومات فوق الخريطة */}
          {!destPoint && (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map-outline" size={44} color="#9CA3AF" />
              <Text style={styles.mapText}>
                {inTransit ? 'بانتظار تحديد موقع المندوب…' : 'يظهر تتبّع المندوب المباشر هنا عند انطلاق التوصيل'}
              </Text>
            </View>
          )}
          {liveTrack && (
            <View style={styles.liveBox}>
              <View style={styles.liveDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.liveTitle}>المندوب على بُعد {liveTrack.km.toFixed(1)} كم</Text>
                <Text style={styles.liveEta}>الوصول خلال {formatEtaRange(liveTrack.eta)} · حُدّث {formatRelativeTime(liveTrack.updatedAt)}</Text>
              </View>
              <Ionicons name="bicycle" size={22} color="#2563EB" />
            </View>
          )}
        </View>

        {/* Order Info Summary */}
        <View style={styles.infoCard}>
          <Text style={styles.orderId}>طلب رقم: {order?.order_number ?? orderId}</Text>
          <Text style={styles.estimatedTime}>المبلغ الإجمالي: {formatPrice(order?.total_amount ?? 0)}</Text>
        </View>

        {/* إلغاء الطلب */}
        {canCancel && !showCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCancel(true)} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>إلغاء الطلب</Text>
          </TouchableOpacity>
        )}
        {showCancel && (
          <View style={styles.reasonsCard}>
            <Text style={styles.reasonsTitle}>سبب الإلغاء</Text>
            {reasons.map((r) => (
              <TouchableOpacity key={r.id} style={styles.reasonItem} onPress={() => doCancel(r.reason_text_ar ?? '')} activeOpacity={0.7}>
                <Text style={styles.reasonText}>{r.reason_text_ar}</Text>
                <Text style={styles.reasonArrow}>‹</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowCancel(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>تراجع</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* طلب استرجاع بعد التسليم */}
        {order?.status === ORDER_STATUS.DELIVERED && !showRefund && (
          <TouchableOpacity style={styles.refundBtn} onPress={() => setShowRefund(true)} activeOpacity={0.8}>
            <Text style={styles.refundBtnText}>طلب استرجاع / إرجاع</Text>
          </TouchableOpacity>
        )}
        {showRefund && (
          <View style={styles.reasonsCard}>
            <Text style={styles.reasonsTitle}>سبب الاسترجاع</Text>
            {REFUND_REASONS.map((r) => (
              <TouchableOpacity key={r.value} style={styles.reasonItem} onPress={() => requestRefund(r.value)} activeOpacity={0.7}>
                <Text style={styles.reasonText}>{r.label}</Text>
                <Text style={styles.reasonArrow}>‹</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowRefund(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>تراجع</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* تقديم شكوى (متاح دائماً) */}
        {!showComplaint && !showCancel && !showRefund && (
          <TouchableOpacity style={styles.complaintBtn} onPress={() => setShowComplaint(true)} activeOpacity={0.8}>
            <Text style={styles.complaintBtnText}>تقديم شكوى عن هذا الطلب</Text>
          </TouchableOpacity>
        )}
        {showComplaint && (
          <View style={styles.reasonsCard}>
            <Text style={styles.reasonsTitle}>نوع الشكوى</Text>
            {COMPLAINT_CATEGORIES.map((c) => (
              <TouchableOpacity key={c.value} style={styles.reasonItem} onPress={() => submitComplaint(c.value, c.label)} activeOpacity={0.7}>
                <Text style={styles.reasonText}>{c.label}</Text>
                <Text style={styles.reasonArrow}>‹</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowComplaint(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>تراجع</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tracking Timeline */}
        <View style={styles.timelineContainer}>
          {TRACKING_STEPS.map((step, index) => {
            const isDELIVERED = index < currentStatusIndex;
            const isCurrent = index === currentStatusIndex;
            
            return (
              <View key={step.status} style={styles.timelineStep}>
                <View style={styles.timelineIconContainer}>
                  <View style={[
                    styles.timelineIconWrap,
                    isDELIVERED ? styles.iconDELIVERED : isCurrent ? styles.iconCurrent : styles.iconPending
                  ]}>
                    <Ionicons name={step.icon} size={16} color={isDELIVERED ? '#FFFFFF' : isCurrent ? COLORS.primary : COLORS.textMuted} />
                  </View>
                  {index < TRACKING_STEPS.length - 1 && (
                    <View style={[
                      styles.timelineLine,
                      isDELIVERED ? styles.lineDELIVERED : styles.linePending
                    ]} />
                  )}
                </View>
                
                <View style={styles.timelineContent}>
                  <Text style={[
                    styles.stepLabel,
                    isCurrent && styles.stepLabelCurrent,
                    !isDELIVERED && !isCurrent && styles.stepLabelPending
                  ]}>
                    {step.label}
                  </Text>
                  {isCurrent && (
                    <Text style={styles.stepDesc}>المندوب في طريقه إليك، يرجى التواجد في الموقع.</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* تقييم الطلب عند التسليم */}
        {order?.status === ORDER_STATUS.DELIVERED && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>قيّم تجربتك مع المتجر</Text>
            {reviewed ? (
              <Text style={styles.reviewThanks}>شكراً لتقييمك</Text>
            ) : (
              <>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
                      <Text style={[styles.star, s <= rating && styles.starActive]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.reviewBtn, (rating === 0 || submittingReview) && { opacity: 0.5 }]}
                  onPress={submitReview}
                  disabled={rating === 0 || submittingReview}
                  activeOpacity={0.8}
                >
                  {submittingReview
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Text style={styles.reviewBtnText}>إرسال التقييم</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: 60, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, zIndex: 10 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: COLORS.background },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'El Messiri' },
  reviewCard: { backgroundColor: COLORS.surface, margin: SPACING.md, padding: 20, borderRadius: RADIUS.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  reviewTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 14 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  star: { fontSize: 36, color: '#E5E7EB' },
  starActive: { color: '#FBBF24' },
  reviewBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 32, height: 46, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', minWidth: 160 },
  reviewBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  reviewThanks: { fontSize: 14, fontWeight: '700', color: '#059669' },
  cancelBtn: { marginHorizontal: SPACING.md, marginTop: 12, paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: '#EF4444', alignItems: 'center' },
  cancelBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 14 },
  refundBtn: { marginHorizontal: SPACING.md, marginTop: 12, paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: '#D97706', alignItems: 'center' },
  refundBtnText: { color: '#D97706', fontWeight: '800', fontSize: 14 },
  complaintBtn: { marginHorizontal: SPACING.md, marginTop: 12, paddingVertical: 14, borderRadius: RADIUS.md, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' },
  complaintBtnText: { color: COLORS.textSecondary, fontWeight: '800', fontSize: 14 },
  reasonsCard: { backgroundColor: COLORS.surface, margin: SPACING.md, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  reasonsTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8 },
  reasonItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  reasonText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' },
  reasonArrow: { fontSize: 20, color: '#D1D5DB' },
  mapContainer: { height: 250, backgroundColor: '#EEF2F6', alignItems: 'center', justifyContent: 'center' },
  mapFill: { ...StyleSheet.absoluteFillObject, width: '100%', height: 250 },
  mapPlaceholder: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  mapText: { color: COLORS.textSecondary, marginTop: 10, fontWeight: '600', textAlign: 'center' },
  liveBox: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.96)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#059669' },
  liveTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  liveEta: { fontSize: 12, fontWeight: '600', color: '#059669', marginTop: 3 },
  driverPin: { position: 'absolute', top: 100, left: '40%', width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 5 },
  infoCard: { margin: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginTop: -30 },
  orderId: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4, fontFamily: 'El Messiri' },
  estimatedTime: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  timelineContainer: { padding: SPACING.md, backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, borderRadius: RADIUS.lg },
  timelineStep: { flexDirection: 'row', minHeight: 70 },
  timelineIconContainer: { alignItems: 'center', width: 40, marginRight: 16 },
  timelineIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stepIcon: { fontSize: 16 },
  iconDELIVERED: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  iconCurrent: { backgroundColor: COLORS.surface, borderColor: COLORS.primary },
  iconPending: { backgroundColor: COLORS.background, borderColor: COLORS.border },
  timelineLine: { width: 2, flex: 1, marginVertical: 4 },
  lineDELIVERED: { backgroundColor: COLORS.success },
  linePending: { backgroundColor: COLORS.border },
  timelineContent: { flex: 1, paddingTop: 6 },
  stepLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  stepLabelCurrent: { color: COLORS.primary, fontSize: 15, fontFamily: 'El Messiri' },
  stepLabelPending: { color: COLORS.textMuted, fontWeight: '500' },
  stepDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
});
