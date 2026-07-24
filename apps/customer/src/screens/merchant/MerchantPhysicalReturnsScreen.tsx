import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  getMerchantPhysicalReturns,
  getMerchantProfile,
  getPhysicalReturnEvidenceLinks,
  getPhysicalReturnProofLinks,
  inspectPhysicalReturn,
  merchantReceivePhysicalReturn,
  MerchantPhysicalReturn,
  PhysicalReturnEvidenceLink,
  PhysicalReturnItem,
  respondPhysicalReturnRequest,
  supabase,
  useAuthStore,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

type Recommendation = 'approve' | 'reject';
type Disposition = 'restock' | 'discard' | 'repair' | 'return_to_vendor' | 'rejected';

interface InspectionDraft {
  acceptedQuantity: string;
  disposition: Disposition | '';
  notes: string;
}

type LoadMode = 'initial' | 'refresh' | 'realtime' | 'more';

const PAGE_SIZE = 40;

interface MerchantPhysicalReturnsScreenProps {
  navigation: { goBack: () => void };
}

const STATUS: Record<string, { label: string; color: string; background: string }> = {
  requested: { label: 'بانتظار مراجعة التاجر', color: '#B45309', background: '#FFFBEB' },
  approved: { label: 'معتمد', color: '#1D4ED8', background: '#EFF6FF' },
  rejected: { label: 'مرفوض', color: '#B91C1C', background: '#FEF2F2' },
  cancelled: { label: 'ملغي', color: '#64748B', background: '#F1F5F9' },
  pickup_scheduled: { label: 'تم تحديد الاستلام', color: '#6D28D9', background: '#F5F3FF' },
  picked_up: { label: 'استلمه المندوب', color: '#0369A1', background: '#F0F9FF' },
  received: { label: 'وصل إلى المتجر', color: '#047857', background: '#ECFDF5' },
  inspected: { label: 'تم الفحص', color: '#0F766E', background: '#F0FDFA' },
  completed: { label: 'مكتمل', color: '#047857', background: '#ECFDF5' },
};

const REASONS: Record<string, string> = {
  damaged: 'المنتج تالف',
  not_as_described: 'غير مطابق للوصف',
  wrong_item: 'تم استلام منتج مختلف',
  changed_mind: 'تغيير رأي العميل',
  other: 'سبب آخر',
};

const DISPOSITIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'restock', label: 'إعادة للمخزون' },
  { value: 'discard', label: 'إتلاف' },
  { value: 'repair', label: 'صيانة' },
  { value: 'return_to_vendor', label: 'إرجاع للمورد' },
  { value: 'rejected', label: 'رفض الكمية' },
];

const FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'actionable', label: 'تحتاج إجراء' },
  { key: 'requested', label: 'جديدة' },
  { key: 'pickup_scheduled', label: 'موعد استلام' },
  { key: 'received', label: 'وصلت المتجر' },
  { key: 'inspected', label: 'تم فحصها' },
  { key: 'completed', label: 'مكتملة' },
];

function itemName(item: PhysicalReturnItem): string {
  return item.order_items?.product_name
    || item.products?.name_ar
    || item.products?.name
    || `منتج ${item.product_id.slice(0, 8)}`;
}

function variantLabel(item: PhysicalReturnItem): string {
  const details = item.order_items?.variant_details;
  if (details && typeof details === 'object') {
    const values = Object.entries(details)
      .filter(([, value]) => value != null && String(value).trim())
      .map(([key, value]) => `${key}: ${String(value)}`);
    if (values.length) return values.join(' • ');
  }
  return item.variant_id ? `متغير #${item.variant_id.slice(0, 8)}` : 'بدون متغير';
}

function isPreviewableImage(path: string): boolean {
  return /\.(?:jpe?g|png)(?:$|\?)/i.test(path);
}

function merchandiseValue(item: PhysicalReturnItem): { quantity: number; amount: number; stage: string } {
  if (item.accepted_quantity != null) {
    return {
      quantity: Number(item.accepted_quantity),
      amount: Number(item.unit_price ?? 0) * Number(item.accepted_quantity),
      stage: 'المقبولة بعد الفحص',
    };
  }
  if (item.approved_quantity != null) {
    return {
      quantity: Number(item.approved_quantity),
      amount: Number(item.unit_price ?? 0) * Number(item.approved_quantity),
      stage: 'المعتمدة للإرجاع',
    };
  }
  return {
    quantity: Number(item.requested_quantity),
    amount: Number(item.unit_price ?? 0) * Number(item.requested_quantity),
    stage: 'المطلوبة للإرجاع',
  };
}

function isActionable(item: MerchantPhysicalReturn): boolean {
  if (item.status === 'requested') return true;
  if (item.pickup_method === 'customer_dropoff' && item.status === 'pickup_scheduled') return true;
  return item.status === 'received';
}

export default function MerchantPhysicalReturnsScreen({ navigation }: MerchantPhysicalReturnsScreenProps) {
  const user = useAuthStore((state) => state.user);
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const [returns, setReturns] = useState<MerchantPhysicalReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('actionable');
  const [actionId, setActionId] = useState<string | null>(null);

  const loadGeneration = useRef(0);
  const evidenceGeneration = useRef(0);
  const returnsRef = useRef<MerchantPhysicalReturn[]>([]);
  const merchantProfileIdRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  const [responseTarget, setResponseTarget] = useState<MerchantPhysicalReturn | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation>('approve');
  const [response, setResponse] = useState('');

  const [receiptTarget, setReceiptTarget] = useState<MerchantPhysicalReturn | null>(null);
  const [receiptNotes, setReceiptNotes] = useState('');

  const [evidenceTarget, setEvidenceTarget] = useState<MerchantPhysicalReturn | null>(null);
  const [evidenceLinks, setEvidenceLinks] = useState<PhysicalReturnEvidenceLink[]>([]);
  const [proofLinks, setProofLinks] = useState<PhysicalReturnEvidenceLink[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');

  const [inspectionTarget, setInspectionTarget] = useState<MerchantPhysicalReturn | null>(null);
  const [inspectionDrafts, setInspectionDrafts] = useState<Record<string, InspectionDraft>>({});
  const [inspectionNotes, setInspectionNotes] = useState('');

  const load = useCallback(async (mode: LoadMode = 'initial') => {
    if (mode === 'more' && (loadingMoreRef.current || !hasMoreRef.current)) return;
    const generation = ++loadGeneration.current;
    const append = mode === 'more';

    if (!user?.id) {
      returnsRef.current = [];
      merchantProfileIdRef.current = null;
      setReturns([]);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setHasMore(false);
      return;
    }

    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    if (!append) setLoadError('');
    setLoadMoreError('');

    try {
      let profileId = merchantProfileIdRef.current;
      if (!append || !profileId) {
        const profile = await getMerchantProfile(user.id);
        if (!profile?.id) throw new Error('ملف التاجر غير موجود.');
        profileId = profile.id;
      }
      const offset = append ? returnsRef.current.length : 0;
      const rows = await getMerchantPhysicalReturns(profileId, { limit: PAGE_SIZE, offset });
      if (generation !== loadGeneration.current) return;

      merchantProfileIdRef.current = profileId;
      const nextRows = append
        ? [...new Map([...returnsRef.current, ...rows].map((item) => [item.id, item])).values()]
        : rows;
      returnsRef.current = nextRows;
      setReturns(nextRows);
      const nextHasMore = rows.length === PAGE_SIZE;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
      setLoadError('');
      setLoadMoreError('');
    } catch (error: any) {
      if (generation !== loadGeneration.current) return;
      const message = error?.message ?? 'تعذر تحميل المرتجعات الفعلية.';
      if (append || returnsRef.current.length > 0) setLoadMoreError(message);
      else setLoadError(message);
    } finally {
      if (generation === loadGeneration.current) {
        loadingMoreRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void load('initial');
    return () => { loadGeneration.current += 1; };
  }, [load]));

  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase
      .channel(`merchant-physical-returns-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'return_requests' }, () => {
        void load('realtime');
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setLoadMoreError('انقطع التحديث المباشر. يمكنك إعادة مزامنة القائمة يدويًا.');
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const visibleReturns = useMemo(() => {
    if (!filter) return returns;
    if (filter === 'actionable') return returns.filter(isActionable);
    return returns.filter((item) => item.status === filter);
  }, [filter, returns]);

  const clearEvidence = useCallback(() => {
    evidenceGeneration.current += 1;
    setEvidenceLinks([]);
    setProofLinks([]);
    setEvidenceError('');
    setEvidenceLoading(false);
  }, []);

  const loadEvidence = useCallback(async (item: MerchantPhysicalReturn) => {
    const generation = ++evidenceGeneration.current;
    const evidencePaths = item.evidence_images ?? [];
    const custodyPaths = (item.return_proofs ?? []).map((proof) => proof.proof_path);
    setEvidenceLinks([]);
    setProofLinks([]);
    setEvidenceError('');
    if (!evidencePaths.length && !custodyPaths.length) {
      setEvidenceLoading(false);
      return;
    }

    setEvidenceLoading(true);
    const [evidenceResult, proofResult] = await Promise.allSettled([
      evidencePaths.length ? getPhysicalReturnEvidenceLinks(evidencePaths) : Promise.resolve([]),
      custodyPaths.length ? getPhysicalReturnProofLinks(custodyPaths) : Promise.resolve([]),
    ]);
    if (generation !== evidenceGeneration.current) return;

    if (evidenceResult.status === 'fulfilled') setEvidenceLinks(evidenceResult.value);
    if (proofResult.status === 'fulfilled') setProofLinks(proofResult.value);
    const failures = [evidenceResult, proofResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    if (failures.length) setEvidenceError(failures.join('\n'));
    setEvidenceLoading(false);
  }, []);

  const openResponse = (item: MerchantPhysicalReturn) => {
    setEvidenceTarget(null);
    setReceiptTarget(null);
    setResponseTarget(item);
    setRecommendation(item.merchant_recommendation ?? 'approve');
    setResponse(item.merchant_response ?? '');
    void loadEvidence(item);
  };

  const closeResponse = () => {
    if (actionId) return;
    setResponseTarget(null);
    clearEvidence();
  };

  const openEvidence = (item: MerchantPhysicalReturn) => {
    setResponseTarget(null);
    setReceiptTarget(null);
    setEvidenceTarget(item);
    void loadEvidence(item);
  };

  const closeEvidence = () => {
    setEvidenceTarget(null);
    clearEvidence();
  };

  const submitResponse = async () => {
    if (!responseTarget || actionId || !response.trim()) return;
    setActionId(responseTarget.id);
    try {
      await respondPhysicalReturnRequest(responseTarget.id, recommendation, response);
      setResponseTarget(null);
      clearEvidence();
      await load('realtime');
      Alert.alert('تم إرسال التوصية', 'وصل ردك إلى الإدارة والعميل، وبقي قرار الاعتماد النهائي لدى الإدارة.');
    } catch (error: any) {
      Alert.alert('تعذر إرسال التوصية', error?.message ?? 'تحقق من الاتصال ثم حاول مرة أخرى.');
    } finally {
      setActionId(null);
    }
  };

  const openReceipt = (item: MerchantPhysicalReturn) => {
    if (actionId) return;
    setResponseTarget(null);
    setEvidenceTarget(null);
    setReceiptTarget(item);
    setReceiptNotes('');
    void loadEvidence(item);
  };

  const closeReceipt = () => {
    if (actionId) return;
    setReceiptTarget(null);
    setReceiptNotes('');
    clearEvidence();
  };

  const submitReceipt = async () => {
    if (!receiptTarget || actionId) return;
    setActionId(receiptTarget.id);
    try {
      await merchantReceivePhysicalReturn(receiptTarget.id, receiptNotes);
      setReceiptTarget(null);
      setReceiptNotes('');
      clearEvidence();
      await load('realtime');
      Alert.alert('تم التأكيد', 'أصبح المرتجع جاهزًا لتسجيل نتيجة الفحص.');
    } catch (error: any) {
      Alert.alert('تعذر تأكيد الاستلام', error?.message ?? 'تحقق من حالة المرتجع ثم حاول مرة أخرى.');
    } finally {
      setActionId(null);
    }
  };

  const openInspection = (item: MerchantPhysicalReturn) => {
    const drafts: Record<string, InspectionDraft> = {};
    for (const returnItem of item.return_items ?? []) {
      drafts[returnItem.id] = {
        acceptedQuantity: '',
        disposition: '',
        notes: returnItem.inspection_notes ?? '',
      };
    }
    setInspectionDrafts(drafts);
    setInspectionNotes(item.inspection_notes ?? '');
    setInspectionTarget(item);
  };

  const updateInspectionDraft = (itemId: string, patch: Partial<InspectionDraft>) => {
    setInspectionDrafts((current) => ({
      ...current,
      [itemId]: { ...current[itemId], ...patch },
    }));
  };

  const submitInspection = async () => {
    if (!inspectionTarget || actionId) return;
    const returnItems = inspectionTarget.return_items ?? [];
    if (!returnItems.length) {
      Alert.alert('بيانات غير مكتملة', 'لا توجد عناصر مرتبطة بهذا المرتجع.');
      return;
    }

    const payload = [] as Array<{
      return_item_id: string;
      accepted_quantity: number;
      disposition: Disposition;
      notes?: string;
    }>;
    for (const item of returnItems) {
      const draft = inspectionDrafts[item.id];
      if (!draft) {
        Alert.alert('بيانات غير مكتملة', `تعذر تجهيز نتيجة فحص ${itemName(item)}.`);
        return;
      }
      if (!draft.acceptedQuantity.trim()) {
        Alert.alert('نتيجة الفحص مطلوبة', `أدخل الكمية المقبولة فعليًا لـ ${itemName(item)}، حتى لو كانت صفرًا.`);
        return;
      }
      const accepted = Number(draft.acceptedQuantity);
      const approved = Number(item.approved_quantity ?? 0);
      if (!Number.isInteger(accepted) || accepted < 0 || accepted > approved) {
        Alert.alert('كمية غير صحيحة', `الكمية المقبولة لـ ${itemName(item)} يجب أن تكون بين 0 و${approved}.`);
        return;
      }
      if (!draft.disposition) {
        Alert.alert('نتيجة الفحص مطلوبة', `اختر التصرف بالكمية الخاصة بـ ${itemName(item)}.`);
        return;
      }
      if ((accepted === 0 && draft.disposition !== 'rejected')
        || (accepted > 0 && draft.disposition === 'rejected')) {
        Alert.alert('نتيجة غير متطابقة', `اختر "رفض الكمية" عند قبول صفر من ${itemName(item)}، أو اختر تصرفًا فعليًا للكمية المقبولة.`);
        return;
      }
      payload.push({
        return_item_id: item.id,
        accepted_quantity: accepted,
        disposition: draft.disposition,
        notes: draft.notes.trim() || undefined,
      });
    }

    setActionId(inspectionTarget.id);
    try {
      await inspectPhysicalReturn({
        request_id: inspectionTarget.id,
        items: payload,
        notes: inspectionNotes,
      });
      setInspectionTarget(null);
      await load();
      Alert.alert('اكتمل الفحص', 'تم حفظ قرار كل عنصر. إذا كانت جميع الكميات مرفوضة فستغلق الإدارة المرتجع بلا استرداد أو حركة مخزون.');
    } catch (error: any) {
      Alert.alert('تعذر حفظ الفحص', error?.message ?? 'راجع الكميات وحاول مرة أخرى.');
    } finally {
      setActionId(null);
    }
  };

  const renderEvidencePanel = () => (
    <View style={styles.evidencePanel}>
      {evidenceLoading ? (
        <View style={styles.evidenceLoadingRow}>
          <ActivityIndicator size="small" color="#1E3A8A" />
          <Text style={styles.evidenceHint}>جاري فتح الملفات الخاصة بصلاحية مؤقتة...</Text>
        </View>
      ) : null}
      {evidenceError ? <Text style={styles.evidenceError}>{evidenceError}</Text> : null}
      {evidenceLinks.length ? (
        <View>
          <Text style={styles.evidenceTitle}>أدلة العميل</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceRow}>
            {evidenceLinks.map((link, index) => (
              <TouchableOpacity key={link.path} style={styles.evidenceCard} onPress={() => void Linking.openURL(link.signedUrl)} accessibilityRole="link">
                {isPreviewableImage(link.path) ? (
                  <Image source={{ uri: link.signedUrl }} style={styles.evidenceImage} />
                ) : (
                  <View style={styles.evidenceFileIcon}><Ionicons name="document-text-outline" size={28} color="#1E3A8A" /></View>
                )}
                <Text style={styles.evidenceLabel}>دليل {index + 1}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {proofLinks.length ? (
        <View>
          <Text style={styles.evidenceTitle}>إثباتات نقل العهدة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceRow}>
            {proofLinks.map((link, index) => (
              <TouchableOpacity key={link.path} style={styles.evidenceCard} onPress={() => void Linking.openURL(link.signedUrl)} accessibilityRole="link">
                <Image source={{ uri: link.signedUrl }} style={styles.evidenceImage} />
                <Text style={styles.evidenceLabel}>إثبات {index + 1}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {!evidenceLoading && !evidenceError && !evidenceLinks.length && !proofLinks.length ? (
        <Text style={styles.evidenceHint}>لا توجد ملفات مرفقة بهذا المرتجع.</Text>
      ) : null}
    </View>
  );

  const renderReturn = ({ item }: { item: MerchantPhysicalReturn }) => {
    const baseMeta = STATUS[item.status] ?? { label: item.status, color: '#475569', background: '#F1F5F9' };
    const meta = item.status === 'completed'
      ? {
        ...baseMeta,
        label: item.refund_request_id || Number(item.refund_amount ?? 0) > 0
          ? 'مكتمل ومسترد'
          : 'مغلق بلا استرداد',
      }
      : baseMeta;
    const canConfirmReceipt = (
      item.pickup_method === 'customer_dropoff' && item.status === 'pickup_scheduled'
    ) || (
      item.status === 'received' && !item.merchant_received_at
    );
    const canInspect = item.status === 'received' && Boolean(item.merchant_received_at);
    const busy = actionId === item.id;
    const tracking = item.return_tracking ?? [];
    const latestTracking = tracking.reduce<(typeof tracking)[number] | undefined>((latest, event) => (
      !latest || new Date(event.created_at).getTime() > new Date(latest.created_at).getTime()
        ? event
        : latest
    ), undefined);
    const receiptEvent = tracking
      .filter((event) => event.status === 'received' && event.notes)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];

    return (
      <View style={[styles.card, isCompact && styles.cardCompact]}>
        <View style={[styles.cardHeader, isCompact && styles.cardHeaderCompact]}>
          <View style={[styles.statusBadge, { backgroundColor: meta.background }]}>
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={styles.orderInfo}>
            <Text style={styles.orderNumber}>طلب #{item.orders?.order_number ?? item.order_id.slice(0, 8)}</Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString('ar-SA')}</Text>
          </View>
        </View>

        <View style={[styles.infoGrid, isCompact && styles.infoGridCompact]}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>العميل</Text>
            <Text style={styles.infoValue}>{item.users?.full_name ?? 'عميل الطلب'}</Text>
            {item.users?.phone ? <Text style={styles.secondaryValue}>{item.users.phone}</Text> : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>طريقة التسليم</Text>
            <Text style={styles.infoValue}>{item.pickup_method === 'courier_pickup' ? 'استلام بواسطة مندوب' : 'تسليم العميل للمتجر'}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>سبب الإرجاع</Text>
        <Text style={styles.bodyText}>{REASONS[item.reason] ?? item.reason}</Text>
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

        <View style={styles.itemsBox}>
          <Text style={styles.itemsTitle}>العناصر المرتجعة</Text>
          {(item.return_items ?? []).map((returnItem) => (
            <View key={returnItem.id} style={[styles.itemRow, isCompact && styles.itemRowCompact]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{itemName(returnItem)}</Text>
                <Text style={styles.itemVariant}>{variantLabel(returnItem)}</Text>
                <Text style={styles.itemMeta}>
                  مطلوب {returnItem.requested_quantity}
                  {returnItem.approved_quantity != null ? ` • معتمد ${returnItem.approved_quantity}` : ''}
                  {returnItem.accepted_quantity != null ? ` • مقبول ${returnItem.accepted_quantity}` : ''}
                </Text>
              </View>
              <View style={styles.itemAmountWrap}>
                <Text style={styles.itemAmount}>{merchandiseValue(returnItem).amount.toFixed(2)} ر.ي</Text>
                <Text style={styles.itemAmountStage}>{merchandiseValue(returnItem).stage}</Text>
              </View>
            </View>
          ))}
        </View>

        {item.pickup_scheduled_at ? (
          <View style={styles.scheduleBox}>
            <Ionicons name="calendar-outline" size={17} color="#6D28D9" />
            <Text style={styles.scheduleText}>موعد الاستلام: {new Date(item.pickup_scheduled_at).toLocaleString('ar-SA')}</Text>
          </View>
        ) : null}

        {item.merchant_response ? (
          <View style={styles.responseBox}>
            <Text style={styles.sectionLabel}>توصية التاجر: {item.merchant_recommendation === 'approve' ? 'موافقة' : 'رفض'}</Text>
            <Text style={styles.bodyText}>{item.merchant_response}</Text>
          </View>
        ) : null}

        {item.review_notes ? (
          <View style={styles.adminBox}>
            <Text style={styles.sectionLabel}>ملاحظات الإدارة</Text>
            <Text style={styles.bodyText}>{item.review_notes}</Text>
          </View>
        ) : null}

        {receiptEvent?.notes ? (
          <View style={styles.receiptBox}>
            <Text style={styles.sectionLabel}>ملاحظات استلام المتجر</Text>
            <Text style={styles.bodyText}>{receiptEvent.notes}</Text>
          </View>
        ) : null}

        {latestTracking ? (
          <Text style={styles.latestEvent}>
            آخر تحديث: {STATUS[latestTracking.status]?.label ?? latestTracking.status}
            {latestTracking.notes ? ` — ${latestTracking.notes}` : ''}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {item.status === 'requested' ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => openResponse(item)} disabled={Boolean(actionId)} accessibilityRole="button">
              <Ionicons name="chatbox-ellipses-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>{item.merchant_response ? 'تحديث التوصية' : 'مراجعة الطلب'}</Text>
            </TouchableOpacity>
          ) : null}
          {canConfirmReceipt ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => openReceipt(item)} disabled={Boolean(actionId)} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="cube-outline" size={18} color="#FFFFFF" />}
              <Text style={styles.primaryButtonText}>تأكيد وصول المرتجع</Text>
            </TouchableOpacity>
          ) : null}
          {canInspect ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => openInspection(item)} disabled={Boolean(actionId)} accessibilityRole="button">
              <Ionicons name="clipboard-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>فحص الكميات</Text>
            </TouchableOpacity>
          ) : null}
          {(item.evidence_images?.length || item.return_proofs?.length) ? (
            <TouchableOpacity style={styles.outlineButton} onPress={() => openEvidence(item)} disabled={Boolean(actionId)} accessibilityRole="button">
              <Ionicons name="images-outline" size={18} color="#1E3A8A" />
              <Text style={styles.outlineButtonText}>عرض الأدلة والإثباتات</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={[styles.header, isCompact && styles.headerCompact, isDesktop && styles.headerWide]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة">
          <Ionicons name="arrow-forward" size={23} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>المرتجعات الفعلية</Text>
          <Text style={styles.subtitle}>راجع الطلب، أكد وصول المنتجات، ثم سجل نتيجة الفحص لكل كمية.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, isDesktop && styles.filtersWide]}>
        {FILTERS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.filter, filter === option.key && styles.filterActive]}
            onPress={() => setFilter(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === option.key }}
          >
            <Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#111827" /></View>
      ) : loadError ? (
        <View style={styles.center} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={44} color="#B91C1C" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void load(); }} accessibilityRole="button">
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleReturns}
          keyExtractor={(item) => item.id}
          renderItem={renderReturn}
          contentContainerStyle={styles.list}
          numColumns={isDesktop ? 2 : 1}
          key={isDesktop ? 'returns-grid' : 'returns-list'}
          columnWrapperStyle={isDesktop ? styles.columnWrapper : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          onEndReached={() => { if (hasMore) void load('more'); }}
          onEndReachedThreshold={0.35}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator style={styles.listFooter} color="#111827" />
          ) : loadMoreError ? (
            <View style={styles.listFooter} accessibilityRole="alert">
              <Text style={styles.errorText}>{loadMoreError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => void load('more')} accessibilityRole="button">
                <Text style={styles.retryText}>إعادة تحميل المزيد</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.center}>
              <Ionicons name="return-down-back-outline" size={42} color="#94A3B8" />
              <Text style={styles.emptyText}>لا توجد مرتجعات ضمن هذا التصنيف.</Text>
            </View>
          )}
        />
      )}

      <Modal visible={Boolean(responseTarget)} transparent animationType="fade" onRequestClose={closeResponse} accessibilityViewIsModal>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={[styles.modalCardContent, isCompact && styles.modalCardCompact]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>توصية التاجر</Text>
            <Text style={styles.modalHint}>هذه توصية للإدارة وليست القرار النهائي. اذكر نتيجة مراجعة الطلب بوضوح.</Text>
            {renderEvidencePanel()}
            <View style={[styles.choiceRow, isCompact && styles.choiceRowCompact]}>
              {([
                { value: 'approve' as Recommendation, label: 'أوصي بالموافقة', icon: 'checkmark-circle-outline' },
                { value: 'reject' as Recommendation, label: 'أوصي بالرفض', icon: 'close-circle-outline' },
              ]).map((choice) => (
                <TouchableOpacity
                  key={choice.value}
                  style={[styles.choice, recommendation === choice.value && styles.choiceActive]}
                  onPress={() => setRecommendation(choice.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: recommendation === choice.value }}
                >
                  <Ionicons name={choice.icon as any} size={19} color={recommendation === choice.value ? '#FFFFFF' : '#475569'} />
                  <Text style={[styles.choiceText, recommendation === choice.value && styles.choiceTextActive]}>{choice.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.responseInput}
              value={response}
              onChangeText={setResponse}
              multiline
              maxLength={2000}
              textAlign="right"
              textAlignVertical="top"
              placeholder="اشرح سبب توصيتك وحالة المنتج قبل التسليم..."
              placeholderTextColor="#94A3B8"
            />
            <View style={[styles.modalActions, isCompact && styles.modalActionsCompact]}>
              <TouchableOpacity style={styles.secondaryButton} onPress={closeResponse} disabled={Boolean(actionId)}>
                <Text style={styles.secondaryButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitButton, (!response.trim() || actionId) && styles.disabled]} onPress={submitResponse} disabled={!response.trim() || Boolean(actionId)}>
                {actionId ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>إرسال التوصية</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={Boolean(receiptTarget)} transparent animationType="fade" onRequestClose={closeReceipt} accessibilityViewIsModal>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={[styles.modalCardContent, isCompact && styles.modalCardCompact]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>تأكيد استلام المرتجع</Text>
            <Text style={styles.modalHint}>راجع إثبات نقل العهدة وحالة الطرد، ثم سجل أي ملاحظة استلام قبل بدء الفحص.</Text>
            {renderEvidencePanel()}
            <TextInput
              style={styles.responseInput}
              value={receiptNotes}
              onChangeText={setReceiptNotes}
              multiline
              maxLength={2000}
              textAlign="right"
              textAlignVertical="top"
              placeholder="ملاحظات حالة الطرد عند الوصول (اختياري)"
              placeholderTextColor="#94A3B8"
            />
            <View style={[styles.modalActions, isCompact && styles.modalActionsCompact]}>
              <TouchableOpacity style={styles.secondaryButton} onPress={closeReceipt} disabled={Boolean(actionId)}>
                <Text style={styles.secondaryButtonText}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitButton, actionId && styles.disabled]} onPress={submitReceipt} disabled={Boolean(actionId)}>
                {actionId ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>تأكيد الاستلام</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={Boolean(evidenceTarget)} transparent animationType="fade" onRequestClose={closeEvidence} accessibilityViewIsModal>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={[styles.modalCardContent, isCompact && styles.modalCardCompact]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>أدلة المرتجع وإثباتات العهدة</Text>
            <Text style={styles.modalHint}>الروابط خاصة ومؤقتة. افتح الملف لمراجعته بالحجم الكامل.</Text>
            {renderEvidencePanel()}
            <TouchableOpacity style={styles.secondaryButton} onPress={closeEvidence} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>إغلاق</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={Boolean(inspectionTarget)} animationType="slide" onRequestClose={() => !actionId && setInspectionTarget(null)} accessibilityViewIsModal>
        <View style={styles.inspectionPage}>
          <View style={[styles.inspectionHeader, isCompact && styles.inspectionHeaderCompact]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setInspectionTarget(null)} disabled={Boolean(actionId)} accessibilityRole="button">
              <Ionicons name="close" size={23} color="#111827" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>فحص المرتجع</Text>
              <Text style={styles.subtitle}>حدد الكمية المقبولة ووجهتها لكل عنصر. لا يمكن تعديلها بعد إكمال الإدارة للاسترداد.</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={[styles.inspectionContent, isCompact && styles.inspectionContentCompact]} keyboardShouldPersistTaps="handled">
            {(inspectionTarget?.return_items ?? []).map((item) => {
              const draft = inspectionDrafts[item.id];
              const approved = Number(item.approved_quantity ?? 0);
              return (
                <View key={item.id} style={styles.inspectionItem}>
                  <Text style={styles.inspectionItemName}>{itemName(item)}</Text>
                  <Text style={styles.itemMeta}>الكمية المعتمدة من الإدارة: {approved}</Text>
                  <Text style={styles.fieldLabel}>الكمية المقبولة فعليًا</Text>
                  <TextInput
                    style={styles.quantityInput}
                    value={draft?.acceptedQuantity ?? ''}
                    onChangeText={(value) => updateInspectionDraft(item.id, { acceptedQuantity: value.replace(/[^0-9]/g, '') })}
                    keyboardType="number-pad"
                    maxLength={4}
                    textAlign="right"
                    accessibilityLabel={`الكمية المقبولة من ${itemName(item)}`}
                  />
                  <Text style={styles.fieldLabel}>التصرف بالكمية</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dispositions}>
                    {DISPOSITIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.disposition, draft?.disposition === option.value && styles.dispositionActive]}
                        onPress={() => updateInspectionDraft(item.id, { disposition: option.value })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: draft?.disposition === option.value }}
                      >
                        <Text style={[styles.dispositionText, draft?.disposition === option.value && styles.dispositionTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={styles.itemNotesInput}
                    value={draft?.notes ?? ''}
                    onChangeText={(value) => updateInspectionDraft(item.id, { notes: value })}
                    maxLength={2000}
                    multiline
                    textAlign="right"
                    textAlignVertical="top"
                    placeholder="ملاحظة على حالة هذا العنصر (اختياري)"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              );
            })}
            <Text style={styles.fieldLabel}>ملاحظات الفحص العامة</Text>
            <TextInput
              style={styles.responseInput}
              value={inspectionNotes}
              onChangeText={setInspectionNotes}
              maxLength={2000}
              multiline
              textAlign="right"
              textAlignVertical="top"
              placeholder="ملخص حالة المرتجع (اختياري)"
              placeholderTextColor="#94A3B8"
            />
            <TouchableOpacity style={[styles.submitInspection, actionId && styles.disabled]} onPress={submitInspection} disabled={Boolean(actionId)} accessibilityRole="button">
              {actionId ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>حفظ نتيجة الفحص</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerCompact: { paddingHorizontal: 14 },
  headerWide: { width: '100%', maxWidth: 1240, alignSelf: 'center' },
  backButton: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.textPrimary, fontSize: 21, fontFamily: FONTS.bold, textAlign: 'right' },
  subtitle: { color: '#64748B', fontSize: 11.5, lineHeight: 18, textAlign: 'right', marginTop: 3 },
  filters: { flexDirection: 'row-reverse', padding: 14, gap: 8 },
  filtersWide: { width: '100%', maxWidth: 1240, alignSelf: 'center' },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.full, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  filterActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { color: '#64748B', fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },
  list: { width: '100%', maxWidth: 1240, alignSelf: 'center', padding: 16, paddingTop: 2, gap: 12, paddingBottom: 90 },
  columnWrapper: { gap: 12 },
  listFooter: { alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 16 },
  center: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#B91C1C', textAlign: 'center', lineHeight: 21 },
  emptyText: { color: '#64748B', fontWeight: '700' },
  retryButton: { minHeight: 44, justifyContent: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 18, borderRadius: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  card: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg, padding: 17, borderWidth: 1, borderColor: '#E2E8F0' },
  cardCompact: { padding: 14, borderRadius: RADIUS.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeaderCompact: { flexDirection: 'column', alignItems: 'stretch' },
  statusBadge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  orderInfo: { flex: 1, alignItems: 'flex-end' },
  orderNumber: { color: '#0F172A', fontWeight: '900', fontSize: 15 },
  date: { color: '#94A3B8', fontSize: 10.5, marginTop: 3 },
  infoGrid: { flexDirection: 'row-reverse', gap: 10, marginTop: 14 },
  infoGridCompact: { flexDirection: 'column' },
  infoBlock: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 11, padding: 11, alignItems: 'flex-end' },
  infoLabel: { color: '#94A3B8', fontSize: 10.5, fontWeight: '700' },
  infoValue: { color: '#0F172A', fontSize: 12.5, fontWeight: '800', marginTop: 3, textAlign: 'right' },
  secondaryValue: { color: '#64748B', fontSize: 10.5, marginTop: 2 },
  sectionLabel: { color: '#64748B', fontSize: 11, fontWeight: '800', textAlign: 'right', marginTop: 12 },
  bodyText: { color: '#0F172A', fontSize: 13, lineHeight: 20, textAlign: 'right', marginTop: 3 },
  description: { color: '#334155', fontSize: 12.5, lineHeight: 20, textAlign: 'right', marginTop: 4 },
  itemsBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, marginTop: 13 },
  itemsTitle: { color: '#475569', fontSize: 11.5, fontWeight: '900', textAlign: 'right', marginBottom: 3 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#CBD5E1' },
  itemRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
  itemName: { color: '#0F172A', fontSize: 12.5, fontWeight: '800', textAlign: 'right' },
  itemVariant: { color: '#475569', fontSize: 10.5, lineHeight: 16, textAlign: 'right', marginTop: 2 },
  itemMeta: { color: '#64748B', fontSize: 10.5, lineHeight: 17, textAlign: 'right', marginTop: 2 },
  itemAmount: { color: '#111827', fontWeight: '800', fontSize: 11.5 },
  itemAmountWrap: { maxWidth: 110, alignItems: 'flex-start' },
  itemAmountStage: { color: '#94A3B8', fontSize: 8.5, lineHeight: 13, marginTop: 2, textAlign: 'left' },
  scheduleBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: '#F5F3FF', borderRadius: 11, padding: 11, marginTop: 11 },
  scheduleText: { flex: 1, color: '#5B21B6', fontSize: 11.5, fontWeight: '800', textAlign: 'right' },
  responseBox: { backgroundColor: '#EFF6FF', borderRadius: 11, padding: 11, marginTop: 11 },
  adminBox: { backgroundColor: '#FFFBEB', borderRadius: 11, padding: 11, marginTop: 11 },
  receiptBox: { backgroundColor: '#F0FDFA', borderRadius: 11, padding: 11, marginTop: 11 },
  latestEvent: { color: '#64748B', fontSize: 10.5, lineHeight: 17, textAlign: 'right', marginTop: 11 },
  actions: { marginTop: 14, gap: 8 },
  primaryButton: { minHeight: 45, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  outlineButton: { minHeight: 45, borderRadius: 11, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  outlineButtonText: { color: '#1E3A8A', fontWeight: '900', fontSize: 12.5 },
  modalOverlay: { flex: 1, backgroundColor: '#0F172A99', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 600, maxHeight: '92%', backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg },
  modalCardContent: { padding: 20 },
  modalCardCompact: { padding: 14 },
  modalTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900', textAlign: 'right' },
  modalHint: { color: '#64748B', fontSize: 12.5, lineHeight: 20, textAlign: 'right', marginTop: 6 },
  evidencePanel: { gap: 10, marginTop: 13, maxHeight: 280 },
  evidenceLoadingRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  evidenceHint: { color: '#64748B', fontSize: 11.5, lineHeight: 18, textAlign: 'center' },
  evidenceError: { color: '#B91C1C', backgroundColor: '#FEF2F2', borderRadius: 9, padding: 9, fontSize: 11.5, lineHeight: 18, textAlign: 'right' },
  evidenceTitle: { color: '#334155', fontSize: 11.5, fontWeight: '900', textAlign: 'right', marginBottom: 6 },
  evidenceRow: { flexDirection: 'row-reverse', gap: 9 },
  evidenceCard: { width: 116, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  evidenceImage: { width: 116, height: 84, backgroundColor: '#E2E8F0' },
  evidenceFileIcon: { width: 116, height: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  evidenceLabel: { color: '#1E3A8A', fontSize: 10.5, fontWeight: '800', textAlign: 'center', padding: 7 },
  choiceRow: { flexDirection: 'row-reverse', gap: 9, marginTop: 15 },
  choiceRowCompact: { flexDirection: 'column' },
  choice: { flex: 1, minHeight: 45, borderRadius: 11, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', flexDirection: 'row-reverse', gap: 6, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  choiceText: { color: '#475569', fontSize: 11.5, fontWeight: '800' },
  choiceTextActive: { color: '#FFFFFF' },
  responseInput: { minHeight: 105, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, backgroundColor: '#F8FAFC', color: '#0F172A', padding: 12, marginTop: 14 },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 15 },
  modalActionsCompact: { flexDirection: 'column' },
  secondaryButton: { flex: 1, minHeight: 45, backgroundColor: '#F1F5F9', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#64748B', fontWeight: '800' },
  submitButton: { flex: 2, minHeight: 45, backgroundColor: COLORS.primary, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  submitButtonText: { color: '#FFFFFF', fontWeight: '900' },
  disabled: { opacity: 0.5 },
  inspectionPage: { flex: 1, backgroundColor: '#F8FAFC' },
  inspectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  inspectionHeaderCompact: { paddingHorizontal: 14 },
  inspectionContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 60 },
  inspectionContentCompact: { paddingHorizontal: 14 },
  inspectionItem: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 15, marginBottom: 12 },
  inspectionItemName: { color: '#0F172A', fontSize: 15, fontWeight: '900', textAlign: 'right' },
  fieldLabel: { color: '#475569', fontSize: 11.5, fontWeight: '800', textAlign: 'right', marginTop: 13, marginBottom: 6 },
  quantityInput: { minHeight: 44, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, backgroundColor: '#F8FAFC', color: '#0F172A', paddingHorizontal: 12, fontSize: 15, fontWeight: '800' },
  dispositions: { flexDirection: 'row-reverse', gap: 7, paddingVertical: 2 },
  disposition: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 11, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  dispositionActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dispositionText: { color: '#475569', fontSize: 10.5, fontWeight: '800' },
  dispositionTextActive: { color: '#FFFFFF' },
  itemNotesInput: { minHeight: 70, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, backgroundColor: '#F8FAFC', color: '#0F172A', padding: 11, marginTop: 12 },
  submitInspection: { minHeight: 49, backgroundColor: COLORS.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
});
