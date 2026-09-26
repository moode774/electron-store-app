import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../../../components/appAlert';
import {
  addToWishlist,
  Category,
  getAddresses,
  getCategories,
  getFeaturedProducts,
  getNotifications,
  getOrders,
  getStores,
  getWishlist,
  ProductSummary,
  removeFromWishlist,
  StoreSummary,
  supabase,
  useAuthStore,
  useCartStore,
} from '@marketplace/shared-hooks';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { HomeStackParamList } from '../../../navigation/types';
import { CustomerResponsiveShell, useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { CustomerProductCard } from '../../../components/customer/CustomerProductCard';
import { CustomerSearchField } from '../../../components/customer/CustomerSearchField';
import { CustomerSectionHeader } from '../../../components/customer/CustomerSectionHeader';

type Navigation = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
type Props = { navigation: Navigation };

// ألوان محايدة لشعارات المتاجر التي لا صورة لها (عرض فقط — ليست بيانات)
const STORE_LOGO_COLORS = ['#EEF2FF', '#ECFDF5', '#FEF3C7', '#FCE7F3', '#E0F2FE', '#F1F5F9'];

function categoryIcon(category: Category): keyof typeof Ionicons.glyphMap {
  const label = `${category.name_ar ?? ''} ${category.name ?? ''}`.toLowerCase();
  if (label.includes('إلكتر') || label.includes('elect')) return 'hardware-chip-outline';
  if (label.includes('أزياء') || label.includes('ملابس') || label.includes('fashion') || label.includes('cloth')) return 'shirt-outline';
  if (label.includes('حذ') || label.includes('shoe')) return 'footsteps-outline';
  if (label.includes('عطر') || label.includes('perfume')) return 'sparkles-outline';
  if (label.includes('منزل') || label.includes('home')) return 'home-outline';
  if (label.includes('رياض') || label.includes('sport')) return 'barbell-outline';
  return 'grid-outline';
}

// @ts-ignore - Dynamic folder reader for assets/images/banners (Scans directory automatically)
const bannerContext = require.context('../../../../assets/images/banners', false, /\.(png|jpe?g|svg|webp)$/);
const DYNAMIC_BANNER_IMAGES = bannerContext.keys().map((key: string, index: number) => ({
  type: 'image' as const,
  id: `dyn_banner_${index}`,
  img: bannerContext(key),
  route: 'Offers',
}));

const HERO_BANNERS = [
  {
    type: 'content',
    id: 'c1',
    title: 'اكتشف الجديد',
    sub: 'منتجات ومتاجر مختارة في مكان واحد',
    btnText: 'تسوق الآن',
    img: require('../../../../assets/images/home/smool_bannar.png'),
    route: 'Offers',
  },
  ...DYNAMIC_BANNER_IMAGES,
];

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const layout = useCustomerLayout();
  const user = useAuthStore((state) => state.user);
  const addToCart = useCartStore((state) => state.addToCart);

  const [defaultCity, setDefaultCity] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wished, setWished] = useState<Set<string>>(new Set());
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const heroScrollRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    if (HERO_BANNERS.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % HERO_BANNERS.length;
        const cardW = layout.usableWidth || 340;
        heroScrollRef.current?.scrollTo({ x: nextIndex * cardW, animated: true });
        return nextIndex;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [layout.usableWidth]);

  const isTabletUp = layout.width >= 768;
  const isDesktopUp = layout.width >= 1024;
  const productColumns = layout.width >= 1440 ? 5 : isDesktopUp ? 4 : isTabletUp ? 3 : layout.width >= 360 ? 2 : 1;
  const productGridGap = 14;
  const productCardWidth =
    productColumns === 1
      ? '100%'
      : Math.max(148, (layout.usableWidth - productGridGap * (productColumns - 1)) / productColumns);

  const openTab = (tab: any, screen?: string, params?: any) => {
    (navigation.getParent() as any)?.navigate(tab, screen ? { screen, params } : undefined);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryResult, storesResult] = await Promise.allSettled([
        getCategories(),
        getStores(undefined, 10),
      ]);

      if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value);
      if (storesResult.status === 'fulfilled') setStores(storesResult.value);

      let fetchedProducts: ProductSummary[] = [];
      try {
        fetchedProducts = await getFeaturedProducts(20);
      } catch {
        fetchedProducts = [];
      }

      if (!fetchedProducts || fetchedProducts.length === 0) {
        const { data: dbProducts, error: dbError } = await supabase
          .from('products')
          .select(
            'id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity, product_images(url:image_url, is_primary, sort_order), product_variants(id, is_active), merchant_profiles(store_name)'
          )
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!dbError && dbProducts && dbProducts.length > 0) {
          fetchedProducts = dbProducts as unknown as ProductSummary[];
        }
      }

      setProducts(fetchedProducts);

      if (user?.id) {
        try {
          const wishlist = await getWishlist(user.id);
          setWished(new Set(wishlist.map((item) => item.product_id)));
        } catch {
          // ignore
        }

        // مدينة العنوان الافتراضي بدل نص ثابت للجميع
        try {
          const addresses = await getAddresses(user.id);
          const preferred = addresses.find((a) => a.is_default) ?? addresses[0];
          setDefaultCity(preferred?.city ?? '');
        } catch {
          setDefaultCity('');
        }

        // نقطة الإشعارات تظهر فقط عند وجود غير مقروء
        try {
          const notifications = await getNotifications(user.id);
          setUnreadCount(notifications.filter((n) => !n.is_read).length);
        } catch {
          setUnreadCount(0);
        }
      }
    } catch (err) {
      console.error('Error loading home data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleWish = async (id: string) => {
    if (!user?.id) return;
    const next = new Set(wished);
    const isSaved = next.has(id);
    if (isSaved) next.delete(id);
    else next.add(id);
    setWished(next);
    try {
      if (isSaved) await removeFromWishlist(user.id, id);
      else await addToWishlist(user.id, id);
    } catch {
      setWished(wished);
    }
  };

  const quickAddToCart = (product: ProductSummary) => {
    if ((product.stock_quantity ?? 1) <= 0) {
      Alert.alert('نفد المخزون', 'هذا المنتج غير متاح حالياً.');
      return;
    }
    addToCart({
      id: product.id,
      productId: product.id,
      name: product.name_ar || product.name,
      price: product.sale_price ?? product.base_price,
      emoji: '🛍️',
      quantity: 1,
      maxQuantity: product.stock_quantity ?? undefined,
      storeId: product.merchant_id,
      storeName: product.merchant_profiles?.store_name ?? '',
      image: product.og_image_url ?? product.product_images?.[0]?.url,
    });
    Alert.alert('تمت الإضافة', 'تمت إضافة المنتج إلى سلة التسوق بنجاح.');
  };

  const displayStores =
    stores.length > 0
      ? stores.map((s, idx) => ({
          id: s.id,
          store_name: s.store_name,
          logo_url: s.store_logo_url,
          logo_bg: STORE_LOGO_COLORS[idx % STORE_LOGO_COLORS.length],
          logo_text: s.store_name?.slice(0, 2) || 'متجر',
          logo_text_color: '#172554',
          is_verified: s.is_approved === true,
        }))
      : [];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Clean Minimalist Top Header */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 10) }]}>
        <CustomerResponsiveShell>
          {/* Top Row: Location Title & Bell Notification Button */}
          <View style={styles.headerTopRow}>
            <View style={styles.locationContainer}>
              <Text style={styles.locationLabel}>الموقع</Text>
              <TouchableOpacity
                style={styles.locationPickerRow}
                activeOpacity={0.8}
                onPress={() => openTab('More', 'AddressBook')}
                accessibilityRole="button"
                accessibilityLabel="تغيير عنوان التوصيل"
              >
                <Ionicons name="location" size={17} color="#172554" />
                <Text style={styles.locationValueText}>
                  {defaultCity || 'اختر عنوان التوصيل'}
                </Text>
                <Ionicons name="chevron-down" size={14} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.notifCircleBtn}
              activeOpacity={0.8}
              onPress={() => openTab('More', 'Notifications')}
              accessibilityRole="button"
              accessibilityLabel="الإشعارات"
            >
              <Ionicons name="notifications" size={20} color="#172554" />
              {unreadCount > 0 && <View style={styles.notifCircleBadgeDot} />}
            </TouchableOpacity>
          </View>

          <CustomerSearchField
            onPress={() => navigation.navigate('Search')}
            placeholder="ابحث عن منتجات أو متاجر"
            showFilter
            onFilterPress={() => navigation.navigate('Search')}
          />
        </CustomerResponsiveShell>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#172554" />
        }
      >
        <CustomerResponsiveShell>

          {/* Swipable Hero Carousel (Content Cards + Full Image Banners) */}
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
              setHeroIndex(Math.max(0, Math.min(HERO_BANNERS.length - 1, index)));
            }}
            scrollEventThrottle={16}
          >
            {HERO_BANNERS.map((banner) => {
              if (banner.type === 'image') {
                return (
                  <TouchableOpacity
                    key={banner.id}
                    style={[styles.heroFullImageCard, { width: layout.usableWidth || '100%' }]}
                    activeOpacity={0.92}
                    onPress={() => navigation.navigate(banner.route as any)}
                  >
                    <Image source={banner.img} style={styles.heroFullImage} resizeMode="cover" />
                  </TouchableOpacity>
                );
              }

              return (
                <View key={banner.id} style={[styles.heroCollectionCard, { width: layout.usableWidth || '100%' }]}>
                  <View style={styles.heroCollectionContent}>
                    <Text style={styles.heroCollectionTitle}>{banner.title}</Text>
                    <Text style={styles.heroCollectionSub}>{banner.sub}</Text>
                    <TouchableOpacity
                      style={styles.shopNowBtn}
                      onPress={() => navigation.navigate(banner.route as any)}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.shopNowBtnText}>{banner.btnText}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.heroCollectionMedia}>
                    <Image source={banner.img} style={styles.heroCollectionImage} resizeMode="cover" />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* 3 Fixed Aesthetic Carousel Dots */}
          <View style={styles.heroDotsContainer}>
            <View style={heroIndex % 3 === 0 ? styles.dotActiveDark : styles.dotInactive} />
            <View style={heroIndex % 3 === 1 ? styles.dotActiveDark : styles.dotInactive} />
            <View style={heroIndex % 3 === 2 ? styles.dotActiveDark : styles.dotInactive} />
          </View>

          <CustomerSectionHeader
            title="التصنيفات"
            actionLabel="عرض الكل"
            onActionPress={() => navigation.navigate('StoresList', {})}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesCircleScroll}
          >
            {categories.length === 0 ? (
              <TouchableOpacity
                style={styles.categoryCircleItem}
                onPress={() => navigation.navigate('StoresList', {})}
                activeOpacity={0.82}
              >
                <View style={styles.categoryCircleWrap}>
                  <Ionicons name="grid-outline" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.categoryCircleName}>الكل</Text>
              </TouchableOpacity>
            ) : categories.slice(0, 8).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.categoryCircleItem}
                onPress={() => navigation.navigate('StoresList', {
                  categoryId: item.id,
                  filter: item.name_ar ?? item.name,
                })}
                activeOpacity={0.82}
              >
                <View style={styles.categoryCircleWrap}>
                  <Ionicons name={categoryIcon(item)} size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.categoryCircleName} numberOfLines={1}>
                  {item.name_ar ?? item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <CustomerSectionHeader
            title="متاجر"
            actionLabel="عرض الكل"
            onActionPress={() => navigation.navigate('StoresList', {})}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storesContent}
          >
            {displayStores.length === 0 && (
              <View style={styles.storesEmptyState}>
                <Ionicons name="storefront-outline" size={22} color="#94A3B8" />
                <Text style={styles.storesEmptyText}>لا توجد متاجر متاحة حالياً</Text>
              </View>
            )}
            {displayStores.map((store: any) => (
              <TouchableOpacity
                key={store.id}
                style={styles.storeCircleItem}
                activeOpacity={0.82}
                onPress={() => navigation.navigate('StoreDetails', { storeId: store.id })}
              >
                <View style={styles.storeCircleWrap}>
                  {store.logo_url ? (
                    <Image source={{ uri: store.logo_url }} style={styles.storeCircleLogo} />
                  ) : store.logo_bg ? (
                    <View style={[styles.storeCircleLogoFallback, { backgroundColor: store.logo_bg }]}>
                      <Text
                        style={[
                          styles.storeCircleLogoFallbackText,
                          store.logo_text_color && { color: store.logo_text_color },
                        ]}
                        numberOfLines={2}
                      >
                        {store.logo_text}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons name="storefront-outline" size={24} color="#172554" />
                  )}
                  {store.is_verified ? (
                    <View style={styles.verifiedCircleBadge}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.storeCircleName} numberOfLines={1}>
                  {store.store_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <CustomerSectionHeader
            eyebrow="مختارة من المتاجر المتاحة"
            title="منتجات تستحق المشاهدة"
            actionLabel="استكشف"
            onActionPress={() => navigation.navigate('Search')}
          />

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={COLORS.primary} size="large" />
            </View>
          ) : products.length === 0 ? (
            <View style={styles.productsEmptyState}>
              <View style={styles.productsEmptyIcon}>
                <Ionicons name="bag-handle-outline" size={28} color={COLORS.primary} />
              </View>
              <Text style={styles.productsEmptyTitle}>لا توجد منتجات متاحة الآن</Text>
              <Text style={styles.productsEmptyText}>جرّب تحديث الصفحة أو استكشف المتاجر المتاحة.</Text>
              <TouchableOpacity style={styles.productsEmptyButton} onPress={() => navigation.navigate('StoresList', {})}>
                <Text style={styles.productsEmptyButtonText}>استكشف المتاجر</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.productsGrid, { gap: productGridGap }]}>
              {products.map((item) => {
                const hasOptions = Boolean(item.product_variants?.some((variant) => variant.is_active !== false));
                return (
                  <CustomerProductCard
                    key={item.id}
                    product={item}
                    style={{ width: productCardWidth }}
                    favorite={wished.has(item.id)}
                    onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
                    onToggleFavorite={() => void toggleWish(item.id)}
                    onQuickAction={() => {
                      if (hasOptions) {
                        navigation.navigate('ProductDetails', { productId: item.id });
                        return;
                      }
                      quickAddToCart(item);
                    }}
                    quickActionNeedsOptions={hasOptions}
                    quickActionDisabled={(item.stock_quantity ?? 1) <= 0}
                  />
                );
              })}
            </View>
          )}
        </CustomerResponsiveShell>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 14,
  },
  headerTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  locationContainer: {
    alignItems: 'flex-end',
  },
  locationLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 2,
  },
  locationPickerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  locationValueText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#172554',
  },
  notifCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifCircleBadgeDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38BDF8',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  searchRowContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  searchInputBox: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchPlaceholderText: {
    flex: 1,
    color: '#94A3B8',
    fontFamily: FONTS.regular,
    fontSize: 13,
    textAlign: 'right',
  },
  darkFilterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#172554', // Deep Dark Slate filter button matching screenshot
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  scrollContent: {
    paddingBottom: 96,
    paddingTop: 8,
  },
  heroCarouselScroll: {
    paddingBottom: 4,
  },
  heroFullImageCard: {
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 150,
    maxHeight: 150,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  heroFullImage: {
    width: '100%',
    height: '100%',
  },
  heroCollectionCard: {
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 150,
    marginBottom: 12,
  },
  heroCollectionContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  heroCollectionTitle: {
    color: '#172554',
    fontFamily: FONTS.bold,
    fontSize: 20,
    textAlign: 'right',
  },
  heroCollectionSub: {
    color: '#64748B',
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    marginTop: 4,
    textAlign: 'right',
  },
  shopNowBtn: {
    backgroundColor: '#172554',
    paddingHorizontal: 20,
    height: 38,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  shopNowBtnText: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
    fontSize: 12.5,
  },
  heroCollectionMedia: {
    width: 120,
    height: 110,
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroCollectionImage: {
    width: '100%',
    height: '100%',
  },
  heroDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  dotActiveDark: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#172554',
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 12,
  },
  sectionTitleBold: {
    color: '#172554',
    fontFamily: FONTS.bold,
    fontSize: 18,
    textAlign: 'right',
  },
  seeAllLink: {
    color: '#64748B',
    fontFamily: FONTS.bold,
    fontSize: 13,
  },
  categoriesCircleScroll: {
    flexDirection: 'row-reverse',
    gap: 16,
    paddingVertical: 4,
  },
  categoryCircleItem: {
    alignItems: 'center',
    width: 68,
  },
  categoryCircleWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCircleName: {
    color: '#334155',
    fontFamily: FONTS.bold,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  storesContent: {
    flexDirection: 'row-reverse',
    gap: 16,
    paddingVertical: 8,
  },
  storesEmptyState: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  storesEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontFamily: FONTS.medium,
  },
  storeCircleItem: {
    alignItems: 'center',
    width: 74,
  },
  storeCircleWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  storeCircleLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    resizeMode: 'cover',
  },
  storeCircleLogoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  storeCircleLogoFallbackText: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    textAlign: 'center',
  },
  verifiedCircleBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#172554',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  storeCircleName: {
    width: '100%',
    color: '#172554',
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    marginTop: 8,
    textAlign: 'center',
  },
  flashHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 12,
  },
  flashTitleCol: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  timerBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timerText: {
    color: '#172554',
    fontFamily: FONTS.bold,
    fontSize: 11.5,
  },
  flashFilterScroll: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 16,
  },
  flashPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  flashPillSelected: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },
  flashPillText: {
    color: '#475569',
    fontFamily: FONTS.medium,
    fontSize: 12.5,
  },
  flashPillTextSelected: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
  },
  productsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingBottom: 8,
  },
  productCard: {
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  productMedia: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1.08,
    backgroundColor: '#F8FAFC',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  discountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#172554',
  },
  discountText: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
    fontSize: 10,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productBody: {
    minHeight: 126,
    padding: 12,
    alignItems: 'flex-end',
  },
  productStore: {
    maxWidth: '100%',
    color: '#64748B',
    fontFamily: FONTS.semiBold,
    fontSize: 10.5,
    marginBottom: 3,
  },
  productName: {
    width: '100%',
    minHeight: 38,
    color: '#172554',
    fontFamily: FONTS.bold,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },
  ratingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    color: '#172554',
    fontFamily: FONTS.bold,
    fontSize: 11.5,
  },
  soldText: {
    color: '#94A3B8',
    fontFamily: FONTS.regular,
    fontSize: 10.5,
  },
  priceActionRow: {
    width: '100%',
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  priceText: {
    color: '#172554',
    fontFamily: FONTS.bold,
    fontSize: 15.5,
  },
  currencyText: {
    color: '#64748B',
    fontFamily: FONTS.medium,
    fontSize: 10.5,
  },
  oldPriceText: {
    color: '#94A3B8',
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#172554',
  },
  productsEmptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
  },
  productsEmptyIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: COLORS.primarySoft,
    marginBottom: 12,
  },
  productsEmptyTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 16,
  },
  productsEmptyText: {
    maxWidth: 360,
    marginTop: 6,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  productsEmptyButton: {
    minHeight: 42,
    marginTop: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  productsEmptyButtonText: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 12.5,
  },
  loadingContainer: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
