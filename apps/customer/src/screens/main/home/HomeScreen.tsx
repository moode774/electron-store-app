import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Platform, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert } from '../../../components/appAlert';
import {
  addToWishlist, Category, getCategories, getFeaturedProducts,
  getUnreadNotificationsCount, getWishlist, ProductSummary, removeFromWishlist,
  supabase, useAuthStore, useCartStore,
} from '@marketplace/shared-hooks';
import { HomeStackParamList } from '../../../navigation/types';

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

const BENEFITS = [
  { icon: 'cash-outline', title: 'الدفع عند الاستلام', detail: 'ادفع عند وصول الطلب' },
  { icon: 'receipt-outline', title: 'تكلفة واضحة', detail: 'تظهر قبل التأكيد' },
  { icon: 'navigate-outline', title: 'متابعة الطلب', detail: 'من صفحة طلباتي' },
  { icon: 'refresh-outline', title: 'طلب إرجاع', detail: 'حسب سياسة الإرجاع' },
  { icon: 'headset-outline', title: 'مركز مساعدة', detail: 'من داخل التطبيق' },
];

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const desktop = width >= 760;
  const wide = width >= 1440;
  const compact = width < 430;
  const contentWidth = desktop ? Math.min(width - (wide ? 112 : 56), 1680) : width;
  const gutter = desktop ? (wide ? 48 : 28) : (compact ? 16 : 20);
  const productColumns = desktop ? (wide ? 5 : width >= 1080 ? 4 : 3) : 2;
  // Account for sidebar width if desktop and wide enough
  const hasSidebar = desktop && width >= 1280;
  const mainContentWidth = hasSidebar ? (contentWidth - 280 - gutter * 3) : (contentWidth - gutter * 2);
  const productWidth = (mainContentWidth - (productColumns - 1) * 16) / productColumns;
  
  const user = useAuthStore((state) => state.user);
  const cartCount = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));
  const addToCart = useCartStore((state) => state.addToCart);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wished, setWished] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);
  const openTab = (tab: 'Cart' | 'More', screen: string) => {
    (navigation.getParent() as any)?.navigate(tab, { screen });
  };

  const loadData = useCallback(async () => {
    const [categoryResult, productResult] = await Promise.allSettled([getCategories(), getFeaturedProducts(8)]);
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
          // Fail closed: quick-add will open details when variant knowledge is unavailable.
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
      } catch { /* keep browsing available */ }
      getUnreadNotificationsCount(user.id).then(setUnread).catch(() => undefined);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  const refresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const toggleWish = async (id: string) => {
    if (!user?.id) return;
    const next = new Set(wished);
    const isSaved = next.has(id);
    if (isSaved) next.delete(id); else next.add(id);
    setWished(next);
    try { if (isSaved) await removeFromWishlist(user.id, id); else await addToWishlist(user.id, id); } catch { setWished(wished); }
  };

  const quickAdd = (product: ProductSummary) => {
    // The featured-products query intentionally loads only variant identity.
    // If that lookup failed, opening details is safer than creating an optionless item.
    if (product.product_variants === undefined
      || product.product_variants.some((variant) => variant.is_active !== false)) {
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

  const apiCategories = categories.map((c, i) => ({ id: c.id, name: c.name_ar || c.name, icon: FALLBACK_CATEGORIES[i % FALLBACK_CATEGORIES.length].icon }));
  const visibleCategories = categories.length >= 8 
    ? apiCategories.slice(0, 8) 
    : [...apiCategories, ...FALLBACK_CATEGORIES.slice(apiCategories.length, 8)];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#2F63DF" />
      {/* HEADER */}
      <View style={styles.topBar}>
        <View style={[styles.topBarInner, !desktop && styles.topBarInnerMobile, { maxWidth: contentWidth, paddingHorizontal: gutter, height: desktop ? undefined : (compact ? 138 : 148) }]}>
          <TouchableOpacity style={styles.brand} onPress={() => navigation.navigate('HomeMain')} accessibilityRole="button" accessibilityLabel="الصفحة الرئيسية">
            <Image
              source={require('../../../../assets/images/logo.png')}
              style={{ width: 40, height: 40, resizeMode: 'contain' }}
            />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerSearch, !desktop && styles.headerSearchMobile]} onPress={() => navigation.navigate('Search')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="البحث عن منتجات أو متاجر">
            <Ionicons name="search" size={17} color="#7C8BA1" />
            <Text style={styles.headerSearchText}>ابحث عن منتجات أو متاجر</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => openTab('More', 'Notifications')} accessibilityRole="button" accessibilityLabel={`الإشعارات${unread > 0 ? `، ${unread} غير مقروءة` : ''}`}>
            <Ionicons name="notifications-outline" size={20} color={desktop ? '#1E3A8A' : '#FFFFFF'} />
            {unread > 0 && <View style={styles.notificationDot}><Text style={styles.notificationText}>{unread}</Text></View>}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1D4ED8" />}>
        <View style={[styles.page, { maxWidth: contentWidth }]}>
          {/* HERO BANNER */}
          <View style={[styles.heroContainer, { marginHorizontal: gutter, height: desktop ? (wide ? 520 : 440) : (compact ? 238 : 260), marginTop: desktop ? 24 : 18 }, desktop && styles.heroContainerDesktop]}>
             <Image source={desktop ? require('../../../../assets/images/home/premium-hero-desktop.png') : require('../../../../assets/images/home/premium-hero-mobile.png')} style={styles.heroImage} resizeMode="cover" />
             <View style={styles.heroOverlay} />
             <View style={[styles.heroContent, desktop && styles.heroContentDesktop, !desktop && { paddingRight: compact ? 24 : 30, paddingLeft: 18 }]}>
               <Text style={[styles.heroTitle, !desktop && (compact ? styles.heroTitleCompact : styles.heroTitleMobile)]}>كل ما تحب{`\n`}بلمسة فخامة</Text>
               <Text style={[styles.heroDescription, !desktop && styles.heroDescriptionMobile]}>تسوّق أرقى المنتجات بأفضل الأسعار{`\n`}وتجربة تسوق استثنائية</Text>
               <TouchableOpacity style={[styles.heroButton, !desktop && styles.heroButtonMobile]} activeOpacity={0.9} onPress={() => navigation.navigate('Offers')}>
                 <Text style={styles.heroButtonText}>تسوّق الآن</Text>
                 <Ionicons name="chevron-back" size={16} color="#FFFFFF" />
               </TouchableOpacity>
             </View>
             {/* Pagination Dots */}
             <View style={styles.heroDots}>
                <View style={[styles.dot, styles.dotActive]} />
                <View style={styles.dot} />
                <View style={styles.dot} />
             </View>
          </View>

          {/* BENEFITS */}
          <View style={[styles.benefits, { marginHorizontal: gutter }, !desktop && styles.benefitsMobile]}>
            {(desktop ? BENEFITS : BENEFITS.slice(0, 2)).map((item, index, items) => <View key={item.title} style={[styles.benefit, !desktop && styles.benefitMobile, index !== items.length - 1 && styles.benefitBorder]}>
              <View style={styles.benefitIcon}><Ionicons name={item.icon as any} size={22} color="#1E293B" /></View>
              <View style={styles.benefitTextWrap}>
                <Text style={styles.benefitTitle}>{item.title}</Text>
                <Text style={styles.benefitDetail}>{item.detail}</Text>
              </View>
            </View>)}
          </View>

          {/* CATEGORIES */}
          <SectionHeading title="تسوّق حسب الفئة" action="عرض الكل" onPress={() => navigation.navigate('StoresList', {})} gutter={gutter} />
          {desktop ? (
            <View style={[styles.categoryGridContainer, { marginHorizontal: gutter }]}>
              {visibleCategories.map((item) => (
                <TouchableOpacity key={item.id} style={[styles.categoryDesktop, wide && styles.categoryDesktopWide]} onPress={() => navigation.navigate('StoresList', { categoryId: item.id, filter: item.name })} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`عرض فئة ${item.name}`}>
                  <View style={styles.categoryIconDesktop}><Ionicons name={item.icon as any} size={28} color="#2563EB" /></View>
                  <Text style={styles.categoryNameDesktop} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categoryList, { paddingHorizontal: gutter }]}>
              {visibleCategories.slice(0, 6).map((item) => <TouchableOpacity key={item.id} style={[styles.category, compact && styles.categoryCompact]} onPress={() => navigation.navigate('StoresList', { categoryId: item.id, filter: item.name })} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`عرض فئة ${item.name}`}>
                <View style={styles.categoryIcon}><Ionicons name={item.icon as any} size={28} color="#1D4ED8" /></View>
                <Text style={styles.categoryName} numberOfLines={1}>{item.name}</Text>
              </TouchableOpacity>)}
            </ScrollView>
          )}

          {/* PRODUCTS & SIDEBAR */}
          <SectionHeading title="الأكثر مبيعاً" action="عرض الكل" onPress={() => navigation.navigate('StoresList', {})} gutter={gutter} />
          
          <View style={[styles.productsLayout, { marginHorizontal: gutter, flexDirection: hasSidebar ? 'row-reverse' : 'column' }]}>
            {/* Sidebar Promo (Desktop) */}
            {hasSidebar && (
              <View style={styles.sidebarPromo}>
                 <Image source={require('../../../../assets/images/home/premium-hero-mobile.png')} style={styles.sidebarImage} resizeMode="cover" />
                 <View style={styles.sidebarOverlay} />
                 <View style={styles.sidebarContent}>
                    <Text style={styles.sidebarTitle}>عروض حصرية</Text>
                    <Text style={styles.sidebarSubtitle}>خصومات تصل إلى</Text>
                    <Text style={styles.sidebarDiscount}>50%</Text>
                    <TouchableOpacity style={styles.sidebarBtn} onPress={() => navigation.navigate('Offers')}><Text style={styles.sidebarBtnText}>تسوق العروض</Text></TouchableOpacity>
                 </View>
              </View>
            )}

            {/* Product Grid */}
            <View style={[styles.productArea, hasSidebar && { flex: 1, paddingRight: gutter }]}>
              {loading ? <ActivityIndicator color="#1D4ED8" style={styles.loader} /> : products.length === 0 ? <View style={styles.empty}><Ionicons name="cube-outline" size={34} color="#94A3B8" /><Text style={styles.emptyText}>سيتم عرض المنتجات هنا قريباً</Text></View> :
                <View style={styles.productGrid}>{products.map((product) => {
                  const price = product.sale_price ?? product.base_price;
                  const discount = product.sale_price ? Math.round(((product.base_price - product.sale_price) / product.base_price) * 100) : null;
                  const needsVariantSelection = product.product_variants === undefined
                    || product.product_variants.some((variant) => variant.is_active !== false);
                  const quickAddDisabled = !needsVariantSelection && (product.stock_quantity ?? 0) <= 0;
                  return <TouchableOpacity key={product.id} style={[styles.product, { width: productWidth }]} activeOpacity={0.88} onPress={() => navigation.navigate('ProductDetails', { productId: product.id })} accessibilityRole="button" accessibilityLabel={`${product.name}، السعر ${price} ريال يمني`}>
                    <View style={[styles.productMedia, wide && styles.productMediaWide, !desktop && styles.productMediaMobile]}>
                      <ProductImage product={product} />
                      <TouchableOpacity style={styles.wish} onPress={(event) => { event.stopPropagation(); toggleWish(product.id); }} accessibilityRole="button" accessibilityLabel={wished.has(product.id) ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'} accessibilityState={{ selected: wished.has(product.id) }}><Ionicons name={wished.has(product.id) ? 'heart' : 'heart-outline'} size={18} color={wished.has(product.id) ? '#EF4444' : '#94A3B8'} /></TouchableOpacity>
                      {discount ? <View style={styles.discountTag}><Text style={styles.discountText}>-{discount}%</Text></View> : null}
                    </View>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                      <View style={styles.priceRow}>
                        <Text style={styles.price}>{price} <Text style={styles.currency}>ر.ي</Text></Text>
                        {product.sale_price && <Text style={styles.oldPrice}>{product.base_price} ر.ي</Text>}
                      </View>
                      <View style={styles.rating}><Ionicons name="star" size={12} color="#FBBF24" /><Text style={styles.ratingText}>{product.rating.toFixed(1)}</Text></View>
                      <TouchableOpacity style={[styles.quickCart, quickAddDisabled && { opacity: 0.45 }]} onPress={(event) => { event.stopPropagation(); quickAdd(product); }} activeOpacity={0.85} disabled={quickAddDisabled} accessibilityRole="button" accessibilityLabel={needsVariantSelection ? `اختيار خيارات ${product.name}` : `إضافة ${product.name} إلى السلة`} accessibilityState={{ disabled: quickAddDisabled }}>
                        <Ionicons name={needsVariantSelection ? 'options-outline' : 'bag-add-outline'} size={17} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>;
                })}</View>}
            </View>
          </View>


          
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeading({ title, action, onPress, gutter }: { title: string; action: string; onPress: () => void; gutter: number }) {
  return <View style={[styles.sectionHeading, { marginHorizontal: gutter }]}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <TouchableOpacity onPress={onPress} style={styles.sectionAction}>
      <Text style={styles.sectionActionText}>{action}</Text>
    </TouchableOpacity>
  </View>;
}

function ProductImage({ product }: { product: ProductSummary }) {
  const imageCandidates = [
    product.og_image_url,
    ...(product.product_images ?? [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
      .map((image) => image.url),
  ].filter((url): url is string => Boolean(url));
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = imageCandidates[imageIndex];

  if (!imageUrl) return <Ionicons name="cube-outline" size={42} color="#CBD5E1" />;
  return <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="cover" onError={() => setImageIndex((index) => index + 1)} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: { backgroundColor: '#2F63DF', borderBottomWidth: 0 },
  topBarInner: { width: '100%', alignSelf: 'center', height: Platform.OS === 'ios' ? 90 : 68, paddingTop: Platform.OS === 'ios' ? 24 : 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  topBarInnerMobile: { alignItems: 'flex-start', paddingTop: Platform.OS === 'ios' ? 30 : 14 },
  brand: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  brandMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1.6 },
  brandNameCompact: { fontSize: 14, letterSpacing: 1 },
  desktopNav: { flexDirection: 'row-reverse', gap: 6, alignItems: 'center', marginRight: 36 },
  navItem: { color: '#64748B', fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 9 },
  navActive: { color: '#1D4ED8', fontSize: 13, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#EFF6FF', borderRadius: 9 },
  searchBarHeader: { flex: 1, maxWidth: 300, height: 38, backgroundColor: '#F7F9FC', borderRadius: 10, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, marginRight: 'auto', marginLeft: 18, borderWidth: 1, borderColor: '#E8EDF4' },
  searchInputHeader: { flex: 1, color: '#1E3A8A', textAlign: 'right', fontSize: 12, marginRight: 8, fontWeight: '600' },
  headerSearch: { flex: 1, maxWidth: 430, height: 40, backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 13, marginHorizontal: 18, borderWidth: 1, borderColor: '#E6ECF4' },
  headerSearchMobile: { position: 'absolute', left: 0, right: 0, bottom: 16, maxWidth: undefined, height: 54, marginHorizontal: 0, borderRadius: 16, paddingHorizontal: 17, shadowColor: '#1E40AF', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  headerSearchText: { flex: 1, color: '#7C8BA1', textAlign: 'right', fontSize: 12, fontWeight: '600', marginRight: 8 },
  accountArea: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  accountAreaMobile: { gap: 4 },
  iconButton: { position: 'relative', width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' },
  notificationDot: { position: 'absolute', top: -3, right: -3, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  notificationText: { color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' },
  mobileHeaderExtra: { paddingTop: 4, paddingBottom: 18, backgroundColor: '#2563EB' },
  mobileWelcomeRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  mobileWelcome: { color: '#B9C9DE', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  mobileUserName: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'right', marginTop: 2, maxWidth: 180 },
  mobileLocation: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
  mobileLocationText: { color: '#EFF6FF', fontSize: 11, fontWeight: '700' },
  mobileSearch: { height: 54, backgroundColor: '#FFFFFF', borderRadius: 15, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 15, shadowColor: '#1E40AF', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  mobileSearchText: { flex: 1, color: '#7C8BA1', fontSize: 13, fontWeight: '600', textAlign: 'right', marginHorizontal: 12 },
  mobileSearchDivider: { width: 1, height: 26, backgroundColor: '#E6ECF4', marginLeft: 12 },
  scroll: { paddingBottom: 60 },
  page: { width: '100%', alignSelf: 'center' },
  search: { marginTop: 15, height: 50, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  searchIcon: { alignItems: 'center', justifyContent: 'center' },
  searchText: { flex: 1, color: '#94A3B8', fontSize: 13, textAlign: 'right' },
  heroContainer: { height: 420, overflow: 'hidden', borderRadius: 20, marginTop: 20, backgroundColor: '#0B1728', position: 'relative' },
  heroContainerDesktop: { height: 480 },
  heroImage: { width: '100%', height: '100%', position: 'absolute' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 15, 30, 0.4)' },
  heroContent: { position: 'absolute', top: 0, bottom: 0, right: 0, justifyContent: 'center', paddingRight: 40 },
  heroContentDesktop: { paddingRight: 80 },
  heroTitle: { color: '#FFFFFF', fontSize: 36, lineHeight: 48, fontWeight: '900', textAlign: 'right' },
  heroTitleMobile: { fontSize: 30, lineHeight: 39 },
  heroTitleCompact: { fontSize: 27, lineHeight: 35 },
  heroDescription: { color: '#CBD5E1', fontSize: 16, lineHeight: 26, fontWeight: '500', textAlign: 'right', marginTop: 16 },
  heroDescriptionMobile: { fontSize: 13, lineHeight: 20, marginTop: 10 },
  heroButton: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1D4ED8', marginTop: 30, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 14 },
  heroButtonMobile: { marginTop: 18, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  heroButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  heroDots: { position: 'absolute', bottom: 20, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 24, backgroundColor: '#3B82F6' },
  benefits: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 16, marginTop: 20, flexDirection: 'row-reverse', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  benefitsMobile: { paddingVertical: 12, marginTop: 14 },
  benefit: { flex: 1, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 12 },
  benefitMobile: { justifyContent: 'flex-start', paddingHorizontal: 12, gap: 8 },
  benefitBorder: { borderLeftWidth: 1, borderLeftColor: '#F1F5F9' },
  benefitIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  benefitTextWrap: { alignItems: 'flex-end' },
  benefitTitle: { color: '#1E293B', fontSize: 13, fontWeight: '800' },
  benefitDetail: { color: '#64748B', fontSize: 11, marginTop: 2 },
  sectionHeading: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 14 },
  sectionTitle: { color: '#10213C', fontSize: 19, fontWeight: '900' },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionActionText: { color: '#1D4ED8', fontSize: 13, fontWeight: '700' },
  categoryList: { gap: 16, paddingBottom: 10, flexDirection: 'row-reverse' },
  category: { width: 110, height: 110, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  categoryCompact: { width: 94, height: 98, gap: 8, borderRadius: 15 },
  categoryIcon: { width: 50, height: 50, backgroundColor: '#EFF6FF', borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  categoryName: { color: '#334155', fontSize: 13, fontWeight: '700' },
  categoryGridContainer: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 20, width: '100%' },
  categoryDesktop: { width: 125, height: 135, borderRadius: 28, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', shadowColor: '#94A3B8', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  categoryDesktopWide: { width: 148, height: 148, borderRadius: 30 },
  categoryIconDesktop: { width: 58, height: 58, backgroundColor: '#EFF6FF', borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  categoryNameDesktop: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  productsLayout: {},
  sidebarPromo: { width: 280, height: 600, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0B1728' },
  sidebarImage: { width: '100%', height: '100%', position: 'absolute' },
  sidebarOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 15, 30, 0.7)' },
  sidebarContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  sidebarTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginBottom: 10 },
  sidebarSubtitle: { color: '#CBD5E1', fontSize: 16 },
  sidebarDiscount: { color: '#3B82F6', fontSize: 64, fontWeight: '900', marginVertical: 10 },
  sidebarBtn: { backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 20 },
  sidebarBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  productArea: {},
  loader: { marginVertical: 50 },
  empty: { alignItems: 'center', paddingVertical: 60, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { color: '#94A3B8', fontSize: 14, marginTop: 12, fontWeight: '600' },
  productGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16 },
  product: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#E9EEF5', shadowColor: '#0F172A', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  productMedia: { height: 180, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  productMediaWide: { height: 220 },
  productMediaMobile: { height: 158 },
  productImage: { width: '100%', height: '100%' },
  wish: { position: 'absolute', top: 12, left: 12, width: 34, height: 34, backgroundColor: '#FFFFFF', borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  discountTag: { position: 'absolute', top: 12, right: 12, backgroundColor: '#1D4ED8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  discountText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  productInfo: { padding: 13, alignItems: 'flex-end', position: 'relative', minHeight: 106 },
  productName: { color: '#1E293B', fontSize: 14, fontWeight: '700', textAlign: 'right', marginBottom: 8 },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 },
  price: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  currency: { fontSize: 11, fontWeight: '600' },
  oldPrice: { color: '#94A3B8', fontSize: 12, textDecorationLine: 'line-through' },
  rating: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  ratingText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  quickCart: { position: 'absolute', left: 12, bottom: 12, width: 33, height: 33, borderRadius: 11, backgroundColor: '#123D80', alignItems: 'center', justifyContent: 'center' },
  footer: { backgroundColor: '#0B1728', borderRadius: 20, marginTop: 40, padding: 32, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 32, justifyContent: 'space-between' },
  footerSection: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, minWidth: 200 },
  footerIcon: { width: 50, height: 50, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  footerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'right', marginBottom: 4 },
  footerSub: { color: '#94A3B8', fontSize: 12, textAlign: 'right' },
  newsletter: { minWidth: 280, flex: 1 },
  newsletterTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'right', marginBottom: 6 },
  newsletterSub: { color: '#94A3B8', fontSize: 13, textAlign: 'right', marginBottom: 16 },
  newsletterInputWrap: { flexDirection: 'row-reverse', height: 48, backgroundColor: '#1E293B', borderRadius: 10, overflow: 'hidden' },
  newsletterInput: { flex: 1, paddingHorizontal: 16, color: '#FFFFFF', textAlign: 'right', fontSize: 13 },
  newsletterBtn: { width: 56, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' },
});
