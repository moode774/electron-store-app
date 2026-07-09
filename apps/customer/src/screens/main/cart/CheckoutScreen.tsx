import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, useWindowDimensions,
  Platform, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SERVICE_AREAS } from '@marketplace/shared-utils';
import { useCartStore, useAuthStore, createOrder, createAddress, validateCoupon, incrementCouponUsage } from '@marketplace/shared-hooks';

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
  { id: 'card',   label: 'بطاقة ائتمانية / مدى',  subtitle: 'Visa · Mastercard · Mada',    icon: 'card-outline',            accent: UI.blue,   bg: '#EFF6FF' },
  { id: 'wallet', label: 'محفظة إلكترونية',       subtitle: 'ادفع برقم هاتفك',            icon: 'phone-portrait-outline',  accent: UI.purple, bg: '#F5F3FF' },
  { id: 'bank',   label: 'تحويل بنكي',            subtitle: 'تحويل مباشر للحساب البنكي',  icon: 'business-outline',        accent: UI.amber,  bg: '#FFFBEB' },
] as const;

function fmtCard(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
}
function fmtExpiry(v: string) {
  const raw = v.replace(/\D/g, '').slice(0, 4);
  return raw.length >= 3 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
}

export default function CheckoutScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const { getTotalPrice, items, getItemsByStore, removeFromCart } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const cartTotal = getTotalPrice();

  // Delivery
  const [address,      setAddress]      = useState('');
  const [landmark,     setLandmark]     = useState('');
  const [altPhone,     setAltPhone]     = useState('');
  const [selectedArea, setSelectedArea] = useState<string>(SERVICE_AREAS.SANAA);

  // Order
  const [placing,     setPlacing]     = useState(false);
  const [paymentStep, setPaymentStep] = useState<'idle' | 'processing' | 'success'>('idle');

  // Coupon
  const [couponCode,     setCouponCode]     = useState('');
  const [couponId,       setCouponId]       = useState<string | null>(null);
  const [discount,       setDiscount]       = useState(0);
  const [couponMsg,      setCouponMsg]      = useState('');
  const [couponOk,       setCouponOk]       = useState(false);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  // Payment
  const [payMethod,    setPayMethod]    = useState<string>('cash');
  const [cardNumber,   setCardNumber]   = useState('');
  const [cardName,     setCardName]     = useState('');
  const [cardExpiry,   setCardExpiry]   = useState('');
  const [cardCvv,      setCardCvv]      = useState('');
  const [walletPhone,  setWalletPhone]  = useState('');

  const storeCount        = Math.max(1, Object.keys(getItemsByStore()).length);
  const deliveryFee       = DELIVERY_FEES[selectedArea] || 1500;
  const totalDeliveryFees = deliveryFee * storeCount;
  const finalTotal        = Math.max(0, cartTotal + totalDeliveryFees - discount);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    try {
      const res = await validateCoupon(couponCode, cartTotal);
      setDiscount(res.discount); setCouponOk(res.valid); setCouponMsg(res.message);
      setCouponId(res.valid && res.coupon ? res.coupon.id : null);
    } catch {
      setDiscount(0); setCouponOk(false); setCouponMsg('تعذّر التحقق من الكود'); setCouponId(null);
    } finally { setCheckingCoupon(false); }
  };

  const validatePaymentFields = (): boolean => {
    if (payMethod === 'card') {
      if (cardNumber.replace(/\s/g, '').length < 16) { Alert.alert('خطأ', 'أدخل رقم البطاقة كاملاً (16 رقم)'); return false; }
      if (!cardName.trim())                           { Alert.alert('خطأ', 'أدخل اسم حامل البطاقة'); return false; }
      if (cardExpiry.length < 5)                      { Alert.alert('خطأ', 'أدخل تاريخ الانتهاء (MM/YY)'); return false; }
      if (cardCvv.length < 3)                         { Alert.alert('خطأ', 'أدخل رمز CVV الصحيح'); return false; }
    }
    if (payMethod === 'wallet' && !walletPhone.trim()) { Alert.alert('خطأ', 'أدخل رقم الهاتف المرتبط بالمحفظة'); return false; }
    return true;
  };

  const handleConfirmOrder = async () => {
    if (!user?.id)           { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً'); return; }
    if (!address.trim())     { Alert.alert('تنبيه', 'الرجاء إدخال عنوان التوصيل'); return; }
    if (items.length === 0)  { Alert.alert('تنبيه', 'السلة فارغة'); return; }
    if (!validatePaymentFields()) return;

    // Mock payment processing for non-cash methods
    if (payMethod !== 'cash') {
      setPaymentStep('processing');
      await new Promise<void>((r) => setTimeout(r, 1800));
      setPaymentStep('success');
      await new Promise<void>((r) => setTimeout(r, 1200));
      setPaymentStep('idle');
    }

    setPlacing(true);
    try {
      const savedAddress = await createAddress({
        user_id: user.id,
        label: 'home',
        full_address: `${address}${landmark ? ' - ' + landmark : ''}`,
        city: selectedArea,
      });

      const byStore = getItemsByStore();
      for (const [storeId, storeItems] of Object.entries(byStore)) {
        const subtotal     = storeItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const storeDiscount = cartTotal > 0 ? Math.round((discount * subtotal) / cartTotal) : 0;
        await createOrder({
          customer_id:     user.id,
          merchant_id:     storeId,
          address_id:      savedAddress.id,
          subtotal,
          delivery_fee:    deliveryFee,
          discount_amount: storeDiscount,
          tax_amount:      0,
          total_amount:    subtotal + deliveryFee - storeDiscount,
          payment_method:  payMethod === 'cash' ? 'cash' : 'online',
          notes:           altPhone.trim() ? `رقم تواصل إضافي: ${altPhone.trim()}` : undefined,
          items: storeItems.map((i) => ({
            product_id:   i.productId,
            quantity:     i.quantity,
            unit_price:   i.price,
            total_price:  i.price * i.quantity,
            product_name: i.name,
          })),
        });
        storeItems.forEach((i) => removeFromCart(i.id));
      }

      if (couponId) {
        incrementCouponUsage(couponId).catch(() => {});
      }

      Alert.alert('تم الطلب ✅', 'تم إرسال طلبك بنجاح', [
        { text: 'متابعة', onPress: () => navigation.navigate('Orders', { screen: 'OrdersList' }) },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل إرسال جزء من الطلب — ما تبقى في السلة لم يُرسَل، حاول مرة أخرى');
    } finally { setPlacing(false); }
  };

  // ─── Reusable Blocks ──────────────────────────────────────

  const deliveryBlock = (
    <View style={s.card}>
      <Row icon="location-outline" iconBg="#EFF6FF" iconColor={UI.blue} title="عنوان التوصيل" />

      <Label>المنطقة / المدينة</Label>
      <View style={s.areasRow}>
        {Object.values(SERVICE_AREAS).map((area) => (
          <TouchableOpacity
            key={area}
            style={[s.areaChip, selectedArea === area && s.areaChipOn]}
            onPress={() => setSelectedArea(area)}
          >
            <Text style={[s.areaChipTxt, selectedArea === area && s.areaChipTxtOn]}>
              {AREA_LABELS[area] || area}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Label>الشارع / الحي *</Label>
      <TextInput style={s.input} placeholder="مثال: شارع حدة، خلف المول" placeholderTextColor={UI.textMuted}
        value={address} onChangeText={setAddress} textAlign="right" />

      <Label>أقرب معلم بارز</Label>
      <TextInput style={s.input} placeholder="مسجد، مدرسة، مستشفى..." placeholderTextColor={UI.textMuted}
        value={landmark} onChangeText={setLandmark} textAlign="right" />

      <Label>رقم هاتف إضافي (اختياري)</Label>
      <TextInput style={[s.input, { marginBottom: 0 }]} placeholder="7xxxxxxxx" placeholderTextColor={UI.textMuted}
        value={altPhone} onChangeText={setAltPhone} keyboardType="phone-pad" textAlign="right" />
    </View>
  );

  const paymentBlock = (
    <View style={s.card}>
      <Row icon="card-outline" iconBg="#ECFDF5" iconColor={UI.green} title="طريقة الدفع" />

      <View style={s.pmList}>
        {PAYMENT_METHODS.map((m) => {
          const sel = payMethod === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              style={[s.pmCard, sel && { borderColor: m.accent, borderWidth: 2 }]}
              onPress={() => setPayMethod(m.id)}
              activeOpacity={0.8}
            >
              <View style={[s.pmIconBox, { backgroundColor: m.bg }]}>
                <Ionicons name={m.icon as any} size={20} color={m.accent} />
              </View>
              <View style={s.pmInfo}>
                <Text style={[s.pmLabel, sel && { color: m.accent }]}>{m.label}</Text>
                <Text style={s.pmSub}>{m.subtitle}</Text>
              </View>
              <View style={[s.pmRadio, sel && { borderColor: m.accent }]}>
                {sel && <View style={[s.pmRadioDot, { backgroundColor: m.accent }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Card form */}
      {payMethod === 'card' && (
        <View style={[s.subForm, { backgroundColor: '#F0F6FF', borderColor: '#BFDBFE' }]}>
          <View style={s.subFormHeader}>
            <Ionicons name="card" size={15} color={UI.blue} />
            <Text style={[s.subFormTitle, { color: UI.blue }]}>بيانات البطاقة</Text>
          </View>
          <TextInput style={s.input} placeholder="1234  5678  9012  3456" placeholderTextColor={UI.textMuted}
            value={cardNumber} onChangeText={(t) => setCardNumber(fmtCard(t))}
            keyboardType="numeric" maxLength={19} textAlign="right" />
          <TextInput style={s.input} placeholder="الاسم كما هو على البطاقة" placeholderTextColor={UI.textMuted}
            value={cardName} onChangeText={setCardName} autoCapitalize="characters" textAlign="right" />
          <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
            <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="MM/YY" placeholderTextColor={UI.textMuted}
              value={cardExpiry} onChangeText={(t) => setCardExpiry(fmtExpiry(t))}
              keyboardType="numeric" maxLength={5} textAlign="center" />
            <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="CVV" placeholderTextColor={UI.textMuted}
              value={cardCvv} onChangeText={(t) => setCardCvv(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="numeric" secureTextEntry textAlign="center" />
          </View>
          <View style={s.secureRow}>
            <Ionicons name="lock-closed-outline" size={11} color={UI.textMuted} />
            <Text style={s.secureTxt}>بياناتك محمية بتشفير SSL 256-bit</Text>
          </View>
        </View>
      )}

      {/* Wallet form */}
      {payMethod === 'wallet' && (
        <View style={[s.subForm, { backgroundColor: '#F9F7FF', borderColor: '#DDD6FE' }]}>
          <View style={s.subFormHeader}>
            <Ionicons name="phone-portrait" size={15} color={UI.purple} />
            <Text style={[s.subFormTitle, { color: UI.purple }]}>رقم المحفظة الإلكترونية</Text>
          </View>
          <TextInput style={[s.input, { marginBottom: 8 }]} placeholder="7xxxxxxxx" placeholderTextColor={UI.textMuted}
            value={walletPhone} onChangeText={setWalletPhone} keyboardType="phone-pad" textAlign="right" />
          <InfoBox icon="information-circle-outline" color={UI.purple} bg="#F5F3FF" border="#DDD6FE">
            {`سيتم خصم ${finalTotal.toLocaleString()} ر.س من محفظتك الإلكترونية فور تأكيد الطلب`}
          </InfoBox>
        </View>
      )}

      {/* Bank form */}
      {payMethod === 'bank' && (
        <View style={[s.subForm, { backgroundColor: '#FFFDF0', borderColor: '#FDE68A' }]}>
          <View style={s.subFormHeader}>
            <Ionicons name="business-outline" size={15} color={UI.amber} />
            <Text style={[s.subFormTitle, { color: UI.amber }]}>بيانات التحويل البنكي</Text>
          </View>
          <InfoBox icon="business-outline" color={UI.amber} bg="#FFFBEB" border="#FDE68A">
            {'البنك: البنك اليمني للتجارة\nرقم الحساب: 1234-5678-9012\nالاسم: شركة المتجر'}
          </InfoBox>
          <InfoBox icon="time-outline" color={UI.red} bg="#FEF2F2" border="#FECACA" mt={8}>
            {`حوّل ${finalTotal.toLocaleString()} ر.س ثم أكّد الطلب. سيُفعَّل خلال ساعة من التحقق.`}
          </InfoBox>
        </View>
      )}
    </View>
  );

  const couponBlock = (
    <View style={s.card}>
      <Row icon="pricetag-outline" iconBg="#FFFBEB" iconColor={UI.amber} title="كود الخصم" />
      <View style={s.couponRow}>
        <TouchableOpacity style={s.couponBtn} onPress={applyCoupon} disabled={checkingCoupon} activeOpacity={0.85}>
          {checkingCoupon
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Text style={s.couponBtnTxt}>تطبيق</Text>}
        </TouchableOpacity>
        <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]}
          placeholder="أدخل كود الخصم" placeholderTextColor={UI.textMuted}
          value={couponCode}
          onChangeText={(t) => { setCouponCode(t); setCouponOk(false); setDiscount(0); setCouponMsg(''); setCouponId(null); }}
          autoCapitalize="characters" textAlign="right" />
      </View>
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
              <Text style={s.sumItemPrice}>{(item.price * item.quantity).toLocaleString()} ر.س</Text>
              <Text style={s.sumItemName} numberOfLines={1}>{item.name} × {item.quantity}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={s.divider} />
      <SumRow label="المجموع الفرعي" value={`${cartTotal.toLocaleString()} ر.س`} />
      <SumRow label={`رسوم التوصيل${storeCount > 1 ? ` (${storeCount} متاجر × ${deliveryFee})` : ''}`}
              value={`${totalDeliveryFees.toLocaleString()} ر.س`} />
      {discount > 0 && <SumRow label="خصم الكوبون" value={`- ${discount.toLocaleString()} ر.س`} green />}
      <View style={s.divider} />
      <View style={s.totalRow}>
        <Text style={s.totalVal}>{finalTotal.toLocaleString()} ر.س</Text>
        <Text style={s.totalLbl}>الإجمالي المطلوب</Text>
      </View>
    </View>
  );

  const confirmBtn = (
    <TouchableOpacity
      style={[s.confirmBtn, (placing || paymentStep !== 'idle') && { opacity: 0.65 }]}
      onPress={handleConfirmOrder}
      disabled={placing || paymentStep !== 'idle'}
      activeOpacity={0.85}
    >
      {placing
        ? <ActivityIndicator color="#FFF" />
        : <>
            <Text style={s.confirmTotal}>{finalTotal.toLocaleString()} ر.س</Text>
            <Text style={s.confirmTxt}>تأكيد الطلب</Text>
          </>}
    </TouchableOpacity>
  );

  // ─── Payment Processing Overlay ───────────────────────────
  const payOverlay = paymentStep !== 'idle' && (
    <View style={s.overlay}>
      <View style={s.overlayCard}>
        {paymentStep === 'processing' ? (
          <>
            <ActivityIndicator size="large" color={UI.blue} style={{ marginBottom: 18 }} />
            <Text style={s.overlayTitle}>جاري معالجة الدفع...</Text>
            <Text style={s.overlaySub}>يُرجى الانتظار لحظة</Text>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={60} color={UI.green} style={{ marginBottom: 14 }} />
            <Text style={s.overlayTitle}>تمت عملية الدفع</Text>
            <Text style={[s.overlaySub, { color: UI.green, fontWeight: '700' }]}>بنجاح ✅</Text>
          </>
        )}
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
          <TouchableOpacity style={s.desktopBackBtn} onPress={() => navigation.goBack()}>
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
            {confirmBtn}
          </View>
        </View>

        {payOverlay}
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
        <TouchableOpacity style={s.mobileBack} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={UI.textDark} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.mobileScroll}>
        {deliveryBlock}
        {paymentBlock}
        {couponBlock}
        {summaryBlock}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={s.mobileBottom}>{confirmBtn}</View>

      {payOverlay}
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

  // ── Payment overlay ──────────────────────────────────
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  overlayCard: { backgroundColor: UI.white, borderRadius: 28, padding: 40, alignItems: 'center', width: 260, ...shadow },
  overlayTitle:{ fontSize: 18, fontWeight: '800', color: UI.textDark, marginBottom: 6, textAlign: 'center' },
  overlaySub:  { fontSize: 14, color: UI.textGrey, textAlign: 'center' },
});
