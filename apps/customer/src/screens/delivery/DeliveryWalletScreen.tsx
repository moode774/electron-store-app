import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, formatPrice } from '@marketplace/shared-utils';
import { useAuthStore, getDeliveryEarnings, getWalletTransactions, requestDeliveryWithdrawal, WalletTransaction } from '@marketplace/shared-hooks';

export default function DeliveryWalletScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [earnings, setEarnings] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    Promise.all([getDeliveryEarnings(user.id), getWalletTransactions(user.id)])
      .then(([e, tx]) => { setEarnings(e.balance); setTransactions(tx); })
      .catch((err: any) => {
        // عند فشل التحميل: تصفير العرض حتى لا يُتاح السحب على بيانات بائتة
        setEarnings(0); setTransactions([]);
        Alert.alert('خطأ', err?.message ?? 'تعذّر تحميل بيانات المحفظة');
      })
      .finally(() => setLoading(false));
  }, [user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleWithdraw = () => {
    if (!user?.id || requesting) return;
    if (earnings <= 0) { Alert.alert('تنبيه', 'لا توجد مستحقات قابلة للسحب'); return; }
    Alert.alert('طلب سحب', `طلب سحب مستحقاتك ${formatPrice(earnings)}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setRequesting(true);
        try {
          await requestDeliveryWithdrawal(user.id, earnings);
          Alert.alert('تم الإرسال', 'تم استلام طلب سحب أرباحك وسيُحوَّل قريباً.');
          load();
        } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر إرسال الطلب'); }
        finally { setRequesting(false); }
      } },
    ]);
  };

  // التصنيف يعتمد على نوع الحركة (credit/debit) لا على إشارة المبلغ
  const isIncome = (t: WalletTransaction) => t.type === 'credit';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المحفظة والتحصيلات</Text>
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
            <View style={styles.cardsRow}>
              <View style={[styles.summaryCard, { backgroundColor: COLORS.primary }]}>
                <Ionicons name="wallet-outline" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={styles.summaryValue}>{formatPrice(earnings, { withSymbol: false })}</Text>
                <Text style={styles.summaryLabel}>مستحقاتك (ر.ي)</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: '#B45309' }]}>
                <Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={styles.summaryValue}>{transactions.length}</Text>
                <Text style={styles.summaryLabel}>عدد المعاملات</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.withdrawBtn, requesting && { opacity: 0.6 }]} activeOpacity={0.85} onPress={handleWithdraw} disabled={requesting}>
              {requesting ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <>
                  <Ionicons name="arrow-down-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.withdrawBtnText}>طلب سحب الأرباح</Text>
                </>
              )}
            </TouchableOpacity>

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
            <View style={[styles.txIcon, { backgroundColor: income ? '#DCFCE7' : '#FEF3C7' }]}>
              <Ionicons name={income ? 'arrow-down' : 'cash-outline'} size={18} color={income ? '#059669' : '#B45309'} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.txTitle}>{item.notes ?? item.source ?? item.type}</Text>
              <Text style={styles.txDate}>{new Date(item.created_at).toLocaleDateString('ar-SA')}</Text>
            </View>
            <Text style={[styles.txAmount, { color: income ? '#059669' : '#B45309' }]}>
              {income ? '+' : ''}{formatPrice(item.amount ?? 0, { withSymbol: false })}
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
  cardsRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  summaryCard: { flex: 1, borderRadius: 18, padding: 18, gap: 6 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  summaryLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, height: 48, borderRadius: 14, marginTop: 12 },
  withdrawBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  noteBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12,
    padding: 12, marginTop: 8,
  },
  noteText: { flex: 1, fontSize: 12, color: '#B45309', lineHeight: 18, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 14, marginBottom: 4 },
  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  txDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  txAmount: { fontSize: 13.5, fontWeight: '800' },
});
