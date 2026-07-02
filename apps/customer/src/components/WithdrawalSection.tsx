// قسم "طلب سحب الرصيد" المشترك بين محفظة التاجر ومحفظة المندوب.
// يعرض طلب السحب القائم (إن وُجد)، أو نموذج تقديم طلب جديد، وسجل الطلبات السابقة.
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getWithdrawalRequests, createWithdrawalRequest, WithdrawalRequest } from '@marketplace/shared-hooks';

const METHODS = ['بنك الكريمي', 'جوالي', 'ون كاش', 'كاش'];

const STATUS_INFO: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'قيد المراجعة', color: '#D97706', bg: '#FEF3C7' },
  approved: { label: 'تمت الموافقة', color: '#2563EB', bg: '#DBEAFE' },
  paid: { label: 'تم التحويل', color: '#059669', bg: '#DCFCE7' },
  rejected: { label: 'مرفوض', color: '#EF4444', bg: '#FEE2E2' },
};

interface Props {
  balance: number;
  role: 'merchant' | 'delivery';
}

export default function WithdrawalSection({ balance, role }: Props) {
  const user = useAuthStore((s) => s.user);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(METHODS[0]);
  const [account, setAccount] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    if (user?.id) getWithdrawalRequests(user.id).then(setRequests).catch(() => {});
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pending = requests.find((r) => r.status === 'pending');

  const submit = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('تنبيه', 'أدخل مبلغاً صحيحاً'); return; }
    if (amt > balance) { Alert.alert('تنبيه', 'المبلغ أكبر من رصيدك المتاح'); return; }
    if (!account.trim()) { Alert.alert('تنبيه', 'أدخل رقم الحساب أو المحفظة'); return; }
    if (!user?.id) return;
    setSending(true);
    try {
      await createWithdrawalRequest({
        user_id: user.id, role, amount: amt, method, account_info: account.trim(),
      });
      setOpen(false); setAmount(''); setAccount('');
      Alert.alert('تم الإرسال ✅', 'سيُراجَع طلبك ويصلك التحويل قريباً');
      load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.code === '23505'
        ? 'لديك طلب سحب قيد المراجعة بالفعل'
        : (e?.message ?? 'تعذّر إرسال الطلب'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* طلب قائم قيد المراجعة */}
      {pending ? (
        <View style={styles.pendingCard}>
          <View style={styles.pendingIcon}>
            <Ionicons name="hourglass-outline" size={20} color="#D97706" />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.pendingTitle}>طلب سحب {pending.amount.toLocaleString()} ر.ي قيد المراجعة</Text>
            <Text style={styles.pendingSub}>{pending.method} · {new Date(pending.created_at).toLocaleDateString('ar-SA')}</Text>
          </View>
        </View>
      ) : !open ? (
        <TouchableOpacity style={styles.withdrawBtn} onPress={() => setOpen(true)} activeOpacity={0.8}>
          <Ionicons name="arrow-down-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.withdrawBtnText}>طلب سحب الرصيد</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>طلب سحب — الرصيد المتاح: {balance.toLocaleString()} ر.ي</Text>

          <Text style={styles.label}>المبلغ (ر.ي)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <Text style={styles.label}>طريقة الاستلام</Text>
          <View style={styles.methodsRow}>
            {METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.methodChip, method === m && styles.methodChipActive]}
                onPress={() => setMethod(m)}
                activeOpacity={0.7}
              >
                <Text style={[styles.methodText, method === m && styles.methodTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>رقم الحساب / المحفظة</Text>
          <TextInput
            style={styles.input}
            placeholder="أدخل رقم حسابك لاستلام المبلغ"
            placeholderTextColor="#9CA3AF"
            value={account}
            onChangeText={setAccount}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>تراجع</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, sending && { opacity: 0.6 }]}
              onPress={submit}
              disabled={sending}
              activeOpacity={0.8}
            >
              {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitBtnText}>إرسال الطلب</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* سجل طلبات السحب السابقة */}
      {requests.filter((r) => r.status !== 'pending').length > 0 && (
        <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>طلبات السحب السابقة</Text>
          {requests.filter((r) => r.status !== 'pending').slice(0, 5).map((r) => {
            const info = STATUS_INFO[r.status] ?? STATUS_INFO.pending;
            return (
              <View key={r.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyAmount}>{r.amount.toLocaleString()} ر.ي</Text>
                  <Text style={styles.historyMeta}>
                    {r.method} · {new Date(r.created_at).toLocaleDateString('ar-SA')}
                    {r.admin_note ? ` · ${r.admin_note}` : ''}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: info.bg }]}>
                  <Text style={[styles.statusText, { color: info.color }]}>{info.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, height: 48, borderRadius: 14,
  },
  withdrawBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pendingCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#FDE68A',
  },
  pendingIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  pendingTitle: { fontSize: 13.5, fontWeight: '800', color: '#92400E' },
  pendingSub: { fontSize: 11.5, color: '#B45309', marginTop: 3, fontWeight: '600' },
  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  formTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 14 },
  label: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, height: 46, fontSize: 14, color: '#111827', marginBottom: 14,
  },
  methodsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  methodChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  methodChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  methodText: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },
  methodTextActive: { color: '#FFFFFF' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    paddingHorizontal: 20, height: 46, borderRadius: 12, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  submitBtn: {
    flex: 1, height: 46, borderRadius: 12, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
  historyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  historyTitle: { fontSize: 13.5, fontWeight: '800', color: '#111827', marginBottom: 10 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F9FAFB',
  },
  historyAmount: { fontSize: 13.5, fontWeight: '800', color: '#111827' },
  historyMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
});
