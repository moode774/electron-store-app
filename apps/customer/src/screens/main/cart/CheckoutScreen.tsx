import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SERVICE_AREAS } from '@marketplace/shared-utils';
import { useCartStore, useAuthStore, createOrder, createAddress, validateCoupon } from '@marketplace/shared-hooks';
import { Card, Button, Input } from '@marketplace/shared-ui';

// Mock Delivery Fees based on area
const DELIVERY_FEES: Record<string, number> = {
  [SERVICE_AREAS.SANAA]: 1000,
  [SERVICE_AREAS.ADEN]: 1500,
  [SERVICE_AREAS.IBB]: 1200,
  [SERVICE_AREAS.TAIZ]: 1200,
};

export default function CheckoutScreen({ navigation }: any) {
  const { getTotalPrice, items, getItemsByStore, removeFromCart } = useCartStore();
  const user = useAuthStore((s) => s.user);
  const cartTotal = getTotalPrice();

  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>(SERVICE_AREAS.SANAA);
  const [placing, setPlacing] = useState(false);

  // الكوبون
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState('');
  const [couponOk, setCouponOk] = useState(false);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  // كل متجر يُنشأ له طلب مستقل برسوم توصيل خاصة به،
  // لذا يجب أن يعكس الملخص الرسوم × عدد المتاجر (لا رسوماً واحدة)
  const storeCount = Math.max(1, Object.keys(getItemsByStore()).length);
  const deliveryFee = DELIVERY_FEES[selectedArea] || 1500;
  const totalDeliveryFees = deliveryFee * storeCount;
  const finalTotal = Math.max(0, cartTotal + totalDeliveryFees - discount);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    try {
      const res = await validateCoupon(couponCode, cartTotal);
      setDiscount(res.discount);
      setCouponOk(res.valid);
      setCouponMsg(res.message);
    } catch {
      setDiscount(0); setCouponOk(false); setCouponMsg('تعذّر التحقق من الكود');
    } finally {
      setCheckingCoupon(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!user?.id) { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً'); return; }
    if (!address.trim()) { Alert.alert('تنبيه', 'الرجاء إدخال عنوان التوصيل'); return; }
    if (items.length === 0) { Alert.alert('تنبيه', 'السلة فارغة'); return; }

    setPlacing(true);
    try {
      // حفظ العنوان أولاً
      const savedAddress = await createAddress({
        user_id: user.id,
        label: 'home',
        full_address: `${address}${landmark ? ' - ' + landmark : ''}`,
        city: selectedArea,
      });

      // تجميع العناصر لكل متجر وإنشاء طلب لكل متجر.
      // بعد نجاح طلب متجرٍ ما تُزال عناصره من السلة فوراً، حتى لو فشل
      // متجر لاحق لا يتكرّر طلب المتجر الناجح عند إعادة المحاولة.
      const byStore = getItemsByStore();
      for (const [storeId, storeItems] of Object.entries(byStore)) {
        const subtotal = storeItems.reduce((s, i) => s + i.price * i.quantity, 0);
        // توزيع الخصم على المتاجر بنسبة قيمة كل متجر من الإجمالي
        const storeDiscount = cartTotal > 0 ? Math.round((discount * subtotal) / cartTotal) : 0;
        await createOrder({
          customer_id: user.id,
          merchant_id: storeId,
          address_id: savedAddress.id,
          subtotal,
          delivery_fee: deliveryFee,
          discount_amount: storeDiscount,
          tax_amount: 0,
          total_amount: subtotal + deliveryFee - storeDiscount,
          payment_method: 'cash',
          notes: altPhone.trim() ? `رقم تواصل إضافي: ${altPhone.trim()}` : undefined,
          items: storeItems.map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
            unit_price: i.price,
            total_price: i.price * i.quantity,
            product_name: i.name,
          })),
        });
        storeItems.forEach((i) => removeFromCart(i.id));
      }

      Alert.alert('تم الطلب ✅', 'تم إرسال طلبك بنجاح', [
        { text: 'متابعة', onPress: () => navigation.navigate('Orders', { screen: 'OrdersList' }) },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل إرسال جزء من الطلب — ما تبقى في السلة لم يُرسَل، حاول مرة أخرى');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>→</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تأكيد الطلب</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Address Selection */}
        <Card style={styles.card} variant="elevated">
          <Text style={styles.sectionTitle}>📍 عنوان التوصيل</Text>
          
          <Text style={styles.label}>المنطقة / المدينة</Text>
          <View style={styles.areasRow}>
            {Object.values(SERVICE_AREAS).map((area) => (
              <TouchableOpacity
                key={area}
                style={[styles.areaChip, selectedArea === area && styles.areaChipActive]}
                onPress={() => setSelectedArea(area)}
              >
                <Text style={[styles.areaChipText, selectedArea === area && styles.areaChipTextActive]}>
                  {area === SERVICE_AREAS.SANAA ? 'صنعاء' :
                   area === SERVICE_AREAS.ADEN ? 'عدن' :
                   area === SERVICE_AREAS.IBB ? 'إب' :
                   area === SERVICE_AREAS.TAIZ ? 'تعز' : area}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="الشارع / الحي"
            placeholder="مثال: شارع حدة، خلف المول"
            value={address}
            onChangeText={setAddress}
          />
          <Input
            label="أقرب معلم بارز"
            placeholder="مسجد، مدرسة، مستشفى..."
            value={landmark}
            onChangeText={setLandmark}
          />
          <TouchableOpacity style={styles.mapBtn}>
            <Text style={styles.mapBtnText}>📌 تحديد الموقع على الخريطة</Text>
          </TouchableOpacity>
        </Card>

        {/* Contact Info */}
        <Card style={styles.card} variant="elevated">
          <Text style={styles.sectionTitle}>📞 معلومات التواصل</Text>
          <Input
            label="رقم هاتف إضافي (اختياري)"
            placeholder="7xxxxxxxx"
            keyboardType="phone-pad"
            value={altPhone}
            onChangeText={setAltPhone}
          />
        </Card>

        {/* Payment Method */}
        <Card style={styles.card} variant="elevated">
          <Text style={styles.sectionTitle}>💳 طريقة الدفع</Text>
          <View style={styles.paymentMethod}>
            <View style={styles.paymentRadioActive} />
            <Text style={styles.paymentMethodText}>الدفع نقداً عند الاستلام (COD)</Text>
            <Text style={styles.paymentEmoji}>💵</Text>
          </View>
        </Card>

        {/* Coupon */}
        <Card style={styles.card} variant="elevated">
          <Text style={styles.sectionTitle}>🎟️ كود الخصم</Text>
          <View style={styles.couponRow}>
            <View style={{ flex: 1 }}>
              <Input
                placeholder="أدخل كود الخصم"
                value={couponCode}
                onChangeText={(t) => { setCouponCode(t); setCouponOk(false); setDiscount(0); setCouponMsg(''); }}
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity style={styles.couponBtn} onPress={applyCoupon} disabled={checkingCoupon} activeOpacity={0.8}>
              {checkingCoupon ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.couponBtnText}>تطبيق</Text>}
            </TouchableOpacity>
          </View>
          {!!couponMsg && (
            <Text style={[styles.couponMsg, { color: couponOk ? '#059669' : '#EF4444' }]}>{couponMsg}</Text>
          )}
        </Card>

        {/* Summary */}
        <Card style={styles.card} variant="elevated">
          <Text style={styles.sectionTitle}>🧾 ملخص الطلب</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>المجموع الفرعي</Text>
            <Text style={styles.summaryValue}>{cartTotal} ر.س</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              رسوم التوصيل{storeCount > 1 ? ` (${storeCount} متاجر × ${deliveryFee})` : ''}
            </Text>
            <Text style={styles.summaryValue}>{totalDeliveryFees} ر.س</Text>
          </View>
          {discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryText, { color: '#059669' }]}>الخصم</Text>
              <Text style={[styles.summaryValue, { color: '#059669' }]}>- {discount} ر.س</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalText}>الإجمالي المطلوب</Text>
            <Text style={styles.totalValue}>{finalTotal} ر.س</Text>
          </View>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <Button
          title={placing ? 'جاري الإرسال...' : `تأكيد الطلب (${finalTotal} ر.س)`}
          onPress={handleConfirmOrder}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  couponBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  couponBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  couponMsg: { fontSize: 12.5, fontWeight: '700', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: 60, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: COLORS.background },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'El Messiri' },
  scrollContent: { padding: SPACING.md, paddingBottom: 100 },
  card: { marginBottom: SPACING.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginBottom: 16, fontFamily: 'El Messiri' },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, marginBottom: 8, fontWeight: '500', fontFamily: 'IBM Plex Sans Arabic' },
  areasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  areaChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  areaChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  areaChipText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: 'IBM Plex Sans Arabic', fontWeight: '500' },
  areaChipTextActive: { color: COLORS.surface },
  mapBtn: { backgroundColor: `${COLORS.info}15`, padding: 12, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: `${COLORS.info}30` },
  mapBtnText: { color: COLORS.info, fontWeight: '700', fontSize: 13 },
  paymentMethod: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: `${COLORS.success}10`, borderRadius: RADIUS.md, borderWidth: 1, borderColor: `${COLORS.success}40` },
  paymentRadioActive: { width: 20, height: 20, borderRadius: 10, borderWidth: 6, borderColor: COLORS.success, marginRight: 12 },
  paymentMethodText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  paymentEmoji: { fontSize: 24 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryText: { fontSize: 13, color: COLORS.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  totalText: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  totalValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, padding: SPACING.md, paddingBottom: 30, borderTopWidth: 1, borderTopColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10 },
});
