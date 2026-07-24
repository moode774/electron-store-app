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

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['requested', 'approved', 'pickup_scheduled', 'picked_up', 'received', 'inspected']);

const STATUS_META: Record<string, { title: string; detail: string; color: string; background: string; border: string }> = {
  requested: { title: 'طلب الإرجاع قيد المراجعة', detail: 'وصل الطلب إلى التاجر والإدارة للمراجعة.', color: '#92400E', background: '#FFFBEB', border: '#FDE68A' },
  approved: { title: 'تمت الموافقة على الإرجاع', detail: 'تنتظر العملية تحديد موعد وطريقة استلام المنتجات.', color: '#166534', background: '#F0FDF4', border: '#BBF7D0' },
  rejected: { title: 'رُفض طلب الإرجاع', detail: 'راجع سبب القرار، ويمكنك فتح شكوى إذا كان لديك اعتراض.', color: '#B91C1C', background: '#FEF2F2', border: '#FECACA' },
  cancelled: { title: 'أُلغي طلب الإرجاع', detail: 'أُلغي الطلب قبل اعتماده.', color: '#475569', background: '#F8FAFC', border: '#CBD5E1' },
  pickup_scheduled: { title: 'تمت جدولة استلام المنتجات', detail: 'سيظهر تقدم المندوب هنا حتى تسليمها إلى المتجر.', color: '#1D4ED8', background: '#EFF6FF', border: '#BFDBFE' },
  picked_up: { title: 'استلم المندوب المنتجات', detail: 'المنتجات الآن بعهدة المندوب وفي طريقها إلى المتجر.', color: '#1D4ED8', background: '#EFF6FF', border: '#BFDBFE' },
  received: { title: 'وصلت المنتجات إلى المتجر', detail: 'ينتظر الطلب فحص حالة المنتجات والكميات المقبولة.', color: '#6D28D9', background: '#F5F3FF', border: '#DDD6FE' },
  inspected: { title: 'اكتمل فحص المنتجات', detail: 'تراجع الإدارة نتيجة الفحص قبل تنفيذ الاسترداد المالي.', color: '#6D28D9', background: '#F5F3FF', border: '#DDD6FE' },
  completed: { title: 'اكتملت معالجة الإرجاع', detail: 'أُغلقت العملية بعد الفحص وقرار الإدارة المثبت.', color: '#166534', background: '#F0FDF4', border: '#BBF7D0' },
};

const RETURN_REASONS: Array<{ value: PhysicalReturnRequest['reason']; label: string }> = [
  { value: 'damaged', label: 'المنتج تالف' },
  { value: 'not_as_described', label: 'المنتج مختلف عن الوصف' },
  { value: 'wrong_item', label: 'وصل منتج خاطئ' },
  { value: 'changed_mind', label: 'تغيير الرأي' },
  { value: 'other', label: 'سبب مادي آخر' },
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
      setLoadError(error?.message ?? 'تعذّر التحقق من طلبات إرجاع المنتجات.');
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
        Alert.alert('السماح بالصور مطلوب', 'اسمح للتطبيق باختيار صورة توضح حالة المنتج.');
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
        Alert.alert('الصورة غير مقبولة', 'حجم الصورة يجب ألا يتجاوز 10 ميجابايت.');
        return;
      }
      setEvidence((current) => [...current, {
        id: createIdempotencyKey(),
        uri: asset.uri,
        contentType,
        size: asset.fileSize,
      }]);
    } catch (error: any) {
      Alert.alert('تعذّر اختيار الصورة', error?.message ?? 'حاول مرة أخرى.');
    }
  };

  const submit = async () => {
    if (!reason) { Alert.alert('اختر السبب', 'حدد سبب إرجاع المنتجات أولاً.'); return; }
    if (!selectedItems.length) { Alert.alert('اختر المنتجات', 'حدد منتجًا واحدًا على الأقل والكمية المراد إرجاعها.'); return; }
    if (description.trim().length < 10) { Alert.alert('التفاصيل مطلوبة', 'اكتب وصفًا واضحًا لا يقل عن 10 أحرف.'); return; }
    if (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0) {
      Alert.alert('صورة الإثبات مطلوبة', 'أرفق صورة واحدة على الأقل لهذا النوع من الإرجاع.');
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
      Alert.alert('تم إرسال طلب الإرجاع', 'سيظهر هنا قرار المراجعة ثم مراحل استلام المنتجات وفحصها.');
    } catch (error: any) {
      Alert.alert('تعذّر إرسال طلب الإرجاع', error?.message ?? 'حاول مرة أخرى مع الاحتفاظ بنفس البيانات.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = () => {
    if (!latestRequest || latestRequest.status !== 'requested') return;
    Alert.alert('إلغاء طلب الإرجاع', 'يمكن الإلغاء الآن فقط قبل اعتماد الطلب. هل تريد المتابعة؟', [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'إلغاء الطلب', style: 'destructive', onPress: async () => {
          try {
            await cancelPhysicalReturnRequest(latestRequest.id, 'ألغاه العميل من شاشة متابعة الطلب');
            await load();
          } catch (error: any) {
            Alert.alert('تعذّر الإلغاء', error?.message ?? 'حاول مرة أخرى.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#2563EB" /><Text style={styles.loadingText}>جارٍ التحقق من إرجاع المنتجات…</Text></View>;
  }

  const completedWithoutRefund = latestRequest?.status === 'completed'
    && !latestRequest.refund_request_id
    && Number(latestRequest.refund_amount ?? 0) === 0;
  const status = latestRequest
    ? (completedWithoutRefund
      ? {
        ...STATUS_META.completed,
        title: 'أُغلق الإرجاع بلا استرداد',
        detail: 'رفض فحص المتجر جميع الكميات، لذلك لم تُنشأ حركة مالية أو إعادة مخزون.',
      }
      : (STATUS_META[latestRequest.status] ?? STATUS_META.requested))
    : null;

  return (
    <View>
      <View style={styles.sectionIntro}>
        <Text style={styles.sectionTitle}>إرجاع منتجات فعليًا</Text>
        <Text style={styles.sectionText}>هذا المسار للمنتج التالف أو الخاطئ أو غير المطابق. يمر بالاستلام ثم فحص المتجر قبل أي استرداد مالي.</Text>
      </View>

      {latestRequest && status ? (
        <View style={[styles.statusCard, { backgroundColor: status.background, borderColor: status.border }]} accessibilityRole="summary">
          <Text style={[styles.statusTitle, { color: status.color }]}>{status.title}</Text>
          <Text style={[styles.statusText, { color: status.color }]}>{status.detail}</Text>
          <Text style={[styles.statusText, { color: status.color }]}>الطريقة: {latestRequest.pickup_method === 'courier_pickup' ? 'استلام بواسطة مندوب' : 'تسليم العميل للمتجر'}</Text>
          {latestRequest.pickup_scheduled_at ? <Text style={[styles.statusText, { color: status.color }]}>الموعد: {new Date(latestRequest.pickup_scheduled_at).toLocaleString('ar-SA')}</Text> : null}
          {latestRequest.review_notes ? <Text style={[styles.statusText, { color: status.color }]}>قرار الإدارة: {latestRequest.review_notes}</Text> : null}
          {latestRequest.merchant_response ? <Text style={[styles.statusText, { color: status.color }]}>رد التاجر: {latestRequest.merchant_response}</Text> : null}
          {latestRequest.inspection_notes ? <Text style={[styles.statusText, { color: status.color }]}>نتيجة الفحص: {latestRequest.inspection_notes}</Text> : null}
          {latestRequest.status === 'completed' ? (
            <Text style={[styles.statusText, { color: status.color }]}>
              {completedWithoutRefund ? 'لم يُنشأ استرداد مالي.' : `المبلغ المسترد: ${latestRequest.refund_amount} ر.ي`}
            </Text>
          ) : null}
          {latestRequest.status === 'requested' ? (
            <TouchableOpacity onPress={cancel} style={styles.cancelRequestBtn} accessibilityRole="button" accessibilityLabel="إلغاء طلب إرجاع المنتجات">
              <Text style={styles.cancelRequestText}>إلغاء الطلب قبل الاعتماد</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {loadError ? (
        <TouchableOpacity style={styles.errorCard} onPress={() => void load()} accessibilityRole="button" accessibilityLabel="إعادة التحقق من إرجاع المنتجات">
          <Text style={styles.errorText}>{loadError} اضغط لإعادة المحاولة. لن يُفتح طلب جديد قبل نجاح التحقق.</Text>
        </TouchableOpacity>
      ) : null}

      {!loadError && order.status === ORDER_STATUS.DELIVERED && !windowOpen && !activeRequest ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{windowKnown ? `انتهت مهلة إرجاع المنتجات (7 أيام) في ${new Date(returnDeadline).toLocaleString('ar-SA')}. افتح شكوى للحالات الاستثنائية.` : 'تعذّر التحقق من وقت التسليم؛ أُوقف فتح إرجاع جديد حتى تتضح البيانات.'}</Text>
        </View>
      ) : null}

      {canCreate && !loadError && !showForm ? (
        <TouchableOpacity style={styles.openBtn} onPress={openForm} accessibilityRole="button" accessibilityLabel="فتح طلب إرجاع منتجات">
          <Ionicons name="cube-outline" size={19} color="#2563EB" />
          <Text style={styles.openBtnText}>{latestRequest?.status === 'completed' ? 'إرجاع كمية متبقية' : 'طلب إرجاع منتجات'}</Text>
        </TouchableOpacity>
      ) : null}

      {showForm && canCreate ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>حدد المنتجات والكميات</Text>
          {availableItems.map((item) => {
            const quantity = quantities[item.id] ?? 0;
            return (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.product_name ?? item.products?.name ?? 'منتج'}</Text>
                  <Text style={styles.itemSub}>المتاح للإرجاع: {item.available} · سعر الوحدة: {item.unit_price} ر.ي</Text>
                </View>
                <View style={styles.counter}>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => changeQuantity(item.id, item.available, 1)} accessibilityLabel={`زيادة كمية ${item.product_name ?? 'المنتج'}`}><Text style={styles.counterText}>+</Text></TouchableOpacity>
                  <Text style={styles.quantity}>{quantity}</Text>
                  <TouchableOpacity style={styles.counterBtn} onPress={() => changeQuantity(item.id, item.available, -1)} accessibilityLabel={`تقليل كمية ${item.product_name ?? 'المنتج'}`}><Text style={styles.counterText}>−</Text></TouchableOpacity>
                </View>
              </View>
            );
          })}

          <Text style={styles.formTitle}>سبب الإرجاع</Text>
          {RETURN_REASONS.map((item) => (
            <TouchableOpacity key={item.value} style={[styles.choiceRow, reason === item.value && styles.choiceSelected]} onPress={() => setReason(item.value)} accessibilityRole="radio" accessibilityState={{ selected: reason === item.value }}>
              <Text style={[styles.choiceText, reason === item.value && styles.choiceTextSelected]}>{item.label}</Text>
              <Ionicons name={reason === item.value ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === item.value ? '#2563EB' : '#94A3B8'} />
            </TouchableOpacity>
          ))}

          <Text style={[styles.formTitle, { marginTop: 14 }]}>طريقة تسليم المنتجات</Text>
          {([
            ['courier_pickup', 'مندوب يستلمها من عنوان الطلب'],
            ['customer_dropoff', 'سأسلمها بنفسي إلى المتجر'],
          ] as const).map(([value, label]) => (
            <TouchableOpacity key={value} style={[styles.choiceRow, pickupMethod === value && styles.choiceSelected]} onPress={() => setPickupMethod(value)} accessibilityRole="radio" accessibilityState={{ selected: pickupMethod === value }}>
              <Text style={[styles.choiceText, pickupMethod === value && styles.choiceTextSelected]}>{label}</Text>
              <Ionicons name={pickupMethod === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={pickupMethod === value ? '#2563EB' : '#94A3B8'} />
            </TouchableOpacity>
          ))}

          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="صف حالة المنتج والتغليف وما حدث (10 أحرف على الأقل)…" placeholderTextColor="#94A3B8" multiline maxLength={2000} textAlign="right" accessibilityLabel="تفاصيل إرجاع المنتجات" />
          <View style={styles.evidenceHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formTitle}>صور حالة المنتج</Text>
              <Text style={styles.evidenceHint}>مطلوبة للتالف أو الخاطئ أو غير المطابق · حتى 5 صور</Text>
            </View>
            <TouchableOpacity style={styles.addEvidenceBtn} onPress={() => void pickEvidence()} disabled={submitting || evidence.length >= 5} accessibilityRole="button" accessibilityLabel="إضافة صورة إثبات">
              <Ionicons name="camera-outline" size={18} color="#1D4ED8" />
              <Text style={styles.addEvidenceText}>إضافة</Text>
            </TouchableOpacity>
          </View>
          {evidence.map((file, index) => (
            <View key={file.id} style={styles.evidenceRow}>
              <Ionicons name={file.path ? 'cloud-done-outline' : 'image-outline'} size={18} color={file.path ? '#059669' : '#475569'} />
              <Text style={styles.evidenceName}>صورة {index + 1}{file.path ? ' · تم رفعها بأمان' : ''}</Text>
              {!file.path ? <TouchableOpacity style={styles.removeEvidenceBtn} onPress={() => setEvidence((current) => current.filter((item) => item.id !== file.id))} accessibilityRole="button" accessibilityLabel={`حذف صورة الإثبات ${index + 1}`}><Ionicons name="trash-outline" size={18} color="#DC2626" /></TouchableOpacity> : null}
            </View>
          ))}
          <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={18} color="#1D4ED8" /><Text style={styles.noticeText}>المبلغ لا يُنفذ الآن. بعد الاستلام والفحص تحسبه قاعدة البيانات من الكميات المقبولة والتسوية المثبتة، ولا تعيد رسوم التوصيل تلقائيًا.</Text></View>
          <TouchableOpacity style={[styles.submitBtn, (submitting || !reason || !selectedItems.length || description.trim().length < 10 || (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0)) && { opacity: 0.5 }]} onPress={submit} disabled={submitting || !reason || !selectedItems.length || description.trim().length < 10 || (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0)} accessibilityRole="button" accessibilityState={{ disabled: submitting || !reason || !selectedItems.length || description.trim().length < 10 || (['damaged', 'not_as_described', 'wrong_item'].includes(reason) && evidence.length === 0), busy: submitting }}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>إرسال طلب إرجاع المنتجات</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => !submitting && setShowForm(false)} disabled={submitting}><Text style={styles.dismissText}>تراجع</Text></TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginHorizontal: 16, marginTop: 12, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: '#64748B', fontSize: 12 },
  sectionIntro: { marginHorizontal: 16, marginTop: 18, padding: 14, borderRadius: RADIUS.md, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  sectionTitle: { color: '#1E3A8A', fontFamily: FONTS.bold, fontSize: 15, textAlign: 'right' },
  sectionText: { color: '#1D4ED8', fontSize: 12, lineHeight: 19, textAlign: 'right', marginTop: 4 },
  statusCard: { marginHorizontal: 16, marginTop: 10, padding: 15, borderRadius: 14, borderWidth: 1 },
  statusTitle: { fontWeight: '900', fontSize: 15, textAlign: 'right' },
  statusText: { fontSize: 12.5, lineHeight: 19, textAlign: 'right', marginTop: 4 },
  cancelRequestBtn: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: '#DC2626', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cancelRequestText: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
  errorCard: { marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  errorText: { color: '#991B1B', fontSize: 12, lineHeight: 19, textAlign: 'right' },
  openBtn: { minHeight: 48, marginHorizontal: 16, marginTop: 10, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#2563EB', flexDirection: 'row-reverse', gap: 7, alignItems: 'center', justifyContent: 'center' },
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
