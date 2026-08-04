import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { HomeStackParamList } from '../../../navigation/types';
import { useAuthStore, useCartStore, getStoreById, getProductsByStore, getWishlist, addToWishlist, removeFromWishlist, isFollowingStore, followStore, unfollowStore, getStoreFollowersCount, getWorkingHours, getOrCreateConversation, getReviews, WorkingHour, Review, StoreSummary, ProductSummary, supabase } from '@marketplace/shared-hooks';
import { Alert } from '../../../components/appAlert';
import { CustomerProductCard } from '../../../components/customer/CustomerProductCard';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { t, tv } from '@marketplace/shared-i18n';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'StoreDetails'>;
type ScreenRouteProp = RouteProp<HomeStackParamList, 'StoreDetails'>;

interface Props {
  navigation: NavigationProp;
  route: ScreenRouteProp;
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function StoreDetailsScreen({ navigation, route }: Props) {
  const layout = useCustomerLayout(1120);
  const productGutter = layout.gutter;
  const productGap = layout.compact ? 10 : 16;
  const productColumns = layout.width < 560 ? 2 : layout.tablet && !layout.desktop ? 3 : layout.desktop ? 4 : 2;
  const productCardWidth = (layout.usableWidth - productGap * (productColumns - 1)) / productColumns;
  const { storeId } = route.params;
  const [activeTab, setActiveTab] = useState<'products' | 'about'>('products');
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
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
    } catch (error: any) {
      Alert.alert('تعذّر فتح المحادثة', error?.message ?? 'تحقق من الاتصال وحاول مجددًا.');
    }
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
    } catch {
      setFollowing(!next);
      setFollowers((count) => Math.max(0, count + (next ? -1 : 1)));
      Alert.alert('تعذّر تحديث المتابعة', 'تحقق من الاتصال وحاول مجددًا.');
    }
  };

  const quickAdd = (product: ProductSummary) => {
    if ((product.product_variants ?? []).some((variant) => variant.is_active !== false)) {
      navigation.navigate('ProductDetails', { productId: product.id });
      return;
    }
    if (Number(product.stock_quantity ?? 0) <= 0) {
      Alert.alert('نفد المخزون', 'هذا المنتج غير متاح للإضافة حاليًا.');
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
      storeName: store?.store_name ?? 'المتجر',
    });
  };

  const loadData = React.useCallback(async () => {
    setLoadError('');
    try {
      const [nextStore, nextProducts] = await Promise.all([getStoreById(storeId), getProductsByStore(storeId)]);
      if (!nextStore) throw new Error('المتجر غير موجود أو غير متاح حاليًا.');
      setStore(nextStore);
      setProducts(nextProducts);
    } catch (error: any) {
      setStore(null);
      setProducts([]);
      setLoadError(error?.message ?? 'تعذّر تحميل المتجر. تحقق من الاتصال وحاول مجددًا.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    if (user?.id) {
      getWishlist(user.id).then((wl) => setWishedIds(new Set(wl.map((w) => w.product_id)))).catch(() => {});
      isFollowingStore(user.id, storeId).then(setFollowing).catch(() => {});
    }
    getStoreFollowersCount(storeId).then(setFollowers).catch(() => {});
    getWorkingHours(storeId).then(setHours).catch(() => {});
    getReviews(storeId).then(setReviews).catch(() => {});
  }, [storeId, user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  useEffect(() => {
    const channel = supabase.channel(`store_details_${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_profiles', filter: `id=eq.${storeId}` }, () => {
        void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `merchant_id=eq.${storeId}` }, () => {
        void loadData();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [storeId, loadData]);

  const toggleWish = async (productId: string) => {
    if (!user?.id) return;
    const next = new Set(wishedIds);
    const isWished = next.has(productId);
    if (isWished) next.delete(productId); else next.add(productId);
    setWishedIds(next);
    try {
      if (isWished) await removeFromWishlist(user.id, productId);
      else await addToWishlist(user.id, productId);
    } catch {
      setWishedIds((current) => {
        const restored = new Set(current);
        if (isWished) restored.add(productId); else restored.delete(productId);
        return restored;
      });
      Alert.alert('تعذّر تحديث المفضلة', 'تحقق من الاتصال وحاول مجددًا.');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (loadError || !store) {
    return (
      <View style={styles.errorState} accessibilityRole="alert">
        <Ionicons name="storefront-outline" size={52} color="#B91C1C" />
        <Text style={styles.errorTitle}>{t('تعذّر فتح المتجر')}</Text>
        <Text style={styles.errorMessage}>{tv(loadError || t('المتجر غير موجود أو غير متاح حاليًا.'))}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void loadData(); }} accessibilityRole="button">
          <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLinkButton} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.backLink}>{t('العودة')}</Text>
        </TouchableOpacity>
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
      
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={[styles.page, layout.tablet && styles.pageWide]}>
        {/* Cover & Header */}
        <View style={[styles.cover, layout.desktop && styles.coverDesktop, { backgroundColor: STORE.coverColor }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('العودة')}>
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
            <Text style={styles.storeName}>{tv(STORE.name)}</Text>
            {STORE.isVerified && <Ionicons name="checkmark-circle" size={18} color="#059669" />}
          </View>
          <Text style={styles.storeDesc}>{tv(STORE.description)}</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.statValRow}>
                <Ionicons name="star" size={14} color="#B45309" />
                <Text style={styles.statValue}>{tv(STORE.rating)}</Text>
              </View>
              <Text style={styles.statLabel}>{t('{0} تقييم', [tv(STORE.reviews)])}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{tv(followers)}</Text>
              <Text style={styles.statLabel}>{t('متابع')}</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={[styles.followBtn, following && styles.followBtnActive]}
              activeOpacity={0.8}
              onPress={toggleFollow}
              accessibilityRole="button"
              accessibilityLabel={following ? t('إلغاء متابعة المتجر') : t('متابعة المتجر')}
              accessibilityState={{ selected: following }}
            >
              <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                {tv(following ? t('✓ متابَع') : t('+ متابعة'))}
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
            <Text style={[styles.tabText, activeTab === 'products' && styles.activeTabText]}>{t('المنتجات')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'about' && styles.activeTab]}
            onPress={() => setActiveTab('about')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'about' && styles.activeTabText]}>{t('عن المتجر')}</Text>
          </TouchableOpacity>
        </View>

        {/* Products Grid */}
        {activeTab === 'products' && (
          <View style={[styles.productsGrid, { paddingHorizontal: productGutter, paddingVertical: 24, gap: productGap }]}>
            {products.length === 0 ? (
              <View style={{ width: '100%', alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 14 }}>{t('لا توجد منتجات حتى الآن')}</Text>
              </View>
            ) : products.map((product) => {
              const needsOptions = (product.product_variants ?? []).some((variant) => variant.is_active !== false);
              const quickActionDisabled = !needsOptions && Number(product.stock_quantity ?? 0) <= 0;
              return (
              <CustomerProductCard
                key={product.id}
                product={product}
                style={{ width: productCardWidth }}
                favorite={wishedIds.has(product.id)}
                onPress={() => navigation.navigate('ProductDetails', { productId: product.id })}
                onToggleFavorite={() => void toggleWish(product.id)}
                onQuickAction={() => quickAdd(product)}
                quickActionNeedsOptions={needsOptions}
                quickActionDisabled={quickActionDisabled}
              />
              );
            })}
          </View>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <View style={[styles.aboutSection, { marginHorizontal: productGutter }]}>
            <View style={styles.aboutItem}>
              <View style={styles.aboutIconBox}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.aboutContent}>
                <Text style={styles.aboutTitle}>{t('سياسة الاسترجاع')}</Text>
                <Text style={styles.aboutText}>{t('يقبل المتجر إرجاع المنتجات خلال 3 أيام من تاريخ الاستلام بشرط أن تكون بحالتها الأصلية.')}</Text>
              </View>
            </View>
            
            <View style={styles.aboutDivider} />
            
            <View style={styles.aboutItem}>
              <View style={styles.aboutIconBox}>
                <Ionicons name="location-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.aboutContent}>
                <Text style={styles.aboutTitle}>{t('موقع المتجر')}</Text>
                <Text style={styles.aboutText}>{tv(store?.city ?? t('غير محدد'))}</Text>
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
                    <Text style={styles.aboutTitle}>{t('ساعات العمل')}</Text>
                    {hours.map((h) => (
                      <View key={h.id} style={styles.hourRow}>
                        <Text style={styles.hourDay}>{tv(DAY_NAMES[h.day_of_week])}</Text>
                        <Text style={[styles.hourTime, h.is_closed && { color: '#EF4444' }]}>
                          {tv(h.is_closed ? t('مغلق') : `${(h.open_time ?? '').slice(0,5)} - ${(h.close_time ?? '').slice(0,5)}`)}
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
                    <Text style={styles.aboutTitle}>{t('التقييمات ({0})', [tv(reviews.length)])}</Text>
                    {reviews.slice(0, 5).map((r) => (
                      <View key={r.id} style={styles.reviewRow}>
                        <Text style={styles.reviewStars}>{tv('★'.repeat(r.rating))}{tv('☆'.repeat(5 - r.rating))}</Text>
                        {!!r.comment && <Text style={styles.reviewComment}>{tv(r.comment)}</Text>}
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.chatStoreBtn} onPress={openChat} activeOpacity={0.85}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
              <Text style={styles.chatStoreBtnText}>{t('مراسلة المتجر')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  page: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  pageWide: { marginVertical: 24, overflow: 'hidden', borderRadius: RADIUS.xl, backgroundColor: COLORS.surface },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: '#F9FAFB' },
  errorTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  errorMessage: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  retryButton: { minHeight: 46, minWidth: 150, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  backLink: { color: COLORS.primary, fontWeight: '700', padding: 10 },
  backLinkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cover: { 
    height: 180, 
    paddingTop: 50, 
    paddingHorizontal: 20 
  },
  coverDesktop: { height: 260 },
  backBtn: { 
    width: 44,
    height: 44,
    borderRadius: 16,
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
    fontFamily: FONTS.bold,
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
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 44,
    justifyContent: 'center',
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
    width: '100%',
    alignSelf: 'center',
  },
  aboutSection: { 
    padding: 24, 
    backgroundColor: '#FFFFFF', 
    marginTop: 24, 
    borderRadius: 16, 
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
  chatStoreBtn: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 14, marginTop: 18 },
  chatStoreBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  reviewRow: { marginTop: 8 },
  reviewStars: { fontSize: 14, color: '#FBBF24' },
  reviewComment: { fontSize: 12.5, color: '#6B7280', marginTop: 2, lineHeight: 18 },
});
