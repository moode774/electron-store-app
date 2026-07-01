import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, Switch, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getMerchantProducts, updateProduct } from '@marketplace/shared-hooks';

export default function MerchantProductsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try { setProducts(await getMerchantProducts(user.id)); } catch { setProducts([]); }
    finally { setLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleActive = async (id: string, current: boolean) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: !current } : p)));
    await updateProduct(id, { is_active: !current }).catch(() => load());
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>منتجاتي</Text>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AddProduct')}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addBtnText}>إضافة منتج</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>لا توجد منتجات بعد</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, !item.is_active && styles.cardInactive]}>
              <View style={styles.imageWrap}>
                {item.og_image_url ? (
                  <Image source={{ uri: item.og_image_url }} style={styles.thumbImg} resizeMode="cover" />
                ) : (
                  <Ionicons name="cube-outline" size={28} color="#9CA3AF" />
                )}
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.price}>{item.sale_price ?? item.base_price} ر.س</Text>
                <View style={styles.stockRow}>
                  <View style={[styles.stockDot, { backgroundColor: item.is_active ? '#059669' : '#EF4444' }]} />
                  <Text style={[styles.stockText, !item.is_active && { color: '#EF4444' }]}>
                    {item.is_active ? 'معروض' : 'مخفي'}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Switch
                  value={item.is_active}
                  onValueChange={() => toggleActive(item.id, item.is_active)}
                  trackColor={{ false: '#E5E7EB', true: `${COLORS.primary}60` }}
                  thumbColor={item.is_active ? COLORS.primary : '#9CA3AF'}
                />
                <Text style={styles.activeLabel}>{item.is_active ? 'معروض' : 'مخفي'}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  listContent: { padding: 20, gap: 12, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  cardInactive: { opacity: 0.6 },
  imageWrap: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  info: { flex: 1, marginHorizontal: 12 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827' },
  price: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  stockText: { fontSize: 11.5, color: '#6B7280', fontWeight: '500' },
  actions: { alignItems: 'center', gap: 2 },
  activeLabel: { fontSize: 10.5, color: '#9CA3AF', fontWeight: '600' },
});
