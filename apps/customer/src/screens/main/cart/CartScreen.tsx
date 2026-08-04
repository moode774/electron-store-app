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
import { useCartStore, isCartItemSelected, getFeaturedProducts, ProductSummary } from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { t, tv } from '@marketplace/shared-i18n';

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

  const toggleWishlist = (id: string) => {
    const next = new Set(wishlistedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setWishlistedItems(next);
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
        <Text style={styles.emptyTitle}>{t('السلة فارغة')}</Text>
        <Text style={styles.emptySub}>{t('تصفح المتاجر وأضف ما يعجبك إلى السلة')}</Text>
        <TouchableOpacity
          style={styles.browseBtn}
          onPress={() => navigation.navigate('Home', { screen: 'StoresList' })}
          activeOpacity={0.85}
        >
          <Text style={styles.browseBtnText}>{t('تصفح المتاجر')}</Text>
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
          <TouchableOpacity style={styles.headerIconButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={20} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.headerCenterRow}>
            <Text style={styles.headerTitleText}>{t('سلة المشتريات')}</Text>
            <View style={styles.headerBadgePill}>
              <Text style={styles.headerBadgeText}>{tv(items.length)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.editButton}>
            <Ionicons name="create-outline" size={16} color="#0F172A" />
            <Text style={styles.editText}>{t('تعديل')}</Text>
          </TouchableOpacity>
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
            const isWishlisted = wishlistedItems.has(item.id);

            return (
              <View key={item.id} style={styles.cartItemCard}>
                <View style={styles.cartItemContentRow}>
                  {/* Right Side: Product Thumbnail */}
                  <View style={styles.productImageWrap}>
                    <Image
                      source={{
                        uri:
                          item.image ||
                          'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=300&q=80',
                      }}
                      style={styles.productImg}
                      resizeMode="cover"
                    />
                  </View>

                  {/* Middle: Info Column (RTL) */}
                  <View style={styles.productInfoCol}>
                    <Text style={styles.productNameText} numberOfLines={2}>
                      {tv(item.name)}
                    </Text>
                    <Text style={styles.productVariantText}>{t('لون: أبيض')}</Text>

                    <View style={styles.stockBadgePill}>
                      <Text style={styles.stockBadgeText}>{t('متوفر')}</Text>
                    </View>

                    <View style={styles.deliveryBadgeRow}>
                      <Ionicons name="sparkles" size={11} color={COLORS.primary} />
                      <Text style={styles.deliveryBadgeText}>{t('توصيل خلال 24 ساعة')}</Text>
                    </View>
                  </View>

                  {/* Left Side: Checkbox, Actions, Price, Stepper */}
                  <View style={styles.productActionsCol}>
                    {/* Top Actions: Delete & Favorite */}
                    <View style={styles.topActionsRow}>
                      <TouchableOpacity
                        style={styles.actionIconButton}
                        onPress={() => toggleWishlist(item.id)}
                      >
                        <Ionicons
                          name={isWishlisted ? 'heart' : 'heart-outline'}
                          size={18}
                          color={isWishlisted ? '#EF4444' : '#64748B'}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionIconButton}
                        onPress={() => removeFromCart(item.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    {/* Middle: Checkbox + Price */}
                    <View style={styles.priceCheckboxRow}>
                      <TouchableOpacity
                        style={[styles.checkboxSquare, isSelected && styles.checkboxSquareActive]}
                        onPress={() => toggleSelected(item.id)}
                      >
                        {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </TouchableOpacity>

                      <Text style={styles.itemPriceText}>{t('{0} ر.ي', [item.price.toLocaleString()])}</Text>
                    </View>

                    {/* Bottom: Quantity Stepper */}
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Ionicons name="add" size={14} color="#0F172A" />
                      </TouchableOpacity>

                      <Text style={styles.stepperQtyText}>{tv(item.quantity)}</Text>

                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        <Ionicons name="remove" size={14} color="#0F172A" />
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
              <Text style={styles.recommendationsTitleText}>{t('قد يعجبك أيضاً')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Home', { screen: 'StoresList' })}>
                <Text style={styles.viewAllText}>{t('عرض الكل ›')}</Text>
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
                        <Ionicons name="cube-outline" size={28} color="#94A3B8" />
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.recTitleText} numberOfLines={1}>
                    {tv(rec.name)}
                  </Text>

                  <View style={styles.recPriceRow}>
                    <View>
                      <Text style={styles.recPriceText}>{t('{0} ر.ي', [rec.price.toLocaleString()])}</Text>
                      {rec.oldPrice ? (
                        <Text style={styles.recOldPriceText}>{t('{0} ر.ي', [rec.oldPrice.toLocaleString()])}</Text>
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
                      <Ionicons name="add" size={16} color="#FFFFFF" />
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
          {/* Order Totals Summary */}
          <View style={styles.orderTotalsCol}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{t('المجموع الفرعي ({0} منتجات)', [tv(totalCount)])}</Text>
              <Text style={styles.totalsVal}>{t('{0} ر.ي', [totalPrice.toLocaleString()])}</Text>
            </View>

            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{t('تكلفة التوصيل')}</Text>
              <View style={styles.shippingValRow}>
                <Text style={styles.totalsLabel}>{t('تُحسب حسب عنوانك عند إتمام الطلب')}</Text>
              </View>
            </View>

            <View style={styles.totalsDivider} />

            <View style={styles.totalsRow}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.grandTotalLabel}>{t('الإجمالي')}</Text>
                <Text style={styles.vatText}>{t('قبل رسوم التوصيل')}</Text>
              </View>
              <Text style={styles.grandTotalVal}>{t('{0} ر.ي', [totalPrice.toLocaleString()])}</Text>
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
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
              <Text style={styles.checkoutBtnText}>
                {tv(activeCartItems.length === 0 ? t('حدد منتجاً للمتابعة') : t('إتمام الطلب'))}
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
    backgroundColor: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F0F5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 26,
  },
  browseBtn: {
    backgroundColor: '#172554', // Dark Royal Blue
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  browseBtnText: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
    fontSize: 15,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerCenterRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#0F172A',
  },
  headerBadgePill: {
    backgroundColor: '#172554', // Dark Royal Blue
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  editButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#0F172A',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 220,
  },
  freeShippingCard: {
    backgroundColor: '#F0F5FF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
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
    backgroundColor: '#172554', // Dark Royal Blue
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
    color: '#0F172A',
  },
  freeShippingSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'right',
  },
  progressBarWrapper: {
    marginTop: 12,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#DBEAFE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#172554', // Dark Royal Blue
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
    color: '#64748B',
  },
  cartItemsListContainer: {
    gap: 14,
    marginBottom: 20,
  },
  cartItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#F8FAFC',
  },
  productImg: {
    width: '100%',
    height: '100%',
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
    color: '#0F172A',
    textAlign: 'right',
  },
  productVariantText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
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
    color: '#64748B',
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
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#FFFFFF',
  },
  checkboxSquareActive: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },
  itemPriceText: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: '#0F172A',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stepperBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperQtyText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#0F172A',
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
    color: '#0F172A',
  },
  viewAllText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: '#172554',
  },
  recommendationsScroll: {
    flexDirection: 'row-reverse',
    gap: 12,
    paddingBottom: 4,
    marginBottom: 20,
  },
  recCard: {
    width: 140,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  recImgWrap: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recTitleText: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: '#0F172A',
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
    color: '#0F172A',
  },
  recOldPriceText: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  recAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#172554', // Dark Royal Blue
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixedBottomFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
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
    flex: 1.15,
    gap: 4,
  },
  totalsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
  },
  totalsVal: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: '#0F172A',
  },
  shippingValRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  oldShippingText: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  freeGreenText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: '#059669',
  },
  totalsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 3,
  },
  grandTotalLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#0F172A',
  },
  vatText: {
    fontFamily: FONTS.regular,
    fontSize: 9,
    color: '#94A3B8',
  },
  grandTotalVal: {
    fontFamily: FONTS.bold,
    fontSize: 16.5,
    color: '#0F172A',
  },
  couponBoxBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  couponIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F0F5FF',
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
    color: '#0F172A',
  },
  couponSubText: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: '#64748B',
  },
  checkoutBtn: {
    backgroundColor: '#172554', // Dark Royal Blue
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
    color: '#FFFFFF',
  },
});
