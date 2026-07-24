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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../../../components/appAlert';
import {
  addToWishlist,
  Category,
  getCategories,
  getFeaturedProducts,
  getOrders,
  getStores,
  getWishlist,
  OrderSummary,
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

type Navigation = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
type Props = { navigation: Navigation };

// Apple Design Tokens strictly from DESIGN-apple.md
const APPLE_TOKENS = {
  primary: '#0066cc', // Action Blue
  primaryFocus: '#0071e3',
  primaryOnDark: '#2997ff',
  ink: '#1d1d1f', // Near-Black Ink
  bodyMuted: '#7a7a7a',
  hairline: '#e0e0e0',
  dividerSoft: '#f0f0f0',
  canvas: '#ffffff',
  canvasParchment: '#f5f5f7',
  surfacePearl: '#fafafc',
  surfaceTileDark: '#1d1d1f',
  surfaceTileDark2: '#272729',
};

// Fallback Stores
const MOCKUP_STORES = [
  { id: 'noon', store_name: 'نون', logo_bg: '#FEE500', logo_text: 'نون', is_verified: true },
  { id: 'amazon', store_name: 'أمازون', logo_bg: '#FFFFFF', logo_text: 'amazon', is_verified: true },
  { id: 'namshi', store_name: 'نمشي', logo_bg: '#FFFFFF', logo_text: 'NAMSHI', is_verified: true },
  { id: 'shein', store_name: 'شي إن', logo_bg: '#000000', logo_text: 'SHEIN', logo_text_color: '#FFFFFF', is_verified: true },
  { id: 'vogacloset', store_name: 'فوغا كلوسيت', logo_bg: '#FFFFFF', logo_text: 'VOGA', is_verified: true },
];

// Fallback Category Chips
const CATEGORY_ITEMS = [
  { id: 'all', name: 'الكل', icon: 'grid-outline' },
  { id: 'offers', name: 'العروض 🔥', icon: 'pricetag-outline' },
  { id: 'clothing', name: 'الأزياء', icon: 'shirt-outline' },
  { id: 'beauty', name: 'الجمال والعناية', icon: 'sparkles-outline' },
  { id: 'electronics', name: 'الإلكترونيات', icon: 'hardware-chip-outline' },
  { id: 'perfumes', name: 'العطور', icon: 'flask-outline' },
  { id: 'watches', name: 'الساعات', icon: 'watch-outline' },
];

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const layout = useCustomerLayout();
  const user = useAuthStore((state) => state.user);
  const addToCart = useCartStore((state) => state.addToCart);

  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [wished, setWished] = useState<Set<string>>(new Set());

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

      // Fetch featured products
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
            'id, merchant_id, name, name_ar, base_price, sale_price, rating, total_sold, is_active, is_featured, category_id, og_image_url, stock_quantity, product_images(url:image_url, is_primary, sort_order), merchant_profiles(store_name)'
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

        try {
          const userOrders = await getOrders(user.id);
          const ongoing = userOrders.find(
            (o) => o.status !== 'delivered' && o.status !== 'cancelled'
          );
          if (ongoing) setActiveOrder(ongoing);
        } catch {
          // ignore
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

  const authUser = user as any;
  const userName =
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.full_name ||
    'عزيزنا العميل';

  // Display stores
  const displayStores =
    stores.length > 0
      ? stores.map((s) => ({
          id: s.id,
          store_name: s.store_name,
          logo_url: s.store_logo_url,
          is_verified: true,
        }))
      : MOCKUP_STORES;

  // Categories bar
  const displayCategories = [
    ...CATEGORY_ITEMS.slice(0, 2),
    ...categories.map((c) => ({
      id: c.id,
      name: c.name_ar || c.name,
      icon: 'grid-outline',
    })),
  ];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header Bar following DESIGN-apple.md */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        <CustomerResponsiveShell>
          <View style={styles.headerRow}>
            {/* User Avatar & Greeting (RTL Right side) */}
            <View style={styles.userProfileSection}>
              <View style={styles.avatarCircle}>
                <Image
                  source={{
                    uri:
                      authUser?.user_metadata?.avatar_url ||
                      authUser?.avatar_url ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
                  }}
                  style={styles.avatarImage}
                />
              </View>
              <View style={styles.userGreetingText}>
                <Text style={styles.userNameText}>أهلاً بك، {userName}</Text>
                <Text style={styles.userSubText}>اكتشف أرقى المنتجات والعروض الحصرية</Text>
              </View>
            </View>

            {/* Notification Bell Pill */}
            <TouchableOpacity
              style={styles.bellButton}
              onPress={() => openTab('More', 'Notifications')}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={20} color={APPLE_TOKENS.ink} />
              <View style={styles.bellBadgeDot} />
            </TouchableOpacity>
          </View>
        </CustomerResponsiveShell>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={APPLE_TOKENS.primary} />
        }
      >
        <CustomerResponsiveShell>
          {/* Apple Search Input Component ({component.search-input}) */}
          <View style={styles.searchRow}>
            <TouchableOpacity
              style={styles.searchInput}
              onPress={() => navigation.navigate('Search')}
              activeOpacity={0.9}
            >
              <Ionicons name="search-outline" size={18} color={APPLE_TOKENS.bodyMuted} />
              <Text style={styles.searchPlaceholder}>ابحث عن منتجات، ماركات، ومتاجر...</Text>
            </TouchableOpacity>
          </View>

          {/* Configurator Category Option Chips ({component.configurator-option-chip}) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScrollContent}
          >
            {displayCategories.map((item) => {
              const isSelected = selectedCategory === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.configChip,
                    isSelected && styles.configChipSelected,
                  ]}
                  onPress={() => {
                    setSelectedCategory(item.id);
                    if (item.id === 'offers') {
                      navigation.navigate('Offers');
                    } else if (item.id !== 'all') {
                      navigation.navigate('StoresList', { categoryId: item.id, filter: item.name });
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.configChipText,
                      isSelected && styles.configChipTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Hero Feature Banner Tile ({component.product-tile-dark}) */}
          <View style={styles.heroTileDark}>
            <View style={styles.heroTileTextCol}>
              <Text style={styles.heroTileTagline}>تشكيلة الموسم الجديد</Text>
              <Text style={styles.heroTileTitle}>الفخامة والجودة. في مكان واحد.</Text>
              <Text style={styles.heroTileSub}>تسوق أفضل المنتجات مع خيارات التوصيل السريع.</Text>

              <TouchableOpacity
                style={styles.primaryPillBtn}
                onPress={() => navigation.navigate('Offers')}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryPillBtnText}>استكشف العروض</Text>
                <Ionicons name="arrow-back-outline" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Order Stepper Banner ({component.store-utility-card}) */}
          {activeOrder && (
            <View style={styles.activeOrderCard}>
              <View style={styles.activeOrderRow}>
                <TouchableOpacity
                  style={styles.trackPillBtn}
                  onPress={() => openTab('Orders', 'OrderTracking', { orderId: activeOrder.id })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.trackPillBtnText}>تتبع الطلب 🗺️</Text>
                </TouchableOpacity>

                <View style={styles.activeOrderInfo}>
                  <Text style={styles.activeOrderTitle}>
                    طلب رقم #{activeOrder.order_number}
                  </Text>
                  <Text style={styles.activeOrderSub}>جاري معالجة وتوصيل طلبك</Text>
                </View>
              </View>
            </View>
          )}

          {/* Featured Stores Horizontal Carousel */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleText}>متاجر الشركاء المعتمدة</Text>
            <TouchableOpacity onPress={() => navigation.navigate('StoresList', {})}>
              <Text style={styles.viewAllText}>عرض الكل</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storesScrollContent}
          >
            {displayStores.map((store) => (
              <TouchableOpacity
                key={store.id}
                style={styles.storeCircleCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('StoreDetails', { storeId: store.id })}
              >
                <View style={styles.storeLogoCircle}>
                  {(store as any).logo_url ? (
                    <Image source={{ uri: (store as any).logo_url }} style={styles.storeLogoImg} />
                  ) : (store as any).logo_bg ? (
                    <View style={[styles.storeLogoFallback, { backgroundColor: (store as any).logo_bg }]}>
                      <Text
                        style={[
                          styles.storeLogoFallbackText,
                          (store as any).logo_text_color && { color: (store as any).logo_text_color },
                        ]}
                      >
                        {(store as any).logo_text}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons name="storefront-outline" size={24} color={APPLE_TOKENS.primary} />
                  )}
                  {store.is_verified && (
                    <View style={styles.verifiedCheckBadge}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Text style={styles.storeCircleName} numberOfLines={1}>
                  {store.store_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Section: Products Grid ({component.store-utility-card}) */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleText}>منتجات مختارة لك</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Offers')}>
              <Text style={styles.viewAllText}>عرض الكل</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={APPLE_TOKENS.primary} size="large" />
            </View>
          ) : (
            <View style={styles.productsGridContainer}>
              {products.map((item: any) => {
                const isFavorite = wished.has(item.id);
                const currentPrice = item.sale_price ?? item.base_price;
                const oldPrice = item.sale_price ? item.base_price : null;
                const imgUri = item.og_image_url || item.product_images?.[0]?.url;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.utilityProductCard}
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
                  >
                    {/* Favorite Button */}
                    <TouchableOpacity
                      style={styles.heartButton}
                      onPress={() => void toggleWish(item.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isFavorite ? 'heart' : 'heart-outline'}
                        size={17}
                        color={isFavorite ? '#DC2626' : APPLE_TOKENS.bodyMuted}
                      />
                    </TouchableOpacity>

                    {/* Image Render resting on surface with single product shadow */}
                    <View style={styles.productImageFrame}>
                      {imgUri ? (
                        <Image source={{ uri: imgUri }} style={styles.productImg} resizeMode="contain" />
                      ) : (
                        <Ionicons name="bag-handle-outline" size={38} color={APPLE_TOKENS.bodyMuted} />
                      )}
                    </View>

                    {/* Store Title */}
                    {item.merchant_profiles?.store_name && (
                      <Text style={styles.storeNameText} numberOfLines={1}>
                        {item.merchant_profiles.store_name}
                      </Text>
                    )}

                    {/* Product Name */}
                    <Text style={styles.productTitleText} numberOfLines={2}>
                      {item.name_ar || item.name}
                    </Text>

                    {/* Price & Action Button */}
                    <View style={styles.productPriceRow}>
                      <View style={styles.priceCol}>
                        <Text style={styles.currentPriceText}>
                          {currentPrice}{' '}
                          <Text style={styles.currencyText}>ر.س</Text>
                        </Text>
                        {oldPrice ? (
                          <Text style={styles.oldPriceText}>{oldPrice} ر.س</Text>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={styles.quickAddPillBtn}
                        onPress={() => quickAddToCart(item)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="cart-outline" size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Apple Parchment Footer ({component.footer}) */}
          <View style={styles.appleFooter}>
            <Text style={styles.footerBrandText}>متجر • تصميم إلكتروني متكامل</Text>
            <Text style={styles.footerSubText}>جميع الحقوق محفوظة © {new Date().getFullYear()}</Text>
          </View>
        </CustomerResponsiveShell>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: APPLE_TOKENS.canvas, // Pure White #ffffff
  },
  headerContainer: {
    backgroundColor: APPLE_TOKENS.canvas,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: APPLE_TOKENS.dividerSoft,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  userProfileSection: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
    overflow: 'hidden',
    backgroundColor: APPLE_TOKENS.canvasParchment,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userGreetingText: {
    alignItems: 'flex-end',
  },
  userNameText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: APPLE_TOKENS.ink,
  },
  userSubText: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: APPLE_TOKENS.bodyMuted,
    marginTop: 2,
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: APPLE_TOKENS.canvasParchment,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
    position: 'relative',
  },
  bellBadgeDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: APPLE_TOKENS.primary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  searchRow: {
    marginTop: 14,
    marginBottom: 12,
  },
  searchInput: {
    height: 46,
    borderRadius: 9999, // {rounded.pill}
    backgroundColor: APPLE_TOKENS.canvasParchment,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
    gap: 8,
  },
  searchPlaceholder: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: APPLE_TOKENS.bodyMuted,
    textAlign: 'right',
  },
  categoriesScrollContent: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingVertical: 6,
  },
  configChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9999, // {rounded.pill}
    backgroundColor: APPLE_TOKENS.canvasParchment,
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
  },
  configChipSelected: {
    backgroundColor: APPLE_TOKENS.primary, // Action Blue #0066cc
    borderColor: APPLE_TOKENS.primary,
  },
  configChipText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: APPLE_TOKENS.ink,
  },
  configChipTextSelected: {
    fontFamily: FONTS.bold,
    color: '#FFFFFF',
  },
  heroTileDark: {
    backgroundColor: APPLE_TOKENS.surfaceTileDark, // #1d1d1f
    borderRadius: 20,
    padding: 24,
    marginTop: 16,
    marginBottom: 20,
  },
  heroTileTextCol: {
    alignItems: 'flex-end',
  },
  heroTileTagline: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: APPLE_TOKENS.primaryOnDark, // #2997ff
    marginBottom: 6,
  },
  heroTileTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'right',
  },
  heroTileSub: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: '#A1A1A6',
    marginTop: 6,
    textAlign: 'right',
  },
  primaryPillBtn: {
    backgroundColor: APPLE_TOKENS.primary, // #0066cc
    borderRadius: 9999, // {rounded.pill}
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  primaryPillBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  activeOrderCard: {
    backgroundColor: APPLE_TOKENS.canvasParchment,
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
  },
  activeOrderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeOrderInfo: {
    alignItems: 'flex-end',
  },
  activeOrderTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: APPLE_TOKENS.ink,
  },
  activeOrderSub: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: APPLE_TOKENS.bodyMuted,
    marginTop: 2,
  },
  trackPillBtn: {
    backgroundColor: APPLE_TOKENS.primary,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  trackPillBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  sectionTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: APPLE_TOKENS.ink,
    letterSpacing: -0.3,
  },
  viewAllText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: APPLE_TOKENS.primary,
  },
  storesScrollContent: {
    flexDirection: 'row-reverse',
    gap: 14,
    paddingBottom: 20,
  },
  storeCircleCard: {
    alignItems: 'center',
    width: 72,
  },
  storeLogoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: APPLE_TOKENS.canvasParchment,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
    marginBottom: 6,
    position: 'relative',
  },
  storeLogoImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    resizeMode: 'contain',
  },
  storeLogoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeLogoFallbackText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: APPLE_TOKENS.ink,
  },
  verifiedCheckBadge: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  storeCircleName: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: APPLE_TOKENS.ink,
    textAlign: 'center',
  },
  productsGridContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    paddingBottom: 24,
  },
  utilityProductCard: {
    width: '48.5%',
    backgroundColor: APPLE_TOKENS.canvas,
    borderRadius: 18, // {rounded.lg} 18px
    padding: 14,
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
    position: 'relative',
  },
  heartButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: APPLE_TOKENS.canvasParchment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImageFrame: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  productImg: {
    width: '92%',
    height: '92%',
  },
  storeNameText: {
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    color: APPLE_TOKENS.primary,
    textAlign: 'right',
    marginBottom: 2,
  },
  productTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: APPLE_TOKENS.ink,
    textAlign: 'right',
    marginBottom: 8,
    minHeight: 36,
  },
  productPriceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  currentPriceText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: APPLE_TOKENS.ink,
  },
  currencyText: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: APPLE_TOKENS.bodyMuted,
  },
  oldPriceText: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: APPLE_TOKENS.bodyMuted,
    textDecorationLine: 'line-through',
  },
  quickAddPillBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: APPLE_TOKENS.primary, // Action Blue #0066cc
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleFooter: {
    backgroundColor: APPLE_TOKENS.canvasParchment,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: APPLE_TOKENS.hairline,
  },
  footerBrandText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: APPLE_TOKENS.ink,
  },
  footerSubText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: APPLE_TOKENS.bodyMuted,
    marginTop: 4,
  },
});
