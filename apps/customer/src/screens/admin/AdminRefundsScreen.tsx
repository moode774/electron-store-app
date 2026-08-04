import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet,
  Image, Linking, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getAdminRefundRequests,
  updateRefundRequestStatus,
  type AdminRefundRequest,
  type RefundDecisionStatus,
  type RefundRequestStatus,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

const UI = {
  primary: COLORS.primary, bg: COLORS.background, card: COLORS.surface, text: COLORS.textPrimary,
  muted: COLORS.textMuted, border: COLORS.border, success: COLORS.success, danger: COLORS.error, warning: COLORS.warning,
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد المراجعة', color: UI.warning, bg: '#FFFBEB' },
  approved: { label: 'مقبول بانتظار التنفيذ المالي', color: '#2563EB', bg: '#EFF6FF' },
  processing: { label: 'قيد التنفيذ المالي', color: '#7C3AED', bg: '#F5F3FF' },
  completed: { label: 'تم الاسترداد', color: UI.success, bg: '#ECFDF5' },
  rejected: { label: 'مرفوض', color: UI.danger, bg: '#FEF2F2' },
};

type Decision = RefundDecisionStatus;

const REFUND_FILTERS: Array<{ key: RefundRequestStatus | ''; label: string }> = [
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'approved', label: 'مقبول' },
  { key: 'processing', label: 'قيد التنفيذ' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'rejected', label: 'مرفوض' },
  { key: '', label: 'الكل' },
];

function isSafeEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && /(^|\.)supabase\.co$/i.test(url.hostname)
      && url.pathname.includes('/storage/v1/object/');
  } catch {
    return false;
  }
}

const DECISION_COPY: Record<Decision, { title: string; detail: string; placeholder: string }> = {
  approved: { title: 'قبول طلب الاسترداد', detail: 'سيُنقل الطلب إلى المسار المالي، ولن تُعرض حالة «تم الاسترداد» إلا بعد نجاح القيود المالية.', placeholder: 'ملاحظة القرار (اختياري)' },
  rejected: { title: 'رفض طلب الاسترداد', detail: 'اكتب سبب الرفض. سيظهر هذا التوضيح للأطراف المعنية.', placeholder: 'سبب الرفض (مطلوب)' },
  processing: { title: 'بدء التنفيذ المالي', detail: 'استخدم هذه المرحلة عندما بدأ رد المبلغ أو المعالجة الفعلية، لكنه لم يكتمل بعد.', placeholder: 'ملاحظة أو مرجع بدء التنفيذ (اختياري)' },
  completed: { title: 'تأكيد اكتمال الاسترداد', detail: 'لن ينجح التأكيد إلا إذا أكمل الخادم التسوية العكسية وتحديث الرصيد والمخزون وحالة الطلب مرة واحدة.', placeholder: 'ملاحظة إدارية إضافية (اختياري)' },
};

export default function AdminRefundsScreen() {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const [items, setItems] = useState<AdminRefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RefundRequestStatus | ''>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ item: AdminRefundRequest; status: Decision } | null>(null);
  const [notes, setNotes] = useState('');
  const [externalReference, setExternalReference] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await getAdminRefundRequests());
    } catch (e) {
      console.error('Failed to load refund requests:', e);
      setError('تعذر تحميل طلبات الاسترداد. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleItems = useMemo(
    () => filter ? items.filter((item) => item.status === filter) : items,
    [filter, items],
  );

  const openDecision = (item: AdminRefundRequest, status: Decision) => {
    setNotes('');
    setExternalReference('');
    setDecision({ item, status });
  };

  const submitDecision = async () => {
    if (!decision || processingId) return;
    if (decision.status === 'rejected' && !notes.trim()) {
      Alert.alert('سبب الرفض مطلوب', 'اكتب سبباً واضحاً ليظهر للعميل والتاجر.');
      return;
    }
    if (decision.status === 'completed' && decision.item.refund_method === 'original_payment' && !externalReference.trim()) {
      Alert.alert('مرجع التنفيذ مطلوب', 'اكتب مرجع عملية رد المبلغ قبل تأكيد اكتمال الاسترداد الأصلي.');
      return;
    }
    const { item, status } = decision;
    setProcessingId(item.id);
    try {
      await updateRefundRequestStatus(
        item.id,
        status,
        notes.trim() || undefined,
        externalReference.trim() || undefined,
      );
      setItems((current) => current.map((row) => row.id === item.id
        ? { ...row, status, admin_notes: notes.trim() || row.admin_notes, external_reference: externalReference.trim() || row.external_reference }
        : row));
      setDecision(null);
      const messages: Record<Decision, string> = {
        approved: 'تم قبول الطلب للمسار المالي. لا يُعد المبلغ مسترداً حتى تظهر الحالة «تم الاسترداد».',
        rejected: 'تم رفض طلب الاسترداد وتسجيل السبب.',
        processing: 'تم تسجيل بدء التنفيذ المالي، ولم يُسجل الاسترداد كمكتمل بعد.',
        completed: 'أكد الخادم اكتمال قيود الاسترداد وتحديث حالة الطلب.',
      };
      Alert.alert('تم تسجيل المرحلة', messages[status]);
    } catch (e) {
      console.error('Failed to process refund request:', e);
      Alert.alert('تعذر حفظ القرار', e instanceof Error ? e.message : 'لم تتغير حالة الطلب. أعد المحاولة.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderItem = ({ item }: { item: AdminRefundRequest }) => {
    const meta = STATUS_META[item.status] ?? { label: item.status, color: UI.muted, bg: '#F1F5F9' };
    const evidenceImages = Array.isArray(item.evidence_images) ? item.evidence_images.filter(isSafeEvidenceUrl) : [];
    const orderItems = Array.isArray(item.orders?.order_items) ? item.orders.order_items : [];
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[s.statusText, { color: meta.color }]}>{tv(meta.label)}</Text>
          </View>
          <View style={s.headingWrap}>
            <Text style={s.name}>{t('طلب #{0}', [item.orders?.order_number ?? item.order_id?.slice?.(0, 8) ?? '—'])}</Text>
            <Text style={s.store}>{tv(item.orders?.merchant_profiles?.store_name ?? t('متجر غير متوفر'))}</Text>
          </View>
        </View>

        <View style={s.infoGrid}>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('العميل')}</Text><Text style={s.infoValue}>{tv(item.users?.full_name ?? '—')}</Text></View>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('المبلغ المطلوب')}</Text><Text style={s.amount}>{t('{0} ر.ي', [Number(item.refund_amount ?? 0).toFixed(2)])}</Text></View>
        </View>
        <View style={s.infoGrid}>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('الدفع الأصلي')}</Text><Text style={s.infoValue}>{tv(item.orders?.payment_method ?? '—')} / {tv(item.orders?.payment_status ?? '—')}</Text></View>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('طريقة الاسترداد')}</Text><Text style={s.infoValue}>{tv(item.refund_method === 'original_payment' ? t('وسيلة الدفع الأصلية') : t('المحفظة'))}</Text></View>
        </View>
        <View style={s.infoGrid}>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('إجمالي الطلب')}</Text><Text style={s.infoValue}>{t('{0} ر.ي', [Number(item.orders?.total_amount ?? 0).toFixed(2)])}</Text></View>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('وقت التسليم المسجل')}</Text><Text style={s.infoValue}>{tv(item.orders?.delivered_at ? new Date(item.orders.delivered_at).toLocaleString(getLocale()) : t('غير مسجل'))}</Text></View>
        </View>
        <Text style={s.label}>{t('السبب')}</Text>
        <Text style={s.reason}>{tv(item.reason || t('لم يذكر سبب'))}</Text>
        {!!item.description && <Text style={s.description}>{tv(item.description)}</Text>}
        {orderItems.length ? (
          <View style={s.detailSection}>
            <Text style={s.noteTitle}>{t('عناصر الطلب')}</Text>
            {orderItems.map((orderItem: any, index: number) => (
              <Text key={`${orderItem.product_name ?? 'item'}-${index}`} style={s.itemLine}>{t('{0} × {1} — {2} ر.ي', [orderItem.product_name ?? 'منتج', orderItem.quantity ?? 0, Number(orderItem.total_price ?? 0).toFixed(2)])}</Text>
            ))}
          </View>
        ) : null}
        {evidenceImages.length ? (
          <View style={s.detailSection}>
            <Text style={s.noteTitle}>{t('أدلة العميل ({0})', [tv(evidenceImages.length)])}</Text>
            <ScrollView horizontal contentContainerStyle={s.evidenceRow} showsHorizontalScrollIndicator={false}>
              {evidenceImages.map((url: string, index: number) => (
                <TouchableOpacity key={`${url}-${index}`} onPress={() => void Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={t('فتح صورة الدليل {0}', [index + 1])}>
                  <Image source={{ uri: url }} style={s.evidenceImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {!!item.merchant_response && <View style={s.noteBox}><Text style={s.noteTitle}>{t('رد التاجر')}</Text><Text style={s.noteText}>{tv(item.merchant_response)}</Text></View>}
        {!!item.admin_notes && <View style={s.noteBox}><Text style={s.noteTitle}>{t('ملاحظة الإدارة')}</Text><Text style={s.noteText}>{tv(item.admin_notes)}</Text></View>}
        <Text style={s.date}>{tv(new Date(item.created_at).toLocaleString(getLocale()))}</Text>

        {item.status === 'pending' && (
          processingId === item.id ? <ActivityIndicator color={UI.primary} style={{ marginTop: 16 }} /> : (
            <View style={s.actions}>
              <TouchableOpacity style={s.reject} onPress={() => openDecision(item, 'rejected')} accessibilityRole="button" accessibilityLabel={t('رفض طلب الاسترداد')}>
                <Text style={s.rejectText}>{t('رفض')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.approve} onPress={() => openDecision(item, 'approved')} accessibilityRole="button" accessibilityLabel={t('قبول طلب الاسترداد للمسار المالي')}>
                <Text style={s.approveText}>{t('قبول للمسار المالي')}</Text>
              </TouchableOpacity>
            </View>
          )
        )}
        {item.status === 'approved' && (
          processingId === item.id ? <ActivityIndicator color={UI.primary} style={{ marginTop: 16 }} /> : (
            <View style={s.actions}>
              <TouchableOpacity style={s.secondaryAction} onPress={() => openDecision(item, 'processing')} accessibilityRole="button" accessibilityLabel={t('بدء تنفيذ الاسترداد المالي')}>
                <Text style={s.processingText}>{t('بدء التنفيذ')}</Text>
              </TouchableOpacity>
            </View>
          )
        )}
        {item.status === 'processing' && (
          processingId === item.id ? <ActivityIndicator color={UI.primary} style={{ marginTop: 16 }} /> : (
            <View style={s.actions}>
              <TouchableOpacity style={s.approve} onPress={() => openDecision(item, 'completed')} accessibilityRole="button" accessibilityLabel={t('تأكيد اكتمال الاسترداد')}>
                <Text style={s.approveText}>{t('تأكيد اكتمال القيود المالية')}</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </View>
    );
  };

  return (
    <View style={s.page}>
      <View style={[s.header, { paddingHorizontal: pagePadding + Math.max((width - contentWidth) / 2, 0) }]}>
        <Text style={s.title}>{t('طلبات الاسترداد')}</Text>
        <Text style={s.sub}>{t('قرار القبول منفصل عن تنفيذ رد المبلغ، وتظهر كل مرحلة بحالتها الفعلية.')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {REFUND_FILTERS.map((option) => (
          <TouchableOpacity key={option.key} style={[s.filter, filter === option.key && s.filterActive]} onPress={() => setFilter(option.key)} accessibilityRole="button" accessibilityState={{ selected: filter === option.key }}>
            <Text style={[s.filterText, filter === option.key && s.filterTextActive]}>{tv(option.label)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator style={{ marginTop: 48 }} color={UI.primary} /> : error ? (
        <View style={s.empty} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={46} color={UI.danger} />
          <Text style={s.errorText}>{tv(error)}</Text>
          <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>{t('إعادة المحاولة')}</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          key={`refunds-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UI.primary} />}
          ListEmptyComponent={<View style={s.empty}><Ionicons name="refresh-circle-outline" size={48} color={UI.border} /><Text style={s.emptyText}>{t('لا توجد طلبات بهذه الحالة')}</Text></View>}
        />
      )}

      <Modal visible={!!decision} transparent animationType="fade" onRequestClose={() => !processingId && setDecision(null)} accessibilityViewIsModal>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { width: Math.min(Math.max(width - 24, 280), 480) }]}>
            <Text style={s.modalTitle}>{tv(decision ? DECISION_COPY[decision.status].title : '')}</Text>
            <Text style={s.modalText}>{tv(decision ? DECISION_COPY[decision.status].detail : '')}</Text>
            <TextInput
              style={s.input}
              value={notes}
              onChangeText={setNotes}
              placeholder={decision ? DECISION_COPY[decision.status].placeholder : ''}
              placeholderTextColor={UI.muted}
              multiline
              maxLength={2000}
              textAlign="right"
              accessibilityLabel={t('ملاحظات قرار الاسترداد')}
            />
            {decision?.status === 'completed' && decision.item.refund_method === 'original_payment' && (
              <TextInput
                style={s.referenceInput}
                value={externalReference}
                onChangeText={setExternalReference}
                placeholder={t('مرجع عملية رد المبلغ (مطلوب)')}
                placeholderTextColor={UI.muted}
                maxLength={200}
                textAlign="right"
                accessibilityLabel={t('مرجع عملية رد المبلغ')}
              />
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancel} onPress={() => setDecision(null)} disabled={!!processingId}><Text style={s.cancelText}>{t('تراجع')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirm, decision?.status === 'rejected' && s.confirmDanger]} onPress={submitDecision} disabled={!!processingId}>
                {processingId ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmText}>{t('تأكيد القرار')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: UI.bg },
  header: { padding: 24, backgroundColor: UI.card, borderBottomWidth: 1, borderColor: UI.border },
  title: { fontSize: 24, fontFamily: FONTS.bold, textAlign: 'right', color: UI.text },
  sub: { color: UI.muted, fontFamily: FONTS.regular, textAlign: 'right', marginTop: 6, lineHeight: 21 },
  filters: { paddingHorizontal: 18, paddingVertical: 14, gap: 8, flexDirection: 'row-reverse' },
  filter: { minHeight: 44, justifyContent: 'center', backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, paddingHorizontal: 15, paddingVertical: 9, borderRadius: RADIUS.full },
  filterActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { color: UI.muted, fontFamily: FONTS.semiBold },
  filterTextActive: { color: '#FFF' },
  list: { alignSelf: 'center', paddingTop: 4, gap: 12, paddingBottom: 112 },
  columnRow: { gap: 12 },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: RADIUS.lg, padding: 18, borderWidth: 1, borderColor: UI.border },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headingWrap: { flex: 1, alignItems: 'flex-end' },
  name: { fontWeight: '900', fontSize: 16, color: UI.text, textAlign: 'right' },
  store: { color: UI.muted, fontSize: 13, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, maxWidth: '48%' },
  statusText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  infoGrid: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  infoBox: { flex: 1, backgroundColor: UI.bg, borderRadius: 12, padding: 12, alignItems: 'flex-end' },
  infoLabel: { fontSize: 11, color: UI.muted, fontWeight: '700' },
  infoValue: { fontSize: 14, color: UI.text, fontWeight: '800', marginTop: 4, textAlign: 'right' },
  amount: { fontSize: 17, color: UI.primary, fontWeight: '900', marginTop: 4 },
  label: { color: UI.muted, fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 14 },
  reason: { color: UI.text, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  description: { color: '#334155', textAlign: 'right', marginTop: 6, lineHeight: 21 },
  detailSection: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 12, gap: 7 },
  itemLine: { color: '#334155', fontSize: 12.5, textAlign: 'right', lineHeight: 19 },
  evidenceRow: { gap: 9, paddingTop: 5 },
  evidenceImage: { width: 86, height: 86, borderRadius: 10, backgroundColor: '#E2E8F0' },
  noteBox: { backgroundColor: '#F8FAFC', borderRightWidth: 3, borderRightColor: UI.primary, padding: 12, marginTop: 12 },
  noteTitle: { color: UI.primary, fontWeight: '800', textAlign: 'right', fontSize: 12 },
  noteText: { color: UI.text, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  date: { color: UI.muted, fontSize: 11, textAlign: 'left', marginTop: 12 },
  actions: { flexDirection: 'row-reverse', gap: 10, marginTop: 16, borderTopWidth: 1, borderTopColor: UI.border, paddingTop: 14 },
  approve: { flex: 2, minHeight: 44, justifyContent: 'center', backgroundColor: UI.success, padding: 12, borderRadius: RADIUS.sm, alignItems: 'center' },
  approveText: { color: '#FFF', fontWeight: '900' },
  reject: { flex: 1, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: UI.danger, padding: 11, borderRadius: RADIUS.sm, alignItems: 'center' },
  rejectText: { color: UI.danger, fontWeight: '800' },
  secondaryAction: { flex: 1, borderWidth: 1, borderColor: UI.primary, padding: 11, borderRadius: 11, alignItems: 'center' },
  processingText: { color: UI.primary, fontWeight: '800' },
  empty: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 13, padding: 24 },
  emptyText: { textAlign: 'center', color: UI.muted, fontWeight: '700' },
  errorText: { textAlign: 'center', color: UI.danger, fontWeight: '700', lineHeight: 22 },
  retry: { backgroundColor: UI.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#FFF', fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, alignItems: 'center', justifyContent: 'center', padding: 12 },
  modal: { maxWidth: 480, maxHeight: '90%', backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 22 },
  modalTitle: { color: UI.text, fontSize: 19, fontFamily: FONTS.bold, textAlign: 'right' },
  modalText: { color: UI.muted, fontSize: 14, lineHeight: 23, textAlign: 'right', marginTop: 10 },
  input: { minHeight: 100, borderWidth: 1, borderColor: UI.border, borderRadius: 13, backgroundColor: UI.bg, padding: 14, marginTop: 16, textAlignVertical: 'top', color: UI.text },
  referenceInput: { minHeight: 48, borderWidth: 1, borderColor: UI.border, borderRadius: 13, backgroundColor: UI.bg, paddingHorizontal: 14, marginTop: 10, color: UI.text },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 18 },
  cancel: { flex: 1, minHeight: 44, justifyContent: 'center', backgroundColor: COLORS.surfaceMuted, padding: 13, borderRadius: RADIUS.md, alignItems: 'center' },
  cancelText: { color: UI.muted, fontWeight: '800' },
  confirm: { flex: 2, minHeight: 44, justifyContent: 'center', backgroundColor: UI.success, padding: 13, borderRadius: RADIUS.md, alignItems: 'center' },
  confirmDanger: { backgroundColor: UI.danger },
  confirmText: { color: '#FFF', fontWeight: '900' },
});
