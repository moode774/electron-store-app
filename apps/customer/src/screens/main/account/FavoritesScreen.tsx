import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getWishlist, removeFromWishlist, WishlistItem } from '@marketplace/shared-hooks';

export default function FavoritesScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [favorites, setFavorites] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try { setFavorites(await getWishlist(user.id)); } catch { setFavorites([]); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const removeFavorite = async (productId: string) => {
    if (!user?.id) return;
    setFavorites((prev) => prev.filter((f) => f.product_id !== productId));
    await removeFromWishlist(user.id, productId).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المفضلة</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="heart-outline" size={48} color="#9CA3AF" />
          </View>
          <Text style={styles.emptyTitle}>لا توجد منتجات مفضلة</Text>
          <Text style={styles.emptySub}>اضغط على أيقونة القلب في أي منتج لإضافته هنا</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Home', { screen: 'ProductDetails', params: { productId: item.product_id } })}
            >
              <View style={styles.imageWrap}>
                {item.products?.og_image_url ? (
                  <Image source={{ uri: item.products.og_image_url }} style={styles.thumbImg} resizeMode="cover" />
                ) : (
                  <Ionicons name="cube-outline" size={32} color="#9CA3AF" />
                )}
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={2}>{item.products?.name ?? 'منتج'}</Text>
                <Text style={styles.store}>{item.products?.merchant_profiles?.store_name ?? ''}</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>{item.products?.sale_price ?? item.products?.base_price ?? 0} ر.س</Text>
                  {item.products?.sale_price && <Text style={styles.oldPrice}>{item.products.base_price}</Text>}
                </View>
              </View>
              <TouchableOpacity
                style={styles.heartBtn}
                onPress={() => removeFavorite(item.product_id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="heart" size={22} color="#EF4444" />
              </TouchableOpacity>
            </TouchableOpacity>
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
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContent: { padding: 20, gap: 12 },
  card: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12,
    borderWidth: 1.5, borderColor: '#F3F4F6', alignItems: 'center',
  },
  imageWrap: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  info: { flex: 1, marginHorizontal: 12 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20 },
  store: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  price: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  oldPrice: { fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through' },
  heartBtn: { padding: 6 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
});
