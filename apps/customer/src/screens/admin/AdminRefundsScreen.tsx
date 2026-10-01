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
import { useTranslation } from '../../i18n';

const UI = {
  primary: COLORS.primary, bg: COLORS.background, card: COLORS.surface, text: COLORS.textPrimary,
  muted: COLORS.textMuted, border: COLORS.border, success: COLORS.success, danger: COLORS.error, warning: COLORS.warning,
};

const STATUS_META: Record<string, { labelKey: string; color: string; bg: string }> = {
  pending: { labelKey: 'adminUi.refundPending', color: UI.warning, bg: '#FFFBEB' },
  approved: { labelKey: 'adminUi.refundApprovedAwaiting', color: '#2563EB', bg: '#EFF6FF' },
  processing: { labelKey: 'adminUi.refundProcessingFinancial', color: '#7C3AED', bg: '#F5F3FF' },
  completed: { labelKey: 'adminUi.refundCompleted', color: UI.success, bg: '#ECFDF5' },
  rejected: { labelKey: 'adminUi.productRejected', color: UI.danger, bg: '#FEF2F2' },
};

type Decision = RefundDecisionStatus;

const REFUND_FILTERS: Array<{ key: RefundRequestStatus | ''; labelKey: string }> = [
  { key: 'pending', labelKey: 'adminUi.refundPending' },
  { key: 'approved', labelKey: 'adminUi.refundApproved' },
  { key: 'processing', labelKey: 'adminUi.refundProcessing' },
  { key: 'completed', labelKey: 'adminUi.refundCompleteShort' },
  { key: 'rejected', labelKey: 'adminUi.productRejected' },
  { key: '', labelKey: 'adminUi.all' },
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

const DECISION_COPY: Record<Decision, { titleKey: string; detailKey: string; placeholderKey: string }> = {
  approved: { titleKey: 'adminUi.refundApproveTitle', detailKey: 'adminUi.refundApproveDetail', placeholderKey: 'adminUi.refundDecisionNoteOptional' },
  rejected: { titleKey: 'adminUi.refundRejectTitle', detailKey: 'adminUi.refundRejectDetail', placeholderKey: 'adminUi.refundRejectReasonRequired' },
  processing: { titleKey: 'adminUi.refundStartProcessingTitle', detailKey: 'adminUi.refundStartProcessingDetail', placeholderKey: 'adminUi.refundProcessingNoteOptional' },
  completed: { titleKey: 'adminUi.refundConfirmCompleteTitle', detailKey: 'adminUi.refundConfirmCompleteDetail', placeholderKey: 'adminUi.refundAdminNoteOptional' },
};

export default function AdminRefundsScreen() {
  const { t, language } = useTranslation();
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
      setError(t('adminUi.refundLoadFailed'));
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
      Alert.alert(t('adminUi.rejectionReasonRequired'), t('adminUi.refundRejectReasonText'));
      return;
    }
    if (decision.status === 'completed' && decision.item.refund_method === 'original_payment' && !externalReference.trim()) {
      Alert.alert(t('adminUi.refundExecutionReferenceRequired'), t('adminUi.refundExecutionReferenceText'));
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
        approved: t('adminUi.refundSuccessApproved'),
        rejected: t('adminUi.refundSuccessRejected'),
        processing: t('adminUi.refundSuccessProcessing'),
        completed: t('adminUi.refundSuccessCompleted'),
      };
      Alert.alert(t('adminUi.refundStageRecorded'), messages[status]);
    } catch (e) {
      console.error('Failed to process refund request:', e);
      Alert.alert(t('adminUi.refundDecisionSaveFailed'), e instanceof Error ? e.message : t('adminUi.withdrawNoChange'));
    } finally {
      setProcessingId(null);
    }
  };

  const renderItem = ({ item }: { item: AdminRefundRequest }) => {
    const meta = STATUS_META[item.status] ?? { labelKey: '', color: UI.muted, bg: '#F1F5F9' };
    const evidenceImages = Array.isArray(item.evidence_images) ? item.evidence_images.filter(isSafeEvidenceUrl) : [];
    const orderItems = Array.isArray(item.orders?.order_items) ? item.orders.order_items : [];
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[s.statusText, { color: meta.color }]}>{meta.labelKey ? t(meta.labelKey) : item.status}</Text>
          </View>
          <View style={s.headingWrap}>
            <Text style={s.name}>{t('adminUi.order')} #{item.orders?.order_number ?? item.order_id?.slice?.(0, 8) ?? '—'}</Text>
            <Text style={s.store}>{item.orders?.merchant_profiles?.store_name ?? t('adminUi.storeUnavailable')}</Text>
          </View>
        </View>

        <View style={s.infoGrid}>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('adminUi.customer')}</Text><Text style={s.infoValue}>{item.users?.full_name ?? '—'}</Text></View>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('adminUi.requestedAmount')}</Text><Text style={s.amount}>{Number(item.refund_amount ?? 0).toFixed(2)} {t('adminUi.yer')}</Text></View>
        </View>
        <View style={s.infoGrid}>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('adminUi.originalPayment')}</Text><Text style={s.infoValue}>{item.orders?.payment_method ?? '—'} / {item.orders?.payment_status ?? '—'}</Text></View>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('adminUi.refundMethod')}</Text><Text style={s.infoValue}>{item.refund_method === 'original_payment' ? t('adminUi.originalPaymentMethod') : t('adminUi.wallet')}</Text></View>
        </View>
        <View style={s.infoGrid}>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('adminUi.orderTotal')}</Text><Text style={s.infoValue}>{Number(item.orders?.total_amount ?? 0).toFixed(2)} {t('adminUi.yer')}</Text></View>
          <View style={s.infoBox}><Text style={s.infoLabel}>{t('adminUi.recordedDeliveryTime')}</Text><Text style={s.infoValue}>{item.orders?.delivered_at ? new Date(item.orders.delivered_at).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US') : t('adminUi.notRecorded')}</Text></View>
        </View>
        <Text style={s.label}>{t('adminUi.reason')}</Text>
        <Text style={s.reason}>{item.reason || t('adminUi.noReasonProvided')}</Text>
        {!!item.description && <Text style={s.description}>{item.description}</Text>}
        {orderItems.length ? (
          <View style={s.detailSection}>
            <Text style={s.noteTitle}>{t('adminUi.orderItems')}</Text>
            {orderItems.map((orderItem: any, index: number) => (
              <Text key={`${orderItem.product_name ?? 'item'}-${index}`} style={s.itemLine}>
                {orderItem.product_name ?? t('adminUi.product')} × {orderItem.quantity ?? 0} — {Number(orderItem.total_price ?? 0).toFixed(2)} {t('adminUi.yer')}
              </Text>
            ))}
          </View>
        ) : null}
        {evidenceImages.length ? (
          <View style={s.detailSection}>
            <Text style={s.noteTitle}>{t('adminUi.customerEvidence')} ({evidenceImages.length})</Text>
            <ScrollView horizontal contentContainerStyle={s.evidenceRow} showsHorizontalScrollIndicator={false}>
              {evidenceImages.map((url: string, index: number) => (
                <TouchableOpacity key={`${url}-${index}`} onPress={() => void Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={`${t('adminUi.openEvidenceImage')} ${index + 1}`}>
                  <Image source={{ uri: url }} style={s.evidenceImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {!!item.merchant_response && <View style={s.noteBox}><Text style={s.noteTitle}>{t('adminUi.merchantReply')}</Text><Text style={s.noteText}>{item.merchant_response}</Text></View>}
        {!!item.admin_notes && <View style={s.noteBox}><Text style={s.noteTitle}>{t('adminUi.adminNote')}</Text><Text style={s.noteText}>{item.admin_notes}</Text></View>}
        <Text style={s.date}>{new Date(item.created_at).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</Text>

        {item.status === 'pending' && (
          processingId === item.id ? <ActivityIndicator color={UI.primary} style={{ marginTop: 16 }} /> : (
            <View style={s.actions}>
              <TouchableOpacity style={s.reject} onPress={() => openDecision(item, 'rejected')} accessibilityRole="button" accessibilityLabel={t('adminUi.refundRejectTitle')}>
                <Text style={s.rejectText}>{t('adminUi.reject')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.approve} onPress={() => openDecision(item, 'approved')} accessibilityRole="button" accessibilityLabel={t('adminUi.refundApproveA11y')}>
                <Text style={s.approveText}>{t('adminUi.refundApproveFinancial')}</Text>
              </TouchableOpacity>
            </View>
          )
        )}
        {item.status === 'approved' && (
          processingId === item.id ? <ActivityIndicator color={UI.primary} style={{ marginTop: 16 }} /> : (
            <View style={s.actions}>
              <TouchableOpacity style={s.secondaryAction} onPress={() => openDecision(item, 'processing')} accessibilityRole="button" accessibilityLabel={t('adminUi.refundStartA11y')}>
                <Text style={s.processingText}>{t('adminUi.startProcessing')}</Text>
              </TouchableOpacity>
            </View>
          )
        )}
        {item.status === 'processing' && (
          processingId === item.id ? <ActivityIndicator color={UI.primary} style={{ marginTop: 16 }} /> : (
            <View style={s.actions}>
              <TouchableOpacity style={s.approve} onPress={() => openDecision(item, 'completed')} accessibilityRole="button" accessibilityLabel={t('adminUi.refundConfirmCompleteTitle')}>
                <Text style={s.approveText}>{t('adminUi.confirmFinancialCompletion')}</Text>
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
        <Text style={s.title}>{t('adminUi.refunds')}</Text>
        <Text style={s.sub}>{t('adminUi.refundsSubtitle')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {REFUND_FILTERS.map((option) => (
          <TouchableOpacity key={option.key} style={[s.filter, filter === option.key && s.filterActive]} onPress={() => setFilter(option.key)} accessibilityRole="button" accessibilityState={{ selected: filter === option.key }}>
            <Text style={[s.filterText, filter === option.key && s.filterTextActive]}>{t(option.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator style={{ marginTop: 48 }} color={UI.primary} /> : error ? (
        <View style={s.empty} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={46} color={UI.danger} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>{t('adminUi.retry')}</Text></TouchableOpacity>
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
          ListEmptyComponent={<View style={s.empty}><Ionicons name="refresh-circle-outline" size={48} color={UI.border} /><Text style={s.emptyText}>{t('adminUi.noRefundsInStatus')}</Text></View>}
        />
      )}

      <Modal visible={!!decision} transparent animationType="fade" onRequestClose={() => !processingId && setDecision(null)} accessibilityViewIsModal>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { width: Math.min(Math.max(width - 24, 280), 480) }]}>
            <Text style={s.modalTitle}>{decision ? t(DECISION_COPY[decision.status].titleKey) : ''}</Text>
            <Text style={s.modalText}>{decision ? t(DECISION_COPY[decision.status].detailKey) : ''}</Text>
            <TextInput
              style={s.input}
              value={notes}
              onChangeText={setNotes}
              placeholder={decision ? t(DECISION_COPY[decision.status].placeholderKey) : ''}
              placeholderTextColor={UI.muted}
              multiline
              maxLength={2000}
              textAlign={language === 'ar' ? 'right' : 'left'}
              accessibilityLabel={t('adminUi.refundDecisionNotesA11y')}
            />
            {decision?.status === 'completed' && decision.item.refund_method === 'original_payment' && (
              <TextInput
                style={s.referenceInput}
                value={externalReference}
                onChangeText={setExternalReference}
                placeholder={t('adminUi.refundReferencePlaceholder')}
                placeholderTextColor={UI.muted}
                maxLength={200}
                textAlign={language === 'ar' ? 'right' : 'left'}
                accessibilityLabel={t('adminUi.refundReferenceA11y')}
              />
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancel} onPress={() => setDecision(null)} disabled={!!processingId}><Text style={s.cancelText}>{t('adminUi.undo')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirm, decision?.status === 'rejected' && s.confirmDanger]} onPress={submitDecision} disabled={!!processingId}>
                {processingId ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmText}>{t('adminUi.confirmDecision')}</Text>}
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
  filter: { minHeight: 44, justifyContent: 'center', backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 12 },
  filterActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { color: UI.muted, fontFamily: FONTS.semiBold },
  filterTextActive: { color: '#FFF' },
  list: { alignSelf: 'center', paddingTop: 4, gap: 12, paddingBottom: 112 },
  columnRow: { gap: 12 },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: UI.border },
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
  retry: { backgroundColor: UI.primary, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  retryText: { color: '#FFF', fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, alignItems: 'center', justifyContent: 'center', padding: 12 },
  modal: { maxWidth: 480, maxHeight: '90%', backgroundColor: UI.card, borderRadius: 20, padding: 22 },
  modalTitle: { color: UI.text, fontSize: 19, fontFamily: FONTS.bold, textAlign: 'right' },
  modalText: { color: UI.muted, fontSize: 14, lineHeight: 23, textAlign: 'right', marginTop: 10 },
  input: { minHeight: 100, borderWidth: 1, borderColor: UI.border, borderRadius: 13, backgroundColor: UI.bg, padding: 14, marginTop: 16, textAlignVertical: 'top', color: UI.text },
  referenceInput: { minHeight: 48, borderWidth: 1, borderColor: UI.border, borderRadius: 13, backgroundColor: UI.bg, paddingHorizontal: 14, marginTop: 10, color: UI.text },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 18 },
  cancel: { flex: 1, minHeight: 44, justifyContent: 'center', backgroundColor: COLORS.surfaceMuted, padding: 13, borderRadius: 13, alignItems: 'center' },
  cancelText: { color: UI.muted, fontWeight: '800' },
  confirm: { flex: 2, minHeight: 44, justifyContent: 'center', backgroundColor: UI.success, padding: 13, borderRadius: 13, alignItems: 'center' },
  confirmDanger: { backgroundColor: UI.danger },
  confirmText: { color: '#FFF', fontWeight: '900' },
});
