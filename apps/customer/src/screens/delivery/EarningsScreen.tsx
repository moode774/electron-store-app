import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, Platform, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getDeliveryEarnings, getMyWithdrawalRequests, requestWithdrawal, DeliveryEarning, WithdrawalRequest, WithdrawalStatus } from '@marketplace/shared-hooks';

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

function withdrawalErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/COD_FUNDS_NOT_YET_REMITTED/i.test(message)) {
    return 'جزء من الرصيد ناتج عن طلبات دفع عند الاستلام ولم تعتمد الإدارة تسليم تحصيلها بعد. راجع «المحفظة والتحصيلات» لمعرفة المبلغ قيد المراجعة.';
  }
  return message || 'تعذّر إرسال طلب السحب';
}

export default function EarningsScreen() {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [history, setHistory] = useState<DeliveryEarning[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const withdrawLock = useRef(false);

  const loadEarnings = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try {
      const [result, requests] = await Promise.all([
        getDeliveryEarnings(user.id),
        getMyWithdrawalRequests(user.id),
      ]);
      setBalance(result.balance);
      setTotalDeliveries(result.totalDeliveries);
      setHistory(result.earnings);
      setWithdrawals(requests);
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل الأرباح.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const blockingWithdrawal = withdrawals.find((request) => BLOCKING_WITHDRAWAL_STATUSES.has(request.status));
  const hasBlockingWithdrawal = Boolean(blockingWithdrawal);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadEarnings();
  }, [loadEarnings]));

  const handleWithdraw = async () => {
    if (withdrawLock.current || withdrawing) return;
    if (blockingWithdrawal) {
      Alert.alert(
        blockingWithdrawal.status === 'failed' ? 'طلب يحتاج مراجعة' : 'طلب قيد المعالجة',
        blockingWithdrawal.status === 'failed'
          ? 'يوجد طلب فشل تحويله. تواصل مع الدعم أو الإدارة لمراجعته قبل إنشاء طلب جديد.'
          : 'لديك طلب سحب قائم بالفعل.',
      );
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { Alert.alert('تنبيه', 'الرجاء إدخال مبلغ صحيح'); return; }
    if (amount > balance) { Alert.alert('تنبيه', 'المبلغ المطلوب أكبر من رصيدك الحالي'); return; }
    if (amount < 50) { Alert.alert('تنبيه', 'الحد الأدنى للسحب 50 ر.ي'); return; }
    if (!user?.id) return;
    withdrawLock.current = true;
    setWithdrawing(true);
    try {
      await requestWithdrawal(amount, user.id);
      setShowWithdraw(false);
      setWithdrawAmount('');
      await loadEarnings();
      Alert.alert('تم إنشاء الطلب', `تم تسجيل طلب سحب ${amount} ر.ي للمراجعة. يمكنك متابعة حالته في هذه الصفحة، ولا يُعد المبلغ مدفوعاً حتى تظهر حالة «مدفوع».`);
    } catch (error) {
      Alert.alert('تعذّر طلب السحب', withdrawalErrorMessage(error));
    } finally {
      withdrawLock.current = false;
      setWithdrawing(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>أرباحي</Text>
      </View>

      {/* Withdrawal Modal */}
      <Modal visible={showWithdraw} transparent animationType="fade" onRequestClose={() => !withdrawing && setShowWithdraw(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>طلب سحب الأرباح</Text>
            <Text style={styles.modalSub}>رصيدك الحالي: <Text style={{ fontWeight: '800', color: '#111827' }}>{balance} ر.ي</Text></Text>
            <TextInput
              style={styles.modalInput}
              placeholder="المبلغ المراد سحبه (ر.ي)"
              placeholderTextColor="#9CA3AF"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              textAlign="right"
              editable={!withdrawing}
            />
            <TouchableOpacity
              style={[styles.modalBtn, (withdrawing || hasBlockingWithdrawal) && { opacity: 0.6 }]}
              onPress={handleWithdraw}
              disabled={withdrawing || hasBlockingWithdrawal}
              accessibilityState={{ disabled: withdrawing || hasBlockingWithdrawal }}
              activeOpacity={0.8}
            >
              {withdrawing
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.modalBtnText}>إرسال طلب السحب</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancel, withdrawing && { opacity: 0.5 }]}
              onPress={() => { setShowWithdraw(false); setWithdrawAmount(''); }}
              disabled={withdrawing}
            >
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {loadError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity onPress={() => void loadEarnings()} accessibilityRole="button" accessibilityLabel="إعادة تحميل الأرباح">
                  <Text style={styles.retryText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>رصيد المحفظة</Text>
              <Text style={styles.summaryValue}>{balance} ر.ي</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemValue}>{history.length}</Text>
                  <Text style={styles.summaryItemLabel}>توصيلات مسجّلة</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemValue}>{totalDeliveries}</Text>
                  <Text style={styles.summaryItemLabel}>إجمالي التوصيلات</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.withdrawBtn, (balance < 50 || hasBlockingWithdrawal || withdrawing) && { opacity: 0.5 }]}
                onPress={() => setShowWithdraw(true)}
                activeOpacity={0.8}
                disabled={balance < 50 || hasBlockingWithdrawal || withdrawing}
                accessibilityRole="button"
                accessibilityLabel="طلب سحب الأرباح"
                accessibilityState={{ disabled: balance < 50 || hasBlockingWithdrawal || withdrawing }}
              >
                <Ionicons name="arrow-up-circle-outline" size={18} color="#111827" />
                <Text style={styles.withdrawBtnText}>طلب سحب الأرباح</Text>
              </TouchableOpacity>
            </View>

            {withdrawals.length ? (
              <View style={styles.withdrawalSection}>
                <Text style={styles.sectionTitle}>طلبات السحب</Text>
                {withdrawals.slice(0, 5).map((request) => {
                  const statusInfo = WITHDRAWAL_STATUS_INFO[request.status];
                  return (
                    <View key={request.id} style={styles.withdrawalRow}>
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

            <Text style={styles.sectionTitle}>سجل التوصيلات</Text>
          </>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>لا توجد أرباح مسجّلة بعد</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark-done" size={20} color="#059669" />
            </View>
            <View style={styles.info}>
              <Text style={styles.route}>توصيلة مكتملة</Text>
              <Text style={styles.meta}>{new Date(item.created_at).toLocaleDateString('ar-SA')}</Text>
            </View>
            <Text style={styles.fee}>+{item.total_earning} ر.ي</Text>
          </View>
        )}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  listContent: { padding: 20, gap: 12, paddingBottom: 100 },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },
  withdrawalSection: { gap: 8, marginBottom: 6 },
  withdrawalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  withdrawalAmount: { color: '#111827', fontSize: 13.5, fontWeight: '800' },
  withdrawalDate: { color: '#9CA3AF', fontSize: 10.5, marginTop: 3 },
  withdrawalStatus: { maxWidth: '52%', fontSize: 11, fontWeight: '700', textAlign: 'right', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  summaryCard: {
    backgroundColor: COLORS.primary, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 8,
  },
  summaryLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  summaryValue: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginTop: 6, marginBottom: 20 },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14, padding: 14, width: '100%', justifyContent: 'space-around',
  },
  summaryItem: { alignItems: 'center' },
  summaryItemValue: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  summaryItemLabel: { fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 12, marginBottom: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginHorizontal: 12 },
  route: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  fee: { fontSize: 14, fontWeight: '800', color: '#059669' },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 12, marginTop: 16,
  },
  withdrawBtnText: { fontSize: 14, fontWeight: '800', color: '#111827' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'right', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#6B7280', textAlign: 'right', marginBottom: 20, fontWeight: '600' },
  modalInput: {
    backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#111827',
    fontWeight: '700', marginBottom: 16,
  },
  modalBtn: { backgroundColor: '#111827', borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  modalBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modalCancel: { alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { fontSize: 14, color: '#9CA3AF', fontWeight: '700' },
});
