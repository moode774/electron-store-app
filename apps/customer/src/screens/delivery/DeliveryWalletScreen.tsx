import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getDeliveryEarnings, getWalletTransactions, WalletTransaction } from '@marketplace/shared-hooks';

import CodRemittancePanel from './CodRemittancePanel';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

export default function DeliveryWalletScreen({ navigation }: any) {
  const layout = useResponsiveLayout(960);
  const user = useAuthStore((s) => s.user);
  const [earnings, setEarnings] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadWallet = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try {
      const [earningsResult, transactionResult] = await Promise.all([
        getDeliveryEarnings(user.id),
        getWalletTransactions(user.id),
      ]);
      setEarnings(earningsResult.balance);
      setTransactions(transactionResult);
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل المحفظة.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadWallet();
  }, [loadWallet]));

  const isIncome = (tx: WalletTransaction) => tx.type === 'credit';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('العودة')}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('المحفظة والتحصيلات')}</Text>
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
        contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter }]}
        ListHeaderComponent={
          <>
            {loadError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{tv(loadError)}</Text>
                <TouchableOpacity onPress={() => void loadWallet()} accessibilityRole="button" accessibilityLabel={t('إعادة تحميل المحفظة')}>
                  <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={[styles.cardsRow, layout.compact && styles.cardsRowCompact]}>
              <View style={[styles.summaryCard, { backgroundColor: COLORS.primary }]}>
                <Ionicons name="wallet-outline" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={styles.summaryValue}>{tv(earnings.toLocaleString())}</Text>
                <Text style={styles.summaryLabel}>{t('مستحقاتك (ر.ي)')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: '#B45309' }]}>
                <Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={styles.summaryValue}>{tv(transactions.length)}</Text>
                <Text style={styles.summaryLabel}>{t('عدد المعاملات')}</Text>
              </View>
            </View>

            <CodRemittancePanel />

            <Text style={styles.sectionTitle}>{t('سجل المعاملات')}</Text>
          </>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>{t('لا توجد معاملات بعد')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const income = isIncome(item);
          const absoluteAmount = Math.abs(item.amount ?? 0);
          return (
          <View style={styles.txCard}>
            <View style={[styles.txIcon, { backgroundColor: income ? '#DCFCE7' : '#FEF3C7' }]}>
              <Ionicons name={income ? 'arrow-down' : 'cash-outline'} size={18} color={income ? '#059669' : '#B45309'} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.txTitle}>{tv(item.notes ?? item.source ?? item.type)}</Text>
              <Text style={styles.txDate}>{tv(new Date(item.created_at).toLocaleDateString(getLocale()))}</Text>
            </View>
            <Text style={[styles.txAmount, { color: income ? '#059669' : '#B45309' }]}>
              {tv(income ? '+' : '-')}{tv(absoluteAmount.toLocaleString())}
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
    width: '100%', maxWidth: 960, alignSelf: 'center',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContent: { padding: 20, gap: 10, paddingBottom: 100, width: '100%', maxWidth: 960, alignSelf: 'center' },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8, marginBottom: 4 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },
  cardsRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  cardsRowCompact: { flexDirection: 'column' },
  summaryCard: { flex: 1, borderRadius: 18, padding: 18, gap: 6 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  summaryLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  noteBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12,
    padding: 12, marginTop: 8,
  },
  noteText: { flex: 1, fontSize: 12, color: '#B45309', lineHeight: 18, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 14, marginBottom: 4 },
  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
    minWidth: 0,
  },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  txDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  txAmount: { fontSize: 13.5, fontWeight: '800', flexShrink: 1 },
});
