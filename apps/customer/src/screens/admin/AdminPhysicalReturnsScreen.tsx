import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  adminCompletePhysicalReturn,
  adminReviewPhysicalReturn,
  adminSchedulePhysicalReturn,
  createIdempotencyKey,
  getAdminDrivers,
  getAdminPhysicalReturns,
  getPhysicalReturnEvidenceLinks,
  getPhysicalReturnProofLinks,
  type AdminDriver,
  type AdminPhysicalReturnBundle,
  type PhysicalReturnEvidenceLink,
  type PhysicalReturnStatus,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

const UI = {
  primary: COLORS.primary, bg: COLORS.background, card: COLORS.surface, text: COLORS.textPrimary,
  muted: COLORS.textMuted, border: COLORS.border, success: COLORS.success, danger: COLORS.error,
  warning: COLORS.warning, info: COLORS.info, purple: '#7C3AED',
};

type Filter = PhysicalReturnStatus | 'all';
type ActionKind = 'details' | 'approve' | 'reject' | 'schedule' | 'complete';
type ActionState = {
  kind: ActionKind;
  bundle: AdminPhysicalReturnBundle;
  idempotencyKey: string;
};

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'requested', label: 'تحتاج مراجعة' },
  { value: 'approved', label: 'تحتاج جدولة' },
  { value: 'pickup_scheduled', label: 'مجدولة' },
  { value: 'picked_up', label: 'مع المندوب' },
  { value: 'received', label: 'وصلت المتجر' },
  { value: 'inspected', label: 'تحتاج إكمال' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'rejected', label: 'مرفوضة' },
  { value: 'cancelled', label: 'ملغاة' },
  { value: 'all', label: 'الكل' },
];

const STATUS_META: Record<PhysicalReturnStatus, { label: string; color: string; bg: string }> = {
  requested: { label: 'قيد المراجعة', color: UI.warning, bg: '#FFFBEB' },
  approved: { label: 'مقبول', color: UI.info, bg: '#EFF6FF' },
  rejected: { label: 'مرفوض', color: UI.danger, bg: '#FEF2F2' },
  cancelled: { label: 'ملغى', color: UI.muted, bg: '#F1F5F9' },
  pickup_scheduled: { label: 'تمت الجدولة', color: UI.purple, bg: '#F5F3FF' },
  picked_up: { label: 'مع المندوب', color: '#0369A1', bg: '#E0F2FE' },
  received: { label: 'وصل المتجر', color: '#0F766E', bg: '#CCFBF1' },
  inspected: { label: 'تم الفحص', color: '#A16207', bg: '#FEF9C3' },
  completed: { label: 'مكتمل', color: UI.success, bg: '#ECFDF5' },
};

const REASON_LABELS: Record<string, string> = {
  damaged: 'تالف', not_as_described: 'غير مطابق للوصف', wrong_item: 'منتج خاطئ',
  changed_mind: 'تغيير رأي', other: 'سبب آخر',
};

const ACTION_TITLES: Record<ActionKind, string> = {
  details: 'تفاصيل الإرجاع المادي', approve: 'قبول الإرجاع والكميات',
  reject: 'رفض طلب الإرجاع', schedule: 'جدولة استلام المرتجع',
  complete: 'إكمال الإرجاع والاسترداد',
};

function returnItemName(item: AdminPhysicalReturnBundle['items'][number], index: number): string {
  return item.order_items?.product_name
    || item.products?.name_ar
    || item.products?.name
    || t('الصنف {0}', [index + 1]);
}

function returnItemVariant(item: AdminPhysicalReturnBundle['items'][number]): string | null {
  const details = item.order_items?.variant_details;
  if (details && typeof details === 'object') {
    const values = Object.entries(details)
      .filter(([, value]) => value != null && String(value).trim())
      .map(([key, value]) => `${key}: ${String(value)}`);
    if (values.length) return values.join(' • ');
  }
  return item.variant_id ? t('متغير #{0}', [item.variant_id.slice(0, 8)]) : null;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(getLocale());
}

function formatMoney(value?: number | null): string {
  return t('{0} ر.ي', [Number(value ?? 0).toFixed(2)]);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/verified order settlement is missing|legacy return requires reconciliation/i.test(message)) {
    return 'لا توجد تسوية مالية موثقة لهذا الطلب القديم. يجب إجراء مطابقة مالية قبل الإكمال، ولن يخمّن النظام أي مبلغ.';
  }
  if (/approved, active, and online|online courier/i.test(message)) {
    return 'المندوب المختار غير معتمد أو غير متصل الآن. اختر مندوبًا متاحًا ثم أعد المحاولة.';
  }
  if (/idempotency key was reused/i.test(message)) {
    return 'تغيّرت تفاصيل العملية بعد إرسالها. أغلق النافذة وافتحها مجددًا لإنشاء عملية جديدة.';
  }
  return message || 'تعذر تنفيذ العملية. تحقق من الاتصال وحالة الطلب ثم حاول مجددًا.';
}

export default function AdminPhysicalReturnsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 20;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const [filter, setFilter] = useState<Filter>('requested');
  const [returns, setReturns] = useState<AdminPhysicalReturnBundle[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState | null>(null);
  const [notes, setNotes] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [evidenceLinks, setEvidenceLinks] = useState<PhysicalReturnEvidenceLink[]>([]);
  const [proofLinks, setProofLinks] = useState<PhysicalReturnEvidenceLink[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const loadGeneration = useRef(0);
  const evidenceGeneration = useRef(0);

  const onlineDrivers = useMemo(
    () => drivers.filter((driver) => driver.is_approved && driver.is_online === true),
    [drivers],
  );

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGeneration.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError('');
    try {
      const [returnRows, driverRows] = await Promise.all([
        getAdminPhysicalReturns(filter === 'all' ? undefined : filter),
        getAdminDrivers('approved'),
      ]);
      if (generation === loadGeneration.current) {
        setReturns(returnRows);
        setDrivers(driverRows);
      }
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(errorMessage(error));
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filter]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => {
      loadGeneration.current += 1;
      evidenceGeneration.current += 1;
    };
  }, [load]));

  const loadEvidence = useCallback(async (bundle: AdminPhysicalReturnBundle) => {
    const generation = ++evidenceGeneration.current;
    setEvidenceLinks([]);
    setProofLinks([]);
    setEvidenceError('');
    setEvidenceLoading(false);
    const paths = bundle.return.evidence_images ?? [];
    const proofPaths = bundle.proofs.map((proof) => proof.proof_path);
    if (paths.length === 0 && proofPaths.length === 0) return;
    setEvidenceLoading(true);
    try {
      const [links, custodyLinks] = await Promise.all([
        getPhysicalReturnEvidenceLinks(paths),
        getPhysicalReturnProofLinks(proofPaths),
      ]);
      if (generation === evidenceGeneration.current) {
        setEvidenceLinks(links);
        setProofLinks(custodyLinks);
      }
    } catch (error) {
      if (generation === evidenceGeneration.current) setEvidenceError(errorMessage(error));
    } finally {
      if (generation === evidenceGeneration.current) setEvidenceLoading(false);
    }
  }, []);

  const openAction = (bundle: AdminPhysicalReturnBundle, kind: ActionKind) => {
    const defaultDriver = onlineDrivers[0]?.id ?? null;
    setAction({ kind, bundle, idempotencyKey: createIdempotencyKey() });
    setNotes('');
    setExternalReference('');
    setScheduledAt(new Date(Date.now() + 60 * 60 * 1000).toISOString());
    setSelectedDriverId(bundle.return.pickup_method === 'courier_pickup' ? defaultDriver : null);
    setQuantities(Object.fromEntries(
      bundle.items.map((item) => [item.id, String(item.requested_quantity)]),
    ));
    void loadEvidence(bundle);
  };

  const closeAction = () => {
    if (processingId) return;
    evidenceGeneration.current += 1;
    setAction(null);
    setEvidenceLinks([]);
    setProofLinks([]);
    setEvidenceError('');
  };

  const setScheduleOffset = (hours: number) => {
    setScheduledAt(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
  };

  const submitAction = async () => {
    if (!action || action.kind === 'details' || processingId) return;
    const request = action.bundle.return;
    const cleanNotes = notes.trim();

    try {
      setProcessingId(request.id);
      if (action.kind === 'approve') {
        const approvedItems = action.bundle.items.map((item) => ({
          return_item_id: item.id,
          approved_quantity: Number(quantities[item.id]),
        }));
        if (approvedItems.some((item, index) => (
          !Number.isInteger(item.approved_quantity)
          || item.approved_quantity < 0
          || item.approved_quantity > action.bundle.items[index].requested_quantity
        )) || approvedItems.every((item) => item.approved_quantity === 0)) {
          Alert.alert('راجع الكميات', 'يجب تحديد كل كمية برقم صحيح ضمن الكمية المطلوبة، وقبول وحدة واحدة على الأقل.');
          return;
        }
        await adminReviewPhysicalReturn({
          request_id: request.id,
          decision: 'approved',
          approved_items: approvedItems,
          notes: cleanNotes || undefined,
        });
      } else if (action.kind === 'reject') {
        if (cleanNotes.length < 3) {
          Alert.alert('سبب الرفض مطلوب', 'اكتب سببًا واضحًا ليظهر للعميل والتاجر.');
          return;
        }
        await adminReviewPhysicalReturn({
          request_id: request.id,
          decision: 'rejected',
          approved_items: [],
          notes: cleanNotes,
        });
      } else if (action.kind === 'schedule') {
        const timestamp = new Date(scheduledAt);
        if (Number.isNaN(timestamp.getTime()) || timestamp.getTime() < Date.now() - 60_000) {
          Alert.alert('موعد غير صالح', 'اكتب موعدًا مستقبليًا بصيغة صحيحة أو استخدم أحد الاختصارات.');
          return;
        }
        if (request.pickup_method === 'courier_pickup' && !selectedDriverId) {
          Alert.alert('اختر مندوبًا', 'لا يمكن جدولة الاستلام من العميل دون مندوب معتمد ومتصل.');
          return;
        }
        await adminSchedulePhysicalReturn({
          request_id: request.id,
          delivery_profile_id: request.pickup_method === 'courier_pickup' ? selectedDriverId : null,
          scheduled_at: timestamp.toISOString(),
          notes: cleanNotes || undefined,
          idempotency_key: action.idempotencyKey,
        });
      } else if (action.kind === 'complete') {
        const acceptedTotal = action.bundle.items.reduce(
          (total, item) => total + Number(item.accepted_quantity ?? 0),
          0,
        );
        if (acceptedTotal > 0 && request.refund_method === 'original_payment' && !externalReference.trim()) {
          Alert.alert('مرجع التحويل مطلوب', 'أدخل مرجع الاسترداد من بوابة الدفع قبل الإكمال.');
          return;
        }
        await adminCompletePhysicalReturn({
          request_id: request.id,
          external_reference: acceptedTotal > 0 ? externalReference.trim() || undefined : undefined,
          notes: cleanNotes || undefined,
          idempotency_key: action.idempotencyKey,
        });
      }

      setAction(null);
      Alert.alert('تمت العملية', 'حُفظت حالة الإرجاع وسجل التدقيق بنجاح.');
      await load(true);
    } catch (error) {
      Alert.alert('تعذر تنفيذ الإجراء', errorMessage(error));
    } finally {
      setProcessingId(null);
    }
  };

  const renderReturn = ({ item: bundle }: { item: AdminPhysicalReturnBundle }) => {
    const request = bundle.return;
    const status = STATUS_META[request.status];
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[s.statusText, { color: status.color }]}>{tv(status.label)}</Text>
          </View>
          <View style={s.cardTitleGroup}>
            <Text style={s.orderNumber}>{t('طلب #{0}', [tv(bundle.order.order_number)])}</Text>
            <Text style={s.returnId}>{t('إرجاع {0}', [request.id.slice(0, 8)])}</Text>
          </View>
        </View>

        <View style={s.partyRow}>
          <Info icon="person-outline" label={t('العميل')} value={bundle.customer.full_name || bundle.customer.phone || t('غير محدد')} />
          <Info icon="storefront-outline" label={t('التاجر')} value={bundle.merchant?.store_name || t('غير محدد')} />
        </View>
        <View style={s.metaGrid}>
          <Meta label={t('السبب')} value={REASON_LABELS[request.reason] ?? request.reason} />
          <Meta label={t('طريقة التسليم')} value={request.pickup_method === 'courier_pickup' ? t('استلام مندوب') : t('تسليم للمتجر')} />
          <Meta label={t('طريقة الاسترداد')} value={request.refund_method === 'wallet' ? t('المحفظة') : t('وسيلة الدفع الأصلية')} />
          <Meta label={t('تاريخ الطلب')} value={formatDate(request.created_at)} />
        </View>

        {request.description ? <Text style={s.description}>{tv(request.description)}</Text> : null}
        <View style={s.itemSummary}>
          <Ionicons name="cube-outline" size={18} color={UI.primary} />
          <Text style={s.itemSummaryText}>{t('{0} صنف · {1} وحدة مطلوبة', [tv(bundle.items.length), bundle.items.reduce((sum, item) => sum + item.requested_quantity, 0)])}</Text>
          <Text style={s.evidenceCount}>{t('{0} دليل', [request.evidence_images?.length ?? 0])}</Text>
        </View>

        {request.merchant_recommendation ? (
          <View style={s.merchantResponse}>
            <Text style={s.merchantResponseTitle}>{t('توصية التاجر: {0}', [request.merchant_recommendation === 'approve' ? 'قبول' : 'رفض'])}</Text>
            <Text style={s.merchantResponseText}>{tv(request.merchant_response || t('بدون تفاصيل'))}</Text>
          </View>
        ) : null}

        <View style={s.actions}>
          <TouchableOpacity style={s.detailsButton} onPress={() => openAction(bundle, 'details')}>
            <Ionicons name="eye-outline" size={18} color={UI.primary} />
            <Text style={s.detailsButtonText}>{t('التفاصيل والأدلة')}</Text>
          </TouchableOpacity>
          {request.status === 'requested' ? (
            <>
              <TouchableOpacity style={s.rejectButton} onPress={() => openAction(bundle, 'reject')}>
                <Text style={s.rejectButtonText}>{t('رفض')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.primaryButton} onPress={() => openAction(bundle, 'approve')}>
                <Text style={s.primaryButtonText}>{t('مراجعة وقبول')}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {request.status === 'approved' ? (
            <TouchableOpacity style={s.primaryButton} onPress={() => openAction(bundle, 'schedule')}>
              <Text style={s.primaryButtonText}>{t('جدولة التسليم')}</Text>
            </TouchableOpacity>
          ) : null}
          {request.status === 'inspected' ? (
            <TouchableOpacity style={[s.primaryButton, { backgroundColor: UI.success }]} onPress={() => openAction(bundle, 'complete')}>
              <Text style={s.primaryButtonText}>{t('إكمال الاسترداد')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingHorizontal: pagePadding + Math.max((width - contentWidth) / 2, 0) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerButton} accessibilityLabel={t('العودة')}>
          <Ionicons name="arrow-forward" size={22} color={UI.text} />
        </TouchableOpacity>
        <View style={s.headerCopy}>
          <Text style={s.title}>{t('الإرجاعات المادية')}</Text>
          <Text style={s.subtitle}>{t('مراجعة الكميات ومسار الاستلام والفحص والاسترداد')}</Text>
        </View>
        <TouchableOpacity onPress={() => void load(true)} style={s.headerButton} accessibilityLabel={t('تحديث')}>
          <Ionicons name="refresh" size={21} color={UI.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {FILTERS.map((item) => (
          <TouchableOpacity
            key={item.value}
            onPress={() => setFilter(item.value)}
            style={[s.filterButton, filter === item.value && s.filterButtonActive]}
            accessibilityState={{ selected: filter === item.value }}
          >
            <Text style={[s.filterText, filter === item.value && s.filterTextActive]}>{tv(item.label)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : loadError ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={44} color={UI.danger} />
          <Text style={s.errorText}>{tv(loadError)}</Text>
          <TouchableOpacity style={s.retryButton} onPress={() => void load()}><Text style={s.retryText}>{t('إعادة المحاولة')}</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={returns}
          key={`physical-returns-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          keyExtractor={(item) => item.return.id}
          renderItem={renderReturn}
          contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={50} color={UI.success} />
              <Text style={s.emptyTitle}>{t('لا توجد إرجاعات في هذه المرحلة')}</Text>
              <Text style={s.emptyText}>{t('ستظهر الطلبات هنا فور انتقالها إلى الحالة المحددة.')}</Text>
            </View>
          )}
        />
      )}

      <Modal visible={!!action} transparent animationType="slide" onRequestClose={closeAction} accessibilityViewIsModal>
        <View style={[s.modalBackdrop, !compact && s.modalBackdropDesktop]}>
          <View style={[s.modalCard, !compact && s.modalCardDesktop, { width: Math.min(Math.max(width - 24, 280), 820) }]}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={closeAction} style={s.modalClose} disabled={!!processingId} accessibilityLabel={t('إغلاق')}>
                <Ionicons name="close" size={23} color={UI.text} />
              </TouchableOpacity>
              <View style={s.modalHeaderCopy}>
                <Text style={s.modalTitle}>{tv(action ? ACTION_TITLES[action.kind] : '')}</Text>
                <Text style={s.modalSubtitle}>{tv(action ? `#${action.bundle.order.order_number}` : '')}</Text>
              </View>
            </View>

            {action ? (
              <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
                <View style={s.summaryBox}>
                  <Meta label={t('الحالة')} value={STATUS_META[action.bundle.return.status].label} />
                  <Meta label={t('العميل')} value={action.bundle.customer.full_name || action.bundle.customer.phone || '—'} />
                  <Meta label={t('المتجر')} value={action.bundle.merchant?.store_name || '—'} />
                  <Meta label={t('قيمة الطلب')} value={formatMoney(action.bundle.order.total_amount)} />
                </View>

                <SectionTitle title={t('الأدلة')} />
                {evidenceLoading ? <ActivityIndicator color={UI.primary} /> : evidenceError ? (
                  <Text style={s.inlineError}>{tv(evidenceError)}</Text>
                ) : evidenceLinks.length === 0 ? (
                  <Text style={s.mutedText}>{t('لا توجد مرفقات لهذا السبب.')}</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.evidenceRow}>
                    {evidenceLinks.map((link, index) => {
                      const isPdf = /\.pdf(?:\?|$)/i.test(link.path);
                      return (
                        <TouchableOpacity key={link.path} style={s.evidenceCard} onPress={() => void Linking.openURL(link.signedUrl)}>
                          {isPdf ? (
                            <Ionicons name="document-text" size={36} color={UI.danger} />
                          ) : (
                            <Image source={{ uri: link.signedUrl }} style={s.evidenceImage} />
                          )}
                          <Text style={s.evidenceLabel} numberOfLines={1}>{t('دليل {0}', [index + 1])}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <SectionTitle title={t('إثباتات عهدة المندوب')} />
                {evidenceLoading ? <ActivityIndicator color={UI.primary} /> : evidenceError ? null : proofLinks.length === 0 ? (
                  <Text style={s.mutedText}>{t('لا توجد إثباتات عهدة في هذه المرحلة.')}</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.evidenceRow}>
                    {proofLinks.map((link) => {
                      const proof = action.bundle.proofs.find((item) => item.proof_path === link.path);
                      return (
                        <TouchableOpacity key={link.path} style={s.evidenceCard} onPress={() => void Linking.openURL(link.signedUrl)}>
                          <Image source={{ uri: link.signedUrl }} style={s.evidenceImage} />
                          <Text style={s.evidenceLabel} numberOfLines={1}>
                            {tv(proof?.proof_type === 'pickup' ? t('إثبات الاستلام') : t('إثبات التسليم'))}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <SectionTitle title={t('الكميات')} />
                {action.bundle.items.map((item, index) => (
                  <View key={item.id} style={s.returnItem}>
                    <View style={s.itemCopy}>
                      <Text style={s.itemTitle}>{tv(returnItemName(item, index))}</Text>
                      {returnItemVariant(item) ? <Text style={s.itemDetail}>{tv(returnItemVariant(item))}</Text> : null}
                      <Text style={s.itemDetail}>{t('مشتراة {0} · مطلوبة {1}{2}{3}', [tv(item.purchased_quantity), tv(item.requested_quantity), item.approved_quantity !== null ? ` · مقبولة إداريًا ${item.approved_quantity}` : '', item.accepted_quantity !== null ? ` · مقبولة بعد الفحص ${item.accepted_quantity}` : ''])}</Text>
                      {item.disposition ? <Text style={s.itemDetail}>{t('التصرف: {0}', [tv(item.disposition)])}</Text> : null}
                    </View>
                    {action.kind === 'approve' ? (
                      <TextInput
                        value={quantities[item.id] ?? ''}
                        onChangeText={(value) => setQuantities((current) => ({ ...current, [item.id]: value.replace(/[^0-9]/g, '') }))}
                        keyboardType="number-pad"
                        style={s.quantityInput}
                        accessibilityLabel={t('الكمية المقبولة للصنف {0}', [index + 1])}
                      />
                    ) : null}
                  </View>
                ))}

                {action.kind === 'schedule' ? (
                  <>
                    <SectionTitle title={t('الموعد')} />
                    <View style={s.quickScheduleRow}>
                      {[1, 3, 24].map((hours) => (
                        <TouchableOpacity key={hours} style={s.quickScheduleButton} onPress={() => setScheduleOffset(hours)}>
                          <Text style={s.quickScheduleText}>{tv(hours === 24 ? t('غدًا') : t('بعد {0} س', [tv(hours)]))}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      value={scheduledAt}
                      onChangeText={setScheduledAt}
                      style={s.input}
                      autoCapitalize="none"
                      placeholder="2026-07-14T12:00:00+03:00"
                    />
                    <Text style={s.inputHint}>{t('المعاينة: {0}', [formatDate(scheduledAt)])}</Text>

                    {action.bundle.return.pickup_method === 'courier_pickup' ? (
                      <>
                        <SectionTitle title={t('المندوب المتصل')} />
                        {onlineDrivers.length === 0 ? (
                          <View style={s.warningBox}>
                            <Ionicons name="warning-outline" size={20} color={UI.warning} />
                            <Text style={s.warningText}>{t('لا يوجد مندوب معتمد ومتصل الآن. لا يمكن تجاوز هذا الشرط.')}</Text>
                          </View>
                        ) : onlineDrivers.map((driver) => (
                          <TouchableOpacity
                            key={driver.id}
                            style={[s.driverRow, selectedDriverId === driver.id && s.driverRowSelected]}
                            onPress={() => setSelectedDriverId(driver.id)}
                          >
                            <Ionicons name={selectedDriverId === driver.id ? 'radio-button-on' : 'radio-button-off'} size={21} color={UI.primary} />
                            <View style={s.driverCopy}>
                              <Text style={s.driverName}>{tv(driver.users?.full_name || driver.users?.phone || driver.id.slice(0, 8))}</Text>
                              <Text style={s.driverMeta}>{tv(driver.vehicle_type || t('مركبة'))} · {tv(driver.vehicle_plate || t('بدون لوحة'))}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </>
                    ) : (
                      <View style={s.infoBox}><Text style={s.infoText}>{t('العميل سيسلّم المرتجع للمتجر؛ لن يتم إسناد مندوب.')}</Text></View>
                    )}
                  </>
                ) : null}

                {action.kind === 'complete' ? (
                  <>
                    <SectionTitle title={t('الاسترداد')} />
                    {action.bundle.items.reduce((total, item) => total + Number(item.accepted_quantity ?? 0), 0) === 0 ? (
                      <View style={s.infoBox}>
                        <Text style={s.infoText}>{t('رفض الفحص جميع الكميات. سيُغلق المرتجع بلا استرداد مالي، بلا إعادة مخزون، وبلا تغيير لحالة الطلب أو إنشاء مرجع دفع.')}</Text>
                      </View>
                    ) : (
                      <View style={s.infoBox}>
                        <Text style={s.infoText}>{t('سيحسب الخادم قيمة البضاعة المقبولة بعد خصم حصتها من خصم الطلب وإضافة حصتها من الضريبة، دون رسوم التوصيل، ولن يتجاوز رصيد التسوية.')}</Text>
                      </View>
                    )}
                    {action.bundle.items.reduce((total, item) => total + Number(item.accepted_quantity ?? 0), 0) > 0
                    && action.bundle.return.refund_method === 'original_payment' ? (
                      <TextInput
                        value={externalReference}
                        onChangeText={setExternalReference}
                        style={s.input}
                        placeholder={t('مرجع الاسترداد من بوابة الدفع (مطلوب)')}
                        textAlign="right"
                      />
                    ) : action.bundle.items.reduce((total, item) => total + Number(item.accepted_quantity ?? 0), 0) > 0 ? (
                      <Text style={s.mutedText}>{t('سيُضاف المبلغ إلى محفظة العميل عند نجاح التسوية.')}</Text>
                    ) : null}
                  </>
                ) : null}

                {action.kind !== 'details' ? (
                  <>
                    <SectionTitle title={action.kind === 'reject' ? t('سبب الرفض') : t('ملاحظات الإدارة')} />
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      style={[s.input, s.notesInput]}
                      placeholder={action.kind === 'reject' ? t('سبب واضح ومحدد (مطلوب)') : t('ملاحظة اختيارية تظهر في سجل العملية')}
                      multiline
                      textAlignVertical="top"
                      textAlign="right"
                    />
                  </>
                ) : null}

                {action.kind === 'details' ? (
                  <>
                    <SectionTitle title={t('التتبع')} />
                    {action.bundle.tracking.length === 0 ? <Text style={s.mutedText}>{t('لا توجد أحداث.')}</Text> : action.bundle.tracking.map((event) => (
                      <View key={event.id} style={s.timelineRow}>
                        <View style={s.timelineDot} />
                        <View style={s.timelineCopy}>
                          <Text style={s.timelineTitle}>{tv(STATUS_META[event.status]?.label ?? event.status)}</Text>
                          <Text style={s.timelineMeta}>{tv(formatDate(event.created_at))} · {tv(event.actor_role || t('النظام'))}</Text>
                          {event.notes ? <Text style={s.timelineNotes}>{tv(event.notes)}</Text> : null}
                        </View>
                      </View>
                    ))}
                    <Text style={s.mutedText}>{t('إثباتات عهدة المندوب: {0}', [tv(action.bundle.proofs.length)])}</Text>
                    {action.bundle.refund ? <Text style={s.mutedText}>{t('تم ربط سجل الاسترداد المالي بهذا الإرجاع.')}</Text> : null}
                  </>
                ) : null}
              </ScrollView>
            ) : null}

            {action?.kind !== 'details' ? (
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelButton} onPress={closeAction} disabled={!!processingId}>
                  <Text style={s.cancelButtonText}>{t('تراجع')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.submitButton, action?.kind === 'reject' && { backgroundColor: UI.danger }]}
                  onPress={() => void submitAction()}
                  disabled={!!processingId}
                >
                  {processingId ? <ActivityIndicator color="#FFF" /> : <Text style={s.submitButtonText}>{t('تأكيد الإجراء')}</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.modalFooter}>
                <TouchableOpacity style={s.submitButton} onPress={closeAction}><Text style={s.submitButtonText}>{t('إغلاق')}</Text></TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Info({ icon, label, value }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={s.infoItem}>
      <Ionicons name={icon} size={18} color={UI.primary} />
      <View style={s.infoItemCopy}><Text style={s.infoLabel}>{tv(label)}</Text><Text style={s.infoValue} numberOfLines={1}>{tv(value)}</Text></View>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={s.metaItem}><Text style={s.metaLabel}>{tv(label)}</Text><Text style={s.metaValue}>{tv(value)}</Text></View>;
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{tv(title)}</Text>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { backgroundColor: UI.card, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 38, paddingBottom: 18, flexDirection: 'row-reverse', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: UI.border },
  headerButton: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'flex-end', paddingHorizontal: 14 },
  title: { fontSize: 22, fontWeight: '900', color: UI.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: UI.muted, marginTop: 4, textAlign: 'right' },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse' },
  filterButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border },
  filterButtonActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 12, color: UI.muted, fontWeight: '700' },
  filterTextActive: { color: '#FFF' },
  list: { alignSelf: 'center', paddingTop: 16, paddingBottom: 112, gap: 14, flexGrow: 1 },
  columnRow: { gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 },
  errorText: { color: UI.danger, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: UI.primary, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFF', fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: UI.text },
  emptyText: { color: UI.muted, textAlign: 'center' },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: UI.border, padding: 17, gap: 13, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleGroup: { alignItems: 'flex-end' },
  orderNumber: { fontSize: 16, fontWeight: '900', color: UI.text },
  returnId: { fontSize: 11, color: UI.muted, marginTop: 3 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  statusText: { fontSize: 11, fontWeight: '900' },
  partyRow: { flexDirection: 'row-reverse', gap: 10 },
  infoItem: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10 },
  infoItemCopy: { flex: 1, alignItems: 'flex-end' },
  infoLabel: { fontSize: 10, color: UI.muted },
  infoValue: { fontSize: 12, color: UI.text, fontWeight: '800', maxWidth: '100%' },
  metaGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  metaItem: { minWidth: '46%', flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 9, alignItems: 'flex-end' },
  metaLabel: { fontSize: 10, color: UI.muted },
  metaValue: { fontSize: 12, color: UI.text, fontWeight: '700', textAlign: 'right', marginTop: 2 },
  description: { color: UI.text, fontSize: 13, lineHeight: 20, textAlign: 'right', backgroundColor: '#F8FAFC', padding: 11, borderRadius: 11 },
  itemSummary: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  itemSummaryText: { flex: 1, color: UI.text, fontWeight: '700', textAlign: 'right' },
  evidenceCount: { color: UI.info, fontWeight: '800', fontSize: 12 },
  merchantResponse: { borderRightWidth: 3, borderRightColor: UI.warning, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, alignItems: 'flex-end' },
  merchantResponseTitle: { color: '#92400E', fontSize: 12, fontWeight: '900' },
  merchantResponseText: { color: '#78350F', fontSize: 12, marginTop: 3, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: UI.border, paddingTop: 12 },
  detailsButton: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: UI.primary, backgroundColor: COLORS.primarySoft, paddingHorizontal: 12, paddingVertical: 10, borderRadius: RADIUS.sm },
  detailsButtonText: { color: UI.primary, fontWeight: '800', fontSize: 12 },
  primaryButton: { backgroundColor: UI.primary, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11 },
  primaryButtonText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  rejectButton: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11 },
  rejectButtonText: { color: UI.danger, fontWeight: '900', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  modalBackdropDesktop: { justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: UI.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '92%', minHeight: '55%', overflow: 'hidden' },
  modalCardDesktop: { borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: UI.border },
  modalClose: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  modalHeaderCopy: { flex: 1, alignItems: 'flex-end', paddingLeft: 12 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: UI.text, textAlign: 'right' },
  modalSubtitle: { fontSize: 12, color: UI.muted, marginTop: 3 },
  modalContent: { padding: 18, paddingBottom: 28, gap: 12 },
  summaryBox: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: UI.text, textAlign: 'right', marginTop: 6 },
  evidenceRow: { gap: 10, flexDirection: 'row-reverse' },
  evidenceCard: { width: 112, height: 112, borderRadius: 13, borderWidth: 1, borderColor: UI.border, backgroundColor: '#F8FAFC', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  evidenceImage: { width: '100%', height: 82, resizeMode: 'cover' },
  evidenceLabel: { width: '100%', paddingHorizontal: 7, paddingVertical: 6, color: UI.text, fontSize: 11, textAlign: 'center' },
  inlineError: { color: UI.danger, textAlign: 'right', lineHeight: 19 },
  mutedText: { color: UI.muted, textAlign: 'right', lineHeight: 20 },
  returnItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 13, padding: 11 },
  itemCopy: { flex: 1, alignItems: 'flex-end' },
  itemTitle: { fontWeight: '900', color: UI.text },
  itemDetail: { color: UI.muted, fontSize: 11, textAlign: 'right', marginTop: 3 },
  quantityInput: { width: 62, height: 42, borderWidth: 1, borderColor: '#93C5FD', borderRadius: 10, textAlign: 'center', color: UI.text, fontWeight: '900', backgroundColor: '#EFF6FF' },
  quickScheduleRow: { flexDirection: 'row-reverse', gap: 8 },
  quickScheduleButton: { flex: 1, backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  quickScheduleText: { color: UI.primary, fontWeight: '800', fontSize: 12 },
  input: { borderWidth: 1, borderColor: UI.border, borderRadius: 12, backgroundColor: '#FFF', color: UI.text, paddingHorizontal: 13, paddingVertical: 12, textAlign: 'right' },
  inputHint: { color: UI.muted, fontSize: 11, textAlign: 'right' },
  notesInput: { minHeight: 92 },
  warningBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 12 },
  warningText: { flex: 1, color: '#92400E', textAlign: 'right', lineHeight: 19 },
  infoBox: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  infoText: { color: '#1E3A8A', textAlign: 'right', lineHeight: 20 },
  driverRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 12, padding: 11 },
  driverRowSelected: { borderColor: UI.primary, backgroundColor: '#EFF6FF' },
  driverCopy: { flex: 1, alignItems: 'flex-end' },
  driverName: { color: UI.text, fontWeight: '900' },
  driverMeta: { color: UI.muted, fontSize: 11, marginTop: 3 },
  timelineRow: { flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: UI.primary, marginTop: 5 },
  timelineCopy: { flex: 1, alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: UI.border, paddingBottom: 10 },
  timelineTitle: { color: UI.text, fontWeight: '800' },
  timelineMeta: { color: UI.muted, fontSize: 10, marginTop: 2 },
  timelineNotes: { color: UI.text, fontSize: 12, textAlign: 'right', marginTop: 4 },
  modalFooter: { flexDirection: 'row-reverse', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: UI.border, backgroundColor: '#FFF' },
  cancelButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#F1F5F9' },
  cancelButtonText: { color: UI.text, fontWeight: '800' },
  submitButton: { flex: 2, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: UI.primary },
  submitButtonText: { color: '#FFF', fontWeight: '900' },
});
