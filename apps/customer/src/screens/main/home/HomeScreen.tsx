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
import { FONTS } from '@marketplace/shared-utils';
import { HomeStackParamList } from '../../../navigation/types';
import { CustomerResponsiveShell, useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { CustomerProductCard } from '../../../components/customer/CustomerProductCard';
import { CustomerSearchField } from '../../../components/customer/CustomerSearchField';
import { CustomerSectionHeader } from '../../../components/customer/CustomerSectionHeader';
import { CustomerHorizontalList } from '../../../components/customer/CustomerHorizontalList';
import { DirectionalIcon } from '../../../components/DirectionalIcon';
import { useTranslation, localized } from '../../../i18n';
import { directional } from '../../../i18n/directionalStyles';
import { CT, CT_RADIUS } from '../../../theme/customerTheme';

type Navigation = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
type Props = { navigation: Navigation };

const LOGO_MARK = require('../../../../assets/images/logo.png');

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
    title: 'customer.discoverNew',
    sub: 'customer.curatedProductsStores',
    btnText: 'customer.shopNow',
    img: require('../../../../assets/images/home/smool_bannar.png'),
    route: 'Offers',
  },
  ...DYNAMIC_BANNER_IMAGES,
];

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
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
      Alert.alert(t('customer.outOfStock'), t('customer.unavailableProduct'));
      return;
    }
    addToCart({
      id: product.id,
      productId: product.id,
      name: localized(product.name_ar, product.name),
      price: product.sale_price ?? product.base_price,
      emoji: '🛍️',
      quantity: 1,
      maxQuantity: product.stock_quantity ?? undefined,
      storeId: product.merchant_id,
      storeName: product.merchant_profiles?.store_name ?? '',
      image: product.og_image_url ?? product.product_images?.[0]?.url,
    });
    Alert.alert(t('customer.added'), t('customer.addedToCart'));
  };

  const displayStores = stores.map((s) => ({
    id: s.id,
    store_name: s.store_name,
    logo_url: s.store_logo_url,
    logo_text: s.store_name?.trim().slice(0, 1) || t('customer.currentStoreFallback'),
    city: s.city ?? '',
    rating: Number(s.rating ?? 0),
    is_verified: s.is_approved === true,
  }));

  const heroWidth = layout.usableWidth || 340;
  const heroHeight = Math.min(300, Math.max(168, Math.round(heroWidth / 1.9)));

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={CT.surface} />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 4 }]}>
        <CustomerResponsiveShell>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.brandRow}
              activeOpacity={0.8}
              onPress={() => openTab('More', 'AddressBook')}
              accessibilityRole="button"
              accessibilityLabel={t('customer.changeDeliveryAddress')}
            >
              <Image source={LOGO_MARK} style={styles.brandMark} resizeMode="contain" />
              <View style={styles.locationCol}>
                <Text style={styles.locationLabel}>{t('customer.deliverTo')}</Text>
                <View style={styles.locationRow}>
                  <Text style={styles.locationValue} numberOfLines={1}>
                    {defaultCity || t('customer.chooseDeliveryAddress')}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={CT.inkSecondary} />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              activeOpacity={0.8}
              onPress={() => openTab('More', 'Notifications')}
              accessibilityRole="button"
              accessibilityLabel={t('customer.notifications')}
            >
              <Ionicons name="notifications-outline" size={21} color={CT.ink} />
              {unreadCount > 0 && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          </View>

          <CustomerSearchField
            onPress={() => navigation.navigate('Search')}
            placeholder={t('customer.searchPlaceholder')}
            showFilter
            onFilterPress={() => navigation.navigate('Search')}
          />
        </CustomerResponsiveShell>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={CT.navy} />
        }
      >
        <CustomerResponsiveShell>
          <ScrollView
            ref={heroScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / heroWidth);
              setHeroIndex(Math.max(0, Math.min(HERO_BANNERS.length - 1, index)));
            }}
            scrollEventThrottle={16}
          >
            {HERO_BANNERS.map((banner) => {
              if (banner.type === 'image') {
                return (
                  <TouchableOpacity
                    key={banner.id}
                    style={[styles.heroCard, { width: heroWidth, height: heroHeight }]}
                    activeOpacity={0.92}
                    onPress={() => navigation.navigate(banner.route as any)}
                    accessibilityRole="button"
                  >
                    <Image source={banner.img} style={styles.heroImage} resizeMode="cover" />
                  </TouchableOpacity>
                );
              }

              return (
                <View key={banner.id} style={[styles.heroCard, styles.heroFeature, { width: heroWidth, height: heroHeight }]}>
                  <View style={styles.heroFeatureText}>
                    <View style={styles.heroChip}>
                      <Text style={styles.heroChipText}>{t('onboarding.appName')}</Text>
                    </View>
                    <Text style={styles.heroTitle} numberOfLines={2}>{t(banner.title)}</Text>
                    <Text style={styles.heroSub} numberOfLines={2}>{t(banner.sub)}</Text>
                    <TouchableOpacity
                      style={styles.heroButton}
                      onPress={() => navigation.navigate(banner.route as any)}
                      activeOpacity={0.88}
                      accessibilityRole="button"
                    >
                      <Text style={styles.heroButtonText}>{t(banner.btnText)}</Text>
                      <DirectionalIcon name="arrow-back" size={15} color={CT.navy} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.heroFeatureMedia}>
                    <Image source={banner.img} style={styles.heroImage} resizeMode="cover" />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {HERO_BANNERS.length > 1 ? (
            <View style={styles.heroDots}>
              {HERO_BANNERS.length <= 6 ? (
                HERO_BANNERS.map((banner, index) => (
                  <View key={banner.id} style={index === heroIndex ? styles.dotActive : styles.dot} />
                ))
              ) : (
                <Text style={styles.heroCounter}>{`${heroIndex + 1} / ${HERO_BANNERS.length}`}</Text>
              )}
            </View>
          ) : null}

          <CustomerSectionHeader
            title={t('customer.categories')}
            actionLabel={t('customer.viewAll')}
            onActionPress={() => navigation.navigate('StoresList', {})}
          />

          <CustomerHorizontalList contentContainerStyle={styles.categoriesRow}>
            {categories.length === 0 ? (
              <TouchableOpacity
                style={styles.categoryItem}
                onPress={() => navigation.navigate('StoresList', {})}
                activeOpacity={0.8}
              >
                <View style={styles.categoryIcon}>
                  <Ionicons name="grid-outline" size={23} color={CT.navy} />
                </View>
                <Text style={styles.categoryName}>{t('customer.all')}</Text>
              </TouchableOpacity>
            ) : categories.slice(0, 10).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.categoryItem}
                onPress={() => navigation.navigate('StoresList', {
                  categoryId: item.id,
                  filter: item.name_ar ?? item.name,
                })}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <View style={styles.categoryIcon}>
                  <Ionicons name={categoryIcon(item)} size={23} color={CT.navy} />
                </View>
                <Text style={styles.categoryName} numberOfLines={1}>
                  {localized(item.name_ar, item.name)}
                </Text>
              </TouchableOpacity>
            ))}
          </CustomerHorizontalList>

          <CustomerSectionHeader
            title={t('common.stores')}
            actionLabel={t('customer.viewAll')}
            onActionPress={() => navigation.navigate('StoresList', {})}
          />

          <CustomerHorizontalList contentContainerStyle={styles.storesRow}>
            {displayStores.length === 0 && (
              <View style={styles.storesEmpty}>
                <Ionicons name="storefront-outline" size={20} color={CT.inkMuted} />
                <Text style={styles.storesEmptyText}>{t('customer.noStores')}</Text>
              </View>
            )}
            {displayStores.map((store) => (
              <TouchableOpacity
                key={store.id}
                style={styles.storeCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('StoreDetails', { storeId: store.id })}
                accessibilityRole="button"
                accessibilityLabel={store.store_name}
              >
                <View style={styles.storeLogoWrap}>
                  {store.logo_url ? (
                    <Image source={{ uri: store.logo_url }} style={styles.storeLogo} />
                  ) : (
                    <Text style={styles.storeLogoText}>{store.logo_text}</Text>
                  )}
                  {store.is_verified ? (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark" size={10} color={CT.surface} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.storeName} numberOfLines={2}>{store.store_name}</Text>
                <View style={styles.storeMeta}>
                  {store.rating > 0 ? (
                    <View style={styles.storeRating}>
                      <Ionicons name="star" size={11} color={CT.star} />
                      <Text style={styles.storeRatingText}>{store.rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                  {store.city ? (
                    <Text style={styles.storeCity} numberOfLines={1}>{store.city}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </CustomerHorizontalList>

          <CustomerSectionHeader
            eyebrow={t('customer.curatedStores')}
            title={t('common.products')}
            actionLabel={t('customer.explore')}
            onActionPress={() => navigation.navigate('Search')}
          />

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={CT.navy} size="large" />
            </View>
          ) : products.length === 0 ? (
            <View style={styles.productsEmpty}>
              <View style={styles.productsEmptyIcon}>
                <Ionicons name="bag-handle-outline" size={26} color={CT.navy} />
              </View>
              <Text style={styles.productsEmptyTitle}>{t('customer.noProducts')}</Text>
              <Text style={styles.productsEmptyText}>{t('customer.tryRefresh')}</Text>
              <TouchableOpacity style={styles.productsEmptyButton} onPress={() => navigation.navigate('StoresList', {})}>
                <Text style={styles.productsEmptyButtonText}>{t('customer.exploreStores')}</Text>
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

const styles = directional(StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CT.paper,
  },
  header: {
    backgroundColor: CT.surface,
    borderBottomWidth: 1,
    borderBottomColor: CT.hairline,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 40,
    height: 40,
    marginLeft: -2,
  },
  locationCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  locationLabel: {
    color: CT.inkMuted,
    fontFamily: FONTS.medium,
    fontSize: 11,
    marginBottom: 1,
  },
  locationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  locationValue: {
    flexShrink: 1,
    color: CT.ink,
    fontFamily: FONTS.bold,
    fontSize: 15,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.surface,
    borderWidth: 1,
    borderColor: CT.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CT.sand,
    borderWidth: 1.5,
    borderColor: CT.surface,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 110,
  },
  heroCard: {
    borderRadius: CT_RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: CT.navySoft,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFeature: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    padding: 20,
    backgroundColor: CT.navy,
  },
  heroFeatureText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  heroChip: {
    paddingHorizontal: 10,
    height: 22,
    justifyContent: 'center',
    borderRadius: CT_RADIUS.pill,
    backgroundColor: 'rgba(200,163,106,0.18)',
    marginBottom: 10,
  },
  heroChipText: {
    color: CT.sand,
    fontFamily: FONTS.semiBold,
    fontSize: 10.5,
  },
  heroTitle: {
    color: CT.ivory,
    fontFamily: FONTS.bold,
    fontSize: 21,
    lineHeight: 28,
    textAlign: 'right',
  },
  heroSub: {
    color: 'rgba(248,246,241,0.72)',
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'right',
  },
  heroButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.ivory,
    marginTop: 14,
  },
  heroButtonText: {
    color: CT.navy,
    fontFamily: FONTS.bold,
    fontSize: 12.5,
  },
  heroFeatureMedia: {
    width: 108,
    height: 108,
    borderRadius: CT_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: CT.navyDeep,
  },
  heroDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 12,
  },
  heroCounter: {
    color: CT.inkMuted,
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CT.navyTint,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: CT.navy,
  },
  categoriesRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    paddingVertical: 2,
  },
  categoryItem: {
    width: 76,
    alignItems: 'center',
    paddingVertical: 4,
  },
  categoryIcon: {
    width: 58,
    height: 58,
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    width: '100%',
    color: CT.ink,
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    marginTop: 8,
    textAlign: 'center',
  },
  storesRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingVertical: 4,
  },
  storesEmpty: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  storesEmptyText: {
    fontSize: 13,
    color: CT.inkMuted,
    fontFamily: FONTS.medium,
  },
  storeCard: {
    width: 150,
    padding: 12,
    alignItems: 'flex-end',
    borderRadius: CT_RADIUS.lg,
    backgroundColor: CT.surface,
    borderWidth: 1,
    borderColor: CT.hairline,
  },
  storeLogoWrap: {
    width: 52,
    height: 52,
    borderRadius: CT_RADIUS.md,
    backgroundColor: CT.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  storeLogo: {
    width: '100%',
    height: '100%',
    borderRadius: CT_RADIUS.md,
    resizeMode: 'cover',
  },
  storeLogoText: {
    color: CT.navy,
    fontFamily: FONTS.bold,
    fontSize: 18,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -5,
    left: -5,
    width: 19,
    height: 19,
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CT.surface,
  },
  storeName: {
    width: '100%',
    minHeight: 36,
    color: CT.ink,
    fontFamily: FONTS.semiBold,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 10,
    textAlign: 'right',
  },
  storeMeta: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  storeRating: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
  },
  storeRatingText: {
    color: CT.ink,
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  storeCity: {
    flexShrink: 1,
    color: CT.inkMuted,
    fontFamily: FONTS.regular,
    fontSize: 11,
  },
  productsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingBottom: 8,
  },
  productsEmpty: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: CT.hairline,
    borderRadius: CT_RADIUS.lg,
    backgroundColor: CT.surface,
  },
  productsEmptyIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.navySoft,
    marginBottom: 12,
  },
  productsEmptyTitle: {
    color: CT.ink,
    fontFamily: FONTS.bold,
    fontSize: 16,
  },
  productsEmptyText: {
    maxWidth: 360,
    marginTop: 6,
    color: CT.inkSecondary,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  productsEmptyButton: {
    minHeight: 42,
    marginTop: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.navy,
  },
  productsEmptyButtonText: {
    color: CT.ivory,
    fontFamily: FONTS.bold,
    fontSize: 12.5,
  },
  loadingContainer: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
}), 'rtl');
