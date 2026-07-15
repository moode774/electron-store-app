import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../../../components/appAlert';
import CustomerPhysicalReturnPanel from './CustomerPhysicalReturnPanel';
import { COLORS, SPACING, FONT_SIZE, RADIUS, ORDER_STATUS } from '@marketplace/shared-utils';
import { useAuthStore, getOrderById, createReview, getCancellationReasons, cancelOrder, createRefundRequest, getMyRefundRequests, createSupportTicket, getOrCreateConversation, CancellationReason, OrderDetail, supabase } from '@marketplace/shared-hooks';

const TRACKING_STEPS = [
  { status: ORDER_STATUS.PENDING, label: 'بانتظار تأكيد المتجر', icon: '⏳' },
  { status: ORDER_STATUS.PREPARING, label: 'المتجر يجهز الطلب', icon: '📦' },
  { status: ORDER_STATUS.READY, label: 'بانتظار المندوب', icon: '🛵' },
  { status: ORDER_STATUS.ASSIGNED, label: 'تم قبول التوصيل', icon: '✅' },
  { status: ORDER_STATUS.ON_THE_WAY, label: 'في الطريق إليك', icon: '📍' },
  { status: ORDER_STATUS.DELIVERED, label: 'تم التسليم', icon: '🎉' },
];

// كل حالات الطلب مُسندة لخطوة في الخط الزمني — الحالات الوسيطة
// (confirmed, picked_up...) كانت سابقاً تسقط للخطوة 0 وتضلّل العميل
const STATUS_STEP_INDEX: Record<string, number> = {
  [ORDER_STATUS.PENDING]: 0,
  [ORDER_STATUS.CONFIRMED]: 1,
  [ORDER_STATUS.PREPARING]: 1,
  [ORDER_STATUS.READY]: 2,
  [ORDER_STATUS.ASSIGNED]: 3,
  [ORDER_STATUS.PICKED_UP]: 4,
  [ORDER_STATUS.ON_THE_WAY]: 4,
  [ORDER_STATUS.RESCHEDULED]: 3,
  [ORDER_STATUS.DELIVERED]: 5,
};

const TERMINAL_LABELS: Record<string, string> = {
  [ORDER_STATUS.CANCELLED]: 'تم إلغاء هذا الطلب',
  [ORDER_STATUS.RETURNED]: 'تم إرجاع هذا الطلب',
  [ORDER_STATUS.FAILED_DELIVERY]: 'تعذّر توصيل هذا الطلب',
  [ORDER_STATUS.PARTIAL_DELIVERY]: 'تم تسليم جزء من هذا الطلب',
  [ORDER_STATUS.DISPUTED]: 'هذا الطلب محل نزاع وتراجعه الإدارة',
};

const CURRENT_STATUS_LABELS: Record<string, string> = {
  [ORDER_STATUS.CONFIRMED]: 'تم تأكيد الطلب وسيبدأ المتجر بتجهيزه',
  [ORDER_STATUS.PICKED_UP]: 'استلم المندوب الطلب من المتجر',
  [ORDER_STATUS.RESCHEDULED]: 'أُعيدت جدولة التوصيل وسيظهر التحديث هنا',
};

const REFUND_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const REFUND_STATUS_META: Record<string, { title: string; detail: string; color: string; background: string; border: string }> = {
  pending: { title: 'طلب الاسترداد المالي قيد المراجعة', detail: 'استلمت الإدارة الطلب وتراجعه حالياً.', color: '#92400E', background: '#FFFBEB', border: '#FDE68A' },
  approved: { title: 'تمت الموافقة على الاسترداد المالي', detail: 'سيتم استكمال خطوات تنفيذ المبلغ وإثباته.', color: '#166534', background: '#F0FDF4', border: '#BBF7D0' },
  processing: { title: 'جاري تنفيذ الاسترداد المالي', detail: 'تتم الآن معالجة المبلغ عبر المسار المالي.', color: '#1D4ED8', background: '#EFF6FF', border: '#BFDBFE' },
  completed: { title: 'اكتمل الاسترداد المالي', detail: 'تم إغلاق الطلب بعد تسجيل التنفيذ المالي.', color: '#166534', background: '#F0FDF4', border: '#BBF7D0' },
  rejected: { title: 'تم رفض الاسترداد المالي', detail: 'يمكنك التواصل مع الدعم لمعرفة السبب أو الاعتراض.', color: '#B91C1C', background: '#FEF2F2', border: '#FECACA' },
  cancelled: { title: 'تم إلغاء الاسترداد المالي', detail: 'هذا الطلب لم يعد قيد المعالجة.', color: '#475569', background: '#F8FAFC', border: '#CBD5E1' },
};

export default function OrderTrackingScreen({ navigation, route }: any) {
  const { orderId } = route.params;
  const user = useAuthStore((s) => s.user);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewStatusLoading, setReviewStatusLoading] = useState(true);
  const [reviewStatusError, setReviewStatusError] = useState('');
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [cancellationReasonsError, setCancellationReasonsError] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundReasonCode, setRefundReasonCode] = useState('');
  const [refundDescription, setRefundDescription] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundRequest, setRefundRequest] = useState<any>(null);
  const [refundLoadError, setRefundLoadError] = useState('');
  const [showSupport, setShowSupport] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [sendingSupport, setSendingSupport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadReviewStatus = useCallback(async (merchantId?: string | null): Promise<boolean | null> => {
    if (!user?.id || !merchantId) {
      setReviewed(false);
      setReviewStatusError('');
      setReviewStatusLoading(false);
      return false;
    }

    const { data, error } = await supabase.rpc('has_reviewed_order', {
      p_order_id: orderId,
      p_target_type: 'merchant',
      p_target_id: merchantId,
    });

    if (error) {
      setReviewStatusError('تعذّر التحقق من تقييمك السابق. أعد المحاولة قبل إرسال تقييم جديد.');
      setReviewStatusLoading(false);
      return null;
    }

    const exists = data === true;
    setReviewed(exists);
    setReviewStatusError('');
    setReviewStatusLoading(false);
    return exists;
  }, [orderId, user?.id]);

  const reload = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setLoadError('');
    try {
      const data = await getOrderById(orderId);
      if (!data) throw new Error('لم يتم العثور على الطلب أو لا تملك صلاحية عرضه.');
      setOrder(data);
      await loadReviewStatus(data.merchant_id);
    } catch (error: any) {
      setLoadError(error?.message ?? 'تعذّر تحميل تفاصيل الطلب.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadReviewStatus, orderId]);

  useEffect(() => {
    setReviewed(false);
    setReviewStatusError('');
    setReviewStatusLoading(true);
  }, [orderId, user?.id]);

  const reloadRefund = useCallback(async () => {
    if (!user?.id) { setRefundRequest(null); setRefundLoadError(''); return; }
    try {
      const requests = await getMyRefundRequests(user.id);
      setRefundRequest(requests.find((request) => request.order_id === orderId) ?? null);
      setRefundLoadError('');
    } catch (error: any) {
      setRefundLoadError(error?.message ?? 'تعذّر التحقق من وجود طلب استرداد حالي.');
    }
  }, [orderId, user?.id]);

  const loadCancellationReasons = useCallback(async () => {
    setCancellationReasonsError('');
    try {
      const availableReasons = await getCancellationReasons('customer');
      setReasons(availableReasons);
      if (availableReasons.length === 0) {
        setCancellationReasonsError('لا توجد أسباب إلغاء مفعلة حاليًا. تواصل مع الدعم لإلغاء الطلب.');
      }
    } catch (error) {
      setCancellationReasonsError(error instanceof Error && error.message
        ? error.message
        : 'تعذّر تحميل أسباب الإلغاء.');
    }
  }, []);

  useEffect(() => { void loadCancellationReasons(); }, [loadCancellationReasons]);

  useFocusEffect(useCallback(() => {
    reload();
    reloadRefund();
  }, [reload, reloadRefund]));

  useEffect(() => {
    const channel = supabase
      .channel(`customer-order-tracking-${orderId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}`,
      }, () => { reload(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'refund_requests', filter: `order_id=eq.${orderId}`,
      }, () => { reloadRefund(); })
      .subscribe();
    const fallback = setInterval(() => {
      void reload();
      void reloadRefund();
    }, 30000);

    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [orderId, reload, reloadRefund]);

  const canCancel = order && ['pending', 'preparing'].includes(order.status);

  const doCancel = async (reason: string) => {
    setShowCancel(false);
    try { await cancelOrder(orderId, reason); await reload(); Alert.alert('تم الإلغاء', 'تم إلغاء طلبك'); }
    catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإلغاء'); }
  };

  const requestRefund = async () => {
    if (!user?.id) return;
    if (!refundReasonCode) { Alert.alert('اختر السبب', 'حدد سبب طلب الاسترداد أولاً.'); return; }
    if (refundDescription.trim().length < 10) { Alert.alert('التفاصيل مطلوبة', 'اكتب وصفاً واضحاً لا يقل عن 10 أحرف ليساعد الإدارة على المراجعة.'); return; }
    setRefundSubmitting(true);
    try {
      await createRefundRequest({
        order_id: orderId,
        customer_id: user.id,
        reason: refundReasonCode,
        description: refundDescription.trim(),
        refund_method: 'original_payment',
      });
      await reloadRefund();
      setRefundRequest((current: any) => current ?? { status: 'pending', reason: refundReasonCode });
      setShowRefund(false);
      setRefundDescription('');
      setRefundReasonCode('');
    } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإرسال'); }
    finally { setRefundSubmitting(false); }
  };

  const contactMerchant = async () => {
    if (!user?.id || !order?.merchant_id) return;
    try {
      const conversationId = await getOrCreateConversation(user.id, order.merchant_id, orderId);
      navigation.navigate('Home', { screen: 'Chat', params: { conversationId, title: order.merchant_profiles?.store_name ?? 'المتجر' } });
    } catch (e: any) { Alert.alert('تعذّر فتح المحادثة', e?.message ?? 'حاول مرة أخرى'); }
  };

  const submitOrderComplaint = async () => {
    if (!user?.id || !supportMessage.trim()) return;
    setSendingSupport(true);
    try {
      await createSupportTicket({
        user_id: user.id,
        subject: `شكوى بخصوص الطلب ${order?.order_number ?? orderId}`,
        category: 'order_complaint',
        order_id: orderId,
        message: `رقم الطلب: ${order?.order_number ?? orderId}\n\n${supportMessage.trim()}`,
      });
      setSupportMessage('');
      setShowSupport(false);
      Alert.alert('تم فتح الشكوى', 'وصلت شكواك للإدارة وسيتم الرد عليها من مركز الدعم.');
    } catch (e: any) { Alert.alert('تعذّر إرسال الشكوى', e?.message ?? 'حاول مرة أخرى'); }
    finally { setSendingSupport(false); }
  };

  const REFUND_REASONS = [
    { value: 'not_received', label: 'لم يصلني الطلب' },
    { value: 'other', label: 'مشكلة مالية أخرى لا تتطلب إعادة منتج' },
  ];

  const submitReview = async () => {
    if (!user?.id || !order?.merchant_id || rating === 0 || reviewed || reviewStatusLoading) return;
    setSubmittingReview(true);
    try {
      const existingReview = await loadReviewStatus(order.merchant_id);
      if (existingReview === null) {
        Alert.alert('تعذّر التحقق', 'لم نتمكن من التحقق من وجود تقييم سابق. حاول مجدداً قبل الإرسال.');
        return;
      }
      if (existingReview) {
        Alert.alert('تم التقييم مسبقاً', 'سبق أن قيّمت هذا الطلب، ولا يمكن إرسال تقييم مكرر.');
        return;
      }
      await createReview({
        reviewer_id: user.id,
        order_id: order.id,
        target_type: 'merchant',
        target_id: order.merchant_id,
        rating,
      });
      setReviewed(true);
      Alert.alert('شكراً لك ⭐', 'تم إرسال تقييمك بنجاح');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال التقييم');
    } finally {
      setSubmittingReview(false);
    }
  };

  const currentStatus = order?.status ?? ORDER_STATUS.PENDING;
  const currentStatusIndex = STATUS_STEP_INDEX[currentStatus] ?? 0;
  const terminalLabel = TERMINAL_LABELS[currentStatus];
  const currentStatusLabel = terminalLabel
    ?? CURRENT_STATUS_LABELS[currentStatus]
    ?? TRACKING_STEPS[currentStatusIndex]?.label
    ?? 'جاري التتبع...';
  const refundReferenceValue = order?.delivered_at ?? order?.updated_at ?? order?.created_at;
  const refundReferenceTime = refundReferenceValue ? new Date(refundReferenceValue).getTime() : Number.NaN;
  const refundDeadlineTime = refundReferenceTime + REFUND_WINDOW_MS;
  const refundWindowKnown = Number.isFinite(refundReferenceTime);
  const refundWindowOpen = order?.status === ORDER_STATUS.DELIVERED
    && refundWindowKnown
    && Date.now() <= refundDeadlineTime;
  const canStartRefund = refundWindowOpen
    && (!refundRequest || refundRequest.status === 'rejected');
  const refundDeadlineLabel = refundWindowKnown
    ? new Date(refundDeadlineTime).toLocaleString('ar-SA')
    : null;
  const refundStatus = refundRequest ? (REFUND_STATUS_META[refundRequest.status] ?? {
    title: `حالة الاسترداد المالي: ${refundRequest.status}`,
    detail: 'يمكنك متابعة التفاصيل مع مركز الدعم.',
    color: '#475569', background: '#F8FAFC', border: '#CBD5E1',
  }) : null;
  const refundReason = refundRequest
    ? (REFUND_REASONS.find((reason) => reason.value === refundRequest.reason)?.label ?? refundRequest.reason)
    : '';

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!order && loadError) {
    return (
      <View style={styles.loadErrorWrap}>
        <Text style={styles.loadErrorTitle}>تعذّر فتح الطلب</Text>
        <Text style={styles.loadErrorText}>{loadError}</Text>
        <TouchableOpacity style={styles.loadErrorBtn} onPress={() => reload()} accessibilityRole="button" accessibilityLabel="إعادة تحميل الطلب">
          <Text style={styles.loadErrorBtnText}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة">
          <Text style={styles.backIcon}>→</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تتبع الطلب</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={COLORS.primary} />}>
        {loadError ? <View style={styles.inlineError} accessibilityRole="alert"><Text style={styles.inlineErrorText}>{loadError}</Text></View> : null}
        
        {/* Delivery Status Banner */}
        <View style={[styles.mapContainer, terminalLabel ? styles.mapContainerTerminal : null]}>
          <View style={styles.mapStatusIcon}>
            <Text style={styles.mapStatusEmoji}>
              {terminalLabel ? '✕' : TRACKING_STEPS[currentStatusIndex]?.icon ?? '⏳'}
            </Text>
          </View>
          <Text style={[styles.mapStatusLabel, terminalLabel ? { color: '#DC2626' } : null]}>
            {currentStatusLabel}
          </Text>
          {order?.addresses?.full_address ? (
            <View style={styles.mapAddressRow}>
              <Text style={styles.mapAddressIcon}>📍</Text>
              <Text style={styles.mapAddressTxt} numberOfLines={2}>{order.addresses.full_address}</Text>
            </View>
          ) : null}
          {!terminalLabel && currentStatus === 'on_the_way' && (
            <View style={styles.driverLive}>
              <Text style={styles.driverLiveText}>🛵 حالة الطلب: المندوب في الطريق إليك</Text>
            </View>
          )}
        </View>

        {/* Order Info Summary */}
        <View style={styles.infoCard}>
          <Text style={styles.orderId}>طلب رقم: {order?.order_number ?? orderId}</Text>
          <Text style={styles.estimatedTime}>المبلغ الإجمالي: {order?.total_amount ?? 0} ر.ي</Text>
        </View>

        <View style={styles.serviceCard}>
          <Text style={styles.serviceTitle}>مساعدة بخصوص هذا الطلب</Text>
          <Text style={styles.serviceSub}>تواصل مباشرة مع المتجر أو افتح شكوى تصل إلى إدارة التطبيق.</Text>
          <View style={styles.serviceActions}>
            <TouchableOpacity style={styles.merchantChatBtn} onPress={contactMerchant} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="مراسلة المتجر">
              <Text style={styles.merchantChatText}>مراسلة المتجر</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.supportBtn} onPress={() => setShowSupport((shown) => !shown)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="فتح شكوى للإدارة" accessibilityState={{ expanded: showSupport }}>
              <Text style={styles.supportBtnText}>فتح شكوى للإدارة</Text>
            </TouchableOpacity>
          </View>
          {showSupport && (
            <View style={styles.supportForm}>
              <Text style={styles.supportFormTitle}>اشرح المشكلة وسيرى فريق الإدارة رقم الطلب تلقائياً</Text>
              <TextInput
                style={styles.supportInput}
                value={supportMessage}
                onChangeText={setSupportMessage}
                placeholder="اكتب تفاصيل الشكوى بوضوح..."
                placeholderTextColor="#94A3B8"
                multiline
                textAlign="right"
                accessibilityLabel="تفاصيل الشكوى"
              />
              <TouchableOpacity style={[styles.submitSupportBtn, (!supportMessage.trim() || sendingSupport) && { opacity: 0.55 }]} onPress={submitOrderComplaint} disabled={!supportMessage.trim() || sendingSupport} accessibilityRole="button" accessibilityLabel="إرسال الشكوى إلى الإدارة" accessibilityState={{ disabled: !supportMessage.trim() || sendingSupport, busy: sendingSupport }}>
                {sendingSupport ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitSupportText}>إرسال الشكوى للإدارة</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* إلغاء الطلب */}
        {canCancel && !showCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCancel(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="إلغاء الطلب">
            <Text style={styles.cancelBtnText}>إلغاء الطلب</Text>
          </TouchableOpacity>
        )}
        {showCancel && (
          <View style={styles.reasonsCard}>
            <Text style={styles.reasonsTitle}>سبب الإلغاء</Text>
            {cancellationReasonsError ? (
              <View style={styles.refundErrorCard} accessibilityRole="alert">
                <Text style={styles.refundErrorText}>{cancellationReasonsError}</Text>
                <TouchableOpacity style={styles.loadErrorBtn} onPress={() => void loadCancellationReasons()} accessibilityRole="button" accessibilityLabel="إعادة تحميل أسباب الإلغاء">
                  <Text style={styles.loadErrorBtnText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : reasons.map((r) => (
              <TouchableOpacity key={r.id} style={styles.reasonItem} onPress={() => Alert.alert('تأكيد إلغاء الطلب', `هل تريد إلغاء الطلب بسبب: ${r.reason_text_ar ?? ''}؟`, [
                { text: 'تراجع', style: 'cancel' },
                { text: 'إلغاء الطلب', style: 'destructive', onPress: () => doCancel(r.reason_text_ar ?? '') },
              ])} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`إلغاء الطلب بسبب ${r.reason_text_ar ?? ''}`}>
                <Text style={styles.reasonText}>{r.reason_text_ar}</Text>
                <Text style={styles.reasonArrow}>‹</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowCancel(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>تراجع</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* الاسترداد المالي لا ينقل منتجات؛ الإرجاع الفعلي له مسار مستقل أدناه. */}
        {refundRequest && refundStatus && (
          <View style={[styles.refundStatusCard, { backgroundColor: refundStatus.background, borderColor: refundStatus.border }]} accessibilityRole="summary">
            <Text style={[styles.refundStatusTitle, { color: refundStatus.color }]}>{refundStatus.title}</Text>
            <Text style={[styles.refundStatusSub, { color: refundStatus.color }]}>{refundStatus.detail}</Text>
            <Text style={[styles.refundStatusSub, { color: refundStatus.color }]}>سبب الاسترداد المالي: {refundReason}</Text>
            {refundRequest.decision_reason ? (
              <Text style={[styles.refundStatusSub, { color: refundStatus.color }]}>سبب القرار: {refundRequest.decision_reason}</Text>
            ) : null}
          </View>
        )}
        {refundLoadError ? (
          <TouchableOpacity style={styles.refundErrorCard} onPress={() => void reloadRefund()} accessibilityRole="button" accessibilityLabel="إعادة التحقق من طلب الاسترداد">
            <Text style={styles.refundErrorText}>{refundLoadError} اضغط لإعادة المحاولة. لن نفتح طلباً جديداً قبل التحقق.</Text>
          </TouchableOpacity>
        ) : null}
        {order?.status === ORDER_STATUS.DELIVERED && !refundRequest && !refundLoadError && !refundWindowOpen && (
          <View style={styles.refundErrorCard} accessibilityRole="summary">
            <Text style={styles.refundErrorText}>
              {refundWindowKnown
                ? `انتهت مهلة طلب الاسترداد المالي، ومدتها 3 أيام من التسليم (انتهت في ${refundDeadlineLabel}). يمكنك فتح شكوى للإدارة إذا كانت لديك حالة استثنائية.`
                : 'تعذّر التحقق من وقت التسليم، لذلك أُوقف فتح طلب استرداد مالي جديد مؤقتاً. حدّث الطلب أو تواصل مع الدعم.'}
            </Text>
          </View>
        )}
        {canStartRefund && !refundLoadError && !showRefund && (
          <TouchableOpacity style={styles.refundBtn} onPress={() => { setRefundReasonCode(''); setRefundDescription(''); setShowRefund(true); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="طلب استرداد مالي دون إرجاع منتجات">
            <Text style={styles.refundBtnText}>{refundRequest?.status === 'rejected' ? 'إعادة طلب الاسترداد المالي' : 'طلب استرداد مالي فقط'}</Text>
          </TouchableOpacity>
        )}
        {showRefund && canStartRefund && (
          <View style={styles.reasonsCard}>
            <Text style={styles.reasonsTitle}>سبب الاسترداد المالي</Text>
            {REFUND_REASONS.map((r) => (
              <TouchableOpacity key={r.value} style={[styles.reasonItem, refundReasonCode === r.value && styles.refundReasonSelected]} onPress={() => setRefundReasonCode(r.value)} activeOpacity={0.7} accessibilityRole="radio" accessibilityLabel={`سبب الاسترداد المالي ${r.label}`} accessibilityState={{ selected: refundReasonCode === r.value }}>
                <Text style={[styles.reasonText, refundReasonCode === r.value && styles.refundReasonTextSelected]}>{r.label}</Text>
                <Ionicons name={refundReasonCode === r.value ? 'radio-button-on' : 'radio-button-off'} size={20} color={refundReasonCode === r.value ? '#D97706' : '#94A3B8'} />
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.refundDescriptionInput}
              value={refundDescription}
              onChangeText={setRefundDescription}
              placeholder="اشرح سبب الاسترداد المالي دون إعادة منتجات..."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={2000}
              textAlign="right"
              accessibilityLabel="تفاصيل طلب الاسترداد"
            />
            <View style={styles.refundMethodInfo}>
              <Ionicons name="information-circle-outline" size={18} color="#92400E" />
              <Text style={styles.refundMethodText}>سيحسب الخادم المبلغ المستحق. وبما أن الدفع نقدي عند الاستلام، تُسجل طريقة الرد كوسيلة الدفع الأصلية ولا تُعد مكتملة قبل إثبات التنفيذ.</Text>
            </View>
            <TouchableOpacity style={[styles.submitRefundBtn, (!refundReasonCode || refundDescription.trim().length < 10 || refundSubmitting) && { opacity: 0.55 }]} onPress={requestRefund} disabled={!refundReasonCode || refundDescription.trim().length < 10 || refundSubmitting} accessibilityRole="button" accessibilityLabel="إرسال طلب الاسترداد" accessibilityState={{ disabled: !refundReasonCode || refundDescription.trim().length < 10 || refundSubmitting, busy: refundSubmitting }}>
              {refundSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitRefundText}>إرسال طلب الاسترداد</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !refundSubmitting && setShowRefund(false)} style={{ paddingVertical: 10, alignItems: 'center' }} disabled={refundSubmitting}>
              <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>تراجع</Text>
            </TouchableOpacity>
          </View>
        )}

        {order && user?.id ? <CustomerPhysicalReturnPanel order={order} userId={user.id} /> : null}

        {/* حالة نهائية (إلغاء/إرجاع/فشل توصيل) بدل الخط الزمني */}
        {terminalLabel ? (
          <View style={[styles.infoCard, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
            <Text style={[styles.orderId, { color: '#DC2626' }]}>✕ {terminalLabel}</Text>
            {order?.cancel_reason ? (
              <Text style={styles.estimatedTime}>السبب: {order.cancel_reason}</Text>
            ) : null}
          </View>
        ) : (
        /* Tracking Timeline */
        <View style={styles.timelineContainer}>
          {TRACKING_STEPS.map((step, index) => {
            const isDELIVERED = index < currentStatusIndex;
            const isCurrent = index === currentStatusIndex;

            return (
              <View key={`${step.status}-${index}`} style={styles.timelineStep}>
                <View style={styles.timelineIconContainer}>
                  <View style={[
                    styles.timelineIconWrap,
                    isDELIVERED ? styles.iconDELIVERED : isCurrent ? styles.iconCurrent : styles.iconPending
                  ]}>
                    <Text style={styles.stepIcon}>{step.icon}</Text>
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
                  {isCurrent && step.status === ORDER_STATUS.ON_THE_WAY && (
                    <Text style={styles.stepDesc}>المندوب في طريقه إليك، يرجى التواجد في الموقع.</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
        )}

        {/* تقييم الطلب عند التسليم */}
        {order?.status === ORDER_STATUS.DELIVERED && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>قيّم تجربتك مع المتجر</Text>
            {reviewStatusLoading ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : reviewStatusError ? (
              <View style={styles.refundErrorCard} accessibilityRole="alert">
                <Text style={styles.refundErrorText}>{reviewStatusError}</Text>
                <TouchableOpacity
                  style={styles.loadErrorBtn}
                  onPress={() => {
                    setReviewStatusLoading(true);
                    void loadReviewStatus(order?.merchant_id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="إعادة التحقق من التقييم السابق"
                >
                  <Text style={styles.loadErrorBtnText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : reviewed ? (
              <Text style={styles.reviewThanks}>✅ شكراً لتقييمك</Text>
            ) : (
              <>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7} accessibilityRole="radio" accessibilityLabel={`${s} من 5 نجوم`} accessibilityState={{ selected: rating === s }}>
                      <Text style={[styles.star, s <= rating && styles.starActive]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.reviewBtn, (rating === 0 || submittingReview) && { opacity: 0.5 }]}
                  onPress={submitReview}
                  disabled={rating === 0 || submittingReview}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="إرسال التقييم"
                  accessibilityState={{ disabled: rating === 0 || submittingReview, busy: submittingReview }}
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
  loadErrorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: COLORS.background },
  loadErrorTitle: { fontSize: 18, fontWeight: '800', color: '#B91C1C', marginBottom: 8, textAlign: 'center' },
  loadErrorText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22, textAlign: 'center' },
  loadErrorBtn: { marginTop: 18, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 20, paddingVertical: 12 },
  loadErrorBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  inlineError: { marginHorizontal: SPACING.md, marginTop: 12, padding: 10, borderRadius: RADIUS.md, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  inlineErrorText: { color: '#B91C1C', fontSize: 12, fontWeight: '700', textAlign: 'right' },
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
  refundErrorCard: { marginHorizontal: SPACING.md, marginTop: 12, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  refundErrorText: { color: '#991B1B', fontSize: 12, lineHeight: 19, textAlign: 'right' },
  refundStatusCard: { marginHorizontal: SPACING.md, marginTop: 12, padding: 15, borderRadius: RADIUS.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  refundStatusTitle: { color: '#92400E', fontWeight: '800', fontSize: 15, textAlign: 'right' },
  refundStatusSub: { color: '#A16207', fontSize: 13, marginTop: 5, textAlign: 'right' },
  reasonsCard: { backgroundColor: COLORS.surface, margin: SPACING.md, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  reasonsTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8 },
  reasonItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  refundReasonSelected: { backgroundColor: '#FFFBEB', paddingHorizontal: 10, borderRadius: 10 },
  refundReasonTextSelected: { color: '#92400E' },
  refundDescriptionInput: { minHeight: 100, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, color: '#0F172A', textAlignVertical: 'top', marginTop: 14 },
  refundMethodInfo: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 11, padding: 11, marginTop: 10 },
  refundMethodText: { flex: 1, color: '#92400E', fontSize: 11.5, lineHeight: 18, textAlign: 'right' },
  submitRefundBtn: { backgroundColor: '#D97706', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  submitRefundText: { color: '#FFFFFF', fontWeight: '900' },
  reasonText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' },
  reasonArrow: { fontSize: 20, color: '#D1D5DB' },
  mapContainer: { minHeight: 200, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 10 },
  mapContainerTerminal: { backgroundColor: '#FEF2F2' },
  mapStatusIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  mapStatusEmoji: { fontSize: 32 },
  mapStatusLabel: { fontSize: 16, fontWeight: '800', color: '#1D4ED8', textAlign: 'center' },
  mapAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  mapAddressIcon: { fontSize: 14, marginTop: 1 },
  mapAddressTxt: { fontSize: 13, color: '#374151', fontWeight: '600', flex: 1, textAlign: 'right' },
  driverLive: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 4 },
  driverLiveText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
  infoCard: { margin: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginTop: -30 },
  serviceCard: { marginHorizontal: SPACING.md, marginTop: 4, padding: 16, backgroundColor: '#F8FAFC', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: '#E2E8F0' },
  serviceTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', textAlign: 'right' },
  serviceSub: { fontSize: 13, color: '#64748B', textAlign: 'right', marginTop: 5, lineHeight: 20 },
  serviceActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 14 },
  merchantChatBtn: { flex: 1, backgroundColor: '#1D4ED8', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  merchantChatText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  supportBtn: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  supportBtnText: { color: '#334155', fontWeight: '800', fontSize: 13 },
  supportForm: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 14 },
  supportFormTitle: { color: '#475569', fontSize: 12, textAlign: 'right', marginBottom: 8 },
  supportInput: { minHeight: 90, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, color: '#0F172A', textAlignVertical: 'top' },
  submitSupportBtn: { marginTop: 10, backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submitSupportText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
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
