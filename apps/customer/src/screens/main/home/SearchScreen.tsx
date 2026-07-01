import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, TextInput, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { searchProducts, getCategories, ProductSummary, Category } from '@marketplace/shared-hooks';

const SORTS = [
  { key: 'default', label: 'الأكثر صلة' },
  { key: 'priceAsc', label: 'السعر: الأقل أولاً' },
  { key: 'priceDesc', label: 'السعر: الأعلى أولاً' },
  { key: 'rating', label: 'الأعلى تقييماً' },
];

export default function SearchScreen({ navigation, route }: any) {
  const [query, setQuery] = useState<string>(route?.params?.initialQuery ?? '');
  // null = الكل ؛ وإلا معرّف التصنيف
  const [categoryId, setCategoryId] = useState<string | null>(route?.params?.initialCategoryId ?? null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sort, setSort] = useState('default');
  const [showSort, setShowSort] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ProductSummary[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await searchProducts(query.trim() || undefined, categoryId ?? undefined);
        let list = [...data];
        if (sort === 'priceAsc') list.sort((a, b) => (a.sale_price ?? a.base_price) - (b.sale_price ?? b.base_price));
        if (sort === 'priceDesc') list.sort((a, b) => (b.sale_price ?? b.base_price) - (a.sale_price ?? a.base_price));
        if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
        setResults(list);
      } catch { setResults([]); }
      finally { setIsSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [query, categoryId, sort]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      {/* Header: back + search input */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="ابحث عن أي شيء..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters Row */}
      <View style={styles.filtersRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: '__all__', name: 'الكل', name_ar: 'الكل' } as Category, ...categories]}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          renderItem={({ item }) => {
            const isAll = item.id === '__all__';
            const isActive = isAll ? categoryId === null : categoryId === item.id;
            return (
              <TouchableOpacity
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setCategoryId(isAll ? null : item.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{item.name_ar ?? item.name}</Text>
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(!showSort)} activeOpacity={0.7}>
          <Ionicons name="swap-vertical" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Sort Dropdown */}
      {showSort && (
        <View style={styles.sortMenu}>
          {SORTS.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={styles.sortItem}
              onPress={() => { setSort(s.key); setShowSort(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortItemText, sort === s.key && { color: COLORS.primary, fontWeight: '800' }]}>
                {s.label}
              </Text>
              {sort === s.key && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Results */}
      {isSearching ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="search-outline" size={42} color="#9CA3AF" />
          </View>
          <Text style={styles.emptyTitle}>لا توجد نتائج</Text>
          <Text style={styles.emptySub}>جرّب كلمات مختلفة أو غيّر التصنيف</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<Text style={styles.resultsCount}>{results.length} نتيجة</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
            >
              <View style={styles.imageWrap}>
                {item.og_image_url ? (
                  <Image source={{ uri: item.og_image_url }} style={styles.thumbImg} resizeMode="cover" />
                ) : (
                  <Ionicons name="cube-outline" size={30} color="#9CA3AF" />
                )}
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="star" size={12} color="#FBBF24" />
                  <Text style={styles.ratingText}>{item.rating}</Text>
                  <Text style={styles.categoryText}>· {item.merchant_profiles?.store_name ?? ''}</Text>
                </View>
                <Text style={styles.price}>{item.sale_price ?? item.base_price} ر.س</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color="#D1D5DB" />
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
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, height: 46,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', textAlign: 'right', paddingVertical: 0 },
  filtersRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#FFFFFF' },
  sortBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center', marginLeft: 16, marginRight: 4 },
  sortMenu: {
    marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 4,
    borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  sortItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  sortItemText: { fontSize: 13.5, color: '#4B5563', fontWeight: '600' },
  listContent: { padding: 20, gap: 12, paddingBottom: 100 },
  resultsCount: { fontSize: 12.5, color: '#9CA3AF', fontWeight: '600', marginBottom: 4 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  imageWrap: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  info: { flex: 1, marginHorizontal: 12 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingText: { fontSize: 11.5, fontWeight: '700', color: '#4B5563' },
  categoryText: { fontSize: 11, color: '#9CA3AF' },
  price: { fontSize: 15, fontWeight: '800', color: COLORS.primary, marginTop: 6 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIconCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280' },
});
