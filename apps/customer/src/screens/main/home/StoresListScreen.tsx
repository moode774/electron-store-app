import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { getStores, StoreSummary, supabase } from '@marketplace/shared-hooks';
import { useFocusEffect } from '@react-navigation/native';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { t, tv } from '@marketplace/shared-i18n';

// ألوان محايدة لشعارات المتاجر التي لا صورة لها (عرض فقط — ليست بيانات)
const STORE_LOGO_COLORS = ['#EEF2FF', '#ECFDF5', '#FEF3C7', '#FCE7F3', '#E0F2FE', '#F1F5F9'];

const CATEGORY_CHIPS = [
  { id: 'all', name: 'الكل', icon: 'grid' },
  { id: 'fashion', name: 'أزياء وموضة', icon: 'shirt-outline' },
  { id: 'electronics', name: 'إلكترونيات', icon: 'hardware-chip-outline' },
  { id: 'beauty', name: 'الجمال والعناية', icon: 'sparkles-outline' },
  { id: 'home', name: 'المنزل والمطبخ', icon: 'home-outline' },
  { id: 'sports', name: 'رياضة', icon: 'barbell-outline' },
];

const STORE_CAROUSEL_CARDS = [
  {
    id: 's1',
    title: 'تسوق من أفضل المتاجر',
    sub: 'آلاف المنتجات، عروض حصرية وتوصيل سريع وأمان كامل',
    btnText: 'تسوق الآن',
    img: require('../../../../assets/images/bannerstoor/delfre.png'),
  },
  {
    id: 's2',
    title: 'متاجر موثوقة 100% 🏬',
    sub: 'أفضل الماركات العالمية والمحلية في مكان واحد مع ضمان الجودة',
    btnText: 'استكشف المتاجر',
    img: require('../../../../assets/images/home/premium-hero-desktop.png'),
  },
  {
    id: 's3',
    title: 'توصيل سريع لكل المدن 🚚',
    sub: 'رسوم التوصيل تُحسب حسب مدينتك وتظهر لك قبل تأكيد الطلب',
    btnText: 'تصفح المتاجر',
    img: require('../../../../assets/images/bannerstoor/delfre.png'),
  },
  {
    id: 's4',
    title: 'عروض وحسومات المتاجر ⚡',
    sub: 'تخفيضات تصل إلى 60% على المنتجات المتميزة والأكثر طلباً',
    btnText: 'شاهد العروض',
    img: require('../../../../assets/images/bannerstoor/add.png'),
  },
];

export default function StoresListScreen({ navigation, route }: any) {
  const layout = useCustomerLayout();
  const categoryId = route?.params?.categoryId;
  const isDatabaseCategory = Boolean(categoryId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(categoryId));
  const fallbackCategory = isDatabaseCategory ? undefined : route?.params?.filter;

  const [search, setSearch] = useState('');
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(fallbackCategory || 'all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const heroScrollRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % STORE_CAROUSEL_CARDS.length;
        const cardW = layout.usableWidth || 340;
        heroScrollRef.current?.scrollTo({ x: nextIndex * cardW, animated: true });
        return nextIndex;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [layout.usableWidth]);

  const loadStores = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await getStores(search || undefined);
      if (isDatabaseCategory && categoryId) {
        const { data: products } = await supabase
          .from('products')
          .select('merchant_id')
          .eq('category_id', categoryId)
          .eq('is_active', true);
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
  }, [categoryId, isDatabaseCategory, search]);

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

  const toggleFavorite = (id: string) => {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFavorites(next);
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
    logo_text_color: '#172554',
    is_verified: s.is_approved === true,
  }));

  const filteredStores =
    activeCategory && activeCategory !== 'all'
      ? displayStoresList.filter(
          (s) => s.store_category.includes(activeCategory) || activeCategory === 'all'
        )
      : displayStoresList;

  const renderStoreRow = (item: any) => {
    const isFav = favorites.has(item.id);
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
                {tv(item.logo_text)}
              </Text>
            </View>
          ) : (
            <Ionicons name="storefront-outline" size={26} color="#172554" />
          )}
          {item.is_verified ? (
            <View style={styles.storeRowVerifiedBadge}>
              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
            </View>
          ) : null}
        </View>

        {/* Center-Right: Title, Categories, Free Delivery Pill */}
        <View style={styles.storeRowMainInfo}>
          <Text style={styles.storeRowName} numberOfLines={1}>
            {tv(item.store_name)}
          </Text>
          <Text style={styles.storeRowCategory} numberOfLines={1}>
            {tv(item.store_category)}
          </Text>

          {item.city ? (
            <View style={styles.freeDeliveryPill}>
              <Ionicons name="location-outline" size={11} color="#059669" />
              <Text style={styles.freeDeliveryText}>{tv(item.city)}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats Column: Rating & Reviews (بيانات حقيقية من القاعدة) */}
        <View style={styles.storeRowStatsCol}>
          <View style={styles.statSubCol}>
            <View style={styles.statIconRow}>
              <Ionicons name="star" size={13} color={item.rating > 0 ? '#F59E0B' : '#CBD5E1'} />
              <Text style={styles.statValText}>{tv(item.rating > 0 ? item.rating.toFixed(1) : '—')}</Text>
            </View>
            <Text style={styles.statLabelText}>{t('التقييم')}</Text>
          </View>

          <View style={styles.statSubCol}>
            <View style={styles.statIconRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={13} color="#64748B" />
              <Text style={styles.statValText}>{tv(item.reviews_count)}</Text>
            </View>
            <Text style={styles.statLabelText}>{t('التقييمات')}</Text>
          </View>
        </View>

        {/* Far-Left: Heart Button */}
        <TouchableOpacity
          style={styles.storeRowHeartBtn}
          onPress={(e) => {
            e.stopPropagation();
            toggleFavorite(item.id);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={18} color={isFav ? '#172554' : '#64748B'} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Clean Minimalist Header Matching HomeScreen */}
      <View style={styles.header}>
        {/* Search Row: Search Input + Dark Filter Button */}
        <View style={styles.searchRowContainer}>
          <View style={styles.searchBoxRow}>
            <Ionicons name="search-outline" size={19} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('ابحث عن متجر أو منتج...')}
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              textAlign={Platform.OS === 'web' ? 'right' : 'left'}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.darkFilterBtn}
            onPress={() => setSearch('')}
            activeOpacity={0.86}
          >
            <Ionicons name="options-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Horizontal Category Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChipsScroll}
        >
          {CATEGORY_CHIPS.map((chip) => {
            const isActive = activeCategory === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[styles.chipPill, isActive && styles.chipPillActive]}
                onPress={() => setActiveCategory(chip.id)}
                activeOpacity={0.82}
              >
                <View style={[styles.chipIconWrap, isActive && styles.chipIconWrapActive]}>
                  <Ionicons
                    name={chip.icon as any}
                    size={14}
                    color={isActive ? '#172554' : '#64748B'}
                  />
                </View>
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {tv(chip.name)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#172554" />}
      >
        {/* 4 Swipable Content Cards Carousel for StoresListScreen */}
        <ScrollView
          ref={heroScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.heroCarouselScroll}
          onScroll={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const cardW = layout.usableWidth || 340;
            const index = Math.round(offsetX / cardW);
            setHeroIndex(Math.max(0, Math.min(STORE_CAROUSEL_CARDS.length - 1, index)));
          }}
          scrollEventThrottle={16}
        >
          {STORE_CAROUSEL_CARDS.map((card) => (
            <View key={card.id} style={[styles.heroCardContainer, { width: layout.usableWidth || '100%' }]}>
              <View style={styles.heroTextCol}>
                <Text style={styles.heroTitleText}>{tv(card.title)}</Text>
                <Text style={styles.heroSubTitleText}>{tv(card.sub)}</Text>

                <TouchableOpacity
                  style={styles.heroCtaBtn}
                  onPress={() => setActiveCategory('all')}
                  activeOpacity={0.88}
                >
                  <Text style={styles.heroCtaText}>{tv(card.btnText)}</Text>
                  <Ionicons name="arrow-back" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.heroGraphicCol}>
                <Image source={card.img} style={styles.heroGraphicImg} resizeMode="contain" />
              </View>
            </View>
          ))}
        </ScrollView>

        {/* 3 Fixed Aesthetic Dots */}
        <View style={styles.carouselDotsRow}>
          <View style={[styles.dot, heroIndex % 3 === 0 && styles.dotActive]} />
          <View style={[styles.dot, heroIndex % 3 === 1 && styles.dotActive]} />
          <View style={[styles.dot, heroIndex % 3 === 2 && styles.dotActive]} />
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleGroup}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>{t('المتاجر المميزة')}</Text>
              <Ionicons name="sparkles" size={16} color="#172554" style={{ marginRight: 6 }} />
            </View>
            <Text style={styles.sectionSubTitleText}>{t('متاجر موثوقة وتجربة تسوق رائعة')}</Text>
          </View>

          <TouchableOpacity onPress={() => setActiveCategory('all')} activeOpacity={0.75}>
            <Text style={styles.viewAllText}>{t('عرض الكل ›')}</Text>
          </TouchableOpacity>
        </View>

        {/* Stores List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#172554" />
          </View>
        ) : (
          <View style={styles.storesListContainer}>
            {filteredStores.length === 0 ? (
              <View style={styles.emptyStoresState}>
                <Ionicons name="storefront-outline" size={44} color="#CBD5E1" />
                <Text style={styles.emptyStoresTitle}>{t('لا توجد متاجر متاحة حالياً')}</Text>
                <Text style={styles.emptyStoresSub}>{t('نعمل على إضافة متاجر جديدة في منطقتك. عاود المحاولة قريباً.')}</Text>
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 48 : 18,
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
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: '#0F172A',
    marginHorizontal: 8,
    textAlign: 'right',
  },
  darkFilterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#172554',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#172554',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 7,
  },
  chipPillActive: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },
  chipIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  chipIconWrapActive: {
    backgroundColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: '#334155',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  heroCarouselScroll: {
    paddingBottom: 4,
  },
  heroCardContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  heroTextCol: {
    flex: 1,
    alignItems: 'flex-end',
    zIndex: 2,
  },
  heroTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: '#0F172A',
    textAlign: 'right',
  },
  heroSubTitleText: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'right',
  },
  heroCtaBtn: {
    backgroundColor: '#172554',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    height: 38,
    borderRadius: 16,
    marginTop: 14,
    gap: 6,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  heroCtaText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
  heroGraphicCol: {
    width: 120,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  heroGraphicImg: {
    width: '100%',
    height: '100%',
  },
  carouselDotsRow: {
    position: 'absolute',
    bottom: 10,
    left: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  dotActive: {
    backgroundColor: '#172554',
    width: 16,
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
    color: '#0F172A',
  },
  sectionSubTitleText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  viewAllText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#64748B',
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
    color: '#94A3B8',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  storeRowLogoWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  storeRowLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
    resizeMode: 'cover',
  },
  storeRowLogoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
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
    backgroundColor: '#172554',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  storeRowMainInfo: {
    flex: 1,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  storeRowName: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: '#0F172A',
    textAlign: 'right',
  },
  storeRowCategory: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'right',
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
    color: '#0F172A',
  },
  statLabelText: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  storeRowHeartBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingWrap: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
