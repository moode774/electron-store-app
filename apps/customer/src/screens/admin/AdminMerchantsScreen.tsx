import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { adminListMerchants, adminSetMerchantApproval, useSettingsStore, type AdminMerchant } from '@marketplace/shared-hooks';

export default function AdminMerchantsScreen(): React.JSX.Element {
  const colors = useSettingsStore((s) => s.colors);
  const [items, setItems] = useState<AdminMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminListMerchants(onlyPending)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [onlyPending]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleApproval = async (m: AdminMerchant) => {
    try {
      await adminSetMerchantApproval(m.id, !m.is_approved);
      setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_approved: !x.is_approved } : x)));
    } catch {
      Alert.alert('خطأ', 'تعذّر تحديث حالة الاعتماد');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>إدارة المتاجر</Text>
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: onlyPending ? colors.primary : colors.background, borderColor: colors.border }]}
          onPress={() => setOnlyPending((v) => !v)}
        >
          <Text style={{ color: onlyPending ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
            بانتظار الاعتماد
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>لا توجد متاجر</Text>}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{item.store_name}</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {item.city ?? '—'} · ⭐ {item.rating}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: item.is_approved ? `${colors.error}22` : colors.success }]}
                onPress={() => toggleApproval(item)}
              >
                <Ionicons
                  name={item.is_approved ? 'close-circle-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={item.is_approved ? colors.error : '#fff'}
                />
                <Text style={{ color: item.is_approved ? colors.error : '#fff', fontWeight: '700', fontSize: 12, marginStart: 4 }}>
                  {item.is_approved ? 'إلغاء' : 'اعتماد'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
});
