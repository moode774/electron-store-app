import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  Platform, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
  ScrollView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import {
  useAuthStore, getWalletTransactions, getMerchantWalletBalance,
  getMyWithdrawalRequests, requestWithdrawal, WalletTransaction, WithdrawalRequest, WithdrawalStatus,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';

const BLOCKING_WITHDRAWAL_STATUSES = new Set<WithdrawalStatus>([
  'pending',
  'approved',
  'processing',
]);

const WITHDRAWAL_STATUS_INFO: Record<WithdrawalStatus, { label: string; color: string; backgroundColor: string }> = {
  pending: { label: 'قيد المراجعة', color: '#92400E', backgroundColor: '#FEF3C7' },
  approved: { label: 'معتمد — لم يُثبت التحويل بعد', color: '#1D4ED8', backgroundColor: '#DBEAFE' },
  processing: { label: 'جاري التحويل', color: '#6D28D9', backgroundColor: '#EDE9FE' },
  paid: { label: 'مدفوع', color: '#047857', backgroundColor: '#D1FAE5' },
  rejected: { label: 'مرفوض', color: '#B91C1C', backgroundColor: '#FEE2E2' },
  failed: { label: 'فشل التحويل', color: '#B91C1C', backgroundColor: '#FEE2E2' },
};

export default function MerchantWalletScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const withdrawLock = useRef(false);
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isTablet = width >= BREAKPOINTS.tablet;

  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const [nextBalance, nextTransactions, requests] = await Promise.all([
        getMerchantWalletBalance(user.id),
        getWalletTransactions(user.id),
        getMyWithdrawalRequests(user.id),
      ]);
      setBalance(nextBalance);
      setTransactions(nextTransactions);
      setWithdrawals(requests);
    } catch (error: unknown) {
      setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل بيانات المحفظة.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void loadData();
  }, [loadData]));

  const isIncome = (t: WalletTransaction) => t.type === 'credit';
  const blockingWithdrawal = withdrawals.find((request) => BLOCKING_WITHDRAWAL_STATUSES.has(request.status));
  const hasBlockingWithdrawal = Boolean(blockingWithdrawal);

  const openWithdraw = () => {
    if (blockingWithdrawal) {
      Alert.alert(
        blockingWithdrawal.status === 'failed' ? 'طلب يحتاج مراجعة' : 'طلب قيد المعالجة',
        blockingWithdrawal.status === 'failed'
          ? 'يوجد طلب فشل تحويله. تواصل مع الدعم أو الإدارة لمراجعته قبل إنشاء طلب جديد.'
          : 'لديك طلب سحب قائم. انتظر اكتماله أو رفضه قبل إنشاء طلب آخر.',
      );
      return;
    }
    setWithdrawAmount('');
    setWithdrawNotes('');
    setShowWithdrawModal(true);
  };

  const handleWithdraw = async () => {
    if (withdrawLock.current || submitting) return;
    if (blockingWithdrawal) {
      Alert.alert(
        blockingWithdrawal.status === 'failed' ? 'طلب يحتاج مراجعة' : 'طلب قيد المعالجة',
        blockingWithdrawal.status === 'failed'
          ? 'يوجد طلب فشل تحويله. تواصل مع الدعم أو الإدارة لمراجعته قبل إنشاء طلب جديد.'
          : 'لديك طلب سحب قائم بالفعل.',
      );
      return;
    }
    const amount = parseFloat(withdrawAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('تنبيه', 'أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    if (amount > balance) {
      Alert.alert('تنبيه', `المبلغ المطلوب يتجاوز رصيدك المتاح (${balance.toLocaleString()} ر.ي)`);
      return;
    }
    if (amount < 50) {
      Alert.alert('تنبيه', 'الحد الأدنى للسحب 50 ر.ي');
      return;
    }
    if (!user?.id) return;
    withdrawLock.current = true;
    setSubmitting(true);
    try {
      await requestWithdrawal(amount, user.id, withdrawNotes.trim() || undefined);
      setShowWithdrawModal(false);
      await loadData();
      Alert.alert(
        'تم إرسال طلب السحب ✅',
        `تم إرسال طلب بقيمة ${amount.toLocaleString()} ر.ي للمراجعة. لا يُعد المبلغ محولاً حتى تعتمد الإدارة الطلب.`,
        [{ text: 'حسناً' }]
      );
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال طلب السحب، يرجى المحاولة لاحقاً');
    } finally {
      withdrawLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      <View style={[styles.header, isCompact && styles.headerCompact, isTablet && styles.headerWide]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المحفظة والمدفوعات</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, isCompact && styles.listContentCompact, isTablet && styles.listContentWide]}
          ListHeaderComponent={
            <>
              {loadError ? (
                <View style={styles.errorCard} accessibilityRole="alert">
                  <Text style={styles.errorText}>{loadError}</Text>
                  <TouchableOpacity onPress={() => void loadData()} accessibilityRole="button" accessibilityLabel="إعادة تحميل المحفظة">
                    <Text style={styles.retryText}>إعادة المحاولة</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {/* Balance Card */}
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>الرصيد المسجل</Text>
                <Text style={styles.balanceValue}>{balance.toLocaleString()} ر.ي</Text>
                <Text style={styles.balanceNote}>تحقق من سجل المعاملات قبل طلب السحب</Text>
                <TouchableOpacity
                  style={[styles.withdrawBtn, (balance < 50 || hasBlockingWithdrawal || submitting) && { opacity: 0.5 }]}
                  activeOpacity={0.8}
                  onPress={openWithdraw}
                  disabled={balance < 50 || hasBlockingWithdrawal || submitting}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: balance < 50 || hasBlockingWithdrawal || submitting }}
                >
                  <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.withdrawBtnText}>طلب سحب</Text>
                </TouchableOpacity>
                {balance < 50 && (
                  <Text style={styles.minNote}>الحد الأدنى للسحب 50 ر.ي</Text>
                )}
              </View>

              {withdrawals.length ? (
                <View style={styles.withdrawalSection}>
                  <Text style={styles.sectionTitle}>طلبات السحب</Text>
                  {withdrawals.slice(0, 5).map((request) => {
                    const statusInfo = WITHDRAWAL_STATUS_INFO[request.status];
                    return (
                      <View key={request.id} style={[styles.withdrawalRow, isCompact && styles.withdrawalRowCompact]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.withdrawalAmount}>{request.amount.toLocaleString()} ر.ي</Text>
                          <Text style={styles.withdrawalDate}>{new Date(request.created_at).toLocaleDateString('ar-SA')}</Text>
                        </View>
                        <Text
                          style={[
                            styles.withdrawalStatus,
                            { color: statusInfo.color, backgroundColor: statusInfo.backgroundColor },
                          ]}
                        >
                          {statusInfo.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Text style={styles.sectionTitle}>سجل المعاملات</Text>
            </>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 48, gap: 12 }}>
              <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>لا توجد معاملات بعد</Text>
            </View>
          }
          renderItem={({ item }) => {
            const income = isIncome(item);
            const absoluteAmount = Math.abs(item.amount ?? 0);
            return (
              <View style={[styles.txCard, isCompact && styles.txCardCompact]}>
                <View style={[styles.txIcon, { backgroundColor: income ? '#DCFCE7' : '#FEE2E2' }]}>
                  <Ionicons name={income ? 'arrow-down' : 'arrow-up'} size={18} color={income ? '#059669' : '#EF4444'} />
                </View>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={styles.txTitle}>{item.notes ?? item.source ?? item.type}</Text>
                  <Text style={styles.txDate}>{new Date(item.created_at).toLocaleDateString('ar-SA')}</Text>
                </View>
                <Text style={[styles.txAmount, { color: income ? '#059669' : '#EF4444' }]}>
                  {income ? '+' : '-'}{absoluteAmount.toLocaleString()} ر.ي
                </Text>
              </View>
            );
          }}
        />
      )}

      {/* Withdrawal Modal */}
      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setShowWithdrawModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, isTablet && styles.modalOverlayWide]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !submitting && setShowWithdrawModal(false)}
          />
          <ScrollView
            style={[styles.modalSheet, isTablet && styles.modalSheetWide]}
            contentContainerStyle={[styles.modalSheetContent, isCompact && styles.modalSheetCompact]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>طلب سحب الأرباح</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => !submitting && setShowWithdrawModal(false)}
                disabled={submitting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBalanceRow}>
              <Text style={styles.modalBalanceLabel}>الرصيد المتاح</Text>
              <Text style={styles.modalBalanceValue}>{balance.toLocaleString()} ر.ي</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>المبلغ المطلوب (ر.ي) *</Text>
              <TextInput
                style={styles.inputBox}
                placeholder="أدخل المبلغ"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                textAlign="right"
                editable={!submitting}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ملاحظات (اختياري)</Text>
              <TextInput
                style={[styles.inputBox, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                placeholder="أي تعليمات إضافية..."
                placeholderTextColor="#9CA3AF"
                value={withdrawNotes}
                onChangeText={setWithdrawNotes}
                multiline
                textAlign="right"
                editable={!submitting}
              />
            </View>

            <View style={styles.modalInfoBox}>
              <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
              <Text style={styles.modalInfoText}>
                سيُرسل الطلب للمراجعة على الحساب البنكي المسجل في إعدادات المتجر.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, (submitting || hasBlockingWithdrawal) && { opacity: 0.7 }]}
              onPress={handleWithdraw}
              disabled={submitting || hasBlockingWithdrawal}
              accessibilityState={{ disabled: submitting || hasBlockingWithdrawal }}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>إرسال طلب السحب</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    width: '100%', alignSelf: 'center',
  },
  headerCompact: { paddingHorizontal: 14 },
  headerWide: { maxWidth: 1120 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.textPrimary },

  listContent: { padding: 20, gap: 10, paddingBottom: 100 },
  listContentCompact: { paddingHorizontal: 14 },
  listContentWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingTop: 28 },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8, marginBottom: 4 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },
  withdrawalSection: { gap: 8, marginBottom: 6 },
  withdrawalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  withdrawalRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
  withdrawalAmount: { color: '#111827', fontSize: 13.5, fontWeight: '800' },
  withdrawalDate: { color: '#9CA3AF', fontSize: 10.5, marginTop: 3 },
  withdrawalStatus: { maxWidth: '52%', fontSize: 11, fontWeight: '700', textAlign: 'right', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },

  balanceCard: { backgroundColor: COLORS.primary, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  balanceValue: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginTop: 6, marginBottom: 4 },
  balanceNote: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 },
  minNote: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8 },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF',
    minHeight: 44, paddingHorizontal: 28, borderRadius: 14,
  },
  withdrawBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 4, marginBottom: 8 },

  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  txCardCompact: { flexWrap: 'wrap', rowGap: 10 },
  txIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  txDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  txAmount: { fontSize: 14, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalOverlayWide: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    width: '100%', maxHeight: '92%',
  },
  modalSheetContent: { padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 28 },
  modalSheetCompact: { paddingHorizontal: 16 },
  modalSheetWide: { maxWidth: 560, borderRadius: RADIUS.xl },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  modalCloseButton: { width: 44, height: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalBalanceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, marginBottom: 20,
  },
  modalBalanceLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  modalBalanceValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, textAlign: 'right' },
  inputBox: {
    backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#111827', fontWeight: '600',
  },
  modalInfoBox: {
    flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EFF6FF', padding: 14, borderRadius: 10, marginBottom: 20,
  },
  modalInfoText: { flex: 1, fontSize: 12, color: '#1D4ED8', textAlign: 'right', lineHeight: 18, fontWeight: '600' },
  submitBtn: {
    backgroundColor: '#111827', height: 54, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
