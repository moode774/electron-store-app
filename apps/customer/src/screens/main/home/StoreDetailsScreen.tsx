import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Dimensions, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { HomeStackParamList } from '../../../navigation/types';
import { useAuthStore, useCartStore, getStoreById, getProductsByStore, getWishlist, addToWishlist, removeFromWishlist, isFollowingStore, followStore, unfollowStore, getStoreFollowersCount, getWorkingHours, getOrCreateConversation, getReviews, WorkingHour, Review, StoreSummary, ProductSummary } from '@marketplace/shared-hooks';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'StoreDetails'>;
type ScreenRouteProp = RouteProp<HomeStackParamList, 'StoreDetails'>;

interface Props {
  navigation: NavigationProp;
  route: ScreenRouteProp;
}

const { width } = Dimensions.get('window');
const CARD_W = (width - 48 - 16) / 2;
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function StoreDetailsScreen({ navigation, route }: Props) {
  const { storeId } = route.params;
  const [activeTab, setActiveTab] = useState<'products' | 'about'>('products');
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishedIds, setWishedIds] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const user = useAuthStore((s) => s.user);

  const openChat = async () => {
    if (!user?.id) return;
    try {
      const convId = await getOrCreateConversation(user.id, storeId);
      navigation.navigate('Chat', { conversationId: convId, title: store?.store_name ?? 'المتجر' });
    } catch { /* ignore */ }
  };
  const addToCart = useCartStore((s) => s.addToCart);

  const toggleFollow = async () => {
    if (!user?.id) return;
    const next = !following;
    setFollowing(next);
    setFollowers((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      if (next) await followStore(user.id, storeId);
      else await unfollowStore(user.id, storeId);
    } catch { setFollowing(!next); }
  };

  const quickAdd = (product: ProductSummary) => {
    addToCart({
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.sale_price ?? product.base_price,
      emoji: '🛍️',
      quantity: 1,
      storeId: product.merchant_id,
      storeName: store?.store_name ?? 'المتجر',
    });
  };

  useEffect(() => {
    Promise.all([getStoreById(storeId), getProductsByStore(storeId)])
      .then(([s, p]) => { setStore(s); setProducts(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
    if (user?.id) {
      getWishlist(user.id).then((wl) => setWishedIds(new Set(wl.map((w) => w.product_id)))).catch(() => {});
      isFollowingStore(user.id, storeId).then(setFollowing).catch(() => {});
    }
    getStoreFollowersCount(storeId).then(setFollowers).catch(() => {});
    getWorkingHours(storeId).then(setHours).catch(() => {});
    getReviews(storeId).then(setReviews).catch(() => {});
  }, [storeId, user?.id]);

  const toggleWish = async (productId: string) => {
    if (!user?.id) return;
    const next = new Set(wishedIds);
    const isWished = next.has(productId);
    if (isWished) next.delete(productId); else next.add(productId);
    setWishedIds(next);
    try {
      if (isWished) await removeFromWishlist(user.id, productId);
      else await addToWishlist(user.id, productId);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const STORE = {
    name: store?.store_name ?? 'المتجر',
    iconName: 'storefront-outline' as const,
    coverColor: '#111827',
    rating: store?.rating ?? 0,
    reviews: store?.total_reviews ?? 0,
    category: store?.store_category ?? 'متجر',
    description: store?.store_description ?? '',
    isVerified: store?.is_approved ?? false,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={STORE.coverColor} />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover & Header */}
        <View style={[styles.cover, { backgroundColor: STORE.coverColor }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.coverContent}>
            <Ionicons name={STORE.iconName as any} size={80} color="rgba(255,255,255,0.2)" />
          </View>
        </View>

        {/* Store Info */}
        <View style={styles.infoSection}>
          <View style={styles.storeIconAvatar}>
            <Ionicons name={STORE.iconName as any} size={32} color={COLORS.primary} />
          </View>
          
          <View style={styles.titleRow}>
            <Text style={styles.storeName}>{STORE.name}</Text>
            {STORE.isVerified && <Ionicons name="checkmark-circle" size={18} color="#059669" />}
          </View>
          <Text style={styles.storeDesc}>{STORE.description}</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.statValRow}>
                <Ionicons name="star" size={14} color="#B45309" />
                <Text style={styles.statValue}>{STORE.rating}</Text>
              </View>
              <Text style={styles.statLabel}>{STORE.reviews} تقييم</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{followers}</Text>
              <Text style={styles.statLabel}>متابع</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={[styles.followBtn, following && styles.followBtnActive]}
              activeOpacity={0.8}
              onPress={toggleFollow}
            >
              <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                {following ? '✓ متابَع' : '+ متابعة'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'products' && styles.activeTab]}
            onPress={() => setActiveTab('products')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'products' && styles.activeTabText]}>المنتجات</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'about' && styles.activeTab]}
            onPress={() => setActiveTab('about')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'about' && styles.activeTabText]}>عن المتجر</Text>
          </TouchableOpacity>
        </View>

        {/* Products Grid */}
        {activeTab === 'products' && (
          <View style={styles.productsGrid}>
            {products.length === 0 ? (
              <View style={{ width: '100%', alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 14 }}>لا توجد منتجات حتى الآن</Text>
              </View>
            ) : products.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.productCard}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('ProductDetails', { productId: product.id })}
              >
                <View style={styles.productImageWrap}>
                  {product.og_image_url ? (
                    <Image source={{ uri: product.og_image_url }} style={styles.productThumb} resizeMode="cover" />
                  ) : (
                    <Ionicons name="cube-outline" size={48} color="#9CA3AF" />
                  )}
                  <TouchableOpacity style={styles.wishBtn} activeOpacity={0.7} onPress={() => toggleWish(product.id)}>
                    <Ionicons name={wishedIds.has(product.id) ? 'heart' : 'heart-outline'} size={18} color={wishedIds.has(product.id) ? '#EF4444' : '#6B7280'} />
                  </TouchableOpacity>
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={12} color="#FBBF24" />
                    <Text style={styles.ratingText}>{product.rating}</Text>
                    <Text style={styles.soldText}>({product.total_sold})</Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{product.sale_price ?? product.base_price} <Text style={styles.currency}>ر.ي</Text></Text>
                    {product.sale_price && <Text style={styles.oldPrice}>{product.base_price}</Text>}
                  </View>
                </View>
                <TouchableOpacity style={styles.addCartBtn} activeOpacity={0.8} onPress={() => quickAdd(product)}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <View style={styles.aboutSection}>
            <View style={styles.aboutItem}>
              <View style={styles.aboutIconBox}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.aboutContent}>
                <Text style={styles.aboutTitle}>سياسة الاسترجاع</Text>
                <Text style={styles.aboutText}>يقبل المتجر إرجاع المنتجات خلال 3 أيام من تاريخ الاستلام بشرط أن تكون بحالتها الأصلية.</Text>
              </View>
            </View>
            
            <View style={styles.aboutDivider} />
            
            <View style={styles.aboutItem}>
              <View style={styles.aboutIconBox}>
                <Ionicons name="location-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.aboutContent}>
                <Text style={styles.aboutTitle}>موقع المتجر</Text>
                <Text style={styles.aboutText}>{store?.city ?? 'غير محدد'}</Text>
              </View>
            </View>

            {hours.length > 0 && (
              <>
                <View style={styles.aboutDivider} />
                <View style={styles.aboutItem}>
                  <View style={styles.aboutIconBox}>
                    <Ionicons name="time-outline" size={20} color={COLORS.primary} />
                  </View>
                  <View style={styles.aboutContent}>
                    <Text style={styles.aboutTitle}>ساعات العمل</Text>
                    {hours.map((h) => (
                      <View key={h.id} style={styles.hourRow}>
                        <Text style={styles.hourDay}>{DAY_NAMES[h.day_of_week]}</Text>
                        <Text style={[styles.hourTime, h.is_closed && { color: '#EF4444' }]}>
                          {h.is_closed ? 'مغلق' : `${(h.open_time ?? '').slice(0,5)} - ${(h.close_time ?? '').slice(0,5)}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            {reviews.length > 0 && (
              <>
                <View style={styles.aboutDivider} />
                <View style={styles.aboutItem}>
                  <View style={styles.aboutIconBox}>
                    <Ionicons name="star-outline" size={20} color={COLORS.primary} />
                  </View>
                  <View style={styles.aboutContent}>
                    <Text style={styles.aboutTitle}>التقييمات ({reviews.length})</Text>
                    {reviews.slice(0, 5).map((r) => (
                      <View key={r.id} style={styles.reviewRow}>
                        <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                        {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.chatStoreBtn} onPress={openChat} activeOpacity={0.85}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
              <Text style={styles.chatStoreBtnText}>مراسلة المتجر</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  cover: { 
    height: 180, 
    paddingTop: 50, 
    paddingHorizontal: 20 
  },
  backBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  coverContent: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  infoSection: { 
    backgroundColor: '#FFFFFF', 
    padding: 24,
    paddingTop: 40,
    borderBottomLeftRadius: 24, 
    borderBottomRightRadius: 24, 
    marginTop: -20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderTopWidth: 0,
  },
  storeIconAvatar: {
    position: 'absolute',
    top: -30,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  titleRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 6, 
    marginBottom: 8 
  },
  storeName: { 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#111827' 
  },
  storeDesc: { 
    fontSize: 13, 
    color: '#6B7280', 
    lineHeight: 20, 
    textAlign: 'center'
  },
  statsRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginTop: 20, 
    backgroundColor: '#F9FAFB', 
    borderRadius: 16, 
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  statItem: { 
    alignItems: 'center' 
  },
  statValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: { 
    fontSize: 15, 
    fontWeight: '800', 
    color: '#111827' 
  },
  statLabel: { 
    fontSize: 11, 
    color: '#6B7280', 
    marginTop: 4,
    fontWeight: '500'
  },
  statDivider: { 
    width: 1.5, 
    height: 30, 
    backgroundColor: '#E5E7EB' 
  },
  followBtn: { 
    backgroundColor: COLORS.primary, 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    borderRadius: 12 
  },
  followBtnActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  followBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  },
  followBtnTextActive: { color: '#059669' },
  tabsRow: { 
    flexDirection: 'row', 
    marginTop: 24, 
    paddingHorizontal: 24,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E5E7EB',
  },
  tab: { 
    marginRight: 32, 
    paddingBottom: 12, 
    borderBottomWidth: 2, 
    borderBottomColor: 'transparent' 
  },
  activeTab: { 
    borderBottomColor: COLORS.primary 
  },
  tabText: { 
    fontSize: 14, 
    color: '#9CA3AF', 
    fontWeight: '600' 
  },
  activeTabText: { 
    color: COLORS.primary, 
    fontWeight: '800' 
  },
  productsGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 16, 
    padding: 24 
  },
  productCard: {
    width: CARD_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F3F4F6',
    overflow: 'hidden',
  },
  productImageWrap: {
    height: 140,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productThumb: { width: '100%', height: '100%' },
  wishBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  productInfo: {
    padding: 12,
    paddingBottom: 16,
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 18,
    height: 36,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  ratingText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '700',
    marginLeft: 4,
  },
  soldText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  currency: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 2,
    marginLeft: 2,
  },
  oldPrice: {
    fontSize: 11,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginLeft: 6,
    marginBottom: 2,
  },
  addCartBtn: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutSection: { 
    padding: 24, 
    backgroundColor: '#FFFFFF', 
    marginTop: 24, 
    borderRadius: 16, 
    marginHorizontal: 24,
    borderWidth: 1.5,
    borderColor: '#F3F4F6',
  },
  aboutItem: {
    flexDirection: 'row',
  },
  aboutIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  aboutContent: {
    flex: 1,
  },
  aboutTitle: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#111827', 
    marginBottom: 4 
  },
  aboutText: { 
    fontSize: 13, 
    color: '#6B7280', 
    lineHeight: 22 
  },
  aboutDivider: {
    height: 1.5,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  hourDay: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  hourTime: { fontSize: 13, color: '#111827', fontWeight: '700' },
  chatStoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 14, marginTop: 18 },
  chatStoreBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  reviewRow: { marginTop: 8 },
  reviewStars: { fontSize: 14, color: '#FBBF24' },
  reviewComment: { fontSize: 12.5, color: '#6B7280', marginTop: 2, lineHeight: 18 },
});
