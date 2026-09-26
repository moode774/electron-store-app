import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../../theme/customerTheme';
import { Category, getCategories, getStores, StoreSummary, supabase } from '@marketplace/shared-hooks';
import { useFocusEffect } from '@react-navigation/native';
import { CustomerSearchField } from '../../../components/customer/CustomerSearchField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ألوان محايدة لشعارات المتاجر التي لا صورة لها (عرض فقط — ليست بيانات)
const STORE_LOGO_COLORS = ['#EDF2FC', '#EAF1FA', '#E8EFF9', '#F1F4FA', '#E8F0F7', '#EFF2F9'];

function categoryIcon(name: string): keyof typeof Ionicons.glyphMap {
  const label = name.toLowerCase();
  if (label.includes('إلكتر') || label.includes('elect')) return 'hardware-chip-outline';
  if (label.includes('أزياء') || label.includes('ملابس') || label.includes('fashion') || label.includes('cloth')) return 'shirt-outline';
  if (label.includes('جمال') || label.includes('beauty') || label.includes('عطر')) return 'sparkles-outline';
  if (label.includes('منزل') || label.includes('home')) return 'home-outline';
  if (label.includes('رياض') || label.includes('sport')) return 'barbell-outline';
  return 'grid-outline';
}

export default function StoresListScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const categoryId = typeof route?.params?.categoryId === 'string' ? route.params.categoryId : '';

  const [search, setSearch] = useState('');
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(categoryId);

  const loadStores = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await getStores(search || undefined);
      if (activeCategory) {
        const { data: products, error } = await supabase
          .from('products')
          .select('merchant_id')
          .eq('category_id', activeCategory)
          .eq('is_active', true);
        if (error) throw error;
        const merchantIds = new Set((products ?? []).map((product: any) => product.merchant_id));
        setStores(data.filter((store) => merchantIds.has(store.id)));
      } else {
        setStores(data);
      }
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory, search]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadStores(), 300);
    return () => clearTimeout(timer);
  }, [loadStores]);

  useFocusEffect(
    useCallback(() => {
      loadStores(true);
    }, [loadStores])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadStores(true);
  };

  // بيانات حقيقية فقط: التقييم وعدد المراجعات كما في القاعدة، ولا متاجر وهمية عند الفراغ
  const displayStoresList = stores.map((s, idx) => ({
    id: s.id,
    store_name: s.store_name,
    store_category: s.store_category || 'متجر عام',
    city: s.city ?? '',
    rating: Number(s.rating ?? 0),
    reviews_count: Number(s.total_reviews ?? 0),
    logo_url: s.store_logo_url,
    logo_bg: STORE_LOGO_COLORS[idx % STORE_LOGO_COLORS.length],
    logo_text: s.store_name?.slice(0, 2) || 'متجر',
    logo_text_color: COLORS.primary,
    is_verified: s.is_approved === true,
  }));

  const filteredStores = displayStoresList;

  const renderStoreRow = (item: any) => {
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('StoreDetails', { storeId: item.id })}
        style={styles.storeRowCard}
      >
        {/* Right Side: Round Logo Avatar */}
        <View style={styles.storeRowLogoWrap}>
          {item.logo_url ? (
            <Image source={{ uri: item.logo_url }} style={styles.storeRowLogo} />
          ) : item.logo_bg ? (
            <View style={[styles.storeRowLogoFallback, { backgroundColor: item.logo_bg }]}>
              <Text
                style={[
                  styles.storeRowLogoFallbackText,
                  item.logo_text_color && { color: item.logo_text_color },
                ]}
                numberOfLines={2}
              >
                {item.logo_text}
              </Text>
            </View>
          ) : (
            <Ionicons name="storefront-outline" size={26} color={COLORS.primary} />
          )}
          {item.is_verified ? (
            <View style={styles.storeRowVerifiedBadge}>
              <Ionicons name="checkmark" size={10} color={COLORS.surface} />
            </View>
          ) : null}
        </View>

        {/* Center-Right: Title, Categories, Free Delivery Pill */}
        <View style={styles.storeRowMainInfo}>
          <Text style={styles.storeRowName} numberOfLines={1}>
            {item.store_name}
          </Text>
          <Text style={styles.storeRowCategory} numberOfLines={1}>
            {item.store_category}
          </Text>

          {item.city ? (
            <View style={styles.freeDeliveryPill}>
              <Ionicons name="location-outline" size={11} color="#059669" />
              <Text style={styles.freeDeliveryText}>{item.city}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.ratingPill}>
          <Ionicons name="star" size={13} color="#D99522" />
          <Text style={styles.ratingValue}>{item.rating > 0 ? item.rating.toFixed(1) : '—'}</Text>
        </View>

      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Clean Minimalist Header Matching HomeScreen */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <CustomerSearchField
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          placeholder="ابحث عن متجر"
          returnKeyType="search"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChipsScroll}
        >
          <TouchableOpacity
            style={[styles.chipPill, !activeCategory && styles.chipPillActive]}
            onPress={() => setActiveCategory('')}
            activeOpacity={0.82}
          >
            <View style={[styles.chipIconWrap, !activeCategory && styles.chipIconWrapActive]}>
              <Ionicons name="grid-outline" size={14} color={!activeCategory ? COLORS.primary : COLORS.textMuted} />
            </View>
            <Text style={[styles.chipText, !activeCategory && styles.chipTextActive]}>الكل</Text>
          </TouchableOpacity>
          {categories.map((category) => {
            const label = category.name_ar ?? category.name;
            const isActive = activeCategory === category.id;
            return (
              <TouchableOpacity
                key={category.id}
                style={[styles.chipPill, isActive && styles.chipPillActive]}
                onPress={() => setActiveCategory(category.id)}
                activeOpacity={0.82}
              >
                <View style={[styles.chipIconWrap, isActive && styles.chipIconWrapActive]}>
                  <Ionicons
                    name={categoryIcon(label)}
                    size={14}
                    color={isActive ? COLORS.primary : COLORS.textMuted}
                  />
                </View>
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="storefront-outline" size={24} color={COLORS.surface} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>متاجر تختار منها بثقة</Text>
            <Text style={styles.introText}>استكشف المتاجر والمنتجات المتاحة الآن.</Text>
          </View>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleGroup}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>المتاجر</Text>
              <Ionicons name="sparkles" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
            </View>
            <Text style={styles.sectionSubTitleText}>المتاجر النشطة المتاحة حالياً</Text>
          </View>

          <TouchableOpacity onPress={() => setActiveCategory('')} activeOpacity={0.75}>
            <Text style={styles.viewAllText}>عرض الكل ›</Text>
          </TouchableOpacity>
        </View>

        {/* Stores List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.storesListContainer}>
            {filteredStores.length === 0 ? (
              <View style={styles.emptyStoresState}>
                <Ionicons name="storefront-outline" size={44} color="#CBD5E1" />
                <Text style={styles.emptyStoresTitle}>لا توجد متاجر متاحة حالياً</Text>
                <Text style={styles.emptyStoresSub}>
                  لا توجد نتائج مطابقة الآن. جرّب تغيير البحث أو التصنيف.
                </Text>
              </View>
            ) : (
              filteredStores.map((item) => renderStoreRow(item))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchRowContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchBoxRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.primarySoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    marginHorizontal: 8,
    textAlign: 'right',
  },
  darkFilterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  categoryChipsScroll: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingVertical: 2,
  },
  chipPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 7,
  },
  chipPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  chipIconWrapActive: {
    backgroundColor: COLORS.surface,
  },
  chipText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: '#334155',
  },
  chipTextActive: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  introCard: {
    minHeight: 106,
    padding: 18,
    marginBottom: 25,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    backgroundColor: COLORS.primaryDark,
  },
  introIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: COLORS.primaryLight,
  },
  introCopy: {
    flex: 1,
    alignItems: 'flex-end',
  },
  introTitle: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 17,
    textAlign: 'right',
  },
  introText: {
    marginTop: 4,
    color: '#D8E3F7',
    fontFamily: FONTS.regular,
    fontSize: 11,
    textAlign: 'right',
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleGroup: {
    alignItems: 'flex-end',
  },
  sectionTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  sectionTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  sectionSubTitleText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  viewAllText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  emptyStoresState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyStoresTitle: {
    fontSize: 16,
    color: '#334155',
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  emptyStoresSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  storesListContainer: {
    gap: 12,
  },
  storeRowCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.textPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  storeRowLogoWrap: {
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    position: 'relative',
  },
  storeRowLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    resizeMode: 'cover',
  },
  storeRowLogoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  storeRowLogoFallbackText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    textAlign: 'center',
  },
  storeRowVerifiedBadge: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  storeRowMainInfo: {
    flex: 1,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  storeRowName: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  storeRowCategory: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'right',
  },
  ratingPill: {
    minWidth: 51,
    height: 28,
    paddingHorizontal: 7,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 10,
    backgroundColor: '#FFF7E8',
  },
  ratingValue: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 11,
  },
  freeDeliveryPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
    gap: 4,
  },
  freeDeliveryText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: '#059669',
  },
  storeRowStatsCol: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
  },
  statSubCol: {
    alignItems: 'center',
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statValText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  statLabelText: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  storeRowHeartBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingWrap: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
