import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Dimensions, Platform, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { HomeStackParamList } from '../../../navigation/types';
import { useCartStore, useAuthStore, getProductById, getProductVariants, isInWishlist, addToWishlist, removeFromWishlist, ProductDetail, ProductVariant } from '@marketplace/shared-hooks';

type NavigationProp = any;
type ScreenRouteProp = RouteProp<HomeStackParamList, 'ProductDetails'>;

interface Props {
  navigation: NavigationProp;
  route: ScreenRouteProp;
}

const { width } = Dimensions.get('window');

// بيانات افتراضية عند التحميل
const FALLBACK_COLORS = ['#111827', '#F3F4F6', '#1E3A8A'];

export default function ProductDetailsScreen({ navigation, route }: Props) {
  const { productId } = route.params;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState(FALLBACK_COLORS[0]);
  const [quantity, setQuantity] = useState(1);
  const [wished, setWished] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const addToCart = useCartStore((s) => s.addToCart);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    getProductById(productId).then((data) => {
      setProduct(data);
      setLoading(false);
    });
    getProductVariants(productId).then((v) => { setVariants(v); if (v.length) setSelectedVariant(v[0]); }).catch(() => {});
    if (user?.id) isInWishlist(user.id, productId).then(setWished).catch(() => {});
  }, [productId, user?.id]);

  const toggleWishlist = async () => {
    if (!user?.id) return;
    const next = !wished;
    setWished(next);
    try {
      if (next) await addToWishlist(user.id, productId);
      else await removeFromWishlist(user.id, productId);
    } catch { setWished(!next); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // إذا فشل التحميل استخدم القيم الافتراضية
  const basePrice = product?.sale_price ?? product?.base_price ?? 0;
  const variantAdd = selectedVariant?.additional_price ?? 0;
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
    reviews: 0,
    sold: product?.total_sold ?? 0,
    stock: product?.stock_quantity ?? 0,
    colors: FALLBACK_COLORS,
    hasStock: (product?.stock_quantity ?? 0) > 0,
    image: product?.product_images?.find((i) => i.is_primary)?.url
      ?? product?.product_images?.[0]?.url
      ?? product?.og_image_url
      ?? null,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header Options */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-forward" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="share-social-outline" size={22} color="#111827" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={toggleWishlist}>
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

        {/* Product Info */}
        <View style={styles.infoContainer}>
          <View style={styles.storeRow}>
            <TouchableOpacity style={styles.storePill} activeOpacity={0.7}>
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
            <Text style={styles.price}>{PRODUCT.price} <Text style={styles.currency}>ر.س</Text></Text>
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
                  const label = [v.size, v.color].filter(Boolean).join(' · ');
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[styles.variantChip, isActive && styles.variantChipActive]}
                      onPress={() => setSelectedVariant(v)}
                      activeOpacity={0.8}
                    >
                      {v.color_hex && <View style={[styles.variantDot, { backgroundColor: v.color_hex }]} />}
                      <Text style={[styles.variantLabel, isActive && styles.variantLabelActive]}>
                        {label}{v.additional_price > 0 ? ` (+${v.additional_price})` : ''}
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
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.quantityWrap}>
          <TouchableOpacity 
            style={styles.qtyBtn} 
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity 
            style={styles.qtyBtn} 
            onPress={() => setQuantity(quantity + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.addToCartBtn, !PRODUCT.hasStock && { backgroundColor: '#9CA3AF' }]}
          activeOpacity={0.9}
          disabled={!PRODUCT.hasStock}
          onPress={() => {
            addToCart({
              id: `${PRODUCT.id}-${selectedVariant?.id ?? 'default'}`,
              productId: PRODUCT.id,
              name: selectedVariant ? `${PRODUCT.name} (${[selectedVariant.size, selectedVariant.color].filter(Boolean).join(' · ')})` : PRODUCT.name,
              price: PRODUCT.price,
              emoji: '🛍️',
              quantity,
              storeId: PRODUCT.store.id,
              storeName: PRODUCT.store.name,
            });
            navigation.navigate('Cart', { screen: 'CartMain' });
          }}
        >
          <Text style={styles.addToCartText}>{PRODUCT.hasStock ? 'إضافة للسلة' : 'نفد المخزون'}</Text>
          <View style={styles.addToCartPriceBox}>
            <Text style={styles.addToCartPrice}>{PRODUCT.price * quantity} ر.س</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFFFFF' 
  },
  scrollContent: { 
    paddingBottom: 120 
  },
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
    width,
    height: width,
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
  storeRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  storePill: {
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
    fontWeight: '800', 
    color: '#111827', 
    lineHeight: 30 
  },
  priceRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
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
    marginLeft: 10,
  },
  discountBadge: { 
    backgroundColor: '#EF4444', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 6,
    marginLeft: 12,
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
  variantChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB' },
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
    flexDirection: 'row', 
    paddingHorizontal: 24, 
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24, 
    borderTopWidth: 1.5, 
    borderTopColor: '#F3F4F6', 
    alignItems: 'center', 
    gap: 16 
  },
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
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '800',
  },
  addToCartPriceBox: { 
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addToCartPrice: {
    color: '#FFFFFF', 
    fontSize: 13, 
    fontWeight: '700'
  },
});
