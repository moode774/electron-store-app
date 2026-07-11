import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  Platform, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import {
  useAuthStore, getWalletTransactions, getMerchantWalletBalance,
  requestWithdrawal, WalletTransaction,
} from '@marketplace/shared-hooks';

export default function MerchantWalletScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    Promise.all([getMerchantWalletBalance(user.id), getWalletTransactions(user.id)])
      .then(([b, tx]) => { setBalance(b); setTransactions(tx); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  useFocusEffect(loadData);

  const isIncome = (t: WalletTransaction) => (t.amount ?? 0) >= 0;

  const openWithdraw = () => {
    setWithdrawAmount('');
    setWithdrawNotes('');
    setShowWithdrawModal(true);
  };

  const handleWithdraw = async () => {
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
    setSubmitting(true);
    try {
      await requestWithdrawal(amount, user.id, withdrawNotes.trim() || undefined);
      setShowWithdrawModal(false);
      Alert.alert(
        'تم إرسال طلب السحب ✅',
        `سيتم تحويل ${amount.toLocaleString()} ر.ي إلى حسابك البنكي خلال 3-5 أيام عمل.`,
        [{ text: 'حسناً' }]
      );
      loadData();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال طلب السحب، يرجى المحاولة لاحقاً');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المحفظة والمدفوعات</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {/* Balance Card */}
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>الرصيد المتاح</Text>
                <Text style={styles.balanceValue}>{balance.toLocaleString()} ر.ي</Text>
                <Text style={styles.balanceNote}>يشمل الأرباح المؤكدة من الطلبات المكتملة</Text>
                <TouchableOpacity
                  style={[styles.withdrawBtn, balance < 50 && { opacity: 0.5 }]}
                  activeOpacity={0.8}
                  onPress={openWithdraw}
                  disabled={balance < 50}
                >
                  <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.withdrawBtnText}>طلب سحب</Text>
                </TouchableOpacity>
                {balance < 50 && (
                  <Text style={styles.minNote}>الحد الأدنى للسحب 50 ر.ي</Text>
                )}
              </View>

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
            return (
              <View style={styles.txCard}>
                <View style={[styles.txIcon, { backgroundColor: income ? '#DCFCE7' : '#FEE2E2' }]}>
                  <Ionicons name={income ? 'arrow-down' : 'arrow-up'} size={18} color={income ? '#059669' : '#EF4444'} />
                </View>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={styles.txTitle}>{item.notes ?? item.source ?? item.type}</Text>
                  <Text style={styles.txDate}>{new Date(item.created_at).toLocaleDateString('ar-SA')}</Text>
                </View>
                <Text style={[styles.txAmount, { color: income ? '#059669' : '#EF4444' }]}>
                  {income ? '+' : ''}{(item.amount ?? 0).toLocaleString()} ر.ي
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !submitting && setShowWithdrawModal(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>طلب سحب الأرباح</Text>
              <TouchableOpacity
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
                سيتم التحويل للحساب البنكي المسجل في إعدادات المتجر خلال 3-5 أيام عمل.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleWithdraw}
              disabled={submitting}
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },

  listContent: { padding: 20, gap: 10, paddingBottom: 100 },

  balanceCard: { backgroundColor: COLORS.primary, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  balanceValue: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginTop: 6, marginBottom: 4 },
  balanceNote: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 },
  minNote: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8 },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF',
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14,
  },
  withdrawBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 4, marginBottom: 8 },

  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  txIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  txDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  txAmount: { fontSize: 14, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
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
