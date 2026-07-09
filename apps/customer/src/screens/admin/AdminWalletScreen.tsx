import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Platform
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAdminWithdrawals, processWithdrawal, AdminWithdrawal } from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#059669',
  danger: '#DC2626',
  warning: '#D97706',
};

const STATUS_FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'approved', label: 'تمت الموافقة' },
  { key: 'rejected', label: 'مرفوض' },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد الانتظار', color: UI.warning, bg: '#FFFBEB' },
  approved: { label: 'موافق عليه', color: UI.success, bg: '#ECFDF5' },
  rejected: { label: 'مرفوض', color: UI.danger, bg: '#FEF2F2' },
};

const ROLE_LABELS: Record<string, string> = {
  merchant: 'تاجر',
  delivery: 'سائق',
  customer: 'عميل',
};

export default function AdminWalletScreen({ navigation }: any) {
  const [requests, setRequests] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [processing, setProcessing] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AdminWithdrawal | null>(null);
  const [modalAction, setModalAction] = useState<'approved' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getAdminWithdrawals(filter || undefined);
      setRequests(data);
    } catch { Alert.alert('خطأ', 'فشل تحميل طلبات السحب'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [filter]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const openModal = (req: AdminWithdrawal, action: 'approved' | 'rejected') => {
    setSelectedRequest(req);
    setModalAction(action);
    setNotes('');
    setModalVisible(true);
  };

  const handleProcess = async () => {
    if (!selectedRequest) return;
    setProcessing(selectedRequest.id);
    setModalVisible(false);
    try {
      await processWithdrawal(selectedRequest.id, modalAction, notes.trim() || undefined);
      load();
      Alert.alert('تم', modalAction === 'approved' ? 'تمت الموافقة على طلب السحب بنجاح' : 'تم رفض طلب السحب');
    } catch { Alert.alert('خطأ', 'فشل معالجة الطلب'); }
    finally { setProcessing(null); }
  };

  const totalPending = requests.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.amount, 0);

  const renderRequest = ({ item }: { item: AdminWithdrawal }) => {
    const statusInfo = STATUS_META[item.status] ?? { label: item.status, color: UI.textMuted, bg: '#F1F5F9' };
    const user = item.users as any;
    const date = new Date(item.created_at).toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
            <Text style={s.amountText}>{item.amount.toFixed(2)} ر.س</Text>
            <Ionicons name="wallet" size={24} color={UI.primary} />
          </View>
          <Text style={s.dateText}>{date}</Text>
        </View>

        {item.notes && (
          <View style={s.notesBox}>
            <Ionicons name="document-text-outline" size={14} color={UI.textMuted} />
            <Text style={s.notesText}>{item.notes}</Text>
          </View>
        )}

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
                  <Text style={s.approveBtnText}>موافقة وتحويل</Text>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>طلبات السحب</Text>
          </View>
          <View style={s.headerBadge}>
            <Text style={s.headerBadgeText}>{totalPending.toFixed(0)} ر.س معلق</Text>
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
      ) : (
        <FlatList
          data={requests}
          keyExtractor={i => i.id}
          renderItem={renderRequest}
          contentContainerStyle={s.list}
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

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
               <Text style={s.modalTitle}>{modalAction === 'approved' ? 'تأكيد الموافقة على السحب' : 'تأكيد رفض السحب'}</Text>
               <TouchableOpacity onPress={() => setModalVisible(false)} style={s.closeBtn}>
                  <Ionicons name="close" size={20} color={UI.textMuted} />
               </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>
              {modalAction === 'approved'
                ? `هل أنت متأكد من الموافقة على سحب مبلغ ${selectedRequest?.amount.toFixed(2)} ر.س؟`
                : `سيتم رفض طلب سحب مبلغ ${selectedRequest?.amount.toFixed(2)} ر.س، هل أنت متأكد؟`}
            </Text>
            
            <View style={s.inputWrapper}>
              <TextInput
                style={s.modalInput}
                placeholder="إضافة ملاحظات (اختياري)..."
                placeholderTextColor={UI.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlign="right"
              />
            </View>
            
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setModalVisible(false)} activeOpacity={0.8}>
                <Text style={s.modalCancelText}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirm, modalAction === 'rejected' && s.modalConfirmReject]}
                onPress={handleProcess}
                activeOpacity={0.8}
              >
                <Text style={s.modalConfirmText}>{modalAction === 'approved' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}</Text>
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
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text },
  backBtn: { padding: 4 },
  headerBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  headerBadgeText: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterRow: { flexDirection: 'row-reverse', paddingHorizontal: 20, gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { padding: 20, paddingTop: 6, gap: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: UI.textMuted, fontWeight: '700' },
  card: { backgroundColor: UI.card, borderRadius: 24, padding: 20, gap: 14, shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
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
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 4 },
  actionsRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  approveBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: UI.success, borderRadius: 14, paddingVertical: 12, shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  approveBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  rejectBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#FEE2E2' },
  rejectBtnText: { fontSize: 14, fontWeight: '800', color: UI.danger },
  modalOverlay: { flex: 1, backgroundColor: '#0F172A66', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, width: '100%', maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: UI.text, textAlign: 'right' },
  closeBtn: { padding: 4, backgroundColor: '#F1F5F9', borderRadius: 12 },
  modalSub: { fontSize: 15, color: UI.textMuted, textAlign: 'right', lineHeight: 24, marginBottom: 20 },
  inputWrapper: { marginBottom: 24 },
  modalInput: { borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 16, fontSize: 15, color: UI.text, minHeight: 100, textAlignVertical: 'top', backgroundColor: '#F8FAFC' },
  modalActions: { flexDirection: 'row-reverse', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '800', color: UI.textMuted },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 16, backgroundColor: UI.success, alignItems: 'center', shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  modalConfirmReject: { backgroundColor: UI.danger, shadowColor: UI.danger },
  modalConfirmText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
});
