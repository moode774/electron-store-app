import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, useWindowDimensions,
  Platform, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SERVICE_AREAS } from '@marketplace/shared-utils';
import {
  Address, useCartStore, useAuthStore, createOrderGroup, createIdempotencyKey,
  createAddress, getAddresses, validateCoupon, appStorage,
} from '@marketplace/shared-hooks';
import { Alert } from '../../../components/appAlert';

const UI = {
  primary:   '#111827',
  bg:        '#F3F4F6',
  white:     '#FFFFFF',
  textDark:  '#111827',
  textGrey:  '#4B5563',
  textMuted: '#9CA3AF',
  border:    '#E5E7EB',
  green:     '#10B981',
  blue:      '#3B82F6',
  red:       '#EF4444',
  purple:    '#7C3AED',
  amber:     '#F59E0B',
};

const shadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
  elevation: 2,
};

const DELIVERY_FEES: Record<string, number> = {
  [SERVICE_AREAS.SANAA]: 1000,
  [SERVICE_AREAS.ADEN]:  1500,
  [SERVICE_AREAS.IBB]:   1200,
  [SERVICE_AREAS.TAIZ]:  1200,
};

const AREA_LABELS: Record<string, string> = {
  [SERVICE_AREAS.SANAA]: 'صنعاء',
  [SERVICE_AREAS.ADEN]:  'عدن',
  [SERVICE_AREAS.IBB]:   'إب',
  [SERVICE_AREAS.TAIZ]:  'تعز',
};

const PAYMENT_METHODS = [
  { id: 'cash',   label: 'الدفع عند الاستلام',   subtitle: 'ادفع نقداً عند استلام طلبك',  icon: 'cash-outline',            accent: UI.green,  bg: '#ECFDF5' },
] as const;

export default function CheckoutScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const { getTotalPrice, items, getItemsByStore, clearCart } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const cartTotal = getTotalPrice();

  // Delivery
  const [address,      setAddress]      = useState('');
  const [landmark,     setLandmark]     = useState('');
  const [altPhone,     setAltPhone]     = useState('');
  const [selectedArea, setSelectedArea] = useState<string>(SERVICE_AREAS.SANAA);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(true);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  // Order
  const [placing,     setPlacing]     = useState(false);
  const [orderSucceeded, setOrderSucceeded] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const checkoutAttempt = useRef({ fingerprint: '', key: createIdempotencyKey() });
  const submitLock = useRef(false);

  // Coupon
  const [couponCode,     setCouponCode]     = useState('');
  const [discount,       setDiscount]       = useState(0);
  const [couponMsg,      setCouponMsg]      = useState('');
  const [couponOk,       setCouponOk]       = useState(false);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const storeCount        = Math.max(1, Object.keys(getItemsByStore()).length);
  const couponAvailable   = storeCount === 1;
  const deliveryFee       = DELIVERY_FEES[selectedArea] || 1500;
  const totalDeliveryFees = deliveryFee * storeCount;
  const finalTotal        = Math.max(0, cartTotal + totalDeliveryFees - discount);
  const selectedSavedAddress = savedAddresses.find((item) => item.id === selectedAddressId) ?? null;

  useEffect(() => {
    if (!couponAvailable) {
      setCouponCode('');
      setDiscount(0);
      setCouponOk(false);
      setCouponMsg('');
    }
  }, [couponAvailable]);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setSavedAddresses([]);
      setSelectedAddressId(null);
      setUseNewAddress(true);
      setLoadingAddresses(false);
      return () => { active = false; };
    }

    setLoadingAddresses(true);
    getAddresses(user.id)
      .then((addresses) => {
        if (!active) return;
        setSavedAddresses(addresses);
        const preferred = addresses.find((item) => item.is_default) ?? addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setUseNewAddress(false);
          if (preferred.city && Object.values(SERVICE_AREAS).includes(preferred.city as any)) {
            setSelectedArea(preferred.city);
          }
        }
      })
      .catch(() => {
        if (active) setSubmitError('تعذّر تحميل عناوينك المحفوظة. يمكنك إدخال عنوان جديد.');
      })
      .finally(() => { if (active) setLoadingAddresses(false); });

    return () => { active = false; };
  }, [user?.id]);

  const showError = (title: string, message: string) => {
    setSubmitError(message);
    Alert.alert(title, message);
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    if (!couponAvailable) {
      setDiscount(0); setCouponOk(false);
      setCouponMsg('يُطبّق الكوبون على طلب متجر واحد فقط. افصل مشتريات المتاجر ثم استخدم الكود.');
      return;
    }
    setCheckingCoupon(true);
    try {
      const res = await validateCoupon(couponCode, cartTotal);
      setDiscount(res.discount); setCouponOk(res.valid); setCouponMsg(res.message);
    } catch {
      setDiscount(0); setCouponOk(false); setCouponMsg('تعذّر التحقق من الكود');
    } finally { setCheckingCoupon(false); }
  };

  const handleConfirmOrder = async () => {
    if (submitLock.current) return;
    setSubmitError('');
    if (!user?.id) { showError('خطأ', 'يجب تسجيل الدخول أولاً'); return; }
    if (!selectedSavedAddress && !address.trim()) { showError('تنبيه', 'اختر عنواناً محفوظاً أو أدخل عنوان توصيل جديداً'); return; }
    if (items.length === 0) { showError('تنبيه', 'السلة فارغة'); return; }
    if (!couponAvailable && couponCode.trim()) {
      showError('الكوبون غير قابل للتوزيع', 'السلة تحتوي أكثر من متجر. احذف الكوبون أو نفّذ طلب كل متجر منفصلاً.');
      return;
    }

    submitLock.current = true;
    setPlacing(true);
    try {
      let deliveryAddress = selectedSavedAddress;
      if (!deliveryAddress) {
        deliveryAddress = await createAddress({
          user_id: user.id,
          label: 'home',
          full_address: `${address.trim()}${landmark.trim() ? ' - ' + landmark.trim() : ''}`,
          city: selectedArea,
        });
        setSavedAddresses((current) => [deliveryAddress!, ...current]);
        setSelectedAddressId(deliveryAddress.id);
        setUseNewAddress(false);
      }

      const byStore = getItemsByStore();
      const stores = Object.entries(byStore).map(([storeId, storeItems]) => ({
        merchant_id: storeId,
        items: storeItems.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          quantity: item.quantity,
        })),
      }));
      const requestFingerprint = JSON.stringify({
        address_id: deliveryAddress.id,
        payment_method: 'cash',
        coupon_code: couponCode.trim() || null,
        notes: altPhone.trim() || null,
        stores,
      });
      const attemptStorageKey = `marketplace-checkout-attempt-v1:${user.id}`;
      let persistedAttempt: { fingerprint?: string; key?: string } | null = null;
      try {
        const stored = await appStorage.getItem(attemptStorageKey);
        persistedAttempt = stored ? JSON.parse(stored) as { fingerprint?: string; key?: string } : null;
      } catch {
        persistedAttempt = null;
      }
      if (persistedAttempt?.fingerprint === requestFingerprint
        && typeof persistedAttempt.key === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(persistedAttempt.key)) {
        checkoutAttempt.current = { fingerprint: requestFingerprint, key: persistedAttempt.key };
      } else if (checkoutAttempt.current.fingerprint !== requestFingerprint) {
        checkoutAttempt.current = { fingerprint: requestFingerprint, key: createIdempotencyKey() };
      }
      try {
        await appStorage.setItem(attemptStorageKey, JSON.stringify(checkoutAttempt.current));
      } catch (storageError) {
        console.warn('Could not persist checkout idempotency attempt:', storageError);
      }
      await createOrderGroup({
        address_id: deliveryAddress.id,
        payment_method: 'cash',
        notes: altPhone.trim() ? `رقم تواصل إضافي: ${altPhone.trim()}` : undefined,
        coupon_code: couponCode.trim() || undefined,
        idempotency_key: checkoutAttempt.current.key,
        stores,
      });

      // The group RPC is atomic: either every store order exists or none does.
      clearCart();
      try {
        await appStorage.removeItem(attemptStorageKey);
      } catch (storageError) {
        console.warn('Could not clear persisted checkout idempotency attempt:', storageError);
      }
      checkoutAttempt.current = { fingerprint: '', key: createIdempotencyKey() };
      setOrderSucceeded(true);
    } catch (e: any) {
      const message = e?.message ?? 'تعذّر إرسال الطلب. لم تُمسح السلة ويمكنك المحاولة مجدداً.';
      showError('تعذّر إكمال الطلب', message);
    } finally {
      submitLock.current = false;
      setPlacing(false);
    }
  };

  // ─── Reusable Blocks ──────────────────────────────────────

  const deliveryBlock = (
    <View style={s.card}>
      <Row icon="location-outline" iconBg="#EFF6FF" iconColor={UI.blue} title="عنوان التوصيل" />

      {loadingAddresses ? <ActivityIndicator color={UI.blue} style={{ marginVertical: 12 }} /> : null}

      {savedAddresses.length > 0 ? (
        <>
          <Label>اختر عنواناً محفوظاً</Label>
          <View style={s.savedAddressesList}>
            {savedAddresses.map((item) => {
              const selected = !useNewAddress && selectedAddressId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.savedAddressCard, selected && s.savedAddressCardSelected]}
                  onPress={() => {
                    setSelectedAddressId(item.id);
                    setUseNewAddress(false);
                    if (item.city && Object.values(SERVICE_AREAS).includes(item.city as any)) setSelectedArea(item.city);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={`${item.label || 'عنوان'}، ${item.full_address}`}
                  accessibilityState={{ selected }}
                  activeOpacity={0.8}
                >
                  <View style={[s.savedAddressRadio, selected && s.savedAddressRadioSelected]}>
                    {selected ? <View style={s.savedAddressRadioDot} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.savedAddressLabel}>{item.label || 'عنوان محفوظ'}{item.is_default ? ' • الافتراضي' : ''}</Text>
                    <Text style={s.savedAddressText}>{item.full_address}</Text>
                    {item.city ? <Text style={s.savedAddressCity}>{AREA_LABELS[item.city] || item.city}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[s.newAddressBtn, useNewAddress && s.newAddressBtnSelected]}
            onPress={() => { setUseNewAddress(true); setSelectedAddressId(null); }}
            accessibilityRole="button"
            accessibilityLabel="استخدام عنوان جديد"
            accessibilityState={{ selected: useNewAddress }}
          >
            <Ionicons name="add-circle-outline" size={18} color={useNewAddress ? UI.white : UI.blue} />
            <Text style={[s.newAddressBtnText, useNewAddress && { color: UI.white }]}>استخدام عنوان جديد</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {useNewAddress ? (
        <>
          <Label>المنطقة / المدينة</Label>
          <View style={s.areasRow}>
            {Object.values(SERVICE_AREAS).map((area) => (
              <TouchableOpacity
                key={area}
                style={[s.areaChip, selectedArea === area && s.areaChipOn]}
                onPress={() => setSelectedArea(area)}
                accessibilityRole="radio"
                accessibilityLabel={AREA_LABELS[area] || area}
                accessibilityState={{ selected: selectedArea === area }}
              >
                <Text style={[s.areaChipTxt, selectedArea === area && s.areaChipTxtOn]}>
                  {AREA_LABELS[area] || area}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label>الشارع / الحي *</Label>
          <TextInput style={s.input} placeholder="مثال: شارع حدة، خلف المول" placeholderTextColor={UI.textMuted}
            value={address} onChangeText={setAddress} textAlign="right" accessibilityLabel="الشارع والحي" />

          <Label>أقرب معلم بارز</Label>
          <TextInput style={s.input} placeholder="مسجد، مدرسة، مستشفى..." placeholderTextColor={UI.textMuted}
            value={landmark} onChangeText={setLandmark} textAlign="right" accessibilityLabel="أقرب معلم بارز" />
        </>
      ) : null}

      <Label>رقم هاتف إضافي (اختياري)</Label>
      <TextInput style={[s.input, { marginBottom: 0 }]} placeholder="7xxxxxxxx" placeholderTextColor={UI.textMuted}
        value={altPhone} onChangeText={setAltPhone} keyboardType="phone-pad" textAlign="right" accessibilityLabel="رقم هاتف إضافي" />
    </View>
  );

  const paymentBlock = (
    <View style={s.card}>
      <Row icon="cash-outline" iconBg="#ECFDF5" iconColor={UI.green} title="طريقة الدفع" />

      {PAYMENT_METHODS.map((method) => (
        <View key={method.id} style={[s.pmCard, { borderColor: method.accent, borderWidth: 2 }]} accessibilityRole="text" accessibilityLabel={`${method.label}. ${method.subtitle}`}>
          <View style={[s.pmIconBox, { backgroundColor: method.bg }]}>
            <Ionicons name={method.icon} size={20} color={method.accent} />
          </View>
          <View style={s.pmInfo}>
            <Text style={[s.pmLabel, { color: method.accent }]}>{method.label}</Text>
            <Text style={s.pmSub}>{method.subtitle}</Text>
          </View>
          <View style={[s.pmRadio, { borderColor: method.accent }]}>
            <View style={[s.pmRadioDot, { backgroundColor: method.accent }]} />
          </View>
        </View>
      ))}

      <InfoBox icon="information-circle-outline" color="#047857" bg="#ECFDF5" border="#A7F3D0" mt={10}>
        لن يطلب التطبيق بيانات بطاقة أو رمز CVV. الدفع الإلكتروني غير متاح في وضع التطوير الحالي.
      </InfoBox>
    </View>
  );

  const couponBlock = (
    <View style={s.card}>
      <Row icon="pricetag-outline" iconBg="#FFFBEB" iconColor={UI.amber} title="كود الخصم" />
      <View style={s.couponRow}>
        <TouchableOpacity style={s.couponBtn} onPress={applyCoupon} disabled={checkingCoupon || !couponAvailable} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="تطبيق كود الخصم" accessibilityState={{ disabled: checkingCoupon || !couponAvailable, busy: checkingCoupon }}>
          {checkingCoupon
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Text style={s.couponBtnTxt}>تطبيق</Text>}
        </TouchableOpacity>
        <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]}
          placeholder="أدخل كود الخصم" placeholderTextColor={UI.textMuted}
          value={couponCode}
          editable={couponAvailable}
          onChangeText={(t) => { setCouponCode(t); setCouponOk(false); setDiscount(0); setCouponMsg(''); }}
          autoCapitalize="characters" textAlign="right" />
      </View>
      {!couponAvailable ? <Text style={[s.couponMsg, { color: UI.amber }]}>الكوبون متاح عندما تكون السلة من متجر واحد فقط.</Text> : null}
      {!!couponMsg && <Text style={[s.couponMsg, { color: couponOk ? UI.green : UI.red }]}>{couponMsg}</Text>}
    </View>
  );

  const summaryBlock = (
    <View style={s.card}>
      <Row icon="receipt-outline" iconBg={UI.bg} iconColor={UI.primary} title="ملخص الطلب" />
      {Object.entries(getItemsByStore()).map(([sid, storeItems]) => (
        <View key={sid} style={{ marginBottom: 10 }}>
          <Text style={s.storeGroupName}>{storeItems[0]?.storeName || 'المتجر'}</Text>
          {storeItems.map((item) => (
            <View key={item.id} style={s.sumItem}>
              <Text style={s.sumItemPrice}>{(item.price * item.quantity).toLocaleString()} ر.ي</Text>
              <Text style={s.sumItemName} numberOfLines={1}>{item.name} × {item.quantity}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={s.divider} />
      <SumRow label="المجموع الفرعي" value={`${cartTotal.toLocaleString()} ر.ي`} />
      <SumRow label={`رسوم التوصيل${storeCount > 1 ? ` (${storeCount} متاجر × ${deliveryFee})` : ''}`}
              value={`${totalDeliveryFees.toLocaleString()} ر.ي`} />
      {discount > 0 && <SumRow label="خصم الكوبون" value={`- ${discount.toLocaleString()} ر.ي`} green />}
      <View style={s.divider} />
      <View style={s.totalRow}>
        <Text style={s.totalVal}>{finalTotal.toLocaleString()} ر.ي</Text>
        <Text style={s.totalLbl}>الإجمالي التقديري — يعتمد الخادم السعر النهائي</Text>
      </View>
    </View>
  );

  const confirmBtn = (
    <TouchableOpacity
      style={[s.confirmBtn, placing && { opacity: 0.65 }]}
      onPress={handleConfirmOrder}
      disabled={placing}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="تأكيد الطلب والدفع عند الاستلام"
      accessibilityState={{ disabled: placing, busy: placing }}
    >
      {placing
        ? <ActivityIndicator color="#FFF" />
        : <>
            <Text style={s.confirmTotal}>{finalTotal.toLocaleString()} ر.ي</Text>
            <Text style={s.confirmTxt}>تأكيد الطلب</Text>
          </>}
    </TouchableOpacity>
  );

  const errorBlock = submitError ? (
    <View style={s.errorCard} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={20} color={UI.red} />
      <Text style={s.errorText}>{submitError}</Text>
    </View>
  ) : null;

  const orderSuccessOverlay = orderSucceeded && (
    <View style={s.overlay}>
      <View style={s.overlayCard}>
        <Ionicons name="checkmark-circle" size={68} color={UI.green} style={{ marginBottom: 14 }} />
        <Text style={s.overlayTitle}>تم إرسال طلبك بنجاح</Text>
        <Text style={s.overlaySub}>ستجد حالة الطلب وتفاصيله في صفحة طلباتي</Text>
        <TouchableOpacity
          style={s.successOrderBtn}
          onPress={() => {
            setOrderSucceeded(false);
            navigation.navigate('Orders', { screen: 'OrdersList' });
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="عرض طلباتي"
        >
          <Text style={s.successOrderBtnTxt}>عرض طلباتي</Text>
          <Ionicons name="receipt-outline" size={18} color={UI.white} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Desktop Layout ────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={s.desktopWrap}>
        <StatusBar barStyle="dark-content" />

        {/* Top Bar */}
        <View style={s.desktopTopBar}>
          <View style={s.desktopSteps}>
            {['بيانات التوصيل', 'طريقة الدفع', 'تأكيد الطلب'].map((step, i) => (
              <View key={step} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                {i > 0 && <Ionicons name="chevron-back" size={14} color={UI.textMuted} />}
                <View style={[s.stepPill, i === 0 && s.stepPillActive]}>
                  <Text style={[s.stepTxt, i === 0 && s.stepTxtActive]}>{step}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={s.desktopHeading}>إتمام الطلب</Text>
          <TouchableOpacity style={s.desktopBackBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة إلى السلة">
            <Ionicons name="arrow-back" size={18} color={UI.textGrey} />
            <Text style={s.desktopBackTxt}>العودة للسلة</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={s.desktopBody}>
          {/* Right column: Delivery + Payment */}
          <ScrollView style={s.desktopCol} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}>
            {deliveryBlock}
            {paymentBlock}
          </ScrollView>

          {/* Left column: Summary + Coupon + Confirm */}
          <View style={s.desktopSide}>
            {couponBlock}
            {summaryBlock}
            {errorBlock}
            {confirmBtn}
          </View>
        </View>

        {orderSuccessOverlay}
      </View>
    );
  }

  // ─── Mobile Layout ─────────────────────────────────────────
  return (
    <View style={s.mobileWrap}>
      <StatusBar barStyle="dark-content" />

      <View style={s.mobileHeader}>
        <View style={{ width: 40 }} />
        <Text style={s.mobileTitle}>إتمام الطلب</Text>
        <TouchableOpacity style={s.mobileBack} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة إلى السلة">
          <Ionicons name="arrow-back" size={22} color={UI.textDark} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.mobileScroll}>
        {deliveryBlock}
        {paymentBlock}
        {couponBlock}
        {summaryBlock}
        {errorBlock}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={s.mobileBottom}>{confirmBtn}</View>

      {orderSuccessOverlay}
    </View>
  );
}

// ─── Helper mini-components ────────────────────────────────

function Row({ icon, iconBg, iconColor, title }: { icon: string; iconBg: string; iconColor: string; title: string }) {
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <View style={[s.secIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={17} color={iconColor} />
      </View>
      <Text style={s.secTitle}>{title}</Text>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={s.lbl}>{children}</Text>;
}

function SumRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <View style={s.sumRow}>
      <Text style={[s.sumVal, green && { color: UI.green }]}>{value}</Text>
      <Text style={[s.sumLbl, green && { color: UI.green }]}>{label}</Text>
    </View>
  );
}

function InfoBox({ icon, color, bg, border, mt, children }: any) {
  return (
    <View style={[s.infoBox, { backgroundColor: bg, borderColor: border, marginTop: mt || 0 }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[s.infoTxt, { color }]}>{children}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Desktop ─────────────────────────────────────────
  desktopWrap: { flex: 1, backgroundColor: UI.bg },
  desktopTopBar: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 48, paddingVertical: 18,
    backgroundColor: UI.white, borderBottomWidth: 1, borderBottomColor: UI.border, ...shadow,
  },
  desktopHeading: { fontSize: 20, fontWeight: '800', color: UI.textDark },
  desktopBackBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  desktopBackTxt: { fontSize: 13, fontWeight: '600', color: UI.textGrey },
  desktopSteps:  { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  stepPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: UI.bg },
  stepPillActive: { backgroundColor: UI.primary },
  stepTxt: { fontSize: 12, fontWeight: '700', color: UI.textMuted },
  stepTxtActive: { color: UI.white },
  desktopBody: { flex: 1, flexDirection: 'row-reverse', gap: 24, paddingHorizontal: 48, paddingTop: 28 },
  desktopCol:  { flex: 1 },
  desktopSide: { width: 380, paddingBottom: 32 },

  // ── Mobile ──────────────────────────────────────────
  mobileWrap: { flex: 1, backgroundColor: UI.bg },
  mobileHeader: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    backgroundColor: UI.white, borderBottomWidth: 1, borderBottomColor: UI.border,
  },
  mobileTitle: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  mobileBack:  { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  mobileScroll: { padding: 16 },
  mobileBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: UI.white, padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1, borderTopColor: UI.border, ...shadow,
  },

  // ── Card ────────────────────────────────────────────
  card: { backgroundColor: UI.white, borderRadius: 20, padding: 20, marginBottom: 14, ...shadow },
  secIcon:  { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  secTitle: { fontSize: 16, fontWeight: '800', color: UI.textDark },

  // ── Fields ──────────────────────────────────────────
  lbl: { fontSize: 12, fontWeight: '700', color: UI.textGrey, textAlign: 'right', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1.5, borderColor: UI.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    color: UI.textDark, backgroundColor: UI.bg, marginBottom: 10,
  },

  // ── Areas ───────────────────────────────────────────
  areasRow:     { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  areaChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: UI.bg, borderWidth: 1.5, borderColor: 'transparent' },
  areaChipOn:   { backgroundColor: UI.primary, borderColor: UI.primary },
  areaChipTxt:  { fontSize: 13, color: UI.textGrey, fontWeight: '600' },
  areaChipTxtOn:{ color: UI.white },
  savedAddressesList: { gap: 8, marginBottom: 10 },
  savedAddressCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, borderWidth: 1.5, borderColor: UI.border, backgroundColor: UI.bg },
  savedAddressCardSelected: { borderColor: UI.blue, backgroundColor: '#EFF6FF' },
  savedAddressRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: UI.border, alignItems: 'center', justifyContent: 'center' },
  savedAddressRadioSelected: { borderColor: UI.blue },
  savedAddressRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: UI.blue },
  savedAddressLabel: { fontSize: 13, color: UI.textDark, fontWeight: '800', textAlign: 'right' },
  savedAddressText: { fontSize: 12, color: UI.textGrey, marginTop: 3, lineHeight: 18, textAlign: 'right' },
  savedAddressCity: { fontSize: 11, color: UI.blue, marginTop: 3, fontWeight: '700', textAlign: 'right' },
  newAddressBtn: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderWidth: 1.5, borderColor: UI.blue, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6 },
  newAddressBtnSelected: { backgroundColor: UI.blue },
  newAddressBtnText: { color: UI.blue, fontSize: 12, fontWeight: '800' },

  // ── Payment Methods ─────────────────────────────────
  pmList:      { gap: 10 },
  pmCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: UI.border, borderRadius: 14,
    padding: 13, backgroundColor: UI.bg,
  },
  pmIconBox:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pmInfo:      { flex: 1 },
  pmLabel:     { fontSize: 13, fontWeight: '700', color: UI.textDark, textAlign: 'right', marginBottom: 2 },
  pmSub:       { fontSize: 11, color: UI.textMuted, textAlign: 'right' },
  pmRadio:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: UI.border, alignItems: 'center', justifyContent: 'center' },
  pmRadioDot:  { width: 10, height: 10, borderRadius: 5 },

  // ── Sub-form (card/wallet/bank) ──────────────────────
  subForm:       { marginTop: 14, padding: 16, borderRadius: 14, borderWidth: 1 },
  subFormHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 12 },
  subFormTitle:  { fontSize: 13, fontWeight: '700' },
  secureRow:     { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 8 },
  secureTxt:     { fontSize: 11, color: UI.textMuted },

  // ── Info box ────────────────────────────────────────
  infoBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoTxt: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 18, textAlign: 'right' },

  // ── Coupon ──────────────────────────────────────────
  couponRow:    { flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start' },
  couponBtn:    { backgroundColor: UI.primary, paddingHorizontal: 18, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 80 },
  couponBtnTxt: { color: UI.white, fontWeight: '800', fontSize: 14 },
  couponMsg:    { fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'right' },

  // ── Summary ─────────────────────────────────────────
  storeGroupName: { fontSize: 11, fontWeight: '700', color: UI.textMuted, textAlign: 'right', marginBottom: 8, textTransform: 'uppercase' },
  sumItem:    { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 },
  sumItemName:  { fontSize: 13, color: UI.textDark, flex: 1, textAlign: 'right' },
  sumItemPrice: { fontSize: 13, fontWeight: '600', color: UI.textDark, marginLeft: 8 },
  divider:    { height: 1, backgroundColor: UI.border, marginVertical: 12 },
  sumRow:     { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 },
  sumLbl:     { fontSize: 13, color: UI.textGrey },
  sumVal:     { fontSize: 13, fontWeight: '600', color: UI.textDark },
  totalRow:   { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 2 },
  totalLbl:   { fontSize: 16, fontWeight: '800', color: UI.textDark },
  totalVal:   { fontSize: 18, fontWeight: '800', color: UI.primary },

  // ── Confirm button ───────────────────────────────────
  confirmBtn: {
    backgroundColor: UI.primary, borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, ...shadow, shadowOpacity: 0.2, shadowColor: UI.primary,
  },
  confirmTxt:   { fontSize: 16, fontWeight: '800', color: UI.white },
  confirmTotal: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  errorCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 12, fontWeight: '700', lineHeight: 19, textAlign: 'right' },

  // ── Payment overlay ──────────────────────────────────
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  overlayCard: { backgroundColor: UI.white, borderRadius: 28, padding: 40, alignItems: 'center', width: 260, ...shadow },
  overlayTitle:{ fontSize: 18, fontWeight: '800', color: UI.textDark, marginBottom: 6, textAlign: 'center' },
  overlaySub:  { fontSize: 14, color: UI.textGrey, textAlign: 'center' },
  successOrderBtn: { marginTop: 24, backgroundColor: UI.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  successOrderBtnTxt: { color: UI.white, fontWeight: '800', fontSize: 15 },
});
