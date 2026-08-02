import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  Image,
  Switch,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import {
  Address,
  useCartStore,
  useAuthStore,
  createOrderGroup,
  createIdempotencyKey,
  getAddresses,
  validateCoupon,
  appStorage,
  estimateDeliveryFees,
  isCartItemSelected,
} from '@marketplace/shared-hooks';
import { Alert } from '../../../components/appAlert';

// السيرفر (place_order_group) يقبل الدفع نقداً فقط حالياً ويرفض غيره بـ
// PAYMENT_METHOD_UNAVAILABLE، لذا تُعرض الطرق الأخرى معطّلة كـ«قريباً» بدل
// السماح باختيارها ثم إرسال cash خلف الكواليس.
const PAYMENT_OPTIONS = [
  {
    id: 'cash',
    name: 'الدفع عند الاستلام',
    subtitle: 'ادفع نقداً عند وصول المندوب إليك',
    iconType: 'cash-outline',
    brand: 'COD',
    brandBg: '#059669',
    available: true,
  },
  {
    id: 'jawali',
    name: 'محفظة جوالي',
    subtitle: 'سيتوفر قريباً',
    iconType: 'phone-portrait-outline',
    brand: 'جوالي',
    brandBg: '#94A3B8',
    available: false,
  },
  {
    id: 'kuraimi',
    name: 'الكريمي',
    subtitle: 'سيتوفر قريباً',
    iconType: 'business-outline',
    brand: 'كريمي',
    brandBg: '#94A3B8',
    available: false,
  },
  {
    id: 'card',
    name: 'بطاقة بنكية',
    subtitle: 'سيتوفر قريباً',
    iconType: 'card-outline',
    brand: 'CARD',
    brandBg: '#94A3B8',
    available: false,
  },
];

export default function CheckoutScreen({ navigation, route }: any) {
  const { items, getSelectedByStore, clearSelected } = useCartStore();
  const user = useAuthStore((s) => s.user);
  // يُطلب فقط ما حدده العميل في السلة
  const selectedItems = items.filter(isCartItemSelected);
  const cartTotal = selectedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // Params passed from AddressSelectionScreen or fallback
  const paramAddressId = route.params?.selectedAddressId;
  const paramAltPhone = route.params?.altPhone;

  // Selected Address State
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(true);

  // Payment Selection
  const [selectedPayment, setSelectedPayment] = useState('cash');
  const [showAllPaymentMethods, setShowAllPaymentMethods] = useState(false);

  // Order Placement State
  const [placing, setPlacing] = useState(false);
  const [orderSucceeded, setOrderSucceeded] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const checkoutAttempt = useRef({ fingerprint: '', key: createIdempotencyKey() });
  const submitLock = useRef(false);

  // Coupon State
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState('');

  // Tax Invoice Option State
  const [needTaxInvoice, setNeedTaxInvoice] = useState(true);

  // Summary Toggle
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  const storeCount = Math.max(1, Object.keys(getSelectedByStore()).length);

  // رسوم التوصيل الحقيقية: تُقدَّر بنفس منطق السيرفر (منطقة توصيل حسب مدينة العنوان لكل متجر)
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeMatched, setFeeMatched] = useState(false);
  const [feeError, setFeeError] = useState(false);

  const finalTotal = Math.max(0, cartTotal + deliveryFee - (couponApplied ? discount : 0));
  const totalCount = selectedItems.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    let active = true;
    const city = selectedAddress?.city;
    const merchantIds = Object.keys(getSelectedByStore());
    if (!city || merchantIds.length === 0) {
      setDeliveryFee(0);
      setFeeMatched(false);
      setFeeLoading(false);
      return;
    }
    setFeeLoading(true);
    setFeeError(false);
    estimateDeliveryFees(city, merchantIds)
      .then((est) => {
        if (!active) return;
        setDeliveryFee(est.total);
        setFeeMatched(est.matched);
      })
      .catch(() => {
        if (!active) return;
        setDeliveryFee(0);
        setFeeMatched(false);
        setFeeError(true);
      })
      .finally(() => {
        if (active) setFeeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedAddress?.city, selectedItems.length]);

  // Fetch or resolve delivery address
  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setLoadingAddress(false);
      return;
    }

    setLoadingAddress(true);
    getAddresses(user.id)
      .then((addresses) => {
        if (!active) return;
        let chosen: Address | undefined;
        if (paramAddressId) {
          chosen = addresses.find((a) => a.id === paramAddressId);
        }
        if (!chosen) {
          chosen = addresses.find((a) => a.is_default) ?? addresses[0];
        }
        setSelectedAddress(chosen ?? null);
      })
      .catch(() => {
        // Fallback gracefully
      })
      .finally(() => {
        if (active) setLoadingAddress(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id, paramAddressId]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    // السيرفر يرفض الكوبون عندما تضم السلة أكثر من متجر (GROUP_COUPON_REQUIRES_SINGLE_STORE)
    if (storeCount > 1) {
      setDiscount(0);
      setCouponApplied(false);
      setCouponMsg('كود الخصم متاح فقط عند الطلب من متجر واحد. قسّم طلبك أو احذف منتجات المتاجر الأخرى.');
      return;
    }
    setCheckingCoupon(true);
    setCouponMsg('');
    try {
      const res = await validateCoupon(couponCode.trim(), cartTotal);
      if (res.valid) {
        setDiscount(res.discount);
        setCouponApplied(true);
        setCouponMsg(res.message || 'تم تطبيق الكوبون بنجاح');
      } else {
        setDiscount(0);
        setCouponApplied(false);
        setCouponMsg(res.message || 'كود الخصم غير صالح أو انتهت صلاحيته');
      }
    } catch {
      setDiscount(0);
      setCouponApplied(false);
      setCouponMsg('تعذّر التحقق من الكود');
    } finally {
      setCheckingCoupon(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (submitLock.current) return;
    setSubmitError('');

    if (!user?.id) {
      Alert.alert('تنبيه', 'يجب تسجيل الدخول لطلب المنتجات');
      return;
    }

    if (!selectedAddress) {
      Alert.alert('تنبيه', 'يرجى تحديد عنوان التوصيل أولاً', [
        {
          text: 'اختيار العنوان',
          onPress: () => navigation.navigate('AddressSelection'),
        },
      ]);
      return;
    }

    if (selectedItems.length === 0) {
      Alert.alert('تنبيه', 'لم تحدد أي منتج للطلب. ارجع للسلة وحدد المنتجات المطلوبة.');
      return;
    }

    submitLock.current = true;
    setPlacing(true);

    try {
      const byStore = getSelectedByStore();
      const stores = Object.entries(byStore).map(([storeId, storeItems]) => ({
        merchant_id: storeId,
        items: storeItems.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          quantity: item.quantity,
        })),
      }));

      const requestFingerprint = JSON.stringify({
        address_id: selectedAddress.id,
        payment_method: 'cash', // Fallback to cash in system
        coupon_code: couponApplied && couponCode.trim() ? couponCode.trim() : null,
        notes: paramAltPhone ? `هاتف إضافي: ${paramAltPhone}` : null,
        stores,
      });

      const attemptStorageKey = `marketplace-checkout-attempt-v1:${user.id}`;
      let persistedAttempt: { fingerprint?: string; key?: string } | null = null;
      try {
        const stored = await appStorage.getItem(attemptStorageKey);
        persistedAttempt = stored ? (JSON.parse(stored) as { fingerprint?: string; key?: string }) : null;
      } catch {
        persistedAttempt = null;
      }

      if (
        persistedAttempt?.fingerprint === requestFingerprint &&
        typeof persistedAttempt.key === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(persistedAttempt.key)
      ) {
        checkoutAttempt.current = { fingerprint: requestFingerprint, key: persistedAttempt.key };
      } else if (checkoutAttempt.current.fingerprint !== requestFingerprint) {
        checkoutAttempt.current = { fingerprint: requestFingerprint, key: createIdempotencyKey() };
      }

      try {
        await appStorage.setItem(attemptStorageKey, JSON.stringify(checkoutAttempt.current));
      } catch (storageError) {
        console.warn('Could not persist checkout attempt:', storageError);
      }

      await createOrderGroup({
        address_id: selectedAddress.id,
        payment_method: 'cash',
        notes: paramAltPhone ? `رقم تواصل إضافي: ${paramAltPhone}` : undefined,
        coupon_code: couponApplied && couponCode.trim() ? couponCode.trim() : undefined,
        idempotency_key: checkoutAttempt.current.key,
        stores,
      });

      // نزيل من السلة ما طُلب فعلاً فقط؛ غير المحدد يبقى للعميل
      clearSelected();
      try {
        await appStorage.removeItem(attemptStorageKey);
      } catch (storageError) {
        console.warn('Could not clear checkout attempt:', storageError);
      }
      checkoutAttempt.current = { fingerprint: '', key: createIdempotencyKey() };
      setOrderSucceeded(true);
    } catch (e: any) {
      const message = e?.message ?? 'تعذّر إكمال الدفع، يرجى المحاولة مرة أخرى.';
      setSubmitError(message);
      Alert.alert('تعذّر إكمال الطلب', message);
    } finally {
      submitLock.current = false;
      setPlacing(false);
    }
  };

  const visiblePaymentMethods = showAllPaymentMethods ? PAYMENT_OPTIONS : PAYMENT_OPTIONS.slice(0, 2);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('AddressSelection')}>
            <Ionicons name="arrow-forward" size={20} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerCenterCol}>
            <Text style={styles.headerTitle}>الدفع</Text>
            <Text style={styles.headerSub}>أنت على بعد خطوة واحدة من إتمام طلبك</Text>
          </View>
          <View style={{ width: 42 }} />
        </View>

        {/* 4-Step Stepper Header */}
        <View style={styles.stepperRow}>
          {/* Step 1: Cart */}
          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.stepCircleDone]}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, styles.stepLabelDone]}>سلة المشتريات</Text>
          </View>
          <View style={[styles.stepLine, styles.stepLineDone]} />

          {/* Step 2: Address */}
          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.stepCircleDone]}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, styles.stepLabelDone]}>العنوان</Text>
          </View>
          <View style={[styles.stepLine, styles.stepLineDone]} />

          {/* Step 3: Payment (ACTIVE) */}
          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.stepCircleActive]}>
              <Ionicons name="card" size={15} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, styles.stepLabelActive]}>الدفع</Text>
          </View>
          <View style={styles.stepLine} />

          {/* Step 4: Confirm */}
          <View style={styles.stepCol}>
            <View style={styles.stepCircle}>
              <Ionicons name="checkmark-done-outline" size={15} color="#94A3B8" />
            </View>
            <Text style={styles.stepLabel}>تأكيد الطلب</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Selected Address Banner Banner Card */}
        <TouchableOpacity
          style={styles.selectedAddressBannerCard}
          onPress={() => navigation.navigate('AddressSelection')}
          activeOpacity={0.85}
        >
          <View style={styles.addressRightWrap}>
            <View style={styles.locationIconCircle}>
              <Ionicons name="location" size={18} color="#172554" />
            </View>
            <View style={styles.addressTextCol}>
              <Text style={styles.addressBannerTitle}>
                عنوان التوصيل المساعد: {selectedAddress?.label || 'المنزل'}
              </Text>
              <Text style={styles.addressBannerSub} numberOfLines={1}>
                {loadingAddress
                  ? 'جاري تحميل العنوان...'
                  : selectedAddress?.full_address || 'انقر لاختيار وتعديل عنوان التوصيل'}
              </Text>
            </View>
          </View>
          <View style={styles.changeAddressBadge}>
            <Text style={styles.changeAddressText}>تغيير</Text>
          </View>
        </TouchableOpacity>

        {/* Card 1: Order Summary */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.summaryHeaderRow}
            onPress={() => setSummaryExpanded(!summaryExpanded)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={summaryExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#64748B"
            />
            <View style={styles.summaryTitleWrap}>
              <Text style={styles.cardTitle}>ملخص الطلب</Text>
              <Text style={styles.itemsCountBadge}>{totalCount} منتجات</Text>
            </View>
          </TouchableOpacity>

          {summaryExpanded && (
            <View style={styles.summaryBodyContainer}>
              <View style={styles.summaryMainRow}>
                {/* Right Side: Product Image Thumbnails */}
                <View style={styles.thumbnailsRow}>
                  {selectedItems.slice(0, 3).map((item, idx) => (
                    <View key={item.id} style={styles.thumbWrapper}>
                      <Image
                        source={{
                          uri:
                            item.image ||
                            'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=200&q=80',
                        }}
                        style={styles.thumbImg}
                        resizeMode="cover"
                      />
                    </View>
                  ))}
                  {selectedItems.length > 3 && (
                    <View style={styles.thumbMoreBadge}>
                      <Text style={styles.thumbMoreText}>+{selectedItems.length - 3}</Text>
                    </View>
                  )}
                </View>

                {/* Left Side: Summary Costs */}
                <View style={styles.costsCol}>
                  <View style={styles.costItemRow}>
                    <Text style={styles.costValueText}>{cartTotal.toLocaleString()} ر.ي</Text>
                    <Text style={styles.costLabelText}>المجموع الفرعي</Text>
                  </View>

                  <View style={styles.costItemRow}>
                    {feeLoading ? (
                      <Text style={styles.costValueText}>...</Text>
                    ) : feeError ? (
                      <Text style={styles.costValueText}>تعذّر الحساب</Text>
                    ) : deliveryFee > 0 ? (
                      <Text style={styles.costValueText}>{deliveryFee.toLocaleString()} ر.ي</Text>
                    ) : feeMatched ? (
                      <Text style={styles.freeGreenText}>مجاني</Text>
                    ) : (
                      <Text style={styles.costValueText}>تُحدَّد عند التأكيد</Text>
                    )}
                    <Text style={styles.costLabelText}>
                      تكلفة التوصيل{storeCount > 1 ? ` (${storeCount} متاجر)` : ''}
                    </Text>
                  </View>

                  {couponApplied && (
                    <View style={styles.costItemRow}>
                      <Text style={styles.discountGreenText}>{discount.toLocaleString()}- ر.ي</Text>
                      <Text style={styles.costLabelText}>كوبون خصم</Text>
                    </View>
                  )}

                  <View style={styles.totalCostRow}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.totalCostVal}>{finalTotal.toLocaleString()} ر.ي</Text>
                      <Text style={styles.vatSubText}>
                        {feeError || (!feeLoading && !feeMatched)
                          ? 'المبلغ تقديري — يُحتسب النهائي عند تأكيد الطلب'
                          : 'المبلغ النهائي يُحتسب عند تأكيد الطلب'}
                      </Text>
                    </View>
                    <Text style={styles.totalCostLabel}>الإجمالي</Text>
                  </View>
                </View>
              </View>

              {/* Savings Highlight Pill */}
              {couponApplied && discount > 0 && (
                <View style={styles.savingsPillCard}>
                  <Text style={styles.savingsPillText}>🎉 توفير {discount.toLocaleString()} ر.ي على هذا الطلب</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Card 2: Payment Options Selection */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.secureBadgeRow}>
              <Ionicons name="lock-closed-outline" size={13} color="#64748B" />
              <Text style={styles.secureBadgeText}>جميع المعاملات آمنة ومشفّرة</Text>
            </View>
            <Text style={styles.cardTitle}>اختر طريقة الدفع</Text>
          </View>

          <View style={styles.paymentMethodsList}>
            {visiblePaymentMethods.map((method) => {
              const isSelected = selectedPayment === method.id;
              return (
                <TouchableOpacity
                  key={method.id}
                  style={[styles.pmItemCard, isSelected && styles.pmItemCardSelected, !method.available && styles.pmItemCardDisabled]}
                  onPress={() => method.available && setSelectedPayment(method.id)}
                  disabled={!method.available}
                  activeOpacity={0.85}
                  accessibilityState={{ disabled: !method.available, selected: isSelected }}
                >
                  {/* Left Side: Brand Logo/Badge */}
                  <View style={styles.pmBrandWrap}>
                    <View style={[styles.pmBrandBox, { backgroundColor: method.brandBg }]}>
                      <Text style={styles.pmBrandText}>{method.brand}</Text>
                    </View>
                  </View>

                  {/* Middle: Method Info (RTL) */}
                  <View style={styles.pmInfoCol}>
                    <Text style={styles.pmNameText}>{method.name}</Text>
                    <Text style={styles.pmSubText}>{method.subtitle}</Text>
                  </View>

                  {/* Right Side: Radio Check */}
                  {method.available ? (
                    <View style={[styles.pmRadioCircle, isSelected && styles.pmRadioCircleSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                  ) : (
                    <View style={styles.pmSoonBadge}>
                      <Text style={styles.pmSoonText}>قريباً</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Expand Payment Options Toggle */}
          <TouchableOpacity
            style={styles.expandPaymentBtn}
            onPress={() => setShowAllPaymentMethods(!showAllPaymentMethods)}
          >
            <Text style={styles.expandPaymentText}>
              {showAllPaymentMethods ? 'عرض أقل ∧' : 'عرض جميع طرق الدفع ∨'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Card 3: Active Coupon Discount */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="pricetag-outline" size={17} color="#172554" />
            <Text style={styles.cardTitle}>كوبون خصم</Text>
          </View>

          {couponApplied ? (
            <View style={styles.appliedCouponRow}>
              <TouchableOpacity
                onPress={() => {
                  setCouponApplied(false);
                  setDiscount(0);
                  setCouponCode('');
                  setCouponMsg('');
                }}
              >
                <Text style={styles.removeCouponText}>إلغاء</Text>
              </TouchableOpacity>

              <View style={styles.appliedCouponBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#059669" />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.appliedCouponCode}>{couponCode}</Text>
                  <Text style={styles.appliedCouponSub}>تم تطبيق الكوبون بنجاح</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.couponInputWrapper}>
              <View style={styles.couponInputRow}>
                <TouchableOpacity
                  style={styles.couponApplyBtn}
                  onPress={handleApplyCoupon}
                  disabled={checkingCoupon || !couponCode.trim()}
                >
                  {checkingCoupon ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.couponApplyBtnText}>تطبيق</Text>
                  )}
                </TouchableOpacity>

                <TextInput
                  style={styles.couponTextInput}
                  placeholder="أدخل كود الخصم (مثال: WELCOME15)"
                  placeholderTextColor="#94A3B8"
                  value={couponCode}
                  onChangeText={(t: string) => {
                    setCouponCode(t);
                    setCouponMsg('');
                  }}
                  autoCapitalize="characters"
                  textAlign="right"
                />
              </View>
              {!!couponMsg && (
                <Text style={[styles.couponMsgText, couponApplied ? { color: '#059669' } : { color: '#EF4444' }]}>
                  {couponMsg}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Card 4: Tax Invoice Request */}
        <View style={styles.card}>
          <View style={styles.taxInvoiceRow}>
            <Switch
              value={needTaxInvoice}
              onValueChange={setNeedTaxInvoice}
              trackColor={{ false: '#CBD5E1', true: '#172554' }}
              thumbColor="#FFFFFF"
            />

            <View style={styles.taxInvoiceRightCol}>
              <View style={styles.taxInvoiceTitleRow}>
                <Ionicons name="receipt-outline" size={17} color="#172554" style={{ marginLeft: 6 }} />
                <Text style={styles.taxInvoiceTitle}>فاتورة ضريبية</Text>
              </View>
              <Text style={styles.taxInvoiceSub}>أريد الحصول على فاتورة ضريبية رسمية</Text>
            </View>
          </View>
        </View>

        {/* Error Alert Card */}
        {!!submitError && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed Bottom Payment Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarRow}>
          {/* Left Column: Total Cost */}
          <View style={styles.bottomTotalCol}>
            <Text style={styles.bottomTotalLabel}>الإجمالي الكلي</Text>
            <Text style={styles.bottomTotalValue}>{finalTotal.toLocaleString()} ر.ي</Text>
            <Text style={styles.bottomVatSub}>شامل رسوم التوصيل — يُحتسب النهائي عند التأكيد</Text>
          </View>

          {/* Right Column: Complete Payment CTA Button */}
          <TouchableOpacity
            style={[styles.checkoutBtn, placing && { opacity: 0.7 }]}
            onPress={handleConfirmOrder}
            disabled={placing}
            activeOpacity={0.88}
          >
            {placing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.checkoutBtnInner}>
                <Ionicons name="lock-closed" size={16} color="#FFFFFF" />
                <Text style={styles.checkoutBtnText}>إتمام الدفع</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.termsSubText}>
          بالضغط على إتمام الدفع أنت توافق على الشروط والأحكام
        </Text>

        {/* Trust Benefits Footer Bar */}
        <View style={styles.trustFooterBar}>
          <View style={styles.trustItem}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#64748B" />
            <Text style={styles.trustText}>دفع آمن 100%</Text>
          </View>
          <Text style={styles.trustDivider}>|</Text>
          <View style={styles.trustItem}>
            <Ionicons name="bus-outline" size={13} color="#64748B" />
            <Text style={styles.trustText}>توصيل سريع وآمن</Text>
          </View>
          <Text style={styles.trustDivider}>|</Text>
          <View style={styles.trustItem}>
            <Ionicons name="ribbon-outline" size={13} color="#64748B" />
            <Text style={styles.trustText}>تجربة موثوقة</Text>
          </View>
        </View>
      </View>

      {/* Success Modal Overlay */}
      {orderSucceeded && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Ionicons name="checkmark-circle" size={68} color="#059669" style={{ marginBottom: 14 }} />
            <Text style={styles.overlayTitle}>تم إرسال طلبك بنجاح! 🎉</Text>
            <Text style={styles.overlaySub}>سيتم توصيل طلبك في أقرب وقت. متابعة الحالة مريحة من صفحة طلباتي.</Text>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => {
                setOrderSucceeded(false);
                navigation.navigate('Orders', { screen: 'OrdersList' });
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.successBtnText}>عرض طلباتي</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerCenterCol: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#0F172A',
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  stepCol: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepCircleActive: {
    backgroundColor: '#172554', // Dark Royal Blue
    borderColor: '#172554',
  },
  stepCircleDone: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  stepLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  stepLabelActive: {
    fontFamily: FONTS.bold,
    color: '#172554',
  },
  stepLabelDone: {
    color: '#059669',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 6,
    marginBottom: 14,
  },
  stepLineDone: {
    backgroundColor: '#059669',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 170,
  },
  selectedAddressBannerCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F5FF',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 14,
  },
  addressRightWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  locationIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  addressBannerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: '#0F172A',
  },
  addressBannerSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  changeAddressBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  changeAddressText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: '#172554',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#0F172A',
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitleWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  itemsCountBadge: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#64748B',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  summaryBodyContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  summaryMainRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  thumbnailsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  thumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbMoreBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbMoreText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#64748B',
  },
  costsCol: {
    alignItems: 'flex-start',
    gap: 6,
  },
  costItemRow: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  costLabelText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#64748B',
  },
  costValueText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: '#0F172A',
  },
  freeGreenText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#059669',
  },
  discountGreenText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#059669',
  },
  totalCostRow: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  totalCostLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#0F172A',
  },
  totalCostVal: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#0F172A',
  },
  vatSubText: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: '#94A3B8',
  },
  savingsPillCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  savingsPillText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#047857',
  },
  secureBadgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  secureBadgeText: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: '#64748B',
  },
  paymentMethodsList: {
    gap: 8,
  },
  pmItemCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  pmItemCardSelected: {
    borderColor: '#172554',
    backgroundColor: '#F0F5FF',
  },
  pmItemCardDisabled: {
    opacity: 0.55,
  },
  pmSoonBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pmSoonText: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    color: '#64748B',
  },
  pmRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pmRadioCircleSelected: {
    borderColor: '#172554',
    backgroundColor: '#172554',
  },
  pmInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 10,
    marginLeft: 10,
  },
  pmNameText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#0F172A',
  },
  pmSubText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  pmBrandWrap: {},
  pmBrandBox: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pmBrandText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  expandPaymentBtn: {
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 4,
  },
  expandPaymentText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#172554',
  },
  appliedCouponRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  appliedCouponBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 8,
  },
  appliedCouponCode: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#065F46',
  },
  appliedCouponSub: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: '#047857',
  },
  removeCouponText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#EF4444',
  },
  couponInputWrapper: {
    marginTop: 6,
  },
  couponInputRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  couponApplyBtn: {
    backgroundColor: '#172554',
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  couponApplyBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  couponTextInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
  },
  couponMsgText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    marginTop: 6,
    textAlign: 'right',
  },
  taxInvoiceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taxInvoiceRightCol: {
    alignItems: 'flex-end',
  },
  taxInvoiceTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  taxInvoiceTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#0F172A',
  },
  taxInvoiceSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  errorCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  errorText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
    textAlign: 'right',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomBarRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  bottomTotalCol: {
    alignItems: 'flex-end',
  },
  bottomTotalLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
  },
  bottomTotalValue: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#0F172A',
  },
  bottomVatSub: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: '#94A3B8',
  },
  checkoutBtn: {
    flex: 1,
    backgroundColor: '#172554', // Dark Royal Blue
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
  termsSubText: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
  trustFooterBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  trustItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  trustText: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    color: '#64748B',
  },
  trustDivider: {
    color: '#CBD5E1',
    fontSize: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: 20,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  overlayTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  overlaySub: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  successBtn: {
    backgroundColor: '#172554',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  successBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
