import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getWalletTransactions, getMerchantWalletBalance, WalletTransaction } from '@marketplace/shared-hooks';

export default function MerchantWalletScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    Promise.all([getMerchantWalletBalance(user.id), getWalletTransactions(user.id)])
      .then(([b, tx]) => { setBalance(b); setTransactions(tx); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]));

  const isIncome = (t: WalletTransaction) => t.type === 'credit';

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
              <TouchableOpacity style={styles.withdrawBtn} activeOpacity={0.8}>
                <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.primary} />
                <Text style={styles.withdrawBtnText}>طلب سحب</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionTitle}>سجل المعاملات</Text>
          </>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>لا توجد معاملات بعد</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContent: { padding: 20, gap: 10, paddingBottom: 100 },
  balanceCard: { backgroundColor: COLORS.primary, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 10 },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  balanceValue: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', marginTop: 6 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  pendingText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF',
    paddingHorizontal: 24, paddingVertical: 11, borderRadius: 12, marginTop: 18,
  },
  withdrawBtnText: { fontSize: 13.5, fontWeight: '800', color: COLORS.primary },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 12, marginBottom: 4 },
  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  txDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  txAmount: { fontSize: 13.5, fontWeight: '800' },
});
