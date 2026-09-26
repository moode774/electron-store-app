import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addToWishlist,
  getFeaturedProducts,
  getWishlist,
  isCartItemSelected,
  ProductSummary,
  removeFromWishlist,
  useAuthStore,
  useCartStore,
} from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '../../../theme/customerTheme';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';

// اقتراح "قد يعجبك أيضاً" من منتجات حقيقية (الأكثر مبيعاً من متاجر معتمدة ومفتوحة)
interface Recommendation {
  id: string;
  name: string;
  price: number;
  oldPrice: number | null;
  image: string | null;
  storeId: string;
  storeName: string;
}

const toRecommendation = (p: ProductSummary): Recommendation => ({
  id: p.id,
  name: p.name_ar || p.name,
  price: Number(p.sale_price ?? p.base_price),
  oldPrice: p.sale_price ? Number(p.base_price) : null,
  image:
    p.product_images?.find((img) => img.is_primary)?.url ??
    p.product_images?.[0]?.url ??
    p.og_image_url ??
    null,
  storeId: p.merchant_id,
  storeName: (p as any).merchant_profiles?.store_name ?? 'المتجر',
});

export default function CartScreen({ navigation }: any) {
  const layout = useCustomerLayout(1180);
  const { updateQuantity, removeFromCart, addToCart, items, toggleSelected } = useCartStore();
  const user = useAuthStore((state) => state.user);

  const [wishlistedItems, setWishlistedItems] = useState<Set<string>>(new Set());
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    let active = true;
    getFeaturedProducts(8)
      .then((products) => {
        if (!active) return;
        const inCart = new Set(items.map((i) => i.productId));
        setRecommendations(
          products.filter((p) => !inCart.has(p.id)).slice(0, 4).map(toRecommendation)
        );
      })
      .catch(() => { /* نخفي القسم عند تعذّر الجلب */ });
    return () => { active = false; };
    // نجلبها مرة واحدة عند فتح الشاشة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setWishlistedItems(new Set());
      return () => { active = false; };
    }
    getWishlist(user.id)
      .then((rows) => {
        if (active) setWishlistedItems(new Set(rows.map((row) => row.product_id)));
      })
      .catch(() => {
        if (active) setWishlistedItems(new Set());
      });
    return () => { active = false; };
  }, [user?.id]);

  const toggleWishlist = async (productId: string): Promise<void> => {
    if (!user?.id) return;
    const wasSaved = wishlistedItems.has(productId);
    const next = new Set(wishlistedItems);
    if (wasSaved) next.delete(productId);
    else next.add(productId);
    setWishlistedItems(next);
    try {
      if (wasSaved) await removeFromWishlist(user.id, productId);
      else await addToWishlist(user.id, productId);
    } catch {
      setWishlistedItems(new Set(wishlistedItems));
    }
  };

  const activeCartItems = items.filter(isCartItemSelected);
  const totalPrice = activeCartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const totalCount = activeCartItems.reduce((acc, item) => acc + item.quantity, 0);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.emptyIconCircle}>
          <Ionicons name="cart-outline" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>السلة فارغة</Text>
        <Text style={styles.emptySub}>تصفح المتاجر وأضف ما يعجبك إلى السلة</Text>
        <TouchableOpacity
          style={styles.browseBtn}
          onPress={() => navigation.navigate('Home', { screen: 'StoresList' })}
          activeOpacity={0.85}
        >
          <Text style={styles.browseBtnText}>تصفح المتاجر</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerIconButton} onPress={() => navigation.getParent()?.navigate('Home')}>
            <Ionicons name="arrow-forward" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerCenterRow}>
            <Text style={styles.headerTitleText}>سلة المشتريات</Text>
            <View style={styles.headerBadgePill}>
              <Text style={styles.headerBadgeText}>{items.length}</Text>
            </View>
          </View>

          <View style={{ width: 68 }} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >


        {/* Cart Product Cards List */}
        <View style={styles.cartItemsListContainer}>
          {items.map((item) => {
            const isSelected = isCartItemSelected(item);
            const isWishlisted = wishlistedItems.has(item.productId);

            return (
              <View key={item.id} style={styles.cartItemCard}>
                <View style={styles.cartItemContentRow}>
                  {/* Right Side: Product Thumbnail */}
                  <View style={styles.productImageWrap}>
                    {item.image ? (
                      <Image source={{ uri: item.image }} style={styles.productImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.productImg, styles.productImgFallback]}>
                        <Ionicons name="cube-outline" size={28} color={COLORS.textMuted} />
                      </View>
                    )}
                  </View>

                  {/* Middle: Info Column (RTL) */}
                  <View style={styles.productInfoCol}>
                    <Text style={styles.productNameText} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.productVariantText} numberOfLines={1}>{item.storeName}</Text>

                    {typeof item.maxQuantity === 'number' ? (
                      <View style={styles.stockBadgePill}>
                        <Text style={styles.stockBadgeText}>المتاح: {item.maxQuantity}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Left Side: Checkbox, Actions, Price, Stepper */}
                  <View style={styles.productActionsCol}>
                    {/* Top Actions: Delete & Favorite */}
                    <View style={styles.topActionsRow}>
                      <TouchableOpacity
                        style={styles.actionIconButton}
                        onPress={() => void toggleWishlist(item.productId)}
                      >
                        <Ionicons
                          name={isWishlisted ? 'heart' : 'heart-outline'}
                          size={18}
                          color={isWishlisted ? '#EF4444' : COLORS.textSecondary}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionIconButton}
                        onPress={() => removeFromCart(item.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Middle: Checkbox + Price */}
                    <View style={styles.priceCheckboxRow}>
                      <TouchableOpacity
                        style={[styles.checkboxSquare, isSelected && styles.checkboxSquareActive]}
                        onPress={() => toggleSelected(item.id)}
                      >
                        {isSelected && <Ionicons name="checkmark" size={14} color={COLORS.surface} />}
                      </TouchableOpacity>

                      <Text style={styles.itemPriceText}>
                        {item.price.toLocaleString()} ر.ي
                      </Text>
                    </View>

                    {/* Bottom: Quantity Stepper */}
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Ionicons name="add" size={14} color={COLORS.textPrimary} />
                      </TouchableOpacity>

                      <Text style={styles.stepperQtyText}>{item.quantity}</Text>

                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        <Ionicons name="remove" size={14} color={COLORS.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* قد يعجبك أيضاً — منتجات حقيقية من القاعدة */}
        {recommendations.length > 0 && (
          <>
            <View style={styles.recommendationsHeaderRow}>
              <Text style={styles.recommendationsTitleText}>قد يعجبك أيضاً</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Home', { screen: 'StoresList' })}>
                <Text style={styles.viewAllText}>عرض الكل ›</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recommendationsScroll}
            >
              {recommendations.map((rec) => (
                <View key={rec.id} style={styles.recCard}>
                  <TouchableOpacity
                    style={styles.recImgWrap}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('Home', { screen: 'ProductDetails', params: { productId: rec.id } })}
                  >
                    {rec.image ? (
                      <Image source={{ uri: rec.image }} style={styles.recImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.recImg, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="cube-outline" size={28} color={COLORS.textMuted} />
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.recTitleText} numberOfLines={1}>
                    {rec.name}
                  </Text>

                  <View style={styles.recPriceRow}>
                    <View>
                      <Text style={styles.recPriceText}>{rec.price.toLocaleString()} ر.ي</Text>
                      {rec.oldPrice ? (
                        <Text style={styles.recOldPriceText}>{rec.oldPrice.toLocaleString()} ر.ي</Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={styles.recAddBtn}
                      onPress={() =>
                        addToCart({
                          id: rec.id,
                          productId: rec.id,
                          name: rec.name,
                          price: rec.price,
                          image: rec.image ?? undefined,
                          emoji: '🛍️',
                          quantity: 1,
                          storeId: rec.storeId,
                          storeName: rec.storeName,
                        })
                      }
                    >
                      <Ionicons name="add" size={16} color={COLORS.surface} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>

      {/* Fixed Compact Bottom Checkout Footer Card */}
      <View style={styles.fixedBottomFooter}>
        <View style={styles.footerInnerContainer}>
          <View style={styles.orderTotalsCol}>
            <View style={styles.totalSummaryRow}>
              <View style={styles.totalSummaryCopy}>
                <Text style={styles.grandTotalLabel}>المجموع ({totalCount} منتجات)</Text>
                <Text style={styles.vatText}>تُحسب رسوم التوصيل بعد اختيار العنوان</Text>
              </View>
              <Text style={styles.grandTotalVal}>{totalPrice.toLocaleString()} ر.ي</Text>
            </View>
          </View>

          {/* Bottom Full-Width Checkout Button */}
          <TouchableOpacity
            style={[styles.checkoutBtn, activeCartItems.length === 0 && { opacity: 0.5 }]}
            onPress={() => navigation.navigate('AddressSelection')}
            disabled={activeCartItems.length === 0}
            activeOpacity={0.88}
          >
            <View style={styles.checkoutBtnInner}>
              <Ionicons name="arrow-back" size={18} color={COLORS.surface} />
              <Text style={styles.checkoutBtnText}>
                {activeCartItems.length === 0 ? 'حدد منتجاً للمتابعة' : 'إتمام الطلب'}
              </Text>
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
    backgroundColor: COLORS.background,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 26,
  },
  browseBtn: {
    backgroundColor: COLORS.primary, // Dark Royal Blue
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  browseBtnText: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 15,
  },
  header: {
    backgroundColor: COLORS.surface,
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerCenterRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  headerBadgePill: {
    backgroundColor: COLORS.primary, // Dark Royal Blue
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.surface,
  },
  editButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 156,
  },
  freeShippingCard: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  freeShippingRightCol: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  truckIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primary, // Dark Royal Blue
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeShippingTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  freeShippingTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  freeShippingSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'right',
  },
  progressBarWrapper: {
    marginTop: 12,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: COLORS.borderStrong,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary, // Dark Royal Blue
    borderRadius: 3,
  },
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressLabelText: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  cartItemsListContainer: {
    gap: 14,
    marginBottom: 20,
  },
  cartItemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cartItemContentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productImageWrap: {
    width: 86,
    height: 86,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
  },
  productImg: {
    width: '100%',
    height: '100%',
  },

  productImgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceMuted,
  },
  productInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 12,
    marginLeft: 8,
  },
  productNameText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  productVariantText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'right',
  },
  stockBadgePill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  stockBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 9.5,
    color: '#059669',
  },
  deliveryBadgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  deliveryBadgeText: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  productActionsCol: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActionsRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    marginBottom: 6,
  },
  actionIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  priceCheckboxRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  checkboxSquareActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  itemPriceText: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stepperBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperQtyText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textPrimary,
    width: 24,
    textAlign: 'center',
  },
  recommendationsHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recommendationsTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 16.5,
    color: COLORS.textPrimary,
  },
  viewAllText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  recommendationsScroll: {
    flexDirection: 'row-reverse',
    gap: 12,
    paddingBottom: 4,
    marginBottom: 20,
  },
  recCard: {
    width: 140,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  recImgWrap: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.surface,
  },
  recImg: {
    width: '100%',
    height: '100%',
  },
  recHeartBtn: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recTitleText: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textPrimary,
    marginTop: 6,
    textAlign: 'right',
  },
  recPriceRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 6,
  },
  recPriceText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  recOldPriceText: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  recAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.primary, // Dark Royal Blue
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixedBottomFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  footerInnerContainer: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    gap: 12,
  },
  footerTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderTotalsCol: {
    flex: 1,
  },
  totalSummaryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  totalSummaryCopy: {
    flex: 1,
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  totalsVal: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: COLORS.textPrimary,
  },
  shippingValRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  oldShippingText: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  freeGreenText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: '#059669',
  },
  totalsDivider: {
    height: 1,
    backgroundColor: COLORS.primarySoft,
    marginVertical: 3,
  },
  grandTotalLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  vatText: {
    fontFamily: FONTS.regular,
    fontSize: 9,
    color: COLORS.textMuted,
  },
  grandTotalVal: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: COLORS.primary,
  },
  couponBoxBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  couponIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  couponTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: COLORS.textPrimary,
  },
  couponSubText: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: COLORS.textSecondary,
  },
  checkoutBtn: {
    backgroundColor: COLORS.primary, // Dark Royal Blue
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutBtnInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkoutBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.surface,
  },
});
