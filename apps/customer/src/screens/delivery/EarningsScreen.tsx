import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, Platform, ActivityIndicator, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getDeliveryEarnings, requestWithdrawal, DeliveryEarning } from '@marketplace/shared-hooks';

export default function EarningsScreen() {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [history, setHistory] = useState<DeliveryEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    getDeliveryEarnings(user.id)
      .then((r) => { setBalance(r.balance); setTotalDeliveries(r.totalDeliveries); setHistory(r.earnings); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]));

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { Alert.alert('تنبيه', 'الرجاء إدخال مبلغ صحيح'); return; }
    if (amount > balance) { Alert.alert('تنبيه', 'المبلغ المطلوب أكبر من رصيدك الحالي'); return; }
    if (!user?.id) return;
    setWithdrawing(true);
    try {
      await requestWithdrawal(amount, user.id);
      setShowWithdraw(false);
      setWithdrawAmount('');
      Alert.alert('تم الطلب ✅', `تم إرسال طلب سحب ${amount} ر.س وسيتم معالجته خلال 1-3 أيام عمل.`);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال طلب السحب');
    } finally {
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
      <Modal visible={showWithdraw} transparent animationType="fade" onRequestClose={() => setShowWithdraw(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>طلب سحب الأرباح</Text>
            <Text style={styles.modalSub}>رصيدك الحالي: <Text style={{ fontWeight: '800', color: '#111827' }}>{balance} ر.س</Text></Text>
            <TextInput
              style={styles.modalInput}
              placeholder="المبلغ المراد سحبه (ر.س)"
              placeholderTextColor="#9CA3AF"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              textAlign="right"
            />
            <TouchableOpacity
              style={[styles.modalBtn, withdrawing && { opacity: 0.6 }]}
              onPress={handleWithdraw}
              disabled={withdrawing}
              activeOpacity={0.8}
            >
              {withdrawing
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.modalBtnText}>إرسال طلب السحب</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowWithdraw(false); setWithdrawAmount(''); }}>
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
            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>رصيد المحفظة</Text>
              <Text style={styles.summaryValue}>{balance} ر.س</Text>
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
                style={styles.withdrawBtn}
                onPress={() => setShowWithdraw(true)}
                activeOpacity={0.8}
                disabled={balance <= 0}
              >
                <Ionicons name="arrow-up-circle-outline" size={18} color="#111827" />
                <Text style={styles.withdrawBtnText}>طلب سحب الأرباح</Text>
              </TouchableOpacity>
            </View>

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
            <Text style={styles.fee}>+{item.total_earning} ر.س</Text>
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
