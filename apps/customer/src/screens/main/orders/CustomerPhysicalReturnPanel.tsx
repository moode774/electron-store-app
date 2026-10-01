import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  cancelPhysicalReturnRequest,
  createIdempotencyKey,
  createPhysicalReturnRequest,
  getMyPhysicalReturns,
  OrderDetail,
  PhysicalReturnRequest,
  supabase,
  uploadPrivateFileToStorage,
} from '@marketplace/shared-hooks';
import { COLORS, FONTS, ORDER_STATUS, RADIUS } from '@marketplace/shared-utils';
import { Alert } from '../../../components/appAlert';
import { useTranslation } from '../../../i18n';

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['requested', 'approved', 'pickup_scheduled', 'picked_up', 'received', 'inspected']);

const STATUS_META: Record<string, { titleKey: string; detailKey: string; color: string; background: string; border: string }> = {
  requested: { titleKey: 'physicalReturn.requestedTitle', detailKey: 'physicalReturn.requestedDetail', color: '#92400E', background: '#FFFBEB', border: '#FDE68A' },
  approved: { titleKey: 'physicalReturn.approvedTitle', detailKey: 'physicalReturn.approvedDetail', color: '#166534', background: '#F0FDF4', border: '#BBF7D0' },
  rejected: { titleKey: 'physicalReturn.rejectedTitle', detailKey: 'physicalReturn.rejectedDetail', color: '#B91C1C', background: '#FEF2F2', border: '#FECACA' },
  cancelled: { titleKey: 'physicalReturn.cancelledTitle', detailKey: 'physicalReturn.cancelledDetail', color: '#475569', background: '#F8FAFC', border: '#CBD5E1' },
  pickup_scheduled: { titleKey: 'physicalReturn.scheduledTitle', detailKey: 'physicalReturn.scheduledDetail', color: '#1D4ED8', background: '#EFF6FF', border: '#BFDBFE' },
  picked_up: { titleKey: 'physicalReturn.pickedTitle', detailKey: 'physicalReturn.pickedDetail', color: '#1D4ED8', background: '#EFF6FF', border: '#BFDBFE' },
  received: { titleKey: 'physicalReturn.receivedTitle', detailKey: 'physicalReturn.receivedDetail', color: '#6D28D9', background: '#F5F3FF', border: '#DDD6FE' },
  inspected: { titleKey: 'physicalReturn.inspectedTitle', detailKey: 'physicalReturn.inspectedDetail', color: '#6D28D9', background: '#F5F3FF', border: '#DDD6FE' },
  completed: { titleKey: 'physicalReturn.completedTitle', detailKey: 'physicalReturn.completedDetail', color: '#166534', background: '#F0FDF4', border: '#BBF7D0' },
};

const RETURN_REASONS: Array<{ value: PhysicalReturnRequest['reason']; labelKey: string }> = [
  { value: 'damaged', labelKey: 'physicalReturn.damaged' },
  { value: 'not_as_described', labelKey: 'physicalReturn.notDescribed' },
  { value: 'wrong_item', labelKey: 'physicalReturn.wrongItem' },
  { value: 'changed_mind', labelKey: 'physicalReturn.changedMind' },
  { value: 'other', labelKey: 'physicalReturn.other' },
];

type Props = { order: OrderDetail; userId: string };
type EvidenceFile = {
  id: string;
  uri: string;
  contentType: 'image/jpeg' | 'image/png';
  size?: number;
  path?: string;
};

export default function CustomerPhysicalReturnPanel({ order, userId }: Props) {
  const { t, language } = useTranslation();
  const [requests, setRequests] = useState<PhysicalReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState<PhysicalReturnRequest['reason'] | ''>('');
  const [description, setDescription] = useState('');
  const [pickupMethod, setPickupMethod] = useState<PhysicalReturnRequest['pickup_method']>('courier_pickup');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getMyPhysicalReturns(userId, order.id);
      setRequests(result);
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.message ?? t('physicalReturn.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [order.id, userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const channel = supabase
      .channel(`customer-physical-return-${order.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'return_requests', filter: `order_id=eq.${order.id}`,
      }, () => { void load(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'return_tracking',
      }, () => { void load(); })
      .subscribe();
    const fallback = setInterval(() => { void load(); }, 30000);
    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [load, order.id]);

  const completedRequested = useMemo(() => {
    const result: Record<string, number> = {};
    for (const request of requests) {
      if (request.status !== 'completed') continue;
      for (const item of request.return_items ?? []) {
        result[item.order_item_id] = (result[item.order_item_id] ?? 0) + item.requested_quantity;
      }
    }
    return result;
  }, [requests]);

  const availableItems = (order.order_items ?? []).map((item) => ({
    ...item,
    available: Math.max(0, item.quantity - (completedRequested[item.id] ?? 0)),
  })).filter((item) => item.available > 0);
  const activeRequest = requests.find((request) => ACTIVE_STATUSES.has(request.status));
  const latestRequest = activeRequest ?? requests[0];
  const referenceValue = order.delivered_at ?? order.updated_at ?? order.created_at;
  const referenceTime = referenceValue ? new Date(referenceValue).getTime() : Number.NaN;
  const returnDeadline = referenceTime + RETURN_WINDOW_MS;
  const windowKnown = Number.isFinite(referenceTime);
  const windowOpen = order.status === ORDER_STATUS.DELIVERED && windowKnown && Date.now() <= returnDeadline;
  const canCreate = windowOpen && !activeRequest && availableItems.length > 0;
  const selectedItems = availableItems
    .map((item) => ({ order_item_id: item.id, quantity: quantities[item.id] ?? 0 }))
    .filter((item) => item.quantity > 0);

  const changeQuantity = (itemId: string, max: number, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [itemId]: Math.max(0, Math.min(max, (current[itemId] ?? 0) + delta)),
    }));
  };

  const openForm = () => {
    idempotencyKey.current = createIdempotencyKey();
    setReason('');
    setDescription('');
    setPickupMethod('courier_pickup');
    setQuantities({});
    setEvidence([]);
    setShowForm(true);
  };

  const pickEvidence = async () => {
    if (evidence.length >= 5 || submitting) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(t('physicalReturn.photosRequired'), t('physicalReturn.photosRequiredText'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.75,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const contentType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      if (asset.fileSize != null && (asset.fileSize < 1 || asset.fileSize > 10 * 1024 * 1024)) {
        Alert.alert(t('physicalReturn.imageRejected'), t('physicalReturn.imageTooLarge'));
        return;
      }
      setEvidence((current) => [...current, {
        id: createIdempotencyKey(),
        uri: asset.uri,
        contentType,
        size: asset.fileSize,
      }]);
    } catch (error: any) {
      Alert.alert(t('physicalReturn.chooseImageFailed'), error?.message ?? t('orderTracking.tryAgain'));
    }
  };

  const submit = async () => {
    if (!reason) { Alert.alert(t('physicalReturn.chooseReason'), t('physicalReturn.chooseReasonText')); return; }
    if (!selectedItems.length) { Alert.alert(t('physicalReturn.chooseProducts'), t('physicalReturn.chooseProductsText')); return; }
    if (description.trim().length < 10) { Alert.alert(t('physicalReturn.detailsRequired'), t('physicalReturn.detailsText')); return; }
    if (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0) {
      Alert.alert(t('physicalReturn.evidenceRequired'), t('physicalReturn.evidenceRequiredText'));
      return;
    }
    setSubmitting(true);
    try {
      const requestKey = idempotencyKey.current ?? createIdempotencyKey();
      idempotencyKey.current = requestKey;
      const nextEvidence = [...evidence];
      for (let index = 0; index < nextEvidence.length; index += 1) {
        const file = nextEvidence[index];
        if (file.path) continue;
        const extension = file.contentType === 'image/png' ? 'png' : 'jpg';
        const path = `${userId}/${order.id}/${requestKey}/${file.id}.${extension}`;
        await uploadPrivateFileToStorage({
          bucket: 'return-evidence',
          objectPath: path,
          uri: file.uri,
          contentType: file.contentType,
        });
        nextEvidence[index] = { ...file, path };
        setEvidence([...nextEvidence]);
      }
      await createPhysicalReturnRequest({
        order_id: order.id,
        items: selectedItems,
        reason,
        description,
        evidence_images: nextEvidence.map((file) => file.path).filter((path): path is string => Boolean(path)),
        pickup_method: pickupMethod,
        refund_method: 'original_payment',
        idempotency_key: requestKey,
      });
      await load();
      setShowForm(false);
      idempotencyKey.current = null;
      Alert.alert(t('physicalReturn.sentTitle'), t('physicalReturn.sentText'));
    } catch (error: any) {
      Alert.alert(t('physicalReturn.sendFailed'), error?.message ?? t('physicalReturn.retryKeepData'));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = () => {
    if (!latestRequest || latestRequest.status !== 'requested') return;
    Alert.alert(t('physicalReturn.cancelTitle'), t('physicalReturn.cancelText'), [
      { text: t('physicalReturn.undo'), style: 'cancel' },
      {
        text: t('physicalReturn.cancelOrder'), style: 'destructive', onPress: async () => {
          try {
            await cancelPhysicalReturnRequest(latestRequest.id, t('physicalReturn.customerCancelledReason'));
            await load();
          } catch (error: any) {
            Alert.alert(t('physicalReturn.cancelFailed'), error?.message ?? t('orderTracking.tryAgain'));
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#172554" /><Text style={styles.loadingText}>{t('physicalReturn.checking')}</Text></View>;
  }

  const completedWithoutRefund = latestRequest?.status === 'completed'
    && !latestRequest.refund_request_id
    && Number(latestRequest.refund_amount ?? 0) === 0;
  const status = latestRequest
    ? (completedWithoutRefund
      ? {
        ...STATUS_META.completed,
        titleKey: 'physicalReturn.closedNoRefundTitle',
        detailKey: 'physicalReturn.closedNoRefundDetail',
      }
      : (STATUS_META[latestRequest.status] ?? STATUS_META.requested))
    : null;

  return (
    <View>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionTitle}>{t('physicalReturn.sectionTitle')}</Text>
        <Text style={styles.sectionText}>{t('physicalReturn.sectionText')}</Text>
      </View>

      {latestRequest && status ? (
        <View style={[styles.statusCard, { backgroundColor: status.background, borderColor: status.border }]} accessibilityRole="summary">
          <Text style={[styles.statusTitle, { color: status.color }]}>{t(status.titleKey)}</Text>
          <Text style={[styles.statusText, { color: status.color }]}>{t(status.detailKey)}</Text>
          <Text style={[styles.statusText, { color: status.color }]}>{t('physicalReturn.method')}: {latestRequest.pickup_method === 'courier_pickup' ? t('physicalReturn.courierPickup') : t('physicalReturn.customerDropoff')}</Text>
          {latestRequest.pickup_scheduled_at ? <Text style={[styles.statusText, { color: status.color }]}>{t('physicalReturn.appointment')}: {new Date(latestRequest.pickup_scheduled_at).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</Text> : null}
          {latestRequest.review_notes ? <Text style={[styles.statusText, { color: status.color }]}>{t('physicalReturn.adminDecision')}: {latestRequest.review_notes}</Text> : null}
          {latestRequest.merchant_response ? <Text style={[styles.statusText, { color: status.color }]}>{t('physicalReturn.merchantReply')}: {latestRequest.merchant_response}</Text> : null}
          {latestRequest.inspection_notes ? <Text style={[styles.statusText, { color: status.color }]}>{t('physicalReturn.inspectionResult')}: {latestRequest.inspection_notes}</Text> : null}
          {latestRequest.status === 'completed' ? (
            <Text style={[styles.statusText, { color: status.color }]}>
              {completedWithoutRefund ? t('physicalReturn.noRefundCreated') : `${t('physicalReturn.refundedAmount')}: ${latestRequest.refund_amount} ${t('merchant.currencyYER')}`}
            </Text>
          ) : null}
          {latestRequest.status === 'requested' ? (
            <TouchableOpacity onPress={cancel} style={styles.cancelRequestBtn} accessibilityRole="button" accessibilityLabel={t('physicalReturn.cancelTitle')}>
              <Text style={styles.cancelRequestText}>{t('physicalReturn.cancelBeforeApproval')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {loadError ? (
        <TouchableOpacity style={styles.errorCard} onPress={() => void load()} accessibilityRole="button" accessibilityLabel={t('physicalReturn.recheckA11y')}>
          <Text style={styles.errorText}>{loadError} {t('physicalReturn.tapRetryNoNew')}</Text>
        </TouchableOpacity>
      ) : null}

      {!loadError && order.status === ORDER_STATUS.DELIVERED && !windowOpen && !activeRequest ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{windowKnown ? `${t('physicalReturn.returnWindowExpired')} ${new Date(returnDeadline).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}. ${t('physicalReturn.exceptionalComplaint')}` : t('physicalReturn.deliveryTimeUnknown')}</Text>
        </View>
      ) : null}

      {canCreate && !loadError && !showForm ? (
        <TouchableOpacity style={styles.openBtn} onPress={openForm} accessibilityRole="button" accessibilityLabel={t('physicalReturn.openRequest')}>
          <Ionicons name="cube-outline" size={19} color="#172554" />
          <Text style={styles.openBtnText}>{latestRequest?.status === 'completed' ? t('physicalReturn.remainingQuantity') : t('physicalReturn.requestReturn')}</Text>
        </TouchableOpacity>
      ) : null}

      {showForm && canCreate ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{t('physicalReturn.selectProductsQty')}</Text>
          {availableItems.map((item) => {
            const quantity = quantities[item.id] ?? 0;
            return (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.product_name ?? item.products?.name ?? t('physicalReturn.productFallback')}</Text>
                  <Text style={styles.itemSub}>{t('physicalReturn.availableReturn')}: {item.available} · {t('physicalReturn.unitPrice')}: {item.unit_price} {t('merchant.currencyYER')}</Text>
                </View>
                <View style={styles.counter}>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => changeQuantity(item.id, item.available, 1)} accessibilityLabel={`${t('physicalReturn.increaseQty')} ${item.product_name ?? t('physicalReturn.productFallback')}`}><Text style={styles.counterText}>+</Text></TouchableOpacity>
                  <Text style={styles.quantity}>{quantity}</Text>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => changeQuantity(item.id, item.available, -1)} accessibilityLabel={`${t('physicalReturn.decreaseQty')} ${item.product_name ?? t('physicalReturn.productFallback')}`}><Text style={styles.counterText}>−</Text></TouchableOpacity>
                </View>
              </View>
            );
          })}

          <Text style={styles.formTitle}>{t('physicalReturn.returnReason')}</Text>
          {RETURN_REASONS.map((item) => (
            <TouchableOpacity key={item.value} style={[styles.choiceRow, reason === item.value && styles.choiceSelected]} onPress={() => setReason(item.value)} accessibilityRole="radio" accessibilityState={{ selected: reason === item.value }}>
              <Text style={[styles.choiceText, reason === item.value && styles.choiceTextSelected]}>{t(item.labelKey)}</Text>
              <Ionicons name={reason === item.value ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === item.value ? '#172554' : '#94A3B8'} />
            </TouchableOpacity>
          ))}

          <Text style={[styles.formTitle, { marginTop: 14 }]}>{t('physicalReturn.deliveryMethod')}</Text>
          {([
            ['courier_pickup', 'physicalReturn.courierCollects'],
            ['customer_dropoff', 'physicalReturn.selfDropoff'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity key={value} style={[styles.choiceRow, pickupMethod === value && styles.choiceSelected]} onPress={() => setPickupMethod(value)} accessibilityRole="radio" accessibilityState={{ selected: pickupMethod === value }}>
              <Text style={[styles.choiceText, pickupMethod === value && styles.choiceTextSelected]}>{t(label)}</Text>
              <Ionicons name={pickupMethod === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={pickupMethod === value ? '#172554' : '#94A3B8'} />
            </TouchableOpacity>
          ))}

          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder={t('physicalReturn.descriptionPlaceholder')} placeholderTextColor="#94A3B8" multiline maxLength={2000} textAlign="right" accessibilityLabel={t('physicalReturn.detailsA11y')} />
          <View style={styles.evidenceHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formTitle}>{t('physicalReturn.productPhotos')}</Text>
              <Text style={styles.evidenceHint}>{t('physicalReturn.evidenceHint')}</Text>
            </View>
            <TouchableOpacity style={styles.addEvidenceBtn} onPress={() => void pickEvidence()} disabled={submitting || evidence.length >= 5} accessibilityRole="button" accessibilityLabel={t('physicalReturn.addEvidence')}>
              <Ionicons name="camera-outline" size={18} color="#1D4ED8" />
              <Text style={styles.addEvidenceText}>{t('physicalReturn.add')}</Text>
            </TouchableOpacity>
          </View>
          {evidence.map((file, index) => (
            <View key={file.id} style={styles.evidenceRow}>
              <Ionicons name={file.path ? 'cloud-done-outline' : 'image-outline'} size={18} color={file.path ? '#059669' : '#475569'} />
              <Text style={styles.evidenceName}>{t('physicalReturn.image')} {index + 1}{file.path ? ` · ${t('physicalReturn.uploadedSecurely')}` : ''}</Text>
              {!file.path ? <TouchableOpacity style={styles.removeEvidenceBtn} onPress={() => setEvidence((current) => current.filter((item) => item.id !== file.id))} accessibilityRole="button" accessibilityLabel={`${t('physicalReturn.deleteEvidence')} ${index + 1}`}><Ionicons name="trash-outline" size={18} color="#DC2626" /></TouchableOpacity> : null}
            </View>
          ))}
          <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={18} color="#1D4ED8" /><Text style={styles.noticeText}>{t('physicalReturn.refundNotice')}</Text></View>
          <TouchableOpacity style={[styles.submitBtn, (submitting || !reason || !selectedItems.length || description.trim().length < 10 || (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0)) && { opacity: 0.5 }]} onPress={submit} disabled={submitting || !reason || !selectedItems.length || description.trim().length < 10 || (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0)} accessibilityRole="button" accessibilityState={{ disabled: submitting || !reason || !selectedItems.length || description.trim().length < 10 || (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0), busy: submitting }}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{t('physicalReturn.submit')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => !submitting && setShowForm(false)} disabled={submitting}><Text style={styles.dismissText}>{t('physicalReturn.undo')}</Text></TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 12, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: '#64748B', fontSize: 12 },
  sectionIntro: { marginTop: 18, padding: 14, borderRadius: RADIUS.md, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  sectionTitle: { color: '#172554', fontFamily: FONTS.bold, fontSize: 15, textAlign: 'right' },
  sectionText: { color: '#1D4ED8', fontSize: 12, lineHeight: 19, textAlign: 'right', marginTop: 4 },
  statusCard: { marginTop: 10, padding: 15, borderRadius: 14, borderWidth: 1 },
  statusTitle: { fontWeight: '900', fontSize: 15, textAlign: 'right' },
  statusText: { fontSize: 12.5, lineHeight: 19, textAlign: 'right', marginTop: 4 },
  cancelRequestBtn: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: '#DC2626', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cancelRequestText: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  errorText: { color: '#991B1B', fontSize: 12, lineHeight: 19, textAlign: 'right' },
  openBtn: { minHeight: 48, marginTop: 10, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#172554', flexDirection: 'row-reverse', gap: 7, alignItems: 'center', justifyContent: 'center' },
  openBtnText: { color: '#1D4ED8', fontWeight: '900', fontSize: 14 },
  formCard: { margin: 16, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1' },
  formTitle: { color: '#0F172A', fontWeight: '900', fontSize: 14, textAlign: 'right', marginBottom: 7 },
  itemRow: { minHeight: 68, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  itemInfo: { flex: 1, minWidth: 180 },
  itemName: { color: '#0F172A', fontWeight: '800', fontSize: 13, textAlign: 'right' },
  itemSub: { color: '#64748B', fontSize: 11, textAlign: 'right', marginTop: 3 },
  counter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  counterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  counterText: { color: '#1D4ED8', fontSize: 19, fontWeight: '900' },
  quantity: { minWidth: 22, textAlign: 'center', color: '#0F172A', fontWeight: '900' },
  choiceRow: { minHeight: 52, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  choiceSelected: { backgroundColor: '#EFF6FF', borderRadius: 10, borderBottomColor: '#BFDBFE' },
  choiceText: { color: '#334155', fontSize: 13, fontWeight: '700' },
  choiceTextSelected: { color: '#1D4ED8' },
  input: { minHeight: 105, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 12, color: '#0F172A', textAlignVertical: 'top', marginTop: 14 },
  evidenceHeader: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 16 },
  evidenceHint: { color: '#64748B', fontSize: 10.5, textAlign: 'right' },
  addEvidenceBtn: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  addEvidenceText: { color: '#1D4ED8', fontWeight: '900', fontSize: 12 },
  evidenceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  evidenceName: { flex: 1, color: '#475569', fontSize: 12, textAlign: 'right' },
  removeEvidenceBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 7, backgroundColor: '#EFF6FF', borderRadius: 11, padding: 11, marginTop: 10 },
  noticeText: { flex: 1, color: '#1E40AF', fontSize: 11.5, lineHeight: 18, textAlign: 'right' },
  submitBtn: { minHeight: 48, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  submitText: { color: '#FFFFFF', fontWeight: '900' },
  dismissBtn: { minHeight: 44, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  dismissText: { color: '#64748B', fontWeight: '800' },
});
