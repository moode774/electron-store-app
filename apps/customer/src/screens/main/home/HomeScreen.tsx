import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Platform, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addToWishlist, Category, getCategories, getFeaturedProducts,
  getUnreadNotificationsCount, getWishlist, ProductSummary, removeFromWishlist,
  useAuthStore, useCartStore,
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
  { icon: 'shield-checkmark-outline', title: 'دفع آمن 100%', detail: 'حماية بياناتك' },
  { icon: 'car-outline', title: 'توصيل سريع', detail: 'خلال 24 ساعة' },
  { icon: 'refresh-outline', title: 'إرجاع سهل', detail: '14 يوم استرجاع' },
  { icon: 'ribbon-outline', title: 'منتجات أصلية', detail: '100% مضمونة' },
  { icon: 'headset-outline', title: 'دعم عملاء 24/7', detail: 'نحن هنا لمساعدتك' },
];

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const desktop = width >= 880;
  const contentWidth = Math.min(width, 1320);
  const gutter = desktop ? 36 : 18;
  const productColumns = desktop ? (width >= 1180 ? 4 : 3) : 2;
  // Account for sidebar width if desktop and wide enough
  const hasSidebar = desktop && width >= 1024;
  const mainContentWidth = hasSidebar ? (contentWidth - 280 - gutter * 3) : (contentWidth - gutter * 2);
  const productWidth = (mainContentWidth - (productColumns - 1) * 16) / productColumns;
  
  const user = useAuthStore((state) => state.user);
  const cartCount = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));
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
    if (productResult.status === 'fulfilled') setProducts(productResult.value);
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

  const apiCategories = categories.map((c, i) => ({ id: c.id, name: c.name_ar || c.name, icon: FALLBACK_CATEGORIES[i % FALLBACK_CATEGORIES.length].icon }));
  const visibleCategories = categories.length >= 8 
    ? apiCategories.slice(0, 8) 
    : [...apiCategories, ...FALLBACK_CATEGORIES.slice(apiCategories.length, 8)];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1728" />
      {/* HEADER */}
      <View style={styles.topBar}>
        <View style={[styles.topBarInner, { maxWidth: contentWidth, paddingHorizontal: gutter }]}>
          <TouchableOpacity style={styles.brand} onPress={() => navigation.navigate('HomeMain')}>
            <View style={styles.brandMark}><Ionicons name="sparkles" size={17} color="#1D4ED8" /></View>
            <Text style={styles.brandName}>N E X O R A</Text>
          </TouchableOpacity>
          {desktop && <View style={styles.desktopNav}>
            <Text style={styles.navActive}>الرئيسية</Text>
            <Text style={styles.navItem}>الأقسام</Text>
            <Text style={styles.navItem}>العروض</Text>
            <Text style={styles.navItem}>وصل حديثاً</Text>
          </View>}
          {desktop && <View style={styles.searchBarHeader}>
            <Ionicons name="search" size={18} color="#64748B" />
            <TextInput placeholder="ابحث عن منتجات..." placeholderTextColor="#64748B" style={styles.searchInputHeader} />
          </View>}
          <View style={styles.accountArea}>
            <TouchableOpacity style={styles.iconButton} onPress={() => openTab('More', 'AccountMain')}>
              <Ionicons name="person-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => openTab('More', 'Favorites')}>
              <Ionicons name="heart-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => openTab('Cart', 'CartMain')}>
              <Ionicons name="bag-handle-outline" size={22} color="#FFFFFF" />
              {cartCount > 0 && <View style={styles.notificationDot}><Text style={styles.notificationText}>{cartCount}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => openTab('More', 'Notifications')}>
              <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
              {unread > 0 && <View style={styles.notificationDot}><Text style={styles.notificationText}>{unread}</Text></View>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1D4ED8" />}>
        <View style={[styles.page, { maxWidth: contentWidth }]}>
          {/* MOBILE SEARCH */}
          {!desktop && <TouchableOpacity style={[styles.search, { marginHorizontal: gutter }]} onPress={() => navigation.navigate('Search')} activeOpacity={0.85}>
            <View style={styles.searchIcon}><Ionicons name="search" size={19} color="#94A3B8" /></View>
            <Text style={styles.searchText}>ابحث عن منتجات...</Text>
          </TouchableOpacity>}

          {/* HERO BANNER */}
          <View style={[styles.heroContainer, { marginHorizontal: gutter }, desktop && styles.heroContainerDesktop]}>
             <Image source={desktop ? require('../../../../assets/images/home/premium-hero-desktop.png') : require('../../../../assets/images/home/premium-hero-mobile.png')} style={styles.heroImage} resizeMode="cover" />
             <View style={styles.heroOverlay} />
             <View style={[styles.heroContent, desktop && styles.heroContentDesktop]}>
               <Text style={styles.heroTitle}>كل ما تحب{`\n`}بلمسة فخامة</Text>
               <Text style={styles.heroDescription}>تسوّق أرقى المنتجات بأفضل الأسعار{`\n`}وتجربة تسوق استثنائية</Text>
               <TouchableOpacity style={styles.heroButton} activeOpacity={0.9} onPress={() => navigation.navigate('Offers')}>
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
          <View style={[styles.benefits, { marginHorizontal: gutter }]}>
            {BENEFITS.map((item, index) => <View key={item.title} style={[styles.benefit, index !== BENEFITS.length - 1 && styles.benefitBorder]}>
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
                <TouchableOpacity key={item.id} style={styles.categoryDesktop} onPress={() => navigation.navigate('StoresList', { categoryId: item.id })} activeOpacity={0.8}>
                  <View style={styles.categoryIconDesktop}><Ionicons name={item.icon as any} size={28} color="#2563EB" /></View>
                  <Text style={styles.categoryNameDesktop} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categoryList, { paddingHorizontal: gutter }]}>
              {visibleCategories.map((item) => <TouchableOpacity key={item.id} style={styles.category} onPress={() => navigation.navigate('StoresList', { categoryId: item.id })} activeOpacity={0.8}>
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
                <View style={styles.productGrid}>{products.map((product, idx) => {
                  const price = product.sale_price ?? product.base_price;
                  const discount = product.sale_price ? Math.round(((product.base_price - product.sale_price) / product.base_price) * 100) : null;
                  // Fake discounts for demo purposes if not present
                  const displayDiscount = discount || [10, 20, 15, 25, 30][idx % 5];
                  
                  return <TouchableOpacity key={product.id} style={[styles.product, { width: productWidth }]} activeOpacity={0.88} onPress={() => navigation.navigate('ProductDetails', { productId: product.id })}>
                    <View style={styles.productMedia}>
                      <ProductImage product={product} />
                      <TouchableOpacity style={styles.wish} onPress={() => toggleWish(product.id)}><Ionicons name={wished.has(product.id) ? 'heart' : 'heart-outline'} size={18} color={wished.has(product.id) ? '#EF4444' : '#94A3B8'} /></TouchableOpacity>
                      <View style={styles.discountTag}><Text style={styles.discountText}>-{displayDiscount}%</Text></View>
                    </View>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                      <View style={styles.priceRow}>
                        <Text style={styles.price}>{price} <Text style={styles.currency}>ر.س</Text></Text>
                        {product.sale_price && <Text style={styles.oldPrice}>{product.base_price} ر.س</Text>}
                        {!product.sale_price && <Text style={styles.oldPrice}>{price + Math.floor(price * 0.2)} ر.س</Text>}
                      </View>
                      <View style={styles.rating}><Ionicons name="star" size={12} color="#FBBF24" /><Text style={styles.ratingText}>{product.rating.toFixed(1)}</Text></View>
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
  topBar: { backgroundColor: '#0B1728' },
  topBarInner: { width: '100%', alignSelf: 'center', height: Platform.OS === 'ios' ? 98 : 76, paddingTop: Platform.OS === 'ios' ? 29 : 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 32, height: 32, borderRadius: 11, backgroundColor: 'rgba(29, 78, 216, 0.1)', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  desktopNav: { flexDirection: 'row', gap: 32, alignItems: 'center', flex: 1, paddingRight: 40, justifyContent: 'center' },
  navItem: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  navActive: { color: '#3B82F6', fontSize: 14, fontWeight: '700', borderBottomWidth: 2, borderBottomColor: '#3B82F6', paddingBottom: 4 },
  searchBarHeader: { flex: 1, maxWidth: 350, height: 42, backgroundColor: '#1E293B', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginRight: 20 },
  searchInputHeader: { flex: 1, color: '#FFFFFF', textAlign: 'right', fontSize: 13, marginLeft: 10 },
  accountArea: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconButton: { position: 'relative' },
  notificationDot: { position: 'absolute', top: -5, right: -5, backgroundColor: '#3B82F6', borderRadius: 10, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0B1728' },
  notificationText: { color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' },
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
  heroDescription: { color: '#CBD5E1', fontSize: 16, lineHeight: 26, fontWeight: '500', textAlign: 'right', marginTop: 16 },
  heroButton: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1D4ED8', marginTop: 30, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 14 },
  heroButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  heroDots: { position: 'absolute', bottom: 20, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 24, backgroundColor: '#3B82F6' },
  benefits: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 16, marginTop: 20, flexDirection: 'row-reverse', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  benefit: { flex: 1, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 12 },
  benefitBorder: { borderLeftWidth: 1, borderLeftColor: '#F1F5F9' },
  benefitIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  benefitTextWrap: { alignItems: 'flex-end' },
  benefitTitle: { color: '#1E293B', fontSize: 13, fontWeight: '800' },
  benefitDetail: { color: '#64748B', fontSize: 11, marginTop: 2 },
  sectionHeading: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 16 },
  sectionTitle: { color: '#0F172A', fontSize: 20, fontWeight: '800' },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionActionText: { color: '#1D4ED8', fontSize: 13, fontWeight: '700' },
  categoryList: { gap: 16, paddingBottom: 10, flexDirection: 'row-reverse' },
  category: { width: 110, height: 110, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  categoryIcon: { width: 50, height: 50, backgroundColor: '#EFF6FF', borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  categoryName: { color: '#334155', fontSize: 13, fontWeight: '700' },
  categoryGridContainer: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 20, width: '100%' },
  categoryDesktop: { width: 125, height: 135, borderRadius: 28, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', shadowColor: '#94A3B8', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
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
  product: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  productMedia: { height: 180, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  wish: { position: 'absolute', top: 12, left: 12, width: 34, height: 34, backgroundColor: '#FFFFFF', borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  discountTag: { position: 'absolute', top: 12, right: 12, backgroundColor: '#1D4ED8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  discountText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  productInfo: { padding: 16, alignItems: 'flex-end' },
  productName: { color: '#1E293B', fontSize: 14, fontWeight: '700', textAlign: 'right', marginBottom: 8 },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 },
  price: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  currency: { fontSize: 11, fontWeight: '600' },
  oldPrice: { color: '#94A3B8', fontSize: 12, textDecorationLine: 'line-through' },
  rating: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  ratingText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
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
