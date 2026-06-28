import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { getStores, StoreSummary } from '@marketplace/shared-hooks';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../../navigation/types';

type StoresListScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'StoresList'>;
interface Props { navigation: StoresListScreenNavigationProp; }

export default function StoresListScreen({ navigation }: Props) {
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStores(search || undefined);
      setStores(data);
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(loadStores, 300);
    return () => clearTimeout(timer);
  }, [loadStores]);

  const categories = Array.from(new Set(stores.map((s) => s.store_category).filter(Boolean))) as string[];

  const filteredStores = activeCategory
    ? stores.filter((s) => s.store_category === activeCategory)
    : stores;

  const renderStore = ({ item }: { item: StoreSummary }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => navigation.navigate('StoreDetails', { storeId: item.id })}
      style={styles.storeCard}
    >
      <View style={styles.storeIconWrap}>
        <Ionicons name="storefront-outline" size={28} color={COLORS.primary} />
      </View>
      <View style={styles.storeInfo}>
        <Text style={styles.storeName}>{item.store_name}</Text>
        <Text style={styles.storeCategory}>{item.store_category || 'متجر'}</Text>
        <View style={styles.badgesRow}>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color="#B45309" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
          <View style={styles.freeDeliveryBadge}>
            <Ionicons name="bicycle-outline" size={12} color="#047857" />
            <Text style={styles.freeDeliveryText}>توصيل متاح</Text>
          </View>
        </View>
      </View>
      <View style={styles.storeRight}>
        <Text style={styles.reviewsCount}>{item.total_reviews} تقييم</Text>
        <Ionicons name="chevron-back" size={18} color="#9CA3AF" style={{ marginTop: 4 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المتاجر</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث عن متجر..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            textAlign={Platform.OS === 'web' ? 'right' : 'left'}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {categories.length > 0 && (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={categories}
            keyExtractor={(c) => c}
            contentContainerStyle={styles.categoriesList}
            renderItem={({ item }) => {
              const isActive = activeCategory === item;
              return (
                <TouchableOpacity
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => setActiveCategory(isActive ? null : item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredStores}
          keyExtractor={(item) => item.id}
          renderItem={renderStore}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>لا توجد متاجر مسجلة حتى الآن</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    height: Platform.OS === 'ios' ? 100 : 80, paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: '#FFFFFF',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  filterSection: { backgroundColor: '#FFFFFF', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14,
    paddingHorizontal: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 16, height: 50,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827', marginHorizontal: 8, height: '100%' },
  categoriesList: { paddingHorizontal: 20, gap: 8 },
  categoryChip: {
    paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
  },
  categoryChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  categoryChipText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  categoryChipTextActive: { color: '#FFFFFF' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 20, paddingBottom: 100 },
  storeCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  storeIconWrap: { width: 60, height: 60, borderRadius: 16, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  storeCategory: { fontSize: 12, color: '#6B7280', fontWeight: '500', marginBottom: 8 },
  badgesRow: { flexDirection: 'row', alignItems: 'center' },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 8,
  },
  ratingText: { fontSize: 11, fontWeight: '700', color: '#B45309', marginLeft: 4 },
  freeDeliveryBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  freeDeliveryText: { fontSize: 11, fontWeight: '700', color: '#047857', marginLeft: 4 },
  storeRight: { alignItems: 'flex-end', justifyContent: 'center' },
  reviewsCount: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600', marginTop: 16 },
});
