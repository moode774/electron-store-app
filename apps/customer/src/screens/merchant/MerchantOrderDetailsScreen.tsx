import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Linking, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BREAKPOINTS, COLORS, FONTS, ORDER_STATUS, RADIUS } from '@marketplace/shared-utils';
import { getOrderById, updateOrderStatus, cancelOrder, getCancellationReasons, getOrderPickupCode, CancellationReason, OrderDetail, supabase } from '@marketplace/shared-hooks';
import {
  getMerchantOrderStatusInfo,
  getOrderTransitionErrorMessage,
  merchantOrderProgress,
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
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 24,
  elevation: 3,
};

export default function MerchantOrderDetailsScreen({ navigation, route }: any) {
  const orderId: string = route?.params?.orderId ?? route?.params?.order?.id;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(ORDER_STATUS.PENDING);
  const [deliveryId, setDeliveryId] = useState<string | null | undefined>(undefined);
  const [updating, setUpdating] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReasons, setCancelReasons] = useState<CancellationReason[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [pickupCode, setPickupCode] = useState<string | null>(null);

  // كود تسليم الطلب للمندوب — يظهر للتاجر من مرحلة "جاهز" حتى الاستلام
  useEffect(() => {
    const needsCode = status === ORDER_STATUS.READY || status === ORDER_STATUS.ASSIGNED;
    if (!orderId || !needsCode) { setPickupCode(null); return; }
    let active = true;
    getOrderPickupCode(orderId)
      .then((code) => { if (active) setPickupCode(code || null); })
      .catch(() => { if (active) setPickupCode(null); });
    return () => { active = false; };
  }, [orderId, status]);
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isDesktop = width >= BREAKPOINTS.desktop;

  const load = useCallback(async (showLoading = false) => {
    if (!orderId) {
      setOrder(null);
      setLoadError('معرف الطلب غير موجود.');
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const [nextOrder, assignment] = await Promise.all([
        getOrderById(orderId),
        supabase.from('orders').select('delivery_id').eq('id', orderId).maybeSingle(),
      ]);
      setOrder(nextOrder);
      if (nextOrder) {
        setStatus(nextOrder.status);
        setLoadError(null);
      } else {
        setLoadError('تعذر العثور على الطلب أو لا تملك صلاحية عرضه.');
      }
      setDeliveryId(assignment.error ? undefined : ((assignment.data as { delivery_id?: string | null } | null)?.delivery_id ?? null));
    } catch {
      setLoadError('تعذر تحميل تفاصيل الطلب. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => {
    void load(true);
    if (!orderId) return undefined;

    const channel = supabase
      .channel(`merchant-order-details-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { void load(false); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load, orderId]));

  const items = order?.order_items ?? [];
  const subtotal = order?.subtotal ?? items.reduce((s, i) => s + i.total_price, 0);
  const deliveryFee = order?.delivery_fee ?? 0;
  const customerName = order?.customer?.full_name ?? 'عميل غير مسجل';
  const customerPhone = order?.customer?.phone ?? '';
  const customerAddress = order?.addresses?.full_address ?? 'عنوان غير متوفر';
  const customerCity = order?.addresses?.city ?? '';
  const paymentMethod = order?.payment_method === 'cash' ? 'الدفع عند الاستلام' : 'طريقة دفع غير نقدية';
  const notes = order?.notes || '';

  const changeStatus = async (next: string) => {
    if (!orderId || updating) return;
    setUpdating(true);
    try {
      await updateOrderStatus(orderId, next);
      await load(false);
    } catch (transitionError) {
      await load(false);
      Alert.alert('لم تتغير حالة الطلب', getOrderTransitionErrorMessage(transitionError));
    } finally {
      setUpdating(false);
    }
  };

  const openCancel = async () => {
    setShowCancel(true);
    if (cancelReasons.length === 0) {
      try { setCancelReasons(await getCancellationReasons('merchant')); } catch { /* تُعرض قائمة فارغة مع خيار سبب عام */ }
    }
  };

  const doCancel = async (reason: string) => {
    if (!orderId || cancelling) return;
    setCancelling(true);
    try {
      await cancelOrder(orderId, reason);
      setShowCancel(false);
      await load(false);
      Alert.alert('تم إلغاء الطلب', 'أُلغي الطلب وأُعيد المخزون تلقائياً وسيُشعَر العميل.');
    } catch (e) {
      await load(false);
      Alert.alert('تعذّر إلغاء الطلب', getOrderTransitionErrorMessage(e));
    } finally {
      setCancelling(false);
    }
  };

  const info = getMerchantOrderStatusInfo(status);
  const progress = merchantOrderProgress(status);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDesktop ? UI.bg : UI.bgMobile }}>
        <ActivityIndicator size="large" color={UI.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loadErrorWrap}>
        <Ionicons name="cloud-offline-outline" size={56} color={UI.textMuted} />
        <Text style={styles.loadErrorTitle}>تعذر فتح الطلب</Text>
        <Text style={styles.loadErrorText}>{loadError ?? 'لم يتم العثور على الطلب.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load(true)} accessibilityRole="button" accessibilityLabel="إعادة تحميل تفاصيل الطلب">
          <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة للطلبات">
          <Text style={styles.backLinkText}>العودة للطلبات</Text>
        </TouchableOpacity>
      </View>
    );
  }

  let dateStr = '';
  try {
    const d = new Date(order.created_at);
    dateStr = d.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' - ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    dateStr = order.created_at;
  }

  // Next action buttons logic
  let nextActionBtn: React.ReactNode = null;
  let actionNotice = '';
  if (status === ORDER_STATUS.PENDING) {
    nextActionBtn = <TouchableOpacity style={[styles.btnPrimary, updating && styles.btnDisabled]} activeOpacity={0.8} onPress={() => changeStatus(ORDER_STATUS.PREPARING)} disabled={updating} accessibilityRole="button" accessibilityLabel="قبول الطلب وبدء التجهيز" accessibilityState={{ disabled: updating, busy: updating }}>{updating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnPrimaryText}>قبول الطلب وبدء التجهيز</Text>}</TouchableOpacity>;
  } else if (status === ORDER_STATUS.PREPARING) {
    nextActionBtn = <TouchableOpacity style={[styles.btnPrimary, updating && styles.btnDisabled]} activeOpacity={0.8} onPress={() => changeStatus(ORDER_STATUS.READY)} disabled={updating} accessibilityRole="button" accessibilityLabel="تحديد الطلب جاهزًا للمندوب" accessibilityState={{ disabled: updating, busy: updating }}>{updating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnPrimaryText}>الطلب جاهز للمندوب</Text>}</TouchableOpacity>;
  } else if (status === ORDER_STATUS.READY) {
    // مسار الطلب بعد "جاهز" حصري للمندوب بحسب قواعد القاعدة —
    // التاجر لا يستطيع on_the_way أو delivered (تتطلب إثبات تسليم من مندوب).
    actionNotice = deliveryId
      ? 'تم إسناد الطلب إلى مندوب. ستتحدث الحالة تلقائيًا عند الاستلام.'
      : 'الطلب جاهز وبانتظار أن يستلمه مندوب. ستتحدث الحالة تلقائيًا.';
  } else if ([ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.ON_THE_WAY, ORDER_STATUS.RESCHEDULED].includes(status as any)) {
    actionNotice = 'الطلب الآن ضمن مسار المندوب، ولا يحتاج إلى تغيير يدوي من التاجر.';
  }

  // الإلغاء متاح للتاجر قبل أن يصبح الطلب جاهزًا (نفس قاعدة marketplace_cancel_order_as)
  const canCancel = [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING].includes(status as any);

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />
      
      {!isDesktop && (
        <View style={[styles.headerMobile, isCompact && styles.headerMobileCompact]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitleMobile}>تفاصيل الطلب</Text>
          <View style={{ width: 44 }} />
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact, isDesktop && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
        
        {isDesktop && (
          <View style={styles.pageHeaderRow}>
             <View>
               <Text style={styles.pageTitle}>تفاصيل الطلب</Text>
               <Text style={styles.pageSubtitle}>نظرة شاملة لجميع بيانات الطلب والعميل والفاتورة</Text>
             </View>
             <TouchableOpacity style={styles.backBtnDesktop} onPress={() => navigation.goBack()}>
                <Text style={styles.backBtnText}>العودة للطلبات</Text>
                <Ionicons name="arrow-back" size={16} color={UI.textDark} />
             </TouchableOpacity>
          </View>
        )}

        {/* Main Grid Wrapper */}
        <View style={[styles.gridContainer, isDesktop && { flexDirection: 'row-reverse' }]}>
          
          {/* Main Column (Receipt & Timeline) */}
          <View style={[styles.mainCol, isDesktop && { flex: 7 }]}>
            
            {/* Header Info */}
            <View style={[styles.card, isCompact && styles.cardCompact]}>
              <View style={[styles.cardHeaderRow, isCompact && styles.cardHeaderCompact]}>
                <View>
                  <Text style={styles.orderIdText}>{order.order_number}</Text>
                  <Text style={styles.dateText}>{dateStr}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: info.background }]}>
                  <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                </View>
              </View>
              {notes ? (
                <View style={styles.notesBox}>
                  <Ionicons name="reader-outline" size={18} color={UI.textDark} />
                  <Text style={styles.notesText}>{notes}</Text>
                </View>
              ) : null}
            </View>

            {/* Timeline */}
            <View style={[styles.card, isCompact && styles.cardCompact]}>
              <Text style={styles.sectionTitle}>مسار الطلب</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScrollContent}>
              <View style={[styles.timelineRow, isCompact && styles.timelineRowCompact]}>
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: progress >= 1 ? UI.orange : UI.border }]} />
                  <Text style={[styles.timelineText, { color: UI.textDark }]}>جديد</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: progress >= 2 ? UI.blue : UI.border }]} />
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: progress >= 2 ? UI.blue : UI.border }]} />
                  <Text style={[styles.timelineText, { color: progress >= 2 ? UI.textDark : UI.textMuted }]}>تجهيز</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: progress >= 3 ? '#7C3AED' : UI.border }]} />
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: progress >= 3 ? '#7C3AED' : UI.border }]} />
                  <Text style={[styles.timelineText, { color: progress >= 3 ? UI.textDark : UI.textMuted }]}>جاهز</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: progress >= 4 ? '#0369A1' : UI.border }]} />
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: progress >= 4 ? '#0369A1' : UI.border }]} />
                  <Text style={[styles.timelineText, { color: progress >= 4 ? UI.textDark : UI.textMuted }]}>التوصيل</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: progress >= 5 ? UI.green : UI.border }]} />
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: progress >= 5 ? UI.green : UI.border }]} />
                  <Text style={[styles.timelineText, { color: progress >= 5 ? UI.textDark : UI.textMuted }]}>مكتمل</Text>
                </View>
              </View>
              </ScrollView>
              {progress === 0 && (
                <Text style={styles.terminalStatusNote}>الحالة الحالية: {info.label}</Text>
              )}
            </View>

            {/* Receipt (Items) */}
            <View style={[styles.card, isCompact && styles.cardCompact]}>
              <View style={[styles.cardHeaderRow, isCompact && styles.cardHeaderCompact]}>
                <Text style={styles.sectionTitle}>المنتجات المطلوبة</Text>
                <Text style={styles.itemsCount}>{items.length} منتجات</Text>
              </View>
              <View style={styles.itemsWrapper}>
                {items.map((item, i) => (
                  <View key={item.id} style={[styles.itemRow, isCompact && styles.itemRowCompact, i < items.length - 1 && styles.borderBottom]}>
                    <View style={styles.itemImagePlaceholder}>
                      <Ionicons name="cube-outline" size={24} color={UI.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.products?.name ?? item.product_name ?? 'منتج'}</Text>
                      <Text style={styles.itemMeta}>السعر: {item.unit_price} ر.ي</Text>
                    </View>
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text style={styles.itemTotal}>{item.total_price} ر.ي</Text>
                      <Text style={styles.itemQtyBadge}>الكمية: {item.quantity}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

          </View>
          
          {/* Side Column (Customer & Payment) */}
          <View style={[styles.sideCol, isDesktop && { flex: 3 }]}>
             
             {/* Customer Box */}
             <View style={[styles.card, isCompact && styles.cardCompact]}>
               <Text style={styles.sectionTitle}>معلومات العميل</Text>
               <View style={styles.customerRow}>
                 <View style={styles.avatarBig}>
                   <Text style={styles.avatarBigText}>{customerName.substring(0, 1)}</Text>
                 </View>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.customerNameBig}>{customerName}</Text>
                 </View>
               </View>

               <View style={styles.infoList}>
                 <View style={styles.infoRow}>
                   <Ionicons name="call-outline" size={20} color={UI.textGrey} style={styles.infoIcon} />
                   <View style={{ flex: 1 }}>
                     <Text style={styles.infoLabel}>رقم الجوال</Text>
                     <Text style={styles.infoValue}>{customerPhone || 'غير متوفر'}</Text>
                   </View>
                   {!!customerPhone && (
                      <TouchableOpacity style={styles.callIconBtn} onPress={() => Linking.openURL(`tel:${customerPhone}`).catch(() => Alert.alert('تعذر الاتصال', 'لا يمكن فتح تطبيق الاتصال على هذا الجهاز.'))} accessibilityRole="button" accessibilityLabel={`الاتصال بالعميل ${customerName}`}>
                       <Ionicons name="call" size={16} color="#FFFFFF" />
                     </TouchableOpacity>
                   )}
                 </View>
                 
                 <View style={styles.infoRow}>
                   <Ionicons name="location-outline" size={20} color={UI.textGrey} style={styles.infoIcon} />
                   <View style={{ flex: 1 }}>
                     <Text style={styles.infoLabel}>عنوان التوصيل</Text>
                     <Text style={styles.infoValue}>{customerCity ? `${customerCity} - ` : ''}{customerAddress}</Text>
                   </View>
                 </View>
               </View>
             </View>

             {/* Payment Summary */}
             <View style={[styles.card, isCompact && styles.cardCompact]}>
               <Text style={styles.sectionTitle}>ملخص الدفع</Text>
               
                <View style={styles.paymentMethodBox}>
                  <Ionicons name="card-outline" size={20} color={UI.primary} />
                  <Text style={styles.paymentMethodText}>{paymentMethod} · {order.payment_status === 'paid' ? 'مدفوع' : 'غير مؤكد الدفع'}</Text>
               </View>

               <View style={styles.summaryLines}>
                 <View style={styles.summaryLine}>
                   <Text style={styles.summaryLineLabel}>المجموع الفرعي</Text>
                   <Text style={styles.summaryLineValue}>{subtotal} ر.ي</Text>
                 </View>
                 <View style={styles.summaryLine}>
                   <Text style={styles.summaryLineLabel}>رسوم التوصيل</Text>
                   <Text style={styles.summaryLineValue}>{deliveryFee} ر.ي</Text>
                 </View>
               </View>
               <View style={styles.summaryTotalLine}>
                 <Text style={styles.summaryTotalLabel}>الإجمالي المستحق</Text>
                 <Text style={styles.summaryTotalValue}>{order?.total_amount ?? (subtotal + deliveryFee)} <Text style={{ fontSize: 14 }}>ر.ي</Text></Text>
               </View>
             </View>

             {/* كود تسليم الطلب للمندوب */}
             {!!pickupCode && (
               <View style={styles.pickupCodeCard}>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.pickupCodeTitle}>كود تسليم الطلب للمندوب</Text>
                   <Text style={styles.pickupCodeHint}>لا تُعطِ الكود إلا عند تسليم الطلب للمندوب فعلياً — هو إثبات الاستلام.</Text>
                 </View>
                 <Text style={styles.pickupCodeValue}>{pickupCode}</Text>
               </View>
             )}

             {/* Actions */}
             {(nextActionBtn || actionNotice || canCancel) && (
               <View style={styles.actionsCard}>
                 {!!actionNotice && (
                   <View style={styles.waitingDriverNotice}>
                     <Ionicons name="information-circle-outline" size={20} color="#5B21B6" />
                     <Text style={styles.waitingDriverText}>{actionNotice}</Text>
                   </View>
                 )}
                 {nextActionBtn}

                 {/* إلغاء الطلب (متاح قبل مرحلة "جاهز") */}
                 {canCancel && !showCancel && (
                   <TouchableOpacity
                     style={styles.btnCancelOutline}
                     onPress={openCancel}
                     disabled={updating || cancelling}
                     activeOpacity={0.8}
                     accessibilityRole="button"
                     accessibilityLabel="إلغاء الطلب"
                   >
                     <Text style={styles.btnCancelOutlineText}>إلغاء الطلب</Text>
                   </TouchableOpacity>
                 )}
                 {canCancel && showCancel && (
                   <View style={styles.cancelReasonsCard}>
                     <Text style={styles.cancelReasonsTitle}>سبب الإلغاء</Text>
                     {(cancelReasons.length > 0
                       ? cancelReasons.map((r) => ({ key: r.id, label: r.reason_text_ar ?? 'سبب آخر' }))
                       : [
                           { key: 'out_of_stock', label: 'المنتج غير متوفر حالياً' },
                           { key: 'cannot_fulfill', label: 'تعذّر تجهيز الطلب' },
                           { key: 'other', label: 'سبب آخر' },
                         ]
                     ).map((r) => (
                       <TouchableOpacity
                         key={r.key}
                         style={styles.cancelReasonItem}
                         onPress={() => doCancel(r.label)}
                         disabled={cancelling}
                         activeOpacity={0.7}
                       >
                         <Text style={styles.cancelReasonText}>{r.label}</Text>
                         {cancelling ? <ActivityIndicator size="small" color={UI.red} /> : <Ionicons name="chevron-back" size={16} color={UI.textMuted} />}
                       </TouchableOpacity>
                     ))}
                     <TouchableOpacity onPress={() => setShowCancel(false)} disabled={cancelling} style={styles.cancelBackBtn}>
                       <Text style={styles.cancelBackText}>تراجع</Text>
                     </TouchableOpacity>
                   </View>
                 )}
               </View>
             )}

          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },
  pickupCodeCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 14, padding: 14, marginBottom: 12 },
  pickupCodeTitle: { fontSize: 14, fontWeight: '800', color: '#065F46' },
  pickupCodeHint: { fontSize: 11.5, color: '#047857', marginTop: 3, lineHeight: 17 },
  pickupCodeValue: { fontSize: 26, fontWeight: '900', color: '#065F46', letterSpacing: 6 },
  btnCancelOutline: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: UI.red, marginTop: 10 },
  btnCancelOutlineText: { color: UI.red, fontSize: 14, fontWeight: '800' },
  cancelReasonsCard: { marginTop: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 12, padding: 12, backgroundColor: '#FFFFFF' },
  cancelReasonsTitle: { fontSize: 14, fontWeight: '800', color: UI.textDark, marginBottom: 6 },
  cancelReasonItem: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: UI.border },
  cancelReasonText: { fontSize: 13.5, fontWeight: '600', color: UI.textDark },
  cancelBackBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBackText: { color: UI.textMuted, fontSize: 13, fontWeight: '700' },
  loadErrorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bgMobile, padding: 24, gap: 14 },
  loadErrorTitle: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  loadErrorText: { fontSize: 14, color: UI.textGrey, textAlign: 'center', lineHeight: 21 },
  retryBtn: { minHeight: 44, justifyContent: 'center', backgroundColor: UI.primary, borderRadius: 12, paddingHorizontal: 24 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  backLinkText: { color: UI.textGrey, fontSize: 14, fontWeight: '700', padding: 8 },
  
  headerMobile: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: UI.border },
  headerMobileCompact: { paddingHorizontal: 14 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontFamily: FONTS.bold, color: UI.textDark },
  
  scrollContent: { padding: 20, paddingBottom: 100 },
  scrollContentCompact: { paddingHorizontal: 14 },
  scrollContentDesktop: { padding: 40, alignItems: 'center' },
  
  pageHeaderRow: { width: '100%', maxWidth: 1200, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  backBtnDesktop: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border, ...softShadow },
  backBtnText: { fontSize: 13, fontWeight: '700', color: UI.textDark },

  gridContainer: { width: '100%', maxWidth: 1280, gap: 24, flexDirection: 'column' },
  mainCol: { gap: 16 },
  sideCol: { gap: 16 },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 24, borderWidth: 1, borderColor: UI.border, ...softShadow },
  cardCompact: { padding: 14, borderRadius: RADIUS.md },
  cardHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  
  orderIdText: { fontSize: 22, fontWeight: '900', color: UI.textDark, textAlign: 'right' },
  dateText: { fontSize: 13, color: UI.textGrey, marginTop: 4, textAlign: 'right' },
  
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 },
  badgeText: { fontSize: 13, fontWeight: '800' },
  
  notesBox: { marginTop: 16, padding: 16, backgroundColor: '#FEF3C7', borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  notesText: { flex: 1, fontSize: 13, color: '#92400E', textAlign: 'right', lineHeight: 20, fontWeight: '600' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: UI.textDark, marginBottom: 20, textAlign: 'right' },
  
  timelineRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  timelineScrollContent: { minWidth: '100%' },
  timelineRowCompact: { minWidth: 480, paddingHorizontal: 4 },
  timelineStep: { alignItems: 'center', gap: 8 },
  timelineDot: { width: 14, height: 14, borderRadius: 7 },
  timelineText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  timelineLine: { height: 2, flex: 1, marginHorizontal: 4, marginTop: -20 },
  terminalStatusNote: { marginTop: 14, color: UI.textGrey, textAlign: 'center', fontSize: 13, fontWeight: '700' },

  itemsCount: { fontSize: 13, fontWeight: '600', color: UI.textMuted },
  itemsWrapper: { marginTop: 8 },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 16, gap: 16 },
  itemRowCompact: { flexWrap: 'wrap', gap: 12 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: UI.border },
  itemImagePlaceholder: { width: 56, height: 56, borderRadius: 12, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  itemMeta: { fontSize: 13, color: UI.textGrey, marginTop: 4, textAlign: 'right' },
  itemTotal: { fontSize: 16, fontWeight: '800', color: UI.primary, textAlign: 'left' },
  itemQtyBadge: { fontSize: 12, fontWeight: '700', color: UI.textGrey, backgroundColor: UI.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' },

  customerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatarBig: { width: 56, height: 56, borderRadius: 28, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  avatarBigText: { fontSize: 20, fontWeight: '800', color: UI.textGrey },
  customerNameBig: { fontSize: 18, fontWeight: '800', color: UI.textDark, textAlign: 'right' },

  infoList: { gap: 16 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  infoIcon: { marginTop: 2 },
  infoLabel: { fontSize: 12, color: UI.textGrey, textAlign: 'right', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: UI.textDark, textAlign: 'right', lineHeight: 20 },
  callIconBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: UI.primary, alignItems: 'center', justifyContent: 'center' },

  paymentMethodBox: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: UI.border, marginBottom: 20 },
  paymentMethodText: { fontSize: 14, fontWeight: '700', color: UI.textDark },
  
  summaryLines: { gap: 12, borderBottomWidth: 1, borderBottomColor: UI.border, paddingBottom: 16, marginBottom: 16 },
  summaryLine: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  summaryLineLabel: { fontSize: 14, color: UI.textGrey, fontWeight: '600' },
  summaryLineValue: { fontSize: 15, fontWeight: '800', color: UI.textDark },
  
  summaryTotalLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  summaryTotalLabel: { fontSize: 16, fontWeight: '900', color: UI.textDark },
  summaryTotalValue: { fontSize: 24, fontWeight: '900', color: UI.primary },

  actionsCard: { padding: 24, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: UI.border, ...softShadow, gap: 12 },
  btnPrimary: { height: 52, backgroundColor: UI.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  waitingDriverNotice: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 14, padding: 15 },
  waitingDriverText: { flex: 1, color: '#5B21B6', fontSize: 14, fontWeight: '700', textAlign: 'right' },
});
