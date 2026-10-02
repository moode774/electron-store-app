import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Platform,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { DirectionalIcon } from '../../components/DirectionalIcon';
import { getAdminWithdrawals, processWithdrawal, AdminWithdrawal, type WithdrawalDecisionStatus } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useTranslation } from '../../i18n';

const UI = {
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  bg: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  success: COLORS.success,
  danger: COLORS.error,
  warning: COLORS.warning,
};

const STATUS_FILTERS = [
  { key: '', labelKey: 'adminUi.all' },
  { key: 'pending', labelKey: 'adminUi.withdrawPending' },
  { key: 'approved', labelKey: 'adminUi.withdrawApproved' },
  { key: 'processing', labelKey: 'adminUi.withdrawProcessing' },
  { key: 'paid', labelKey: 'adminUi.withdrawPaid' },
  { key: 'failed', labelKey: 'adminUi.withdrawFailed' },
  { key: 'rejected', labelKey: 'adminUi.productRejected' },
];

const STATUS_META: Record<string, { labelKey: string; color: string; bg: string }> = {
  pending: { labelKey: 'adminUi.withdrawPending', color: UI.warning, bg: '#FFFBEB' },
  approved: { labelKey: 'adminUi.withdrawApprovedMeta', color: UI.success, bg: '#ECFDF5' },
  processing: { labelKey: 'adminUi.withdrawProcessingExternal', color: '#7C3AED', bg: '#F5F3FF' },
  paid: { labelKey: 'adminUi.withdrawPaidMeta', color: UI.success, bg: '#ECFDF5' },
  failed: { labelKey: 'adminUi.withdrawFailed', color: UI.danger, bg: '#FEF2F2' },
  rejected: { labelKey: 'adminUi.productRejected', color: UI.danger, bg: '#FEF2F2' },
};

const ROLE_LABELS: Record<string, string> = {
  merchant: 'adminUi.roleMerchant',
  delivery: 'adminUi.roleCourier',
  customer: 'adminUi.roleCustomer',
};

function payoutDestinationLines(destination: AdminWithdrawal['payout_destination'], t: (key: string) => string): string[] {
  if (!destination || typeof destination !== 'object') return [];
  const value = destination as Record<string, unknown>;
  const line = (label: string, ...keys: string[]) => {
    const found = keys.map((key) => value[key]).find((item) => typeof item === 'string' && item.trim());
    return typeof found === 'string' ? `${label}: ${found}` : null;
  };
  return [
    line(t('adminUi.payoutMethod'), 'method', 'type', 'payout_method'),
    line(t('adminUi.payoutBankProvider'), 'bank_name', 'provider_name'),
    line(t('adminUi.payoutBeneficiary'), 'account_name', 'bank_account_name', 'beneficiary_name'),
    line(t('adminUi.payoutAccount'), 'masked_account', 'account_last4', 'bank_account', 'account_number', 'wallet_number'),
  ].filter((item): item is string => !!item);
}

export default function AdminWalletScreen({ navigation }: any) {
  const { t, language } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const tablet = width >= 700 && width < BREAKPOINTS.desktop;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 14 : tablet ? 22 : 28;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const [requests, setRequests] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [processing, setProcessing] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AdminWithdrawal | null>(null);
  const [modalAction, setModalAction] = useState<WithdrawalDecisionStatus>('approved');
  const [notes, setNotes] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await getAdminWithdrawals(filter || undefined);
      setRequests(data);
    } catch (e) {
      console.error('Failed to load withdrawal requests:', e);
      setLoadError(t('adminUi.withdrawLoadFailed'));
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [filter]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const openModal = (req: AdminWithdrawal, action: WithdrawalDecisionStatus) => {
    setSelectedRequest(req);
    setModalAction(action);
    setNotes('');
    setExternalReference('');
    setModalVisible(true);
  };

  const handleProcess = async () => {
    if (!selectedRequest || processing) return;
    const allowedTransitions: Record<string, WithdrawalDecisionStatus[]> = {
      pending: ['approved', 'rejected'],
      approved: ['processing'],
      processing: ['paid', 'failed'],
    };
    if (!allowedTransitions[selectedRequest.status]?.includes(modalAction)) {
      Alert.alert(t('adminUi.withdrawAlreadyProcessed'), t('adminUi.withdrawRefreshCurrent'));
      return;
    }
    if ((modalAction === 'rejected' || modalAction === 'failed') && !notes.trim()) {
      Alert.alert(t('adminUi.withdrawDecisionReasonRequired'), t('adminUi.withdrawDecisionReasonText'));
      return;
    }
    if (modalAction === 'paid' && !externalReference.trim()) {
      Alert.alert(t('adminUi.withdrawReferenceRequired'), t('adminUi.withdrawReferenceText'));
      return;
    }
    setProcessing(selectedRequest.id);
    try {
      await processWithdrawal(selectedRequest.id, modalAction, notes.trim() || undefined, externalReference.trim() || undefined);
      setRequests((current) => {
        if (filter && modalAction !== filter) return current.filter((request) => request.id !== selectedRequest.id);
        return current.map((request) => request.id === selectedRequest.id
          ? {
              ...request,
              status: modalAction,
              admin_notes: notes.trim() || request.admin_notes,
              external_reference: externalReference.trim() || request.external_reference,
            }
          : request);
      });
      setModalVisible(false);
      setSelectedRequest(null);
      const successMessages: Record<WithdrawalDecisionStatus, string> = {
        approved: t('adminUi.withdrawSuccessApproved'),
        rejected: t('adminUi.withdrawSuccessRejected'),
        processing: t('adminUi.withdrawSuccessProcessing'),
        paid: t('adminUi.withdrawSuccessPaid'),
        failed: t('adminUi.withdrawSuccessFailed'),
      };
      Alert.alert(t('adminUi.done'), successMessages[modalAction]);
    } catch (e) {
      console.error('Failed to process withdrawal request:', e);
      Alert.alert(t('adminUi.withdrawProcessFailed'), e instanceof Error ? e.message : t('adminUi.withdrawNoChange'));
    } finally { setProcessing(null); }
  };

  const renderRequest = ({ item }: { item: AdminWithdrawal }) => {
    const statusInfo = STATUS_META[item.status] ?? { labelKey: '', color: UI.textMuted, bg: '#F1F5F9' };
    const user = item.users as any;
    const date = new Date(item.created_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const destinationLines = payoutDestinationLines(item.payout_destination, t);
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.labelKey ? t(statusInfo.labelKey) : item.status}</Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName}>{user?.full_name ?? t('adminUi.unknownUser')}</Text>
            <View style={s.roleBadge}>
              <Text style={s.userRole}>{ROLE_LABELS[user?.role ?? ''] ? t(ROLE_LABELS[user?.role ?? '']) : user?.role ?? t('adminUi.unspecified')}</Text>
            </View>
          </View>
        </View>

        <View style={s.amountBox}>
          <View>
            <Text style={s.amountLabel}>{t('adminUi.requestedAmount')}</Text>
            <View style={s.amountInline}><Text style={s.amountText}>{item.amount.toFixed(2)}</Text><Text style={s.amountCurrency}>{t('adminUi.yer')}</Text></View>
          </View>
          <View style={s.datePill}><Ionicons name="calendar-outline" size={13} color={UI.textMuted} /><Text style={s.dateText}>{date}</Text></View>
        </View>

        {(item.requester_notes ?? item.notes) && (
          <View style={s.notesBox}>
            <Ionicons name="document-text-outline" size={14} color={UI.textMuted} />
            <Text style={s.notesText}>{item.requester_notes ?? item.notes}</Text>
          </View>
        )}
        <View style={s.destinationBox}>
          <View style={s.destinationTitleRow}>
            <View style={s.destinationIcon}><Ionicons name="business-outline" size={15} color={UI.primary} /></View>
            <Text style={s.destinationTitle}>{t('adminUi.payoutDestination')}</Text>
          </View>
          {destinationLines.length ? destinationLines.map((line) => <Text key={line} style={s.destinationLine}>{line}</Text>) : (
            <Text style={s.missingDestination}>{t('adminUi.payoutDestinationMissing')}</Text>
          )}
        </View>
        {!!item.admin_notes && <Text style={s.auditText}>{t('adminUi.adminNote')}: {item.admin_notes}</Text>}
        {!!item.external_reference && <Text style={s.auditText}>{t('adminUi.transferReference')}: {item.external_reference}</Text>}
        {!!item.processed_at && <Text style={s.auditText}>{t('adminUi.lastProcessing')}: {new Date(item.processed_at).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</Text>}
        {!!item.paid_at && <Text style={s.auditText}>{t('adminUi.paymentTime')}: {new Date(item.paid_at).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</Text>}

        {item.status === 'pending' && (
          <>
            <View style={s.divider} />
            {processing === item.id ? (
              <View style={s.actionsRow}><ActivityIndicator size="small" color={UI.primary} /></View>
            ) : (
              <View style={s.actionsRow}>
                <TouchableOpacity style={s.rejectBtn} onPress={() => openModal(item, 'rejected')} activeOpacity={0.8}>
                  <Text style={s.rejectBtnText}>{t('adminUi.rejectRequest')}</Text>
                  <Ionicons name="close-circle" size={18} color={UI.danger} />
                </TouchableOpacity>
                <TouchableOpacity style={s.approveBtn} onPress={() => openModal(item, 'approved')} activeOpacity={0.8}>
                  <Text style={s.approveBtnText}>{t('adminUi.reviewApprove')}</Text>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
        {item.status === 'approved' && (
          <>
            <View style={s.divider} />
            <TouchableOpacity style={s.approveBtn} onPress={() => openModal(item, 'processing')} disabled={processing === item.id} accessibilityRole="button">
              <Text style={s.approveBtnText}>{t('adminUi.startExternalTransfer')}</Text>
              <Ionicons name="swap-horizontal" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        )}
        {item.status === 'processing' && (
          <>
            <View style={s.divider} />
            <View style={s.actionsRow}>
              <TouchableOpacity style={s.rejectBtn} onPress={() => openModal(item, 'failed')} disabled={processing === item.id} accessibilityRole="button">
                <Text style={s.rejectBtnText}>{t('adminUi.withdrawFailed')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.approveBtn} onPress={() => openModal(item, 'paid')} disabled={processing === item.id} accessibilityRole="button">
                <Text style={s.approveBtnText}>{t('adminUi.confirmPayment')}</Text>
                <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  };

  const actionMeta: Record<WithdrawalDecisionStatus, { title: string; detail: string; confirm: string }> = {
    approved: { title: t('adminUi.approveWithdrawal'), detail: t('adminUi.approveWithdrawalDetail'), confirm: t('adminUi.confirmApproval') },
    rejected: { title: t('adminUi.rejectWithdrawal'), detail: t('adminUi.rejectWithdrawalDetail'), confirm: t('adminUi.confirmReject') },
    processing: { title: t('adminUi.startExternalTransfer'), detail: t('adminUi.startExternalTransferDetail'), confirm: t('adminUi.startTransfer') },
    paid: { title: t('adminUi.confirmWithdrawalPayment'), detail: t('adminUi.confirmWithdrawalPaymentDetail'), confirm: t('adminUi.confirmPayment') },
    failed: { title: t('adminUi.recordTransferFailure'), detail: t('adminUi.recordTransferFailureDetail'), confirm: t('adminUi.recordFailure') },
  };
  const currentAction = actionMeta[modalAction];

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={[s.headerContent, { width: contentWidth }]}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <DirectionalIcon name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <View style={s.headerCopy}><Text style={s.headerEyebrow}>{t('adminUi.payments')}</Text><Text style={s.headerTitle}>{t('adminUi.withdrawals')}</Text><Text style={s.headerSubtitle}>{t('adminUi.withdrawalsSubtitle')}</Text></View>
          </View>
          <View style={s.headerBadge}>
            <Text style={s.headerBadgeText}>{requests.length} {t('adminUi.results')}</Text>
          </View>
        </View>
      </View>

      <View style={s.filterRowWrap}>
        <View style={s.filterRow}>
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{t(f.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : loadError ? (
        <View style={s.center} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={48} color={UI.danger} />
          <Text style={s.errorText}>{loadError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>{t('adminUi.retry')}</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={requests}
          key={`withdrawals-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          keyExtractor={i => i.id}
          renderItem={renderRequest}
          contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="wallet-outline" size={48} color={UI.border} />
              <Text style={s.emptyText}>{t('adminUi.noWithdrawals')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => !processing && setModalVisible(false)} accessibilityViewIsModal>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { width: Math.min(Math.max(width - 24, 280), 420) }]}>
            <View style={s.modalHeader}>
               <Text style={s.modalTitle}>{currentAction.title}</Text>
               <TouchableOpacity onPress={() => setModalVisible(false)} style={s.closeBtn} disabled={!!processing}>
                  <Ionicons name="close" size={20} color={UI.textMuted} />
               </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>{currentAction.detail} {t('adminUi.amount')}: {selectedRequest?.amount.toFixed(2)} {t('adminUi.yer')}.</Text>
            
            <View style={s.inputWrapper}>
              <TextInput
                style={s.modalInput}
                placeholder={modalAction === 'rejected' || modalAction === 'failed' ? t('adminUi.decisionReasonRequiredPlaceholder') : t('adminUi.processingNotesOptional')}
                placeholderTextColor={UI.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={2000}
                textAlign="right"
                accessibilityLabel={t('adminUi.withdrawProcessingNotesA11y')}
              />
            </View>
            {modalAction === 'paid' && (
              <View style={s.inputWrapper}>
                <TextInput
                  style={s.referenceInput}
                  placeholder={t('adminUi.externalTransferReferenceRequired')}
                  placeholderTextColor={UI.textMuted}
                  value={externalReference}
                  onChangeText={setExternalReference}
                  maxLength={200}
                  textAlign="right"
                  accessibilityLabel={t('adminUi.externalTransferReference')}
                />
              </View>
            )}
            
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setModalVisible(false)} activeOpacity={0.8} disabled={!!processing}>
                <Text style={s.modalCancelText}>{t('adminUi.undo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, (modalAction === 'rejected' || modalAction === 'failed') && s.modalConfirmReject]}
                onPress={handleProcess}
                activeOpacity={0.8}
                disabled={!!processing}
              >
                {processing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.modalConfirmText}>{currentAction.confirm}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { backgroundColor: UI.bg, paddingTop: Platform.OS === 'ios' ? 56 : 30, paddingBottom: 14, zIndex: 10 },
  headerContent: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  headerCopy: { alignItems: 'flex-end', gap: 1 },
  headerEyebrow: { fontSize: 10, fontFamily: FONTS.semiBold, color: UI.primary },
  headerTitle: { fontSize: 24, fontFamily: FONTS.bold, color: UI.text, letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 10.5, fontFamily: FONTS.regular, color: UI.textMuted },
  backBtn: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border },
  headerBadge: { backgroundColor: UI.card, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: UI.border },
  headerBadgeText: { fontSize: 11, fontFamily: FONTS.semiBold, color: UI.textMuted },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 8 },
  filterRow: { flexDirection: 'row-reverse', paddingHorizontal: 14, gap: 7, flexWrap: 'wrap', justifyContent: 'center' },
  filterBtn: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 11.5, fontFamily: FONTS.semiBold, color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { alignSelf: 'center', paddingTop: 8, gap: 12, paddingBottom: 100 },
  columnRow: { gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: UI.textMuted, fontWeight: '700' },
  errorText: { color: UI.danger, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  retryBtn: { backgroundColor: UI.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: UI.border },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 10.5, fontFamily: FONTS.semiBold },
  userInfo: { alignItems: 'flex-start', gap: 6 },
  userName: { fontSize: 15, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right' },
  roleBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  userRole: { fontSize: 11, color: UI.textMuted, fontWeight: '700' },
  amountBox: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: UI.primaryLight, borderRadius: 16, padding: 15 },
  amountLabel: { fontSize: 10, fontFamily: FONTS.medium, color: UI.textMuted, textAlign: 'right', marginBottom: 2 },
  amountInline: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 5 },
  amountText: { fontSize: 26, fontFamily: FONTS.bold, color: UI.primary, textAlign: 'right' },
  amountCurrency: { fontSize: 11, fontFamily: FONTS.semiBold, color: UI.primary },
  datePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  dateText: { fontSize: 10.5, color: UI.textMuted, fontFamily: FONTS.medium },
  notesBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: UI.border },
  notesText: { fontSize: 13, color: UI.text, textAlign: 'right', flex: 1, lineHeight: 20 },
  destinationBox: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 13, borderWidth: 1, borderColor: UI.border, gap: 5 },
  destinationTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 2 },
  destinationIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  destinationTitle: { color: UI.text, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  destinationLine: { color: '#334155', fontSize: 12, fontWeight: '600', textAlign: 'right' },
  missingDestination: { color: '#B45309', fontSize: 12, fontWeight: '700', lineHeight: 19, textAlign: 'right' },
  auditText: { color: UI.textMuted, fontSize: 11.5, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 4 },
  actionsRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  approveBtn: { flex: 1, minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: UI.primary, borderRadius: 13, paddingVertical: 10 },
  approveBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  rejectBtn: { flex: 1, minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: UI.card, borderRadius: 13, paddingVertical: 10, borderWidth: 1, borderColor: '#FECACA' },
  rejectBtnText: { fontSize: 14, fontWeight: '800', color: UI.danger },
  modalOverlay: { flex: 1, backgroundColor: '#0F172A66', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: { maxHeight: '90%', backgroundColor: UI.card, borderRadius: 24, padding: 22, maxWidth: 420, borderWidth: 1, borderColor: UI.border, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.02, shadowRadius: 24, elevation: 8 },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: UI.text, textAlign: 'right' },
  closeBtn: { padding: 4, backgroundColor: '#F1F5F9', borderRadius: 12 },
  modalSub: { fontSize: 15, color: UI.textMuted, textAlign: 'right', lineHeight: 24, marginBottom: 20 },
  inputWrapper: { marginBottom: 24 },
  modalInput: { borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 16, fontSize: 15, color: UI.text, minHeight: 100, textAlignVertical: 'top', backgroundColor: '#F8FAFC' },
  referenceInput: { borderWidth: 1, borderColor: UI.border, borderRadius: 16, paddingHorizontal: 16, height: 52, fontSize: 15, color: UI.text, backgroundColor: '#F8FAFC' },
  modalActions: { flexDirection: 'row-reverse', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '800', color: UI.textMuted },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 16, backgroundColor: UI.success, alignItems: 'center', shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 },
  modalConfirmReject: { backgroundColor: UI.danger, shadowColor: UI.danger },
  modalConfirmText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
});
