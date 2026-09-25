import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS, ORDER_STATUS, RADIUS } from '@marketplace/shared-utils';
import { getOrderById, updateOrderStatus, cancelOrder, getCancellationReasons, getOrderPickupCode, CancellationReason, OrderDetail, supabase } from '@marketplace/shared-hooks';
import {
  getMerchantOrderStatusInfo,
  getOrderTransitionErrorMessage,
  merchantOrderProgress,
} from './merchantOrderState';
import { Banner, EmptyState, ScreenHeader, StatusPill, card, formatDate, formatMoney, paymentLabel, ui, useIsDesktop } from './merchantUi';

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
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();

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
  const taxAmount = Number(order?.tax_amount ?? 0);
  const discountAmount = Number(order?.discount_amount ?? 0);
  const customerName = order?.customer?.full_name ?? 'عميل غير مسجل';
  const customerPhone = order?.customer?.phone ?? '';
  const customerAddress = order?.addresses?.full_address ?? 'عنوان غير متوفر';
  const customerCity = order?.addresses?.city ?? '';
  const paymentMethod = paymentLabel(order?.payment_method);
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
      <View style={[ui.screen, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title="تفاصيل الطلب" onBack={() => navigation.goBack()} />
        <View style={ui.content}>
          <EmptyState
            icon="cloud-offline-outline"
            title="تعذر فتح الطلب"
            text={loadError ?? 'لم يتم العثور على الطلب.'}
            action={{ label: 'إعادة المحاولة', onPress: () => void load(true) }}
          />
        </View>
      </View>
    );
  }

  const primaryAction = status === ORDER_STATUS.PENDING || status === ORDER_STATUS.CONFIRMED
    ? { label: status === ORDER_STATUS.PENDING ? 'قبول الطلب وبدء التجهيز' : 'بدء التجهيز', next: ORDER_STATUS.PREPARING, icon: 'checkmark' as const }
    : status === ORDER_STATUS.PREPARING
      ? { label: 'الطلب جاهز للمندوب', next: ORDER_STATUS.READY, icon: 'bag-check-outline' as const }
      : null;

  // After "ready" the order belongs to the courier flow (pickup code, proof of
  // delivery), so the store only watches it.
  let actionNotice = '';
  if (status === ORDER_STATUS.READY) {
    actionNotice = deliveryId
      ? 'تم إسناد الطلب إلى مندوب. ستتحدث الحالة تلقائيًا عند الاستلام.'
      : 'الطلب جاهز وبانتظار أن يستلمه مندوب. ستتحدث الحالة تلقائيًا.';
  } else if ([ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.ON_THE_WAY, ORDER_STATUS.RESCHEDULED].includes(status as any)) {
    actionNotice = 'الطلب الآن ضمن مسار المندوب، ولا يحتاج إلى تغيير يدوي من التاجر.';
  }

  // Same rule as marketplace_cancel_order_as: the store may cancel before "ready".
  const canCancel = [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING].includes(status as any);
  const itemsCount = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
  const steps = ['جديد', 'تجهيز', 'جاهز', 'التوصيل', 'مكتمل'];

  const callCustomer = () =>
    Linking.openURL(`tel:${customerPhone}`).catch(() => Alert.alert('تعذر الاتصال', 'لا يمكن فتح تطبيق الاتصال على هذا الجهاز.'));

  const actionButton = primaryAction ? (
    <TouchableOpacity
      style={[ui.primaryBtn, styles.flex, updating && styles.busy]}
      onPress={() => void changeStatus(primaryAction.next)}
      disabled={updating || cancelling}
      accessibilityRole="button"
      accessibilityLabel={primaryAction.label}
      accessibilityState={{ disabled: updating, busy: updating }}
    >
      {updating ? <ActivityIndicator color={COLORS.surface} /> : <Ionicons name={primaryAction.icon} size={18} color={COLORS.surface} />}
      <Text style={ui.primaryBtnText}>{primaryAction.label}</Text>
    </TouchableOpacity>
  ) : null;

  const cancelButton = canCancel && !showCancel ? (
    <TouchableOpacity
      style={styles.cancelBtn}
      onPress={openCancel}
      disabled={updating || cancelling}
      accessibilityRole="button"
      accessibilityLabel="إلغاء الطلب"
    >
      <Text style={styles.cancelBtnText}>إلغاء</Text>
    </TouchableOpacity>
  ) : null;

  const pickupCard = pickupCode ? (
    <View style={styles.pickup}>
      <View style={styles.pickupIcon}><Ionicons name="key-outline" size={20} color={COLORS.primary} /></View>
      <View style={styles.flexEnd}>
        <Text style={styles.pickupTitle}>كود التسليم للمندوب</Text>
        <Text style={styles.pickupHint}>أعطه للمندوب فقط عند تسليم الطلب فعلياً.</Text>
      </View>
      <Text style={styles.pickupCode} selectable>{pickupCode}</Text>
    </View>
  ) : null;

  const cancelReasonsCard = canCancel && showCancel ? (
    <View style={ui.card}>
      <Text style={[ui.cardTitle, styles.mb8]}>سبب الإلغاء</Text>
      <Text style={[ui.muted, styles.mb8]}>سيُعاد المخزون تلقائياً ويُشعَر العميل.</Text>
      {(cancelReasons.length > 0
        ? cancelReasons.map((r) => ({ key: r.id, label: r.reason_text_ar ?? 'سبب آخر' }))
        : [
          { key: 'out_of_stock', label: 'المنتج غير متوفر حالياً' },
          { key: 'cannot_fulfill', label: 'تعذّر تجهيز الطلب' },
          { key: 'other', label: 'سبب آخر' },
        ]
      ).map((r) => (
        <TouchableOpacity key={r.key} style={styles.reason} onPress={() => void doCancel(r.label)} disabled={cancelling} accessibilityRole="button" accessibilityLabel={r.label}>
          <Text style={styles.reasonText}>{r.label}</Text>
          {cancelling ? <ActivityIndicator size="small" color={COLORS.error} /> : <Ionicons name="chevron-back" size={16} color={COLORS.inkTertiary} />}
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => setShowCancel(false)} disabled={cancelling} style={styles.reasonBack} accessibilityRole="button" accessibilityLabel="تراجع">
        <Text style={styles.reasonBackText}>تراجع</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  const timeline = (
    <View style={ui.card}>
      <Text style={[ui.cardTitle, styles.mb12]}>مسار الطلب</Text>
      <View style={styles.steps}>
        {steps.map((label, i) => {
          const done = progress >= i + 1;
          const current = progress === i + 1;
          return (
            <View key={label} style={styles.step}>
              <View style={[styles.stepDot, done && styles.stepDotDone, current && styles.stepDotCurrent]}>
                {done && !current ? <Ionicons name="checkmark" size={12} color={COLORS.surface} /> : null}
              </View>
              <Text style={[styles.stepText, done && styles.stepTextDone]}>{label}</Text>
              {i < steps.length - 1 ? <View style={[styles.stepLine, progress >= i + 2 && styles.stepLineDone]} /> : null}
            </View>
          );
        })}
      </View>
      {progress === 0 ? <Text style={[ui.muted, styles.centerText]}>الحالة الحالية: {info.label}</Text> : null}
    </View>
  );

  const itemsCard = (
    <View style={ui.card}>
      <View style={[ui.row, styles.between, styles.mb8]}>
        <Text style={ui.cardTitle}>المنتجات</Text>
        <Text style={ui.muted}>{itemsCount} قطعة</Text>
      </View>
      {items.map((item, i) => (
        <View key={item.id} style={[styles.item, i < items.length - 1 && styles.itemDivider]}>
          <View style={styles.qty}><Text style={styles.qtyText}>×{item.quantity}</Text></View>
          <View style={styles.flexEnd}>
            <Text style={styles.itemName} numberOfLines={2}>{item.products?.name ?? item.product_name ?? 'منتج'}</Text>
            <Text style={ui.muted}>{formatMoney(item.unit_price)} ر.ي للقطعة</Text>
          </View>
          <Text style={styles.itemTotal}>{formatMoney(item.total_price)}</Text>
        </View>
      ))}
    </View>
  );

  const customerCard = (
    <View style={ui.card}>
      <Text style={[ui.cardTitle, styles.mb12]}>العميل</Text>
      <View style={[ui.row, styles.mb12]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{customerName.substring(0, 1)}</Text></View>
        <View style={styles.flexEnd}>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={ui.muted}>{customerPhone || 'رقم غير متوفر'}</Text>
        </View>
        {customerPhone ? (
          <TouchableOpacity style={styles.call} onPress={callCustomer} accessibilityRole="button" accessibilityLabel={`الاتصال بالعميل ${customerName}`}>
            <Ionicons name="call" size={16} color={COLORS.surface} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.address}>
        <Ionicons name="location-outline" size={16} color={COLORS.inkSecondary} />
        <Text style={styles.addressText}>{customerCity ? `${customerCity} - ` : ''}{customerAddress}</Text>
      </View>
    </View>
  );

  const paymentCard = (
    <View style={ui.card}>
      <View style={[ui.row, styles.between, styles.mb12]}>
        <Text style={ui.cardTitle}>الدفع</Text>
        <StatusPill
          label={order.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع بعد'}
          color={order.payment_status === 'paid' ? '#15803D' : '#B45309'}
          background={order.payment_status === 'paid' ? '#DCFCE7' : COLORS.warningSoft}
        />
      </View>
      <Text style={[ui.text, styles.mb12]}>{paymentMethod}</Text>
      {[
        { label: 'المجموع الفرعي', value: subtotal },
        { label: 'رسوم التوصيل', value: deliveryFee },
        ...(discountAmount > 0 ? [{ label: 'الخصم', value: -discountAmount }] : []),
        ...(taxAmount > 0 ? [{ label: 'الضريبة', value: taxAmount }] : []),
      ].map((line) => (
        <View key={line.label} style={styles.line}>
          <Text style={ui.text}>{line.label}</Text>
          <Text style={[styles.lineValue, line.value < 0 && { color: '#15803D' }]}>{line.value < 0 ? `- ${formatMoney(-line.value)}` : formatMoney(line.value)} ر.ي</Text>
        </View>
      ))}
      <View style={styles.totalLine}>
        <Text style={styles.totalLabel}>الإجمالي</Text>
        <Text style={styles.totalValue}>{formatMoney(order.total_amount ?? (subtotal + deliveryFee + taxAmount - discountAmount))} <Text style={styles.totalCurrency}>ر.ي</Text></Text>
      </View>
    </View>
  );

  const notesCard = notes ? (
    <View style={styles.notes}>
      <Ionicons name="chatbox-ellipses-outline" size={18} color="#92400E" />
      <View style={styles.flexEnd}>
        <Text style={styles.notesTitle}>ملاحظة العميل</Text>
        <Text style={styles.notesText}>{notes}</Text>
      </View>
    </View>
  ) : null;

  const hasActions = !!(actionButton || cancelButton);

  return (
    <View style={ui.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenHeader
        title={`#${order.order_number}`}
        subtitle={formatDate(order.created_at, true)}
        onBack={() => navigation.goBack()}
        right={<StatusPill label={info.label} color={info.color} background={info.background} icon={info.icon} />}
      />

      <ScrollView contentContainerStyle={[ui.content, isDesktop && ui.contentDesktop, !isDesktop && hasActions && styles.padForBar]} showsVerticalScrollIndicator={false}>
        {loadError ? <Banner text={loadError} tone="warning" actionLabel="تحديث" onAction={() => void load(false)} /> : null}
        {isDesktop ? (
          <View style={styles.grid}>
            <View style={styles.main}>
              {timeline}
              {notesCard}
              {itemsCard}
            </View>
            <View style={styles.side}>
              {pickupCard}
              {actionNotice ? <Banner text={actionNotice} tone="info" /> : null}
              {hasActions ? <View style={[ui.card, styles.actionsCard]}>{actionButton}{cancelButton}</View> : null}
              {cancelReasonsCard}
              {customerCard}
              {paymentCard}
            </View>
          </View>
        ) : (
          <>
            {pickupCard}
            {actionNotice ? <Banner text={actionNotice} tone="info" /> : null}
            {cancelReasonsCard}
            {timeline}
            {notesCard}
            {itemsCard}
            {customerCard}
            {paymentCard}
          </>
        )}
      </ScrollView>

      {!isDesktop && hasActions ? (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {actionButton}
          {cancelButton}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center', marginTop: 10 },
  flex: { flex: 1 },
  flexEnd: { flex: 1, alignItems: 'flex-end' },
  between: { justifyContent: 'space-between' },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  busy: { opacity: 0.6 },
  padForBar: { paddingBottom: 120 },

  grid: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 20 },
  main: { flex: 7, gap: 14 },
  side: { flex: 4, gap: 14 },
  actionsCard: { flexDirection: 'row-reverse', gap: 10 },

  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row-reverse', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.hairline,
  },
  cancelBtn: {
    minWidth: 88, minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#FECACA',
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  cancelBtnText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.error },

  pickup: {
    ...card, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14,
    borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: COLORS.primarySoft,
  },
  pickupIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  pickupTitle: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  pickupHint: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'right', marginTop: 2 },
  pickupCode: { fontSize: 26, fontFamily: FONTS.bold, color: COLORS.primary, letterSpacing: 5 },

  steps: { flexDirection: 'row-reverse' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.hairline,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  stepDotDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepDotCurrent: { backgroundColor: COLORS.surface, borderColor: COLORS.primary, borderWidth: 6 },
  stepText: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.inkTertiary },
  stepTextDone: { color: COLORS.ink, fontFamily: FONTS.semiBold },
  stepLine: { position: 'absolute', top: 10, left: '-50%', right: '50%', height: 2, backgroundColor: COLORS.hairline },
  stepLineDone: { backgroundColor: COLORS.primary },

  item: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12 },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.hairline },
  qty: { minWidth: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  qtyText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.primary },
  itemName: { fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right' },
  itemTotal: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.ink },

  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.primary },
  customerName: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  call: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.statusOnline, alignItems: 'center', justifyContent: 'center' },
  address: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, backgroundColor: COLORS.canvas, borderRadius: RADIUS.md, padding: 12 },
  addressText: { flex: 1, fontSize: 13, fontFamily: FONTS.medium, color: COLORS.ink, textAlign: 'right', lineHeight: 20 },

  line: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 5 },
  lineValue: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.ink },
  totalLine: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.hairline,
  },
  totalLabel: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink },
  totalValue: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.primary },
  totalCurrency: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.inkSecondary },

  notes: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: RADIUS.lg, padding: 14 },
  notesTitle: { fontSize: 13, fontFamily: FONTS.bold, color: '#92400E', textAlign: 'right' },
  notesText: { fontSize: 13, fontFamily: FONTS.medium, color: '#92400E', textAlign: 'right', lineHeight: 20, marginTop: 2 },

  reason: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderBottomWidth: 1, borderBottomColor: COLORS.hairline },
  reasonText: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.ink },
  reasonBack: { alignItems: 'center', paddingTop: 12 },
  reasonBackText: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.inkSecondary },
});
