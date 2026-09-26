import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
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
  OrderSummary,
  ProductSummary,
  removeFromWishlist,
  StoreSummary,
  supabase,
  useAuthStore,
  useCartStore,
} from '@marketplace/shared-hooks';
import { COLORS, FONTS } from '../../../theme/customerTheme';
import { HomeStackParamList } from '../../../navigation/types';
import { CustomerResponsiveShell, useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { CustomerProductCard } from '../../../components/customer/CustomerProductCard';
import { CustomerSearchField } from '../../../components/customer/CustomerSearchField';
import { CustomerSectionHeader } from '../../../components/customer/CustomerSectionHeader';

type Navigation = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
type Props = { navigation: Navigation };

// ألوان محايدة لشعارات المتاجر التي لا صورة لها (عرض فقط — ليست بيانات)
const STORE_LOGO_COLORS = ['#EDF2FC', '#EAF1FA', '#E8EFF9', '#F1F4FA', '#E8F0F7', '#EFF2F9'];

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

const HERO_IMAGE = require('../../../../assets/images/home/premium-hero-desktop.png');

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
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wished, setWished] = useState<Set<string>>(new Set());

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

        try {
          const userOrders = await getOrders(user.id);
          const ongoing = userOrders.find(
            (o) => o.status !== 'delivered' && o.status !== 'cancelled'
          );
          if (ongoing) setActiveOrder(ongoing);
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
          logo_text_color: COLORS.primary,
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
                <Ionicons name="location" size={17} color={COLORS.primary} />
                <Text style={styles.locationValueText}>
                  {defaultCity || 'اختر عنوان التوصيل'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.notifCircleBtn}
              activeOpacity={0.8}
              onPress={() => openTab('More', 'Notifications')}
              accessibilityRole="button"
              accessibilityLabel="الإشعارات"
            >
              <Ionicons name="notifications" size={20} color={COLORS.primary} />
              {unreadCount > 0 && <View style={styles.notifCircleBadgeDot} />}
            </TouchableOpacity>
          </View>

          <View style={styles.welcomeBlock}>
            <Text style={styles.welcomeEyebrow}>وجهتك لكل جديد</Text>
            <Text style={styles.welcomeTitle}>تسوّق على ذوقك.</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />
        }
      >
        <CustomerResponsiveShell>
          {/* Active Order Card if present */}
          {activeOrder ? (
            <View style={styles.activeOrderCard}>
              <View style={styles.activeOrderIconWrap}>
                <Ionicons name="navigate" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.activeOrderInfo}>
                <Text style={styles.activeOrderTitle}>طلبك رقم #{activeOrder.order_number}</Text>
                <Text style={styles.activeOrderSub}>قيد المعالجة الآن — تابع حالته لحظة بلحظة</Text>
              </View>
              <TouchableOpacity
                style={styles.trackButton}
                onPress={() => openTab('Orders', 'OrderTracking', { orderId: activeOrder.id })}
                activeOpacity={0.86}
              >
                <Text style={styles.trackButtonText}>تتبع</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <ImageBackground source={HERO_IMAGE} resizeMode="cover" style={[styles.heroCard, isTabletUp && styles.heroCardWide]} imageStyle={styles.heroImage}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>اختيارات تستحق الاكتشاف</Text>
              <Text style={styles.heroTitle}>كل جديد،{ '\n' }على ذوقك.</Text>
              <Text style={styles.heroSub}>منتجات مميزة من متاجر تثق بها</Text>
              <TouchableOpacity style={styles.heroButton} onPress={() => navigation.navigate('Offers')} activeOpacity={0.86}>
                <Text style={styles.heroButtonText}>اكتشف العروض</Text>
                <Ionicons name="arrow-back" size={16} color={COLORS.primaryDark} />
              </TouchableOpacity>
            </View>
          </ImageBackground>

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
                <Ionicons name="storefront-outline" size={22} color={COLORS.textMuted} />
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
                    <Ionicons name="storefront-outline" size={24} color={COLORS.primary} />
                  )}
                  {store.is_verified ? (
                    <View style={styles.verifiedCircleBadge}>
                      <Ionicons name="checkmark" size={10} color={COLORS.surface} />
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
    paddingBottom: 18,
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
    color: COLORS.textMuted,
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
    color: COLORS.primary,
  },
  notifCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.primarySoft,
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
    borderColor: COLORS.surface,
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
    backgroundColor: COLORS.primarySoft,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchPlaceholderText: {
    flex: 1,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 13,
    textAlign: 'right',
  },
  darkFilterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primary, // Deep Dark Slate filter button matching screenshot
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  scrollContent: {
    paddingBottom: 96,
    paddingTop: 18,
  },
  welcomeBlock: {
    alignItems: 'flex-end',
    marginTop: 14,
    marginBottom: 16,
  },
  welcomeEyebrow: {
    color: COLORS.primaryLight,
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    textAlign: 'right',
  },
  welcomeTitle: {
    marginTop: 2,
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 26,
    lineHeight: 36,
    textAlign: 'right',
  },
  heroCard: {
    minHeight: 218,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: COLORS.primaryDark,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroCardWide: {
    minHeight: 280,
  },
  heroImage: {
    borderRadius: 26,
  },
  heroCopy: {
    width: '58%',
    alignItems: 'flex-end',
    paddingRight: 18,
    paddingVertical: 18,
  },
  heroEyebrow: {
    color: '#D9BD8C',
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    textAlign: 'right',
  },
  heroTitle: {
    marginTop: 7,
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 23,
    lineHeight: 31,
    textAlign: 'right',
  },
  heroSub: {
    marginTop: 4,
    color: '#DEE7F5',
    fontFamily: FONTS.regular,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'right',
  },
  heroButton: {
    minHeight: 38,
    marginTop: 13,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroButtonText: {
    color: COLORS.primaryDark,
    fontFamily: FONTS.bold,
    fontSize: 11,
  },
  activeOrderCard: {
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  activeOrderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  activeOrderInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  activeOrderTitle: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
    fontSize: 13.5,
  },
  activeOrderSub: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    marginTop: 3,
    textAlign: 'right',
  },
  trackButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  trackButtonText: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 12.5,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 12,
  },
  sectionTitleBold: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
    fontSize: 18,
    textAlign: 'right',
  },
  seeAllLink: {
    color: COLORS.textSecondary,
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
    borderRadius: 21,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
  },
  storeCircleItem: {
    alignItems: 'center',
    width: 74,
  },
  storeCircleWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  storeCircleLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    resizeMode: 'cover',
  },
  storeCircleLogoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
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
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  storeCircleName: {
    width: '100%',
    color: COLORS.primary,
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
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timerText: {
    color: COLORS.primary,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  flashPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  flashPillText: {
    color: '#475569',
    fontFamily: FONTS.medium,
    fontSize: 12.5,
  },
  flashPillTextSelected: {
    color: COLORS.surface,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  productMedia: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1.08,
    backgroundColor: COLORS.background,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  discountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  discountText: {
    color: COLORS.surface,
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
    borderColor: COLORS.border,
  },
  productBody: {
    minHeight: 126,
    padding: 12,
    alignItems: 'flex-end',
  },
  productStore: {
    maxWidth: '100%',
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
    fontSize: 10.5,
    marginBottom: 3,
  },
  productName: {
    width: '100%',
    minHeight: 38,
    color: COLORS.primary,
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
    color: COLORS.primary,
    fontFamily: FONTS.bold,
    fontSize: 11.5,
  },
  soldText: {
    color: COLORS.textMuted,
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
    color: COLORS.primary,
    fontFamily: FONTS.bold,
    fontSize: 15.5,
  },
  currencyText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.medium,
    fontSize: 10.5,
  },
  oldPriceText: {
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.primary,
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
