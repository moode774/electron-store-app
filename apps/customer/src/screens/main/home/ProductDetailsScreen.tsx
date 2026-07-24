import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator, Image, Share } from 'react-native';
import { Alert } from '../../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { HomeStackParamList } from '../../../navigation/types';
import { useCartStore, useAuthStore, getProductById, isInWishlist, addToWishlist, removeFromWishlist, getReviews, ProductDetail } from '@marketplace/shared-hooks';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';

type Variant = NonNullable<ProductDetail['product_variants']>[number];

type NavigationProp = any;
type ScreenRouteProp = RouteProp<HomeStackParamList, 'ProductDetails'>;

interface Props {
  navigation: NavigationProp;
  route: ScreenRouteProp;
}

// بيانات افتراضية عند التحميل
const FALLBACK_COLORS = ['#111827', '#F3F4F6', '#1E3A8A'];

export default function ProductDetailsScreen({ navigation, route }: Props) {
  const layout = useCustomerLayout(1180);
  const { productId } = route.params;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedColor, setSelectedColor] = useState(FALLBACK_COLORS[0]);
  const [quantity, setQuantity] = useState(1);
  const [wished, setWished] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [reviewsCount, setReviewsCount] = useState(0);
  const addToCart = useCartStore((s) => s.addToCart);
  const user = useAuthStore((s) => s.user);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getProductById(productId);
      if (!data) throw new Error('المنتج غير موجود أو لم يعد متاحًا.');
      setProduct(data);
      const nextVariants = (data.product_variants ?? []).filter((item) => item.is_active);
      setVariants(nextVariants);
      setSelectedVariant(nextVariants.find((item) => item.stock_quantity > 0) ?? nextVariants[0] ?? null);
    } catch (error: any) {
      setProduct(null);
      setVariants([]);
      setSelectedVariant(null);
      setLoadError(error?.message ?? 'تعذّر تحميل المنتج. تحقق من الاتصال وحاول مجددًا.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadProduct();
    if (user?.id) isInWishlist(user.id, productId).then(setWished).catch(() => {});
    getReviews(productId).then((r) => setReviewsCount(r.length)).catch(() => {});
  }, [loadProduct, productId, user?.id]);

  const toggleWishlist = async () => {
    if (!user?.id) return;
    const next = !wished;
    setWished(next);
    try {
      if (next) await addToWishlist(user.id, productId);
      else await removeFromWishlist(user.id, productId);
    } catch {
      setWished(!next);
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

  if (loadError || !product) {
    return (
      <View style={styles.errorState} accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={52} color="#B91C1C" />
        <Text style={styles.errorTitle}>تعذّر فتح المنتج</Text>
        <Text style={styles.errorMessage}>{loadError || 'المنتج غير موجود أو لم يعد متاحًا.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void loadProduct()} accessibilityRole="button">
          <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLinkButton} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.backLink}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // إذا فشل التحميل استخدم القيم الافتراضية
  const basePrice = product?.sale_price ?? product?.base_price ?? 0;
  const variantAdd = selectedVariant?.price_modifier ?? 0;
  const PRODUCT = {
    id: product?.id ?? productId,
    name: product?.name ?? 'منتج',
    price: basePrice + variantAdd,
    oldPrice: product?.sale_price ? product.base_price + variantAdd : null,
    description: product?.description ?? '',
    store: {
      id: product?.merchant_profiles?.id ?? '',
      name: product?.merchant_profiles?.store_name ?? 'المتجر',
    },
    rating: product?.rating ?? 0,
    reviews: reviewsCount,
    sold: product?.total_sold ?? 0,
    // عند اختيار خيار (variant) يُعتمد مخزونه هو، وإلا مخزون المنتج
    stock: selectedVariant ? selectedVariant.stock_quantity : (product?.stock_quantity ?? 0),
    colors: FALLBACK_COLORS,
    hasStock: (selectedVariant ? selectedVariant.stock_quantity : (product?.stock_quantity ?? 0)) > 0,
    image: product?.product_images?.find((i) => i.is_primary)?.url
      ?? product?.product_images?.[0]?.url
      ?? product?.og_image_url
      ?? null,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.page, layout.desktop && { paddingHorizontal: layout.gutter }]}>
        <View style={[styles.productLayout, layout.desktop && styles.productLayoutDesktop]}>
        <View style={[styles.mediaPanel, layout.desktop && styles.mediaPanelDesktop]}>
        {/* Header Options */}
        <View style={[styles.header, layout.desktop && styles.headerDesktop]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="العودة">
            <Ionicons name="arrow-forward" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => Share.share({ message: `${PRODUCT.name} - ${PRODUCT.price} ر.ي`, title: PRODUCT.name })} accessibilityRole="button" accessibilityLabel="مشاركة المنتج">
              <Ionicons name="share-social-outline" size={22} color="#111827" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={toggleWishlist} accessibilityRole="button" accessibilityLabel={wished ? 'إزالة المنتج من المفضلة' : 'إضافة المنتج إلى المفضلة'} accessibilityState={{ selected: wished }}>
              <Ionicons name={wished ? 'heart' : 'heart-outline'} size={22} color={wished ? '#EF4444' : '#111827'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Image */}
        <View style={styles.imageContainer}>
          {PRODUCT.image ? (
            <Image source={{ uri: PRODUCT.image }} style={styles.productMainImage} resizeMode="cover" />
          ) : (
            <Ionicons name="cube-outline" size={120} color="#9CA3AF" />
          )}
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </View>
        </View>

        {/* Product Info */}
        <View style={[styles.infoContainer, layout.desktop && styles.infoContainerDesktop]}>
          <View style={styles.storeRow}>
            <TouchableOpacity
              style={styles.storePill}
              activeOpacity={0.7}
              onPress={() => PRODUCT.store.id && navigation.navigate('StoreDetails', { storeId: PRODUCT.store.id })}
              accessibilityRole="button"
              accessibilityLabel={`فتح متجر ${PRODUCT.store.name}`}
            >
              <Ionicons name="storefront-outline" size={14} color={COLORS.primary} />
              <Text style={styles.storeName}>{PRODUCT.store.name}</Text>
            </TouchableOpacity>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#B45309" />
              <Text style={styles.ratingText}>{PRODUCT.rating}</Text>
              <Text style={styles.reviewsText}>({PRODUCT.reviews})</Text>
            </View>
          </View>

          <Text style={styles.productName}>{PRODUCT.name}</Text>
          
          <View style={styles.priceRow}>
            <Text style={styles.price}>{PRODUCT.price} <Text style={styles.currency}>ر.ي</Text></Text>
            {PRODUCT.oldPrice ? (
              <>
                <Text style={styles.oldPrice}>{PRODUCT.oldPrice}</Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>
                    خصم {Math.round((1 - PRODUCT.price / PRODUCT.oldPrice) * 100)}%
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.soldRow}>
            <View style={styles.soldBadge}>
              <Ionicons name="flame" size={14} color="#DC2626" />
              <Text style={styles.soldText}>تم بيع {PRODUCT.sold} قطعة</Text>
            </View>
            <View style={[styles.stockBadge, !PRODUCT.hasStock && styles.stockBadgeOut]}>
              <Ionicons name={PRODUCT.hasStock ? 'cube-outline' : 'close-circle-outline'} size={14} color={PRODUCT.hasStock ? '#059669' : '#DC2626'} />
              <Text style={[styles.stockText, !PRODUCT.hasStock && { color: '#DC2626' }]}>
                {PRODUCT.hasStock ? `متبقي ${PRODUCT.stock} قطعة` : 'نفد المخزون'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Variants (خيارات حقيقية) */}
          {variants.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>الخيارات المتاحة</Text>
              <View style={styles.variantsRow}>
                {variants.map((v) => {
                  const isActive = selectedVariant?.id === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[styles.variantChip, isActive && styles.variantChipActive]}
                      onPress={() => { setSelectedVariant(v); setQuantity(1); }}
                      disabled={v.stock_quantity <= 0}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityLabel={`${v.name}${v.stock_quantity <= 0 ? '، نفد المخزون' : ''}`}
                      accessibilityState={{ selected: isActive, disabled: v.stock_quantity <= 0 }}
                    >
                      <Text style={[styles.variantLabel, isActive && styles.variantLabelActive]}>
                        {v.name}{v.price_modifier > 0 ? ` (+${v.price_modifier})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.divider} />
            </>
          )}

          {/* Description */}
          <Text style={styles.sectionTitle}>تفاصيل المنتج</Text>
          <Text style={styles.description}>{PRODUCT.description}</Text>
          
        </View>
        </View>
        </View>
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      <View style={styles.bottomBar}>
        <View style={[styles.bottomBarInner, { paddingHorizontal: layout.gutter }, layout.compact && styles.bottomBarInnerCompact]}>
        <View style={styles.quantityWrap}>
          <TouchableOpacity 
            style={styles.qtyBtn} 
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="تقليل الكمية"
            accessibilityState={{ disabled: quantity <= 1 }}
            disabled={quantity <= 1}
          >
            <Ionicons name="remove" size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity(Math.min(PRODUCT.stock > 0 ? PRODUCT.stock : 1, quantity + 1))}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="زيادة الكمية"
            accessibilityState={{ disabled: quantity >= PRODUCT.stock }}
            disabled={quantity >= PRODUCT.stock}
          >
            <Ionicons name="add" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.addToCartBtn, !PRODUCT.hasStock && { backgroundColor: '#9CA3AF' }]}
          activeOpacity={0.9}
          disabled={!PRODUCT.hasStock}
          accessibilityRole="button"
          accessibilityLabel={`إضافة ${PRODUCT.name} إلى السلة`}
          accessibilityState={{ disabled: !PRODUCT.hasStock }}
          onPress={() => {
            if (!PRODUCT.store.id) {
              // بدون معرّف متجر صحيح سيفشل إنشاء الطلب لاحقاً في الدفع
              Alert.alert('عذراً', 'تعذّر تحميل بيانات المتجر، أعد فتح المنتج');
              return;
            }
            addToCart({
              id: `${PRODUCT.id}-${selectedVariant?.id ?? 'default'}`,
              productId: PRODUCT.id,
              variantId: selectedVariant?.id,
              name: selectedVariant ? `${PRODUCT.name} (${selectedVariant.name})` : PRODUCT.name,
              price: PRODUCT.price,
              emoji: '🛍️',
              quantity,
              maxQuantity: PRODUCT.stock,
              storeId: PRODUCT.store.id,
              storeName: PRODUCT.store.name,
              image: PRODUCT.image ?? undefined,
            });
            navigation.navigate('Cart', { screen: 'CartMain' });
          }}
        >
          <Text style={styles.addToCartText}>{PRODUCT.hasStock ? 'إضافة للسلة' : 'نفد المخزون'}</Text>
          <View style={styles.addToCartPriceBox}>
            <Text style={styles.addToCartPrice}>{PRODUCT.price * quantity} ر.ي</Text>
          </View>
        </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF' 
  },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: '#FFFFFF' },
  errorTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  errorMessage: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  retryButton: { marginTop: 8, minWidth: 150, minHeight: 46, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  backLink: { color: COLORS.primary, fontWeight: '700', padding: 10 },
  backLinkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { 
    paddingBottom: 132,
  },
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  productLayout: { width: '100%' },
  productLayoutDesktop: { flexDirection: 'row-reverse', alignItems: 'stretch', gap: 24, paddingTop: 28 },
  mediaPanel: { width: '100%', position: 'relative' },
  mediaPanelDesktop: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: RADIUS.xl, backgroundColor: COLORS.background },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingTop: Platform.OS === 'ios' ? 60 : 40, 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    zIndex: 10 
  },
  headerDesktop: { paddingTop: 20 },
  headerRight: { 
    flexDirection: 'row', 
    gap: 12 
  },
  iconBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#FFFFFF', 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 620,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  productMainImage: {
    width: '100%',
    height: '100%',
  },
  dots: { 
    position: 'absolute', 
    bottom: 24, 
    flexDirection: 'row', 
    gap: 8 
  },
  dot: { 
    width: 6, 
    height: 6, 
    borderRadius: 3, 
    backgroundColor: '#D1D5DB' 
  },
  dotActive: { 
    width: 24, 
    backgroundColor: '#111827' 
  },
  infoContainer: { 
    padding: 24, 
    backgroundColor: '#FFFFFF', 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    marginTop: -32,
    paddingBottom: 40,
  },
  infoContainerDesktop: { flex: 1, minWidth: 0, marginTop: 0, borderRadius: RADIUS.xl, padding: 32, paddingBottom: 32 },
  storeRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  storePill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  storeName: { 
    fontSize: 13, 
    color: COLORS.primary, 
    fontWeight: '700' 
  },
  ratingBadge: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 8,
    gap: 4,
  },
  ratingText: { 
    fontSize: 12, 
    fontWeight: '800', 
    color: '#B45309' 
  },
  reviewsText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  productName: { 
    fontSize: 20, 
    fontFamily: FONTS.bold,
    color: '#111827', 
    lineHeight: 30 
  },
  priceRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16 
  },
  price: { 
    fontSize: 24, 
    fontWeight: '800', 
    color: COLORS.primary 
  },
  currency: {
    fontSize: 14,
    fontWeight: '600',
  },
  oldPrice: { 
    fontSize: 14, 
    color: '#9CA3AF', 
    textDecorationLine: 'line-through',
    marginLeft: 0,
  },
  discountBadge: { 
    backgroundColor: '#EF4444', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 6,
    marginLeft: 0,
  },
  discountText: { 
    color: '#FFFFFF', 
    fontSize: 11, 
    fontWeight: '800' 
  },
  soldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  soldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  stockBadgeOut: {
    backgroundColor: '#FEF2F2',
  },
  stockText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  soldText: { 
    fontSize: 12, 
    color: '#DC2626', 
    fontWeight: '700', 
  },
  divider: { 
    height: 1.5, 
    backgroundColor: '#F3F4F6', 
    marginVertical: 24 
  },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: '800', 
    color: '#111827', 
    marginBottom: 16 
  },
  variantsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  variantChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB' },
  variantChipActive: { borderColor: COLORS.primary, backgroundColor: '#F0F4FF' },
  variantDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  variantLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  variantLabelActive: { color: COLORS.primary },
  colorsRow: {
    flexDirection: 'row',
    gap: 16
  },
  colorCircleWrap: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    borderWidth: 2, 
    borderColor: 'transparent', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  colorCircleWrapActive: { 
    borderColor: COLORS.primary 
  },
  colorCircle: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: 'rgba(0,0,0,0.1)' 
  },
  description: { 
    fontSize: 14, 
    color: '#4B5563', 
    lineHeight: 26, 
    fontWeight: '500',
  },
  bottomBar: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: '#FFFFFF', 
    borderTopWidth: 1.5, 
    borderTopColor: '#F3F4F6', 
    alignItems: 'center',
  },
  bottomBarInner: { width: '100%', maxWidth: 820, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 32 : 16 },
  bottomBarInnerCompact: { gap: 8 },
  quantityWrap: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F9FAFB', 
    borderRadius: 14, 
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  qtyBtn: { 
    width: 44, 
    height: 52, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  qtyText: { 
    fontSize: 16, 
    fontWeight: '800', 
    color: '#111827', 
    width: 32, 
    textAlign: 'center' 
  },
  addToCartBtn: { 
    flex: 1, 
    minWidth: 0,
    backgroundColor: COLORS.primary, 
    height: 52, 
    borderRadius: 14, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingLeft: 24,
    paddingRight: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  addToCartText: {
    flexShrink: 1,
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '800',
  },
  addToCartPriceBox: { 
    flexShrink: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addToCartPrice: {
    color: '#FFFFFF', 
    fontSize: 13, 
    fontWeight: '700',
    textAlign: 'center',
  },
});
