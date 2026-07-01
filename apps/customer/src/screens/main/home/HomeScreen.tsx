import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Platform,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, useCartStore } from '@marketplace/shared-hooks';
import { getFeaturedProducts, getCategories, getWishlist, addToWishlist, removeFromWishlist, ProductSummary, Category } from '@marketplace/shared-hooks';
import { COLORS } from '@marketplace/shared-utils';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../../navigation/types';

const { width } = Dimensions.get('window');

const FEATURES = [
  { id: '1', title: 'ضمان جودة', subtitle: 'منتجات أصلية\n100%', icon: 'shield-checkmark', bgColor: '#ECFDF5', iconColor: '#059669' },
  { id: '2', title: 'شحن سريع', subtitle: 'توصيل خلال\n24-48 ساعة', icon: 'bus', bgColor: '#EFF6FF', iconColor: '#3B82F6' },
  { id: '3', title: 'عروض حصرية', subtitle: 'خصومات تصل إلى\n50%', icon: 'gift', bgColor: '#FFF7ED', iconColor: '#D97706' },
];

const PROMO_BANNERS = [
  { id: '1', image: require('../../../../assets/images/banners/banner1.png') },
  { id: '2', image: require('../../../../assets/images/banners/banner2.png') },
  { id: '3', image: require('../../../../assets/images/banners/banner3.png') },
  { id: '4', image: require('../../../../assets/images/banners/banner4.png') },
  { id: '5', image: require('../../../../assets/images/banners/banner5.png') },
];

// أيقونات احتياطية للتصنيفات
const CAT_ICON_FALLBACK = [
  'headset-outline', 'sparkles-outline', 'shirt-outline',
  'color-wand-outline', 'game-controller-outline', 'grid-outline',
];

type HomeScreenNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
interface Props { navigation: HomeScreenNavigationProp; }

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addToCart);
  const [search, setSearch] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);

  // ─── بيانات من Supabase ────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [wishedIds, setWishedIds] = useState<Set<string>>(new Set());

  const toggleWish = async (productId: string) => {
    if (!user?.id) return;
    const next = new Set(wishedIds);
    const isWished = next.has(productId);
    if (isWished) next.delete(productId); else next.add(productId);
    setWishedIds(next);
    try {
      if (isWished) await removeFromWishlist(user.id, productId);
      else await addToWishlist(user.id, productId);
    } catch { /* revert silently */ }
  };

  const loadData = useCallback(async () => {
    // فشل أحدهما لا يُسقط الآخر
    const [catsRes, prodsRes] = await Promise.allSettled([
      getCategories(),
      getFeaturedProducts(8),
    ]);
    if (catsRes.status === 'fulfilled') setCategories(catsRes.value);
    if (prodsRes.status === 'fulfilled') setProducts(prodsRes.value);
    setDataLoading(false);
    if (user?.id) {
      try {
        const wl = await getWishlist(user.id);
        setWishedIds(new Set(wl.map((w) => w.product_id)));
      } catch { /* ignore */ }
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  // ──────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.bellBtn} activeOpacity={0.7} onPress={() => (navigation as any).navigate('More', { screen: 'Notifications' })}>
          <Ionicons name="notifications-outline" size={24} color="#111827" />
          <View style={styles.bellBadge} />
        </TouchableOpacity>

        <Image
          source={require('../../../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.profileRow}>
          <View style={styles.profileTextCol}>
            <Text style={styles.welcomeText}>مرحباً بك</Text>
            <Text style={styles.userName}>{user?.full_name || 'محمد'}</Text>
          </View>
          <View style={styles.avatarBox}>
            <Ionicons name="person" size={20} color="#FFFFFF" />
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TouchableOpacity
          style={styles.searchBox}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={[styles.searchInput, { color: '#9CA3AF', paddingTop: 14 }]}>ابحث عن أي شيء...</Text>
          <Ionicons name="search-outline" size={20} color="#111827" style={styles.searchIcon} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Main Promo Banner Slider */}
        <View style={{ marginBottom: 16 }}>
          <FlatList
            data={PROMO_BANNERS}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            onMomentumScrollEnd={(e) => {
              setActiveSlide(Math.round(e.nativeEvent.contentOffset.x / width));
            }}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.9} style={styles.bannerItem}>
                <Image source={item.image} style={styles.bannerImage} resizeMode="cover" />
              </TouchableOpacity>
            )}
          />
          <View style={styles.dotsRow}>
            {PROMO_BANNERS.map((_, idx) => (
              <View key={idx} style={idx === activeSlide ? styles.dotActive : styles.dot} />
            ))}
          </View>
        </View>

        {/* Categories — من قاعدة البيانات */}
        <View style={styles.sectionHeader}>
          <TouchableOpacity activeOpacity={0.7} style={styles.seeAllRow} onPress={() => navigation.navigate('StoresList', {})}>
            <Ionicons name="arrow-back" size={14} color="#3B82F6" />
            <Text style={styles.seeAllText}>عرض الكل</Text>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>تصفح الأقسام</Text>
        </View>

        {dataLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 24 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {(categories.length > 0 ? categories : [
              { id: '1', name: 'الإلكترونيات', name_ar: null, icon_url: null, parent_id: null, sort_order: 0, is_active: true },
              { id: '2', name: 'الجمال والعناية', name_ar: null, icon_url: null, parent_id: null, sort_order: 1, is_active: true },
              { id: '3', name: 'الأزياء', name_ar: null, icon_url: null, parent_id: null, sort_order: 2, is_active: true },
              { id: '4', name: 'العطور', name_ar: null, icon_url: null, parent_id: null, sort_order: 3, is_active: true },
              { id: '5', name: 'ألعاب وهوايات', name_ar: null, icon_url: null, parent_id: null, sort_order: 4, is_active: true },
              { id: '6', name: 'المزيد', name_ar: null, icon_url: null, parent_id: null, sort_order: 5, is_active: true },
            ] as Category[]).map((cat, idx) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.catItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Search', { initialCategoryId: cat.id })}
              >
                <View style={styles.catIconCircle}>
                  <Ionicons name={CAT_ICON_FALLBACK[idx % CAT_ICON_FALLBACK.length] as any} size={24} color="#111827" />
                </View>
                <Text style={styles.catText}>{cat.name_ar || cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Features */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuresScroll}>
          {FEATURES.map((feat) => (
            <View key={feat.id} style={[styles.featCard, { backgroundColor: feat.bgColor }]}>
              <View style={styles.featIconBox}>
                <Ionicons name={feat.icon as any} size={28} color={feat.iconColor} />
              </View>
              <View style={styles.featTexts}>
                <Text style={styles.featTitle}>{feat.title}</Text>
                <Text style={styles.featSubtitle}>{feat.subtitle}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Best Sellers — من قاعدة البيانات */}
        <View style={styles.sectionHeader}>
          <TouchableOpacity activeOpacity={0.7} style={styles.seeAllRow} onPress={() => navigation.navigate('StoresList', {})}>
            <Ionicons name="arrow-back" size={14} color="#3B82F6" />
            <Text style={styles.seeAllText}>عرض الكل</Text>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>الأكثر مبيعاً</Text>
        </View>

        {dataLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 32 }} />
        ) : products.length === 0 ? (
          <View style={{ paddingVertical: 30, alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="cube-outline" size={40} color="#D1D5DB" />
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>لا توجد منتجات متاحة حالياً</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productsScroll}>
            {products.map((prod) => {
              const price = prod.sale_price ?? prod.base_price;
              return (
                <TouchableOpacity
                  key={prod.id}
                  style={styles.productCard}
                  activeOpacity={0.9}
                  onPress={() => navigation.navigate('ProductDetails', { productId: prod.id })}
                >
                  <View style={styles.productImageWrap}>
                    <TouchableOpacity style={styles.heartBtn} onPress={() => toggleWish(prod.id)}>
                      <Ionicons name={wishedIds.has(prod.id) ? 'heart' : 'heart-outline'} size={20} color={wishedIds.has(prod.id) ? '#EF4444' : '#6B7280'} />
                    </TouchableOpacity>
                    {prod.og_image_url ? (
                      <Image source={{ uri: prod.og_image_url }} style={styles.productImage} resizeMode="cover" />
                    ) : (
                      <Ionicons name="cube-outline" size={60} color="#9CA3AF" style={{ marginTop: 20 }} />
                    )}
                  </View>
                  <View style={styles.productInfo}>
                    <View style={styles.ratingRow}>
                      <Text style={styles.ratingText}>{prod.rating.toFixed(1)}</Text>
                      <Ionicons name="star" size={12} color="#FBBF24" style={{ marginLeft: 4 }} />
                    </View>
                    <Text style={styles.productName} numberOfLines={1}>{prod.name}</Text>
                    <View style={styles.productBottom}>
                      <TouchableOpacity
                        style={styles.cartBtn}
                        onPress={() => navigation.navigate('ProductDetails', { productId: prod.id })}
                      >
                        <Ionicons name="cart-outline" size={18} color="#111827" />
                      </TouchableOpacity>
                      <Text style={styles.priceText}>{price} <Text style={styles.currency}>ر.س</Text></Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Bottom Promo */}
        <View style={styles.bottomPromo}>
          <View style={styles.bottomPromoRight}>
            <Text style={styles.bottomPromoTitle}>خصم إضافي <Text style={styles.percentText}>10%</Text></Text>
            <Text style={styles.bottomPromoSubtitle}>على أول طلب لك!</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>استخدم الكود: <Text style={styles.codeHighlight}>WELCOME</Text></Text>
            </View>
          </View>
          <Ionicons name="bag-handle" size={80} color="#FFFFFF" style={{ opacity: 0.1, position: 'absolute', left: 20, top: 20 }} />
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, backgroundColor: '#FFFFFF',
  },
  bellBtn: { padding: 8 },
  bellBadge: {
    position: 'absolute', top: 8, right: 10, width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#3B82F6', borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  logo: { width: 40, height: 40 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  profileTextCol: { alignItems: 'flex-end', marginRight: 10 },
  welcomeText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  userName: { fontSize: 12, fontWeight: '800', color: '#111827' },
  avatarBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  searchContainer: { paddingHorizontal: 24, paddingVertical: 16, backgroundColor: '#FFFFFF' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, height: 48, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  searchIcon: { marginLeft: 12 },
  scrollContent: { paddingBottom: 100 },
  bannerItem: { width, alignItems: 'center', paddingHorizontal: 24 },
  bannerImage: { width: width - 48, height: 180, borderRadius: 20, backgroundColor: '#F5F1EE' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, gap: 6, marginBottom: 24 },
  dotActive: { width: 16, height: 4, borderRadius: 2, backgroundColor: '#3B82F6' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  seeAllRow: { flexDirection: 'row', alignItems: 'center' },
  seeAllText: { fontSize: 13, fontWeight: '700', color: '#3B82F6', marginLeft: 4 },
  catScroll: { paddingHorizontal: 24, paddingBottom: 24, gap: 16 },
  catItem: { alignItems: 'center', width: 68 },
  catIconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#F9FAFB',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 8,
  },
  catText: { fontSize: 12, fontWeight: '600', color: '#111827', textAlign: 'center' },
  featuresScroll: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  featCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, width: 200 },
  featIconBox: { marginLeft: 12 },
  featTexts: { flex: 1, alignItems: 'flex-end' },
  featTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 4 },
  featSubtitle: { fontSize: 11, color: '#6B7280', textAlign: 'right', lineHeight: 16 },
  productsScroll: { paddingHorizontal: 24, paddingBottom: 32, gap: 16 },
  productCard: {
    width: 150, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  productImageWrap: { height: 140, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  productImage: { width: '100%', height: '100%' },
  heartBtn: { position: 'absolute', top: 10, left: 10, zIndex: 2 },
  productInfo: { padding: 12 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  ratingText: { fontSize: 11, fontWeight: '700', color: '#4B5563' },
  productName: { fontSize: 12, fontWeight: '700', color: '#111827', textAlign: 'right', marginBottom: 12 },
  productBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  priceText: { fontSize: 14, fontWeight: '800', color: '#111827' },
  currency: { fontSize: 10, fontWeight: '600' },
  bottomPromo: {
    marginHorizontal: 24, backgroundColor: '#111827', borderRadius: 20, padding: 24,
    marginBottom: 20, position: 'relative', overflow: 'hidden',
  },
  bottomPromoRight: { alignItems: 'flex-end', zIndex: 2 },
  bottomPromoTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  percentText: { color: '#FBBF24' },
  bottomPromoSubtitle: { fontSize: 13, color: '#D1D5DB', marginBottom: 16 },
  codeBox: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  codeText: { fontSize: 11, color: '#FFFFFF' },
  codeHighlight: { color: '#FBBF24', fontWeight: '800' },
});
