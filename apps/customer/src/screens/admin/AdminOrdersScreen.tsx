import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { adminListOrders, useSettingsStore, type AdminOrder } from '@marketplace/shared-hooks';

const STATUSES = [
  { key: '', label: 'الكل' },
  { key: 'pending', label: 'جديد' },
  { key: 'preparing', label: 'تجهيز' },
  { key: 'ready', label: 'جاهز' },
  { key: 'on_the_way', label: 'بالطريق' },
  { key: 'delivered', label: 'مسلّم' },
  { key: 'cancelled', label: 'ملغي' },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'جديد', confirmed: 'مؤكّد', preparing: 'تجهيز', ready: 'جاهز',
  assigned: 'مُسند', picked_up: 'استلام', on_the_way: 'بالطريق',
  delivered: 'مسلّم', cancelled: 'ملغي', returned: 'مُرجع',
};

export default function AdminOrdersScreen(): React.JSX.Element {
  const colors = useSettingsStore((s) => s.colors);
  const [items, setItems] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminListOrders(status || undefined)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [status]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>إدارة الطلبات</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          {STATUSES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chip, { backgroundColor: status === s.key ? colors.primary : colors.background, borderColor: colors.border }]}
              onPress={() => setStatus(s.key)}
            >
              <Text style={{ color: status === s.key ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>لا توجد طلبات</Text>}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{item.order_number}</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {item.merchant_profiles?.store_name ?? '—'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.amount, { color: colors.textPrimary }]}>{item.total_amount ?? 0} ر.س</Text>
                <Text style={[styles.status, { color: colors.info }]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, marginEnd: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4 },
  amount: { fontSize: 14, fontWeight: '800' },
  status: { fontSize: 12, fontWeight: '700', marginTop: 4 },
});
