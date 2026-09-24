import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../../../components/appAlert';
import CustomerPhysicalReturnPanel from './CustomerPhysicalReturnPanel';
import { COLORS, FONTS, ORDER_STATUS } from '@marketplace/shared-utils';
import {
  useAuthStore,
  getOrderById,
  createReview,
  getCancellationReasons,
  cancelOrder,
  createRefundRequest,
  getMyRefundRequests,
  createSupportTicket,
  getOrCreateConversation,
  CancellationReason,
  OrderDetail,
  supabase,
} from '@marketplace/shared-hooks';

const TRACKING_STEPS = [
  { status: ORDER_STATUS.PENDING, label: 'تم استقبال الطلب', desc: 'تم إرسال طلبك إلى المتجر بنجاح', icon: 'time-outline' },
  { status: ORDER_STATUS.PREPARING, label: 'جاري التجهيز', desc: 'يقوم المتجر بإعداد وتغليف منتجاتك', icon: 'cube-outline' },
  { status: ORDER_STATUS.READY, label: 'جاهز للتوصيل', desc: 'الطلب جاهز وبانتظار استلام المندوب', icon: 'checkbox-outline' },
  { status: ORDER_STATUS.ASSIGNED, label: 'قبول المندوب', desc: 'تم إسناد الطلب لمندوب التوصيل', icon: 'person-outline' },
  { status: ORDER_STATUS.ON_THE_WAY, label: 'في الطريق إليك', desc: 'المندوب يتجه حالياً نحو عنوان التوصيل', icon: 'navigate-outline' },
  { status: ORDER_STATUS.DELIVERED, label: 'تم التسليم بنجاح', desc: 'تم توصيل الطلب واستلامه بنجاح', icon: 'checkmark-circle-outline' },
];

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

const REFUND_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

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

  const loadReviewStatus = useCallback(
    async (merchantId?: string | null): Promise<boolean | null> => {
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
        setReviewStatusError('تعذّر التحقق من تقييمك السابق.');
        setReviewStatusLoading(false);
        return null;
      }

      const exists = data === true;
      setReviewed(exists);
      setReviewStatusError('');
      setReviewStatusLoading(false);
      return exists;
    },
    [orderId, user?.id]
  );

  const reload = useCallback(
    async (isRefresh = false) => {
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
    },
    [loadReviewStatus, orderId]
  );

  const reloadRefund = useCallback(async () => {
    if (!user?.id) {
      setRefundRequest(null);
      setRefundLoadError('');
      return;
    }
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
      setCancellationReasonsError(
        error instanceof Error && error.message ? error.message : 'تعذّر تحميل أسباب الإلغاء.'
      );
    }
  }, []);

  useEffect(() => {
    void loadCancellationReasons();
  }, [loadCancellationReasons]);

  useFocusEffect(
    useCallback(() => {
      reload();
      reloadRefund();
    }, [reload, reloadRefund])
  );

  useEffect(() => {
    const channel = supabase
      .channel(`customer-order-tracking-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => {
          reload();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'refund_requests',
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          reloadRefund();
        }
      )
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
    try {
      await cancelOrder(orderId, reason);
      await reload();
      Alert.alert('تم الإلغاء', 'تم إلغاء طلبك بنجاح');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر الإلغاء');
    }
  };

  const requestRefund = async () => {
    if (!user?.id) return;
    if (!refundReasonCode) {
      Alert.alert('اختر السبب', 'حدد سبب طلب الاسترداد أولاً.');
      return;
    }
    if (refundDescription.trim().length < 10) {
      Alert.alert('التفاصيل مطلوبة', 'اكتب وصفاً واضحاً لا يقل عن 10 أحرف.');
      return;
    }
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
      setShowRefund(false);
      setRefundDescription('');
      setRefundReasonCode('');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال الطلب');
    } finally {
      setRefundSubmitting(false);
    }
  };

  const contactMerchant = async () => {
    if (!user?.id || !order?.merchant_id) return;
    try {
      const conversationId = await getOrCreateConversation(user.id, order.merchant_id, orderId);
      navigation.navigate('Home', {
        screen: 'Chat',
        params: {
          conversationId,
          title: order.merchant_profiles?.store_name ?? 'المتجر',
        },
      });
    } catch (e: any) {
      Alert.alert('تعذّر فتح المحادثة', e?.message ?? 'حاول مرة أخرى');
    }
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
      Alert.alert('تم فتح الشكوى', 'وصلت شكواك للإدارة وسيتم الرد عليها في أقرب وقت.');
    } catch (e: any) {
      Alert.alert('تعذّر إرسال الشكوى', e?.message ?? 'حاول مرة أخرى');
    } finally {
      setSendingSupport(false);
    }
  };

  const submitReview = async () => {
    if (!user?.id || !order?.merchant_id || rating === 0 || reviewed || reviewStatusLoading)
      return;
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
  const latestLocation = [...(order?.order_tracking ?? [])]
    .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const openTrackedLocation = async (): Promise<void> => {
    if (latestLocation?.latitude == null || latestLocation?.longitude == null) return;
    const query = `${latestLocation.latitude},${latestLocation.longitude}`;
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
    } catch {
      Alert.alert('تعذّر فتح الخريطة', 'يمكنك نسخ الإحداثيات وفتحها في تطبيق الخرائط.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#172554" />
      </View>
    );
  }

  if (!order && loadError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={56} color="#DC2626" />
        <Text style={styles.errorTitle}>تعذّر فتح الطلب</Text>
        <Text style={styles.errorSub}>{loadError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => reload()}>
          <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.supportPillBtn}
            onPress={() => setShowSupport(!showSupport)}
            activeOpacity={0.8}
          >
            <Ionicons name="headset-outline" size={16} color="#172554" />
            <Text style={styles.supportPillText}>الدعم</Text>
          </TouchableOpacity>

          <View style={styles.headerCenterCol}>
            <Text style={styles.headerTitle}>تتبع الطلب</Text>
            <Text style={styles.headerSub}># طلب {order?.order_number}</Text>
          </View>

          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => reload(true)}
            tintColor="#172554"
          />
        }
      >
        <View style={styles.mapBannerCard}>
          <View style={styles.trackingLocationIcon}>
            <Ionicons
              name={latestLocation ? 'navigate' : 'map-outline'}
              size={30}
              color={COLORS.primary}
            />
          </View>
          <Text style={styles.trackingLocationTitle}>
            {terminalLabel
              ? terminalLabel
              : currentStatus === ORDER_STATUS.ON_THE_WAY
                ? 'المندوب في الطريق إليك'
                : TRACKING_STEPS[currentStatusIndex]?.label ?? 'جاري تحديث حالة الطلب'}
          </Text>
          <Text style={styles.trackingLocationText}>
            {latestLocation
              ? `آخر موقع مسجّل: ${latestLocation.latitude?.toFixed(5)}, ${latestLocation.longitude?.toFixed(5)}`
              : 'لم تصل إحداثيات مباشرة من المندوب حتى الآن. حالة الطلب نفسها تتحدث تلقائياً.'}
          </Text>
          {latestLocation ? (
            <TouchableOpacity style={styles.openMapButton} onPress={openTrackedLocation} activeOpacity={0.82}>
              <Ionicons name="open-outline" size={16} color="#FFFFFF" />
              <Text style={styles.openMapButtonText}>فتح الموقع على الخريطة</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {order?.delivery_id ? (
          <View style={styles.card}>
            <View style={styles.driverCardRow}>
              <View style={styles.driverInfoCol}>
                <Text style={styles.driverNameText}>تم إسناد مندوب للطلب</Text>
                <Text style={styles.driverVehicleText}>
                  نعرض فقط البيانات المؤكدة من النظام؛ بيانات التواصل غير متاحة في هذا الطلب حالياً.
                </Text>
              </View>
              <View style={styles.driverAvatarCircle}>
                <Ionicons name="bicycle-outline" size={24} color={COLORS.primary} />
              </View>
            </View>
          </View>
        ) : null}

        {/* Stepper Timeline Progress Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="git-commit-outline" size={18} color="#172554" />
            <Text style={styles.cardTitle}>مراحل تنفيذ الطلب</Text>
          </View>

          <View style={styles.verticalTimeline}>
            {TRACKING_STEPS.map((step, idx) => {
              const isDone = idx < currentStatusIndex;
              const isCurrent = idx === currentStatusIndex;
              const isLast = idx === TRACKING_STEPS.length - 1;

              return (
                <View key={step.status} style={styles.timelineItemRow}>
                  {/* Right Column: Icon & Line */}
                  <View style={styles.timelineGraphicCol}>
                    <View
                      style={[
                        styles.timelineCircle,
                        isDone && styles.timelineCircleDone,
                        isCurrent && styles.timelineCircleCurrent,
                      ]}
                    >
                      <Ionicons
                        name={(isDone ? 'checkmark' : step.icon) as any}
                        size={14}
                        color={isDone ? '#FFFFFF' : isCurrent ? '#172554' : '#94A3B8'}
                      />
                    </View>
                    {!isLast && (
                      <View
                        style={[
                          styles.timelineVerticalLine,
                          isDone && styles.timelineVerticalLineDone,
                        ]}
                      />
                    )}
                  </View>

                  {/* Left Column: Label & Description */}
                  <View style={styles.timelineDetailsCol}>
                    <Text
                      style={[
                        styles.stepTitleText,
                        isDone && styles.stepTitleDone,
                        isCurrent && styles.stepTitleCurrent,
                      ]}
                    >
                      {step.label}
                    </Text>
                    <Text style={styles.stepDescText}>{step.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Address & Delivery Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="location-outline" size={18} color="#172554" />
            <Text style={styles.cardTitle}>تفاصيل التوصيل والمستلم</Text>
          </View>

          <View style={styles.infoBannerBox}>
            <View style={styles.infoRow}>
              <Text style={styles.infoValueText}>
                {order?.addresses?.full_address || 'لم يتم توفير عنوان التوصيل'}
              </Text>

              <Text style={styles.infoLabelText}> :عنوان التسليم 📍</Text>
            </View>
            <View style={[styles.infoRow, { marginTop: 8 }]}>
              <Text style={styles.infoValueText}>
                {order?.merchant_profiles?.store_name || 'المتجر'}
              </Text>

              <Text style={styles.infoLabelText}>:اسم المتجر 🏪</Text>
            </View>
          </View>
        </View>

        {/* Order Items & Cost Summary Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="receipt-outline" size={18} color="#172554" />
            <Text style={styles.cardTitle}>ملخص منتجات الطلب</Text>
          </View>

          {order?.order_items && order.order_items.length > 0 ? (
            <View style={styles.itemsList}>
              {order.order_items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemPriceText}>
                    {Number(item.total_price || 0).toLocaleString('ar-SA')} ر.ي
                  </Text>
                  <View style={styles.itemDetailsCol}>
                    <Text style={styles.itemNameText}>{item.product_name || item.products?.name || 'منتج'}</Text>
                    <Text style={styles.itemQtyText}>الكمية: {item.quantity}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noItemsText}>يحتوي الطلب على منتجات متعددة.</Text>
          )}

          <View style={styles.costDivider} />

          <View style={styles.summaryTotalRow}>
            <Text style={styles.totalPriceAmountText}>
              {Number(order?.total_amount || 0).toLocaleString('ar-SA')} ر.ي
            </Text>
            <Text style={styles.totalPriceLabelText}>إجمالي الطلب:</Text>
          </View>
        </View>

        {/* Help & Support Complaint Form Toggle */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.merchantChatBtn} onPress={contactMerchant}>
            <Ionicons name="chatbubbles-outline" size={18} color="#FFFFFF" />
            <Text style={styles.merchantChatBtnText}>مراسلة المتجر المباشرة</Text>
          </TouchableOpacity>

          {showSupport && (
            <View style={styles.supportFormBox}>
              <Text style={styles.supportFormTitle}>اشرح مشكلتك وسيرى فريق الدعم الطلب فوراً</Text>
              <TextInput
                style={styles.supportInput}
                value={supportMessage}
                onChangeText={setSupportMessage}
                placeholder="اكتب التفاصيل هنا..."
                placeholderTextColor="#94A3B8"
                multiline
                textAlign="right"
              />
              <TouchableOpacity
                style={[
                  styles.submitSupportBtn,
                  (!supportMessage.trim() || sendingSupport) && { opacity: 0.6 },
                ]}
                onPress={submitOrderComplaint}
                disabled={!supportMessage.trim() || sendingSupport}
              >
                {sendingSupport ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitSupportBtnText}>إرسال الشكوى للإدارة</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Cancel Order Action Button */}
        {canCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCancel(true)}>
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={styles.cancelBtnText}>إلغاء هذا الطلب</Text>
          </TouchableOpacity>
        )}

        {/* Review Order Card when Delivered */}
        {order?.status === ORDER_STATUS.DELIVERED && (
          <View style={styles.card}>
            <Text style={styles.reviewTitle}>قيّم تجربتك مع هذا الطلب ⭐</Text>
            {reviewed ? (
              <Text style={styles.reviewedText}>✅ شكرًا لك! تم إرسال تقييمك بنجاح.</Text>
            ) : (
              <View style={styles.reviewStarsWrap}>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((starNum) => (
                    <TouchableOpacity key={starNum} onPress={() => setRating(starNum)}>
                      <Ionicons
                        name={starNum <= rating ? 'star' : 'star-outline'}
                        size={32}
                        color={starNum <= rating ? '#F59E0B' : '#CBD5E1'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.submitReviewBtn,
                    (rating === 0 || submittingReview) && { opacity: 0.5 },
                  ]}
                  onPress={submitReview}
                  disabled={rating === 0 || submittingReview}
                >
                  {submittingReview ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitReviewBtnText}>إرسال التقييم</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerCenterCol: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: '#0F172A',
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  supportPillBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  supportPillText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#172554',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 14,
  },
  trackingLocationIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
    marginBottom: 10,
  },
  trackingLocationTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 15,
    textAlign: 'center',
  },
  trackingLocationText: {
    maxWidth: 520,
    marginTop: 5,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  openMapButton: {
    minHeight: 42,
    marginTop: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  openMapButtonText: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
    fontSize: 12,
  },
  mapBannerCard: {
    minHeight: 190,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  mapImageBg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  mapShadeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 250, 252, 0.15)',
  },
  liveStatusPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  liveStatusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#172554',
  },
  liveStatusText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#172554',
  },
  centerPinMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPulseShadow: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(30, 58, 138, 0.25)',
  },
  pinIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#172554',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: '#0F172A',
  },
  driverCardRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  driverAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 10,
  },
  driverNameText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#0F172A',
  },
  driverVehicleText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  driverCallBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalTimeline: {
    paddingRight: 6,
  },
  timelineItemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  timelineGraphicCol: {
    alignItems: 'center',
    width: 28,
  },
  timelineCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCircleDone: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },
  timelineCircleCurrent: {
    backgroundColor: '#F0F5FF',
    borderColor: '#172554',
  },
  timelineVerticalLine: {
    width: 2,
    height: 32,
    backgroundColor: '#E2E8F0',
    marginTop: 2,
  },
  timelineVerticalLineDone: {
    backgroundColor: '#172554',
  },
  timelineDetailsCol: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 12,
  },
  stepTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#94A3B8',
  },
  stepTitleDone: {
    color: '#172554',
  },
  stepTitleCurrent: {
    color: '#172554',
    fontSize: 13.5,
  },
  stepDescText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'right',
  },
  infoBannerBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabelText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#172554',
  },
  infoValueText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#334155',
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemDetailsCol: {
    alignItems: 'flex-end',
  },
  itemNameText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: '#0F172A',
  },
  itemQtyText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
  },
  itemPriceText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#172554',
  },
  noItemsText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  costDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  summaryTotalRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalPriceLabelText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#0F172A',
  },
  totalPriceAmountText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#172554',
  },
  merchantChatBtn: {
    backgroundColor: '#172554',
    borderRadius: 14,
    height: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  merchantChatBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  supportFormBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  supportFormTitle: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'right',
    marginBottom: 8,
  },
  supportInput: {
    height: 80,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    fontSize: 12.5,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  submitSupportBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitSupportBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  cancelBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    height: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#DC2626',
  },
  reviewTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: '#0F172A',
    textAlign: 'center',
  },
  reviewedText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#059669',
    textAlign: 'center',
    marginTop: 8,
  },
  reviewStarsWrap: {
    alignItems: 'center',
    marginTop: 12,
  },
  starsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  submitReviewBtn: {
    backgroundColor: '#172554',
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  submitReviewBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#DC2626',
    marginTop: 12,
  },
  errorSub: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#172554',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 16,
  },
  retryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
});
