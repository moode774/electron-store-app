import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, Modal
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAdminMerchants, approveMerchant, toggleMerchantActive, AdminMerchant } from '@marketplace/shared-hooks';

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

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'بانتظار الموافقة' },
  { key: 'approved', label: 'معتمد' },
] as const;

export default function AdminMerchantsScreen() {
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [pauseModal, setPauseModal] = useState<{ visible: boolean; merchant: AdminMerchant | null; reason: string }>({ visible: false, merchant: null, reason: '' });
  const [reviewModal, setReviewModal] = useState<{ visible: boolean; merchant: AdminMerchant | null; approve: boolean; reason: string }>({ visible: false, merchant: null, approve: true, reason: '' });

  const load = useCallback(async () => {
    try {
      const data = await getAdminMerchants(filter);
      setMerchants(data);
    } catch (err) {
      console.error('Failed to load merchants:', err);
      Alert.alert('خطأ', 'فشل تحميل التجار');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [filter]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleApprove = (merchant: AdminMerchant, approve: boolean) => {
    setReviewModal({ visible: true, merchant, approve, reason: '' });
  };

  const submitReview = async () => {
    const { merchant, approve, reason } = reviewModal;
    if (!merchant || processing) return;
    if (!approve && !reason.trim()) {
      Alert.alert('سبب الرفض مطلوب', 'اكتب سبباً واضحاً ليتمكن التاجر من تصحيح الطلب.');
      return;
    }
    setProcessing(merchant.id);
    try {
      await (approveMerchant as any)(merchant.id, approve, reason.trim() || undefined);
      setMerchants((current) => current.map((item) => item.id === merchant.id ? { ...item, is_approved: approve } : item));
      setReviewModal({ visible: false, merchant: null, approve: true, reason: '' });
      Alert.alert('تم حفظ المراجعة', approve ? 'تم اعتماد المتجر بعد مراجعة البيانات المعروضة.' : 'تم رفض الطلب وتسجيل السبب.');
    } catch (err) {
      console.error('Failed to update merchant approval:', err);
      Alert.alert('تعذر حفظ المراجعة', err instanceof Error ? err.message : 'لم تتغير حالة التاجر.');
    } finally {
      setProcessing(null);
    }
  };

  const handleToggleActive = async (merchant: AdminMerchant) => {
    const newActive = !merchant.is_active;
    if (!newActive) {
      setPauseModal({ visible: true, merchant, reason: '' });
      return;
    }
    Alert.alert(
      'تفعيل التاجر',
      `هل تريد تفعيل المتجر "${merchant.store_name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تفعيل',
          style: 'default',
          onPress: async () => {
            setProcessing(merchant.id);
            try {
              await toggleMerchantActive(merchant.id, true);
              load();
            } catch (err) {
              console.error('Failed to activate merchant:', err);
              Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل تحديث حالة التاجر');
            }
            finally { setProcessing(null); }
          },
        },
      ]
    );
  };

  const submitPause = async () => {
    const { merchant, reason } = pauseModal;
    if (!merchant || !reason.trim()) {
      Alert.alert('تنبيه', 'يرجى كتابة سبب الإيقاف لتوضيحه للتاجر.');
      return;
    }
    setPauseModal(p => ({ ...p, visible: false }));
    setProcessing(merchant.id);
    try {
      await toggleMerchantActive(merchant.id, false, reason.trim());
      load();
    } catch (err) {
      console.error('Failed to pause merchant:', err);
      Alert.alert('خطأ', err instanceof Error ? err.message : 'فشل تحديث حالة التاجر');
    } finally {
      setProcessing(null);
    }
  };

  const filtered = merchants.filter(m =>
    m.store_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.owner_name?.toLowerCase().includes(search.toLowerCase()) ||
    (m.users as any)?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const renderMerchant = ({ item }: { item: AdminMerchant }) => {
    const userName = (item.users as any)?.full_name ?? item.owner_name ?? 'غير متوفر';
    const phone = (item.users as any)?.phone ?? 'غير متوفر';
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.avatarCircle}>
            <Ionicons name="storefront" size={24} color={UI.primary} />
          </View>
          <View style={s.cardInfo}>
            <Text style={s.storeName}>{item.store_name}</Text>
            <View style={s.ownerRow}>
              <Ionicons name="person-outline" size={12} color={UI.textMuted} />
              <Text style={s.ownerName}>{userName}</Text>
            </View>
            <View style={s.ownerRow}>
              <Ionicons name="call-outline" size={12} color={UI.textMuted} />
              <Text style={s.phoneText}>{phone}</Text>
            </View>
          </View>
          <View style={[s.statusBadge, item.is_approved ? s.statusApproved : s.statusPending]}>
            <Text style={[s.statusText, item.is_approved ? s.statusTextApproved : s.statusTextPending]}>
              {item.is_approved ? 'معتمد' : 'انتظار'}
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.cardMeta}>
          <View style={s.metaItem}>
            <View style={s.metaIconBox}><Ionicons name="location" size={14} color={UI.primary} /></View>
            <Text style={s.metaText}>{item.city ?? 'غير محدد'}</Text>
          </View>
          <View style={s.metaItem}>
            <View style={[s.metaIconBox, { backgroundColor: '#ECFDF5' }]}><Ionicons name="wallet" size={14} color={UI.success} /></View>
            <Text style={[s.metaText, { color: UI.success, fontWeight: '800' }]}>{(item.wallet_balance || 0).toFixed(2)} ر.ي</Text>
          </View>
          {item.is_approved && (
            <View style={[s.metaItem, item.is_active ? s.activePill : s.inactivePill]}>
              <Ionicons name={item.is_active ? 'checkmark-circle' : 'pause-circle'} size={14} color={item.is_active ? '#10B981' : '#9CA3AF'} />
              <Text style={[s.metaText, { color: item.is_active ? '#10B981' : '#9CA3AF', fontWeight: '700' }]}>
                {item.is_active ? 'نشط' : 'موقوف'}
              </Text>
            </View>
          )}
        </View>

        {processing === item.id ? (
          <View style={s.actionsRow}><ActivityIndicator size="small" color={UI.primary} /></View>
        ) : (
          <View style={s.actionsRow}>
            {!item.is_approved ? (
              <>
                <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(item, true)} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={s.approveBtnText}>موافقة</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => handleApprove(item, false)} activeOpacity={0.8}>
                  <Ionicons name="close-circle-outline" size={18} color={UI.danger} />
                  <Text style={s.rejectBtnText}>رفض</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[s.toggleBtn, item.is_active ? s.toggleBtnStop : s.toggleBtnActive]} onPress={() => handleToggleActive(item)} activeOpacity={0.8}>
                <Ionicons name={item.is_active ? 'pause-outline' : 'play-outline'} size={18} color={item.is_active ? UI.textMuted : UI.primary} />
                <Text style={[s.toggleBtnText, { color: item.is_active ? UI.textMuted : UI.primary }]}>
                  {item.is_active ? 'إيقاف المتجر' : 'تفعيل المتجر'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <Text style={s.headerCount}>{merchants.length} متجر</Text>
          <Text style={s.headerTitle}>التجار</Text>
        </View>
        
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={20} color={UI.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="البحث باسم المتجر أو المالك..."
            placeholderTextColor={UI.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
      </View>

      <View style={s.filterRowWrap}>
        <FlatList
          horizontal
          inverted
          data={FILTERS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          keyExtractor={f => f.key}
          renderItem={({ item: f }) => {
            const isActive = filter === f.key;
            return (
              <TouchableOpacity
                style={[s.filterBtn, isActive && s.filterBtnActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.filterText, isActive && s.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderMerchant}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="storefront-outline" size={48} color={UI.border} />
              <Text style={s.emptyText}>لا يوجد تجار لعرضهم</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Pause Modal */}
      <Modal visible={pauseModal.visible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>إيقاف المتجر</Text>
              <TouchableOpacity onPress={() => setPauseModal(p => ({ ...p, visible: false }))}>
                <Ionicons name="close" size={24} color={UI.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSubtitle}>سيتم إيقاف متجر "{pauseModal.merchant?.store_name}" وإخفاؤه عن العملاء. يرجى توضيح السبب ليظهر للتاجر:</Text>
            
            <View style={s.reasonPresets}>
              {['مخالفة شروط الاستخدام', 'كثرة شكاوى العملاء', 'عدم توفر التراخيص اللازمة'].map((r) => (
                <TouchableOpacity 
                  key={r} 
                  style={[s.reasonPresetBtn, pauseModal.reason === r && s.reasonPresetBtnActive]}
                  onPress={() => setPauseModal(p => ({ ...p, reason: r }))}
                >
                  <Text style={[s.reasonPresetText, pauseModal.reason === r && s.reasonPresetTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={s.reasonInput}
              placeholder="أو اكتب سبباً آخر هنا..."
              placeholderTextColor={UI.textMuted}
              value={pauseModal.reason}
              onChangeText={(t) => setPauseModal(p => ({ ...p, reason: t }))}
              multiline
              textAlign="right"
            />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setPauseModal(p => ({ ...p, visible: false }))}>
                <Text style={s.modalCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSubmitBtn} onPress={submitPause}>
                <Text style={s.modalSubmitText}>تأكيد الإيقاف</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={reviewModal.visible} transparent animationType="fade" onRequestClose={() => !processing && setReviewModal((current) => ({ ...current, visible: false }))} accessibilityViewIsModal>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{reviewModal.approve ? 'مراجعة واعتماد التاجر' : 'رفض طلب اعتماد التاجر'}</Text>
              <TouchableOpacity onPress={() => setReviewModal((current) => ({ ...current, visible: false }))} disabled={!!processing} accessibilityRole="button" accessibilityLabel="إغلاق مراجعة التاجر">
                <Ionicons name="close" size={24} color={UI.textMuted} />
              </TouchableOpacity>
            </View>
            {reviewModal.merchant && (() => {
              const merchant = reviewModal.merchant as AdminMerchant & Record<string, any>;
              return <View style={s.verificationBox}>
                <Text style={s.verificationTitle}>{merchant.store_name}</Text>
                <Text style={s.verificationRow}>المالك: {(merchant.users as any)?.full_name ?? merchant.owner_name ?? 'غير متوفر'}</Text>
                <Text style={s.verificationRow}>رقم الهوية: {merchant.national_id || 'غير مرفق'}</Text>
                <Text style={s.verificationRow}>السجل التجاري: {merchant.commercial_register || 'غير مرفق'}</Text>
                <Text style={s.verificationRow}>الرقم الضريبي: {merchant.tax_number || 'غير مرفق'}</Text>
                <Text style={s.verificationRow}>البنك: {merchant.bank_name || 'غير مرفق'}</Text>
                <Text style={s.verificationRow}>اسم صاحب الحساب: {merchant.bank_account_name || 'غير مرفق'}</Text>
                <View style={s.evidenceWarning}>
                  <Ionicons name="warning-outline" size={17} color={UI.warning} />
                  <Text style={s.evidenceWarningText}>لا يعرض النظام حالياً مستندات أو صور إثبات قابلة للمطابقة؛ لا تعتمد الطلب إذا لم تتحقق خارجياً.</Text>
                </View>
              </View>;
            })()}
            <TextInput
              style={s.reasonInput}
              placeholder={reviewModal.approve ? 'ملاحظة المراجع (اختياري)...' : 'سبب الرفض (مطلوب)...'}
              placeholderTextColor={UI.textMuted}
              value={reviewModal.reason}
              onChangeText={(reason) => setReviewModal((current) => ({ ...current, reason }))}
              multiline
              textAlign="right"
              accessibilityLabel="ملاحظات مراجعة التاجر"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setReviewModal((current) => ({ ...current, visible: false }))} disabled={!!processing}><Text style={s.modalCancelText}>تراجع</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalSubmitBtn, !reviewModal.approve && { backgroundColor: UI.danger }]} onPress={submitReview} disabled={!!processing}>
                {processing ? <ActivityIndicator color="#FFF" /> : <Text style={s.modalSubmitText}>{reviewModal.approve ? 'اعتماد بعد المراجعة' : 'تأكيد الرفض'}</Text>}
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
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text },
  headerCount: { fontSize: 13, color: UI.primary, fontWeight: '700', backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: UI.bg, marginHorizontal: 20, paddingHorizontal: 16, borderRadius: 16, height: 50, borderWidth: 1, borderColor: UI.border },
  searchInput: { flex: 1, fontSize: 15, color: UI.text, fontWeight: '600' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterRow: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { padding: 20, paddingTop: 6, gap: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: UI.textMuted, fontWeight: '600' },
  card: { backgroundColor: UI.card, borderRadius: 24, padding: 18, shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 14 },
  avatarCircle: { width: 56, height: 56, borderRadius: 18, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, alignItems: 'flex-end' },
  storeName: { fontSize: 16, fontWeight: '800', color: UI.text, textAlign: 'right', marginBottom: 6 },
  ownerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginBottom: 4 },
  ownerName: { fontSize: 13, color: UI.textMuted, fontWeight: '600', textAlign: 'right' },
  phoneText: { fontSize: 13, color: UI.textMuted, fontWeight: '600', textAlign: 'right' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusApproved: { backgroundColor: '#ECFDF5' },
  statusPending: { backgroundColor: '#FFFBEB' },
  statusText: { fontSize: 12, fontWeight: '800' },
  statusTextApproved: { color: UI.success },
  statusTextPending: { color: UI.warning },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 14 },
  cardMeta: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  metaIconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  metaText: { fontSize: 13, color: UI.text, fontWeight: '600' },
  activePill: { backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5' },
  inactivePill: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  actionsRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'center', justifyContent: 'center' },
  approveBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: UI.success, borderRadius: 16, paddingVertical: 12, shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  rejectBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#FEE2E2' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: UI.danger },
  toggleBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 12 },
  toggleBtnStop: { backgroundColor: '#F1F5F9' },
  toggleBtnActive: { backgroundColor: UI.primaryLight },
  toggleBtnText: { fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 400, backgroundColor: UI.card, borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: UI.danger },
  modalSubtitle: { fontSize: 13, color: UI.textMuted, textAlign: 'right', marginBottom: 20, lineHeight: 20 },
  reasonPresets: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  reasonPresetBtn: { backgroundColor: UI.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: UI.border },
  reasonPresetBtnActive: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  reasonPresetText: { fontSize: 12, color: UI.textMuted, fontWeight: '600' },
  reasonPresetTextActive: { color: UI.danger, fontWeight: '700' },
  reasonInput: { backgroundColor: UI.bg, borderWidth: 1, borderColor: UI.border, borderRadius: 16, height: 100, padding: 16, fontSize: 14, color: UI.text, textAlignVertical: 'top', marginBottom: 24 },
  verificationBox: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: UI.border, borderRadius: 14, padding: 14, marginBottom: 14, gap: 7 },
  verificationTitle: { color: UI.text, fontSize: 16, fontWeight: '900', textAlign: 'right', marginBottom: 3 },
  verificationRow: { color: '#334155', fontSize: 13, fontWeight: '600', textAlign: 'right' },
  evidenceWarning: { flexDirection: 'row-reverse', gap: 7, alignItems: 'flex-start', backgroundColor: '#FFFBEB', padding: 10, borderRadius: 10, marginTop: 5 },
  evidenceWarningText: { flex: 1, color: '#92400E', fontSize: 12, lineHeight: 19, textAlign: 'right', fontWeight: '700' },
  modalActions: { flexDirection: 'row-reverse', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: UI.bg },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: UI.textMuted },
  modalSubmitBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: UI.danger },
  modalSubmitText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
