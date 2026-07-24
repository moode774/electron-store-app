import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Platform,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAdminWithdrawals, processWithdrawal, AdminWithdrawal, type WithdrawalDecisionStatus } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

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
  { key: '', label: 'الكل' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'approved', label: 'تمت الموافقة' },
  { key: 'processing', label: 'قيد التحويل' },
  { key: 'paid', label: 'مدفوع' },
  { key: 'failed', label: 'فشل التحويل' },
  { key: 'rejected', label: 'مرفوض' },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد الانتظار', color: UI.warning, bg: '#FFFBEB' },
  approved: { label: 'موافق عليه', color: UI.success, bg: '#ECFDF5' },
  processing: { label: 'قيد التحويل الخارجي', color: '#7C3AED', bg: '#F5F3FF' },
  paid: { label: 'تم الدفع', color: UI.success, bg: '#ECFDF5' },
  failed: { label: 'فشل التحويل', color: UI.danger, bg: '#FEF2F2' },
  rejected: { label: 'مرفوض', color: UI.danger, bg: '#FEF2F2' },
};

const ROLE_LABELS: Record<string, string> = {
  merchant: 'تاجر',
  delivery: 'سائق',
  customer: 'عميل',
};

function payoutDestinationLines(destination: AdminWithdrawal['payout_destination']): string[] {
  if (!destination || typeof destination !== 'object') return [];
  const value = destination as Record<string, unknown>;
  const line = (label: string, ...keys: string[]) => {
    const found = keys.map((key) => value[key]).find((item) => typeof item === 'string' && item.trim());
    return typeof found === 'string' ? `${label}: ${found}` : null;
  };
  return [
    line('الوسيلة', 'method', 'type', 'payout_method'),
    line('البنك أو المزود', 'bank_name', 'provider_name'),
    line('اسم المستفيد', 'account_name', 'bank_account_name', 'beneficiary_name'),
    line('الحساب', 'masked_account', 'account_last4', 'bank_account', 'account_number', 'wallet_number'),
  ].filter((item): item is string => !!item);
}

export default function AdminWalletScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 24;
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
      setLoadError('تعذر تحميل طلبات السحب. تحقق من الاتصال ثم أعد المحاولة.');
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
      Alert.alert('تمت معالجة الطلب', 'حدّث القائمة للاطلاع على حالته الحالية.');
      return;
    }
    if ((modalAction === 'rejected' || modalAction === 'failed') && !notes.trim()) {
      Alert.alert('سبب القرار مطلوب', 'اكتب سبباً واضحاً ليظهر في سجل طلب السحب.');
      return;
    }
    if (modalAction === 'paid' && !externalReference.trim()) {
      Alert.alert('مرجع التحويل مطلوب', 'أدخل المرجع الصادر من وسيلة التحويل قبل تأكيد الدفع.');
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
        approved: 'تم اعتماد الطلب وحجز المبلغ، ولم يُسجل كمدفوع بعد.',
        rejected: 'تم رفض طلب السحب وفك الحجز وتسجيل السبب.',
        processing: 'تم تسجيل بدء التحويل الخارجي.',
        paid: 'تم توثيق دفع طلب السحب بالمرجع الخارجي.',
        failed: 'تم تسجيل فشل التحويل وحفظ السبب، ولم يُسجل الطلب كمدفوع.',
      };
      Alert.alert('تم', successMessages[modalAction]);
    } catch (e) {
      console.error('Failed to process withdrawal request:', e);
      Alert.alert('تعذر معالجة الطلب', e instanceof Error ? e.message : 'لم تتغير حالة الطلب. أعد المحاولة.');
    } finally { setProcessing(null); }
  };

  const renderRequest = ({ item }: { item: AdminWithdrawal }) => {
    const statusInfo = STATUS_META[item.status] ?? { label: item.status, color: UI.textMuted, bg: '#F1F5F9' };
    const user = item.users as any;
    const date = new Date(item.created_at).toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const destinationLines = payoutDestinationLines(item.payout_destination);
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName}>{user?.full_name ?? 'مستخدم غير معروف'}</Text>
            <View style={s.roleBadge}>
              <Text style={s.userRole}>{ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? 'غير محدد'}</Text>
            </View>
          </View>
        </View>

        <View style={s.amountBox}>
          <View style={s.amountRow}>
            <Text style={s.amountText}>{item.amount.toFixed(2)} ر.ي</Text>
            <Ionicons name="wallet" size={24} color={UI.primary} />
          </View>
          <Text style={s.dateText}>{date}</Text>
        </View>

        {(item.requester_notes ?? item.notes) && (
          <View style={s.notesBox}>
            <Ionicons name="document-text-outline" size={14} color={UI.textMuted} />
            <Text style={s.notesText}>{item.requester_notes ?? item.notes}</Text>
          </View>
        )}
        <View style={s.destinationBox}>
          <View style={s.destinationTitleRow}>
            <Ionicons name="business-outline" size={16} color={UI.primary} />
            <Text style={s.destinationTitle}>وجهة الصرف المحفوظة وقت الطلب</Text>
          </View>
          {destinationLines.length ? destinationLines.map((line) => <Text key={line} style={s.destinationLine}>{line}</Text>) : (
            <Text style={s.missingDestination}>لا توجد وجهة صرف محفوظة؛ لا تبدأ التحويل قبل التحقق منها.</Text>
          )}
        </View>
        {!!item.admin_notes && <Text style={s.auditText}>ملاحظة الإدارة: {item.admin_notes}</Text>}
        {!!item.external_reference && <Text style={s.auditText}>مرجع التحويل: {item.external_reference}</Text>}
        {!!item.processed_at && <Text style={s.auditText}>آخر معالجة: {new Date(item.processed_at).toLocaleString('ar-SA')}</Text>}
        {!!item.paid_at && <Text style={s.auditText}>وقت الدفع: {new Date(item.paid_at).toLocaleString('ar-SA')}</Text>}

        {item.status === 'pending' && (
          <>
            <View style={s.divider} />
            {processing === item.id ? (
              <View style={s.actionsRow}><ActivityIndicator size="small" color={UI.primary} /></View>
            ) : (
              <View style={s.actionsRow}>
                <TouchableOpacity style={s.rejectBtn} onPress={() => openModal(item, 'rejected')} activeOpacity={0.8}>
                  <Text style={s.rejectBtnText}>رفض الطلب</Text>
                  <Ionicons name="close-circle" size={18} color={UI.danger} />
                </TouchableOpacity>
                <TouchableOpacity style={s.approveBtn} onPress={() => openModal(item, 'approved')} activeOpacity={0.8}>
                  <Text style={s.approveBtnText}>مراجعة واعتماد</Text>
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
              <Text style={s.approveBtnText}>بدء التحويل الخارجي</Text>
              <Ionicons name="swap-horizontal" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        )}
        {item.status === 'processing' && (
          <>
            <View style={s.divider} />
            <View style={s.actionsRow}>
              <TouchableOpacity style={s.rejectBtn} onPress={() => openModal(item, 'failed')} disabled={processing === item.id} accessibilityRole="button">
                <Text style={s.rejectBtnText}>فشل التحويل</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.approveBtn} onPress={() => openModal(item, 'paid')} disabled={processing === item.id} accessibilityRole="button">
                <Text style={s.approveBtnText}>تأكيد الدفع</Text>
                <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  };

  const actionMeta: Record<WithdrawalDecisionStatus, { title: string; detail: string; confirm: string }> = {
    approved: { title: 'اعتماد طلب السحب', detail: 'سيُحجز المبلغ للمعالجة، ولن يظهر كمدفوع حتى توثيق التحويل الخارجي.', confirm: 'تأكيد الاعتماد' },
    rejected: { title: 'رفض طلب السحب', detail: 'سيُفك حجز المبلغ ويُسجل سبب الرفض.', confirm: 'تأكيد الرفض' },
    processing: { title: 'بدء التحويل الخارجي', detail: 'استخدم هذه المرحلة عند بدء التنفيذ لدى البنك أو وسيلة الصرف.', confirm: 'بدء التحويل' },
    paid: { title: 'تأكيد دفع السحب', detail: 'أدخل المرجع الخارجي الذي يثبت تنفيذ التحويل للمستفيد.', confirm: 'تأكيد الدفع' },
    failed: { title: 'تسجيل فشل التحويل', detail: 'سيُحفظ سبب الفشل ولن يُسجل الطلب كمدفوع.', confirm: 'تسجيل الفشل' },
  };
  const currentAction = actionMeta[modalAction];

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={[s.headerContent, { width: contentWidth }]}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>طلبات السحب</Text>
          </View>
          <View style={s.headerBadge}>
            <Text style={s.headerBadgeText}>{requests.length} نتيجة</Text>
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
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
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
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>إعادة المحاولة</Text></TouchableOpacity>
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
              <Text style={s.emptyText}>لا توجد طلبات سحب حالياً</Text>
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
            <Text style={s.modalSub}>{currentAction.detail} المبلغ: {selectedRequest?.amount.toFixed(2)} ر.ي.</Text>
            
            <View style={s.inputWrapper}>
              <TextInput
                style={s.modalInput}
                placeholder={modalAction === 'rejected' || modalAction === 'failed' ? 'سبب القرار (مطلوب)...' : 'ملاحظات المعالجة (اختياري)...'}
                placeholderTextColor={UI.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={2000}
                textAlign="right"
                accessibilityLabel="ملاحظات معالجة طلب السحب"
              />
            </View>
            {modalAction === 'paid' && (
              <View style={s.inputWrapper}>
                <TextInput
                  style={s.referenceInput}
                  placeholder="مرجع التحويل الخارجي (مطلوب)"
                  placeholderTextColor={UI.textMuted}
                  value={externalReference}
                  onChangeText={setExternalReference}
                  maxLength={200}
                  textAlign="right"
                  accessibilityLabel="مرجع التحويل الخارجي"
                />
              </View>
            )}
            
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setModalVisible(false)} activeOpacity={0.8} disabled={!!processing}>
                <Text style={s.modalCancelText}>تراجع</Text>
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
  header: { 
    backgroundColor: UI.card, 
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20, 
    borderBottomWidth: 1, borderColor: UI.border,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
    zIndex: 10
  },
  headerContent: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  headerTitle: { fontSize: 22, fontFamily: FONTS.bold, color: UI.text },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  headerBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  headerBadgeText: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterRow: { flexDirection: 'row-reverse', paddingHorizontal: 20, gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  filterBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { alignSelf: 'center', paddingTop: 6, gap: 16, paddingBottom: 112 },
  columnRow: { gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: UI.textMuted, fontWeight: '700' },
  errorText: { color: UI.danger, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  retryBtn: { backgroundColor: UI.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 20, gap: 14, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: UI.border },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '800' },
  userInfo: { alignItems: 'flex-start', gap: 6 },
  userName: { fontSize: 16, fontWeight: '900', color: UI.text },
  roleBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  userRole: { fontSize: 11, color: UI.textMuted, fontWeight: '700' },
  amountBox: { backgroundColor: UI.primaryLight, borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: UI.primary },
  amountRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  amountText: { fontSize: 24, fontWeight: '900', color: UI.primary, textAlign: 'right' },
  dateText: { fontSize: 12, color: UI.textMuted, fontWeight: '600' },
  notesBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: UI.border },
  notesText: { fontSize: 13, color: UI.text, textAlign: 'right', flex: 1, lineHeight: 20 },
  destinationBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: UI.border, gap: 5 },
  destinationTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  destinationTitle: { color: UI.text, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  destinationLine: { color: '#334155', fontSize: 12, fontWeight: '600', textAlign: 'right' },
  missingDestination: { color: '#B45309', fontSize: 12, fontWeight: '700', lineHeight: 19, textAlign: 'right' },
  auditText: { color: UI.textMuted, fontSize: 11.5, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 4 },
  actionsRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  approveBtn: { flex: 1, minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: UI.success, borderRadius: RADIUS.md, paddingVertical: 10, shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  approveBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  rejectBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#FEE2E2' },
  rejectBtnText: { fontSize: 14, fontWeight: '800', color: UI.danger },
  modalOverlay: { flex: 1, backgroundColor: '#0F172A66', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: { maxHeight: '90%', backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 24, maxWidth: 420, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
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
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 16, backgroundColor: UI.success, alignItems: 'center', shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  modalConfirmReject: { backgroundColor: UI.danger, shadowColor: UI.danger },
  modalConfirmText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
});
