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
  getCategories,
  getFeaturedProducts,
  getUnreadNotificationsCount,
  getWishlist,
  ProductSummary,
  removeFromWishlist,
  supabase,
  useAuthStore,
  useCartStore,
} from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { HomeStackParamList } from '../../../navigation/types';
import { CustomerProductCard } from '../../../components/customer/CustomerProductCard';
import { CustomerResponsiveShell, useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { CustomerSearchField } from '../../../components/customer/CustomerSearchField';
import { CustomerSectionHeader } from '../../../components/customer/CustomerSectionHeader';

type Navigation = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
type Props = { navigation: Navigation };

const FALLBACK_CATEGORIES = [
  { id: 'sports', name: 'الرياضة', icon: 'barbell-outline' },
  { id: 'accessories', name: 'الإكسسوارات', icon: 'glasses-outline' },
  { id: 'bags', name: 'الحقائب', icon: 'briefcase-outline' },
  { id: 'shoes', name: 'الأحذية', icon: 'footsteps-outline' },
  { id: 'clothing', name: 'الملابس', icon: 'shirt-outline' },
  { id: 'perfumes', name: 'العطور', icon: 'color-wand-outline' },
  { id: 'watches', name: 'الساعات', icon: 'watch-outline' },
  { id: 'electronics', name: 'الإلكترونيات', icon: 'headset-outline' },
];

const CATEGORY_TONES = [
  { backgroundColor: COLORS.primarySoft, color: COLORS.primary },
  { backgroundColor: COLORS.secondarySoft, color: '#596D1F' },
  { backgroundColor: COLORS.accentCoralSoft, color: COLORS.accentCoral },
  { backgroundColor: COLORS.accentMintSoft, color: COLORS.success },
];

const BENEFITS = [
  { icon: 'cash-outline', title: 'الدفع عند الاستلام', detail: 'ادفع عند وصول طلبك', tone: COLORS.secondarySoft },
  { icon: 'navigate-outline', title: 'تتبّع واضح', detail: 'تابع طلبك خطوة بخطوة', tone: COLORS.primarySoft },
  { icon: 'refresh-outline', title: 'إرجاع منظّم', detail: 'حسب سياسة الإرجاع', tone: COLORS.accentCoralSoft },
  { icon: 'headset-outline', title: 'دعم قريب', detail: 'مركز المساعدة داخل التطبيق', tone: COLORS.accentMintSoft },
];

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const layout = useCustomerLayout();
  const productColumns = layout.width < 560 ? 2 : layout.width < 900 ? 3 : layout.width < 1240 ? 4 : 5;
  const productGap = layout.compact ? 10 : 16;
  const productWidth = (layout.usableWidth - productGap * (productColumns - 1)) / productColumns;
  const user = useAuthStore((state) => state.user);
  const addToCart = useCartStore((state) => state.addToCart);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wished, setWished] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);

  const openTab = (tab: 'More', screen: string) => {
    (navigation.getParent() as any)?.navigate(tab, { screen });
  };

  const loadData = useCallback(async () => {
    const [categoryResult, productResult] = await Promise.allSettled([
      getCategories(),
      getFeaturedProducts(8),
    ]);

    if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value);
    if (productResult.status === 'fulfilled') {
      const featured = productResult.value;
      if (featured.length === 0) {
        setProducts([]);
      } else {
        const { data: variantRows, error: variantError } = await supabase
          .from('product_variants')
          .select('id, product_id, is_active')
          .in('product_id', featured.map((product) => product.id))
          .eq('is_active', true);

        if (variantError) {
          setProducts(featured);
        } else {
          const variantsByProduct = new Map<string, { id: string; is_active: boolean }[]>();
          for (const row of variantRows ?? []) {
            const current = variantsByProduct.get(row.product_id) ?? [];
            current.push({ id: row.id, is_active: row.is_active !== false });
            variantsByProduct.set(row.product_id, current);
          }
          setProducts(featured.map((product) => ({
            ...product,
            product_variants: variantsByProduct.get(product.id) ?? [],
          })));
        }
      }
    }

    if (user?.id) {
      try {
        const wishlist = await getWishlist(user.id);
        setWished(new Set(wishlist.map((item) => item.product_id)));
      } catch {
        // Keep browsing available when wishlist loading fails.
      }
      getUnreadNotificationsCount(user.id).then(setUnread).catch(() => undefined);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void loadData(); }, [loadData]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleWish = async (id: string) => {
    if (!user?.id) return;
    const next = new Set(wished);
    const isSaved = next.has(id);
    if (isSaved) next.delete(id); else next.add(id);
    setWished(next);
    try {
      if (isSaved) await removeFromWishlist(user.id, id);
      else await addToWishlist(user.id, id);
    } catch {
      setWished(wished);
    }
  };

  const quickAdd = (product: ProductSummary) => {
    if (
      product.product_variants === undefined
      || product.product_variants.some((variant) => variant.is_active !== false)
    ) {
      navigation.navigate('ProductDetails', { productId: product.id });
      return;
    }
    if (Number(product.stock_quantity ?? 0) <= 0) {
      Alert.alert('نفد المخزون', 'هذا المنتج غير متاح للإضافة حالياً.');
      return;
    }
    addToCart({
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.sale_price ?? product.base_price,
      emoji: '🛍️',
      quantity: 1,
      maxQuantity: product.stock_quantity ?? undefined,
      storeId: product.merchant_id,
      storeName: product.merchant_profiles?.store_name ?? '',
      image: product.og_image_url ?? product.product_images?.[0]?.url,
    });
  };

  const apiCategories = categories.map((category, index) => ({
    id: category.id,
    name: category.name_ar || category.name,
    icon: FALLBACK_CATEGORIES[index % FALLBACK_CATEGORIES.length].icon,
  }));
  const visibleCategories = categories.length >= 8
    ? apiCategories.slice(0, 8)
    : [...apiCategories, ...FALLBACK_CATEGORIES.slice(apiCategories.length, 8)];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <CustomerResponsiveShell style={[styles.headerInner, !layout.tablet && styles.headerInnerMobile]}>
          <View style={styles.headerMainRow}>
            <TouchableOpacity
              style={styles.brand}
              onPress={() => navigation.navigate('HomeMain')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="الصفحة الرئيسية"
            >
              <View style={styles.brandMark}>
                <Image source={require('../../../../assets/images/logo.png')} style={styles.logo} />
              </View>
              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>متجر اليمن</Text>
                <Text style={styles.brandCaption}>اختياراتك في مكان واحد</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationButton}
              onPress={() => openTab('More', 'Notifications')}
              accessibilityRole="button"
              accessibilityLabel={`الإشعارات${unread > 0 ? `، ${unread} غير مقروءة` : ''}`}
            >
              <Ionicons name="notifications-outline" size={21} color={COLORS.textPrimary} />
              {unread > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <CustomerSearchField
            containerStyle={[styles.headerSearch, !layout.tablet && styles.headerSearchMobile]}
            onPress={() => navigation.navigate('Search')}
          />
        </CustomerResponsiveShell>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
      >
        <CustomerResponsiveShell>
          <View style={[styles.hero, layout.desktop && styles.heroDesktop]}>
            <View style={styles.heroOrbLarge} />
            <View style={styles.heroOrbSmall} />
            <View style={[styles.heroCopy, layout.desktop && styles.heroCopyDesktop]}>
              <View style={styles.heroEyebrow}>
                <Ionicons name="sparkles" size={14} color={COLORS.textPrimary} />
                <Text style={styles.heroEyebrowText}>تجربة تسوّق أذكى</Text>
              </View>
              <Text style={[styles.heroTitle, layout.compact && styles.heroTitleCompact]}>
                كل ما تحب،{`\n`}بأسلوب أبسط.
              </Text>
              <Text style={styles.heroDescription}>
                اكتشف منتجات موثوقة، عروض حقيقية، وتتبع طلبك من مكان واحد.
              </Text>
              <TouchableOpacity
                style={styles.heroButton}
                onPress={() => navigation.navigate('Offers')}
                activeOpacity={0.86}
                accessibilityRole="button"
              >
                <Text style={styles.heroButtonText}>اكتشف العروض</Text>
                <Ionicons name="arrow-back" size={17} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {layout.desktop ? (
              <View style={styles.heroVisual} pointerEvents="none">
                <View style={styles.heroVisualCardMain}>
                  <View style={styles.heroBagIcon}>
                    <Ionicons name="bag-handle" size={48} color={COLORS.surface} />
                  </View>
                  <Text style={styles.heroVisualLabel}>اختيارات اليوم</Text>
                  <Text style={styles.heroVisualValue}>خصم حتى 50%</Text>
                </View>
                <View style={styles.heroFloatingCard}>
                  <View style={styles.heroFloatingIcon}>
                    <Ionicons name="flash" size={18} color={COLORS.accentCoral} />
                  </View>
                  <View>
                    <Text style={styles.heroFloatingTitle}>توصيل أسرع</Text>
                    <Text style={styles.heroFloatingSub}>وتتبّع لحظي</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {layout.tablet ? (
            <View style={styles.benefitsGrid}>
              {BENEFITS.map((item) => <Benefit key={item.title} {...item} />)}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.benefitsList}
            >
              {BENEFITS.map((item) => <Benefit key={item.title} {...item} compact />)}
            </ScrollView>
          )}

          <CustomerSectionHeader
            eyebrow="استكشف بسهولة"
            title="تسوّق حسب الفئة"
            actionLabel="عرض الكل"
            onActionPress={() => navigation.navigate('StoresList', {})}
          />

          {layout.tablet ? (
            <View style={styles.categoryGrid}>
              {visibleCategories.map((item, index) => (
                <CategoryCard
                  key={item.id}
                  item={item}
                  index={index}
                  onPress={() => navigation.navigate('StoresList', { categoryId: item.id, filter: item.name })}
                />
              ))}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryList}
            >
              {visibleCategories.map((item, index) => (
                <CategoryCard
                  key={item.id}
                  item={item}
                  index={index}
                  compact
                  onPress={() => navigation.navigate('StoresList', { categoryId: item.id, filter: item.name })}
                />
              ))}
            </ScrollView>
          )}

          <CustomerSectionHeader
            eyebrow="الأكثر طلباً"
            title="منتجات تستحق التجربة"
            actionLabel="عرض الكل"
            onActionPress={() => navigation.navigate('StoresList', {})}
          />

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.primary} size="large" />
            </View>
          ) : products.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="bag-handle-outline" size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>المنتجات قادمة قريباً</Text>
              <Text style={styles.emptyText}>ستظهر هنا أفضل اختيارات المتاجر المتاحة.</Text>
            </View>
          ) : (
            <View style={[styles.productGrid, { gap: productGap }]}>
              {products.map((product) => {
                const needsVariantSelection = product.product_variants === undefined
                  || product.product_variants.some((variant) => variant.is_active !== false);
                const quickAddDisabled = !needsVariantSelection && (product.stock_quantity ?? 0) <= 0;
                return (
                  <CustomerProductCard
                    key={product.id}
                    product={product}
                    style={{ width: productWidth }}
                    favorite={wished.has(product.id)}
                    onPress={() => navigation.navigate('ProductDetails', { productId: product.id })}
                    onToggleFavorite={() => void toggleWish(product.id)}
                    onQuickAction={() => quickAdd(product)}
                    quickActionNeedsOptions={needsVariantSelection}
                    quickActionDisabled={quickAddDisabled}
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

function Benefit({
  icon,
  title,
  detail,
  tone,
  compact = false,
}: {
  icon: string;
  title: string;
  detail: string;
  tone: string;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.benefitCard, compact && styles.benefitCardCompact]}>
      <View style={[styles.benefitIcon, { backgroundColor: tone }]}>
        <Ionicons name={icon as any} size={21} color={COLORS.textPrimary} />
      </View>
      <View style={styles.benefitCopy}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function CategoryCard({
  item,
  index,
  compact = false,
  onPress,
}: {
  item: { id: string; name: string; icon: string };
  index: number;
  compact?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const tone = CATEGORY_TONES[index % CATEGORY_TONES.length];
  return (
    <TouchableOpacity
      style={[styles.categoryCard, compact && styles.categoryCardCompact]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`عرض فئة ${item.name}`}
    >
      <View style={[styles.categoryIcon, { backgroundColor: tone.backgroundColor }]}>
        <Ionicons name={item.icon as any} size={25} color={tone.color} />
      </View>
      <Text style={styles.categoryName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    zIndex: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: 'rgba(248,247,251,0.98)',
  },
  headerInner: {
    minHeight: 82,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
    paddingVertical: 12,
  },
  headerInnerMobile: {
    minHeight: 130,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 10,
  },
  headerMainRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
  },
  logo: {
    width: 39,
    height: 39,
    resizeMode: 'contain',
  },
  brandCopy: {
    alignItems: 'flex-end',
  },
  brandName: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 15,
  },
  brandCaption: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    marginTop: 1,
  },
  headerSearch: {
    flex: 1,
    maxWidth: 600,
  },
  headerSearchMobile: {
    width: '100%',
    maxWidth: undefined,
  },
  notificationButton: {
    width: 46,
    height: 46,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: COLORS.background,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentCoral,
  },
  notificationBadgeText: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 8,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 44,
  },
  hero: {
    minHeight: 330,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 24,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
  },
  heroDesktop: {
    minHeight: 430,
    paddingHorizontal: 58,
  },
  heroOrbLarge: {
    position: 'absolute',
    width: 350,
    height: 350,
    top: -170,
    left: -80,
    borderRadius: 175,
    backgroundColor: 'rgba(200,241,105,0.30)',
  },
  heroOrbSmall: {
    position: 'absolute',
    width: 130,
    height: 130,
    right: -35,
    bottom: -35,
    borderRadius: 65,
    backgroundColor: 'rgba(255,107,102,0.34)',
  },
  heroCopy: {
    zIndex: 2,
    maxWidth: 590,
    alignItems: 'flex-end',
  },
  heroCopyDesktop: {
    width: '52%',
  },
  heroEyebrow: {
    minHeight: 34,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.secondary,
  },
  heroEyebrowText: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  heroTitle: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 42,
    lineHeight: 58,
    textAlign: 'right',
    marginTop: 17,
  },
  heroTitleCompact: {
    fontSize: 31,
    lineHeight: 43,
  },
  heroDescription: {
    maxWidth: 520,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'right',
    marginTop: 9,
  },
  heroButton: {
    minHeight: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 19,
    borderRadius: 16,
    backgroundColor: COLORS.secondary,
    marginTop: 21,
  },
  heroButtonText: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 13,
  },
  heroVisual: {
    position: 'absolute',
    left: 62,
    top: 58,
    bottom: 58,
    width: '35%',
  },
  heroVisualCardMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: RADIUS.xxl,
    backgroundColor: 'rgba(255,255,255,0.14)',
    transform: [{ rotate: '-4deg' }],
  },
  heroBagIcon: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 31,
    backgroundColor: 'rgba(23,21,31,0.30)',
  },
  heroVisualLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: FONTS.medium,
    fontSize: 12,
    marginTop: 18,
  },
  heroVisualValue: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 25,
    marginTop: 3,
  },
  heroFloatingCard: {
    position: 'absolute',
    right: -26,
    bottom: 26,
    minWidth: 170,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  heroFloatingIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.accentCoralSoft,
  },
  heroFloatingTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    textAlign: 'right',
  },
  heroFloatingSub: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    textAlign: 'right',
  },
  benefitsGrid: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 16,
  },
  benefitsList: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingTop: 14,
    paddingBottom: 4,
  },
  benefitCard: {
    flex: 1,
    minHeight: 88,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  benefitCardCompact: {
    width: 230,
    flex: 0,
  },
  benefitIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  benefitCopy: {
    flex: 1,
    alignItems: 'flex-end',
  },
  benefitTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    textAlign: 'right',
  },
  benefitDetail: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 10,
    textAlign: 'right',
    marginTop: 2,
  },
  categoryGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  categoryList: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingBottom: 4,
  },
  categoryCard: {
    width: 140,
    minHeight: 124,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  categoryCardCompact: {
    width: 104,
    minHeight: 110,
  },
  categoryIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  categoryName: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 12,
    textAlign: 'center',
  },
  loadingState: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: COLORS.primarySoft,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 16,
    marginTop: 14,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  productGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
});
