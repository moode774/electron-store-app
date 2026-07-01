import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getDeliveryEarnings, DeliveryEarning } from '@marketplace/shared-hooks';

export default function EarningsScreen() {
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [history, setHistory] = useState<DeliveryEarning[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    getDeliveryEarnings(user.id)
      .then((r) => { setBalance(r.balance); setTotalDeliveries(r.totalDeliveries); setHistory(r.earnings); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>أرباحي</Text>
      </View>

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
});
