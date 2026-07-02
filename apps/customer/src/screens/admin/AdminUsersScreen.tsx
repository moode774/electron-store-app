import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { adminListUsers, adminSetUserActive, useSettingsStore, type AdminUser } from '@marketplace/shared-hooks';

const ROLE_LABEL: Record<string, string> = {
  customer: 'عميل', merchant: 'تاجر', delivery: 'مندوب', admin: 'أدمن',
};

export default function AdminUsersScreen(): React.JSX.Element {
  const colors = useSettingsStore((s) => s.colors);
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback((q?: string) => {
    setLoading(true);
    adminListUsers(q)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleActive = async (u: AdminUser) => {
    try {
      await adminSetUserActive(u.id, !u.is_active);
      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: !x.is_active } : x)));
    } catch {
      Alert.alert('خطأ', 'تعذّر تحديث حالة المستخدم');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>إدارة المستخدمين</Text>
        <TextInput
          style={[styles.search, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="بحث بالاسم أو الرقم"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load(search)}
          returnKeyType="search"
          textAlign="right"
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>لا يوجد مستخدمون</Text>}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{item.full_name || 'بدون اسم'}</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {item.phone ?? '—'} · {ROLE_LABEL[item.role] ?? item.role}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.badge, { backgroundColor: item.is_active ? `${colors.success}22` : `${colors.error}22` }]}
                onPress={() => toggleActive(item)}
              >
                <Text style={{ color: item.is_active ? colors.success : colors.error, fontWeight: '700', fontSize: 12 }}>
                  {item.is_active ? 'نشط' : 'موقوف'}
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
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  search: { height: 44, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4 },
  badge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
});
