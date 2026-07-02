import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAdminStats, useSettingsStore, type AdminStats } from '@marketplace/shared-hooks';

export default function AdminDashboardScreen(): React.JSX.Element {
  const colors = useSettingsStore((s) => s.colors);
  const t = useSettingsStore((s) => s.t);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    getAdminStats()
      .then((s) => setStats(s))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cards: { key: keyof AdminStats; label: string; icon: string; color: string }[] = [
    { key: 'users', label: 'المستخدمون', icon: 'people', color: colors.info },
    { key: 'merchants', label: 'المتاجر', icon: 'storefront', color: colors.primary },
    { key: 'pending_merchants', label: 'متاجر بانتظار الاعتماد', icon: 'hourglass', color: colors.warning },
    { key: 'delivery', label: 'المندوبون', icon: 'bicycle', color: colors.success },
    { key: 'orders', label: 'إجمالي الطلبات', icon: 'receipt', color: colors.primary },
    { key: 'orders_today', label: 'طلبات اليوم', icon: 'today', color: colors.info },
    { key: 'revenue', label: 'الإيرادات (مسلّمة)', icon: 'cash', color: colors.success },
    { key: 'open_refunds', label: 'استرجاعات مفتوحة', icon: 'return-down-back', color: colors.error },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('admin.dashboard')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>تعذّر تحميل الإحصائيات</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        >
          {cards.map((c) => (
            <View key={c.key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.iconWrap, { backgroundColor: `${c.color}22` }]}>
                <Ionicons name={c.icon as any} size={22} color={c.color} />
              </View>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {stats ? String(stats[c.key]) : '—'}
              </Text>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{c.label}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  card: { width: '47%', borderRadius: 16, padding: 16, borderWidth: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  value: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '600' },
});
