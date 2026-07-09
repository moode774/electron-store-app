import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Linking, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ORDER_STATUS } from '@marketplace/shared-utils';
import { getOrderById, updateOrderStatus, OrderDetail } from '@marketplace/shared-hooks';

const UI = {
  primary: '#111827',
  bg: '#F3F4F6',
  bgMobile: '#F9FAFB',
  textDark: '#111827',
  textGrey: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  green: '#10B981',
  red: '#EF4444',
  blue: '#3B82F6',
  orange: '#F59E0B',
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 24,
  elevation: 3,
};

export default function MerchantOrderDetailsScreen({ navigation, route }: any) {
  const orderId: string = route?.params?.orderId ?? route?.params?.order?.id;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(ORDER_STATUS.PENDING);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    getOrderById(orderId).then((o) => {
      setOrder(o);
      if (o) setStatus(o.status);
    }).finally(() => setLoading(false));
  }, [orderId]);

  const items = order?.order_items ?? [];
  const subtotal = order?.subtotal ?? items.reduce((s, i) => s + i.total_price, 0);
  const deliveryFee = order?.delivery_fee ?? 0;
  const customerName = order?.customer?.full_name ?? 'عميل غير مسجل';
  const customerPhone = order?.customer?.phone ?? '';
  const customerAddress = order?.addresses?.full_address ?? 'عنوان غير متوفر';
  const customerCity = order?.addresses?.city ?? '';
  const paymentMethod = order?.payment_method === 'cash' ? 'الدفع عند الاستلام' : 'دفع إلكتروني';
  const notes = order?.notes || '';

  const changeStatus = async (next: string) => {
    setStatus(next);
    if (orderId) await updateOrderStatus(orderId, next).catch(() => {});
  };

  const statusInfo = (s: string) => {
    switch (s) {
      case ORDER_STATUS.PENDING: return { label: 'جديد', color: UI.orange, bg: `${UI.orange}15` };
      case ORDER_STATUS.PREPARING: return { label: 'قيد التجهيز', color: UI.blue, bg: `${UI.blue}15` };
      case ORDER_STATUS.READY: return { label: 'جاهز', color: '#7C3AED', bg: '#EDE9FE' };
      case ORDER_STATUS.DELIVERED: return { label: 'مكتمل', color: UI.green, bg: `${UI.green}15` };
      case ORDER_STATUS.CANCELLED: return { label: 'ملغي', color: UI.red, bg: `${UI.red}15` };
      default: return { label: s, color: UI.textGrey, bg: UI.bg };
    }
  };

  const info = statusInfo(status);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDesktop ? UI.bg : UI.bgMobile }}>
        <ActivityIndicator size="large" color={UI.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDesktop ? UI.bg : UI.bgMobile }}>
        <Text style={{ fontSize: 16, color: UI.textMuted }}>لم يتم العثور على الطلب</Text>
      </View>
    );
  }

  let dateStr = '';
  try {
    const d = new Date(order.created_at);
    dateStr = d.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' - ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    dateStr = order.created_at;
  }

  // Next action buttons logic
  let nextActionBtn = null;
  if (status === ORDER_STATUS.PENDING) {
    nextActionBtn = <TouchableOpacity style={styles.btnPrimary} activeOpacity={0.8} onPress={() => changeStatus(ORDER_STATUS.PREPARING)}><Text style={styles.btnPrimaryText}>بدء التجهيز</Text></TouchableOpacity>;
  } else if (status === ORDER_STATUS.PREPARING) {
    nextActionBtn = <TouchableOpacity style={styles.btnPrimary} activeOpacity={0.8} onPress={() => changeStatus(ORDER_STATUS.READY)}><Text style={styles.btnPrimaryText}>الطلب جاهز للتسليم</Text></TouchableOpacity>;
  } else if (status === ORDER_STATUS.READY) {
    nextActionBtn = <TouchableOpacity style={styles.btnPrimary} activeOpacity={0.8} onPress={() => changeStatus(ORDER_STATUS.DELIVERED)}><Text style={styles.btnPrimaryText}>تأكيد التسليم والمكتمل</Text></TouchableOpacity>;
  }

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />
      
      {!isDesktop && (
        <View style={styles.headerMobile}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitleMobile}>تفاصيل الطلب</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
        
        {isDesktop && (
          <View style={styles.pageHeaderRow}>
             <View>
               <Text style={styles.pageTitle}>تفاصيل الطلب</Text>
               <Text style={styles.pageSubtitle}>نظرة شاملة لجميع بيانات الطلب والعميل والفاتورة</Text>
             </View>
             <TouchableOpacity style={styles.backBtnDesktop} onPress={() => navigation.goBack()}>
                <Text style={styles.backBtnText}>العودة للطلبات</Text>
                <Ionicons name="arrow-back" size={16} color={UI.textDark} />
             </TouchableOpacity>
          </View>
        )}

        {/* Main Grid Wrapper */}
        <View style={[styles.gridContainer, isDesktop && { flexDirection: 'row-reverse' }]}>
          
          {/* Main Column (Receipt & Timeline) */}
          <View style={[styles.mainCol, isDesktop && { flex: 7 }]}>
            
            {/* Header Info */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.orderIdText}>{order.order_number}</Text>
                  <Text style={styles.dateText}>{dateStr}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: info.bg }]}>
                  <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                </View>
              </View>
              {notes ? (
                <View style={styles.notesBox}>
                  <Ionicons name="reader-outline" size={18} color={UI.textDark} />
                  <Text style={styles.notesText}>{notes}</Text>
                </View>
              ) : null}
            </View>

            {/* Timeline */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>مسار الطلب</Text>
              <View style={styles.timelineRow}>
                {/* Step 1 */}
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: UI.orange }]} />
                  <Text style={[styles.timelineText, { color: UI.textDark }]}>جديد</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: (status === ORDER_STATUS.PREPARING || status === ORDER_STATUS.READY || status === ORDER_STATUS.DELIVERED) ? UI.blue : UI.border }]} />
                {/* Step 2 */}
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: (status === ORDER_STATUS.PREPARING || status === ORDER_STATUS.READY || status === ORDER_STATUS.DELIVERED) ? UI.blue : UI.border }]} />
                  <Text style={[styles.timelineText, { color: (status === ORDER_STATUS.PREPARING || status === ORDER_STATUS.READY || status === ORDER_STATUS.DELIVERED) ? UI.textDark : UI.textMuted }]}>قيد التجهيز</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: (status === ORDER_STATUS.READY || status === ORDER_STATUS.DELIVERED) ? '#7C3AED' : UI.border }]} />
                {/* Step 3 */}
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: (status === ORDER_STATUS.READY || status === ORDER_STATUS.DELIVERED) ? '#7C3AED' : UI.border }]} />
                  <Text style={[styles.timelineText, { color: (status === ORDER_STATUS.READY || status === ORDER_STATUS.DELIVERED) ? UI.textDark : UI.textMuted }]}>جاهز</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: status === ORDER_STATUS.DELIVERED ? UI.green : UI.border }]} />
                {/* Step 4 */}
                <View style={[styles.timelineStep, { flex: 1 }]}>
                  <View style={[styles.timelineDot, { backgroundColor: status === ORDER_STATUS.DELIVERED ? UI.green : UI.border }]} />
                  <Text style={[styles.timelineText, { color: status === ORDER_STATUS.DELIVERED ? UI.textDark : UI.textMuted }]}>مكتمل</Text>
                </View>
              </View>
            </View>

            {/* Receipt (Items) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.sectionTitle}>المنتجات المطلوبة</Text>
                <Text style={styles.itemsCount}>{items.length} منتجات</Text>
              </View>
              <View style={styles.itemsWrapper}>
                {items.map((item, i) => (
                  <View key={item.id} style={[styles.itemRow, i < items.length - 1 && styles.borderBottom]}>
                    <View style={styles.itemImagePlaceholder}>
                      <Ionicons name="cube-outline" size={24} color={UI.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.products?.name ?? item.product_name ?? 'منتج'}</Text>
                      <Text style={styles.itemMeta}>السعر: {item.unit_price} ر.س</Text>
                    </View>
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text style={styles.itemTotal}>{item.total_price} ر.س</Text>
                      <Text style={styles.itemQtyBadge}>الكمية: {item.quantity}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

          </View>
          
          {/* Side Column (Customer & Payment) */}
          <View style={[styles.sideCol, isDesktop && { flex: 3 }]}>
             
             {/* Customer Box */}
             <View style={styles.card}>
               <Text style={styles.sectionTitle}>معلومات العميل</Text>
               <View style={styles.customerRow}>
                 <View style={styles.avatarBig}>
                   <Text style={styles.avatarBigText}>{customerName.substring(0, 1)}</Text>
                 </View>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.customerNameBig}>{customerName}</Text>
                 </View>
               </View>

               <View style={styles.infoList}>
                 <View style={styles.infoRow}>
                   <Ionicons name="call-outline" size={20} color={UI.textGrey} style={styles.infoIcon} />
                   <View style={{ flex: 1 }}>
                     <Text style={styles.infoLabel}>رقم الجوال</Text>
                     <Text style={styles.infoValue}>{customerPhone || 'غير متوفر'}</Text>
                   </View>
                   {!!customerPhone && (
                     <TouchableOpacity style={styles.callIconBtn} onPress={() => Linking.openURL(`tel:${customerPhone}`)}>
                       <Ionicons name="call" size={16} color="#FFFFFF" />
                     </TouchableOpacity>
                   )}
                 </View>
                 
                 <View style={styles.infoRow}>
                   <Ionicons name="location-outline" size={20} color={UI.textGrey} style={styles.infoIcon} />
                   <View style={{ flex: 1 }}>
                     <Text style={styles.infoLabel}>عنوان التوصيل</Text>
                     <Text style={styles.infoValue}>{customerCity ? `${customerCity} - ` : ''}{customerAddress}</Text>
                   </View>
                 </View>
               </View>
             </View>

             {/* Payment Summary */}
             <View style={styles.card}>
               <Text style={styles.sectionTitle}>ملخص الدفع</Text>
               
               <View style={styles.paymentMethodBox}>
                 <Ionicons name="card-outline" size={20} color={UI.primary} />
                 <Text style={styles.paymentMethodText}>{paymentMethod}</Text>
               </View>

               <View style={styles.summaryLines}>
                 <View style={styles.summaryLine}>
                   <Text style={styles.summaryLineLabel}>المجموع الفرعي</Text>
                   <Text style={styles.summaryLineValue}>{subtotal} ر.س</Text>
                 </View>
                 <View style={styles.summaryLine}>
                   <Text style={styles.summaryLineLabel}>رسوم التوصيل</Text>
                   <Text style={styles.summaryLineValue}>{deliveryFee} ر.س</Text>
                 </View>
               </View>
               <View style={styles.summaryTotalLine}>
                 <Text style={styles.summaryTotalLabel}>الإجمالي المستحق</Text>
                 <Text style={styles.summaryTotalValue}>{order?.total_amount ?? (subtotal + deliveryFee)} <Text style={{ fontSize: 14 }}>ر.س</Text></Text>
               </View>
             </View>

             {/* Actions */}
             {(status === ORDER_STATUS.PENDING || status === ORDER_STATUS.PREPARING || status === ORDER_STATUS.READY) && (
               <View style={styles.actionsCard}>
                 {nextActionBtn}
                 {status === ORDER_STATUS.PENDING && (
                   <TouchableOpacity
                     style={styles.btnReject}
                     activeOpacity={0.7}
                     onPress={() =>
                       Alert.alert('رفض الطلب', 'هل أنت متأكد من رفض هذا الطلب وإلغائه؟', [
                         { text: 'تراجع', style: 'cancel' },
                         { text: 'تأكيد الرفض', style: 'destructive', onPress: () => changeStatus(ORDER_STATUS.CANCELLED) },
                       ])
                     }
                   >
                     <Text style={styles.btnRejectText}>رفض وإلغاء الطلب</Text>
                   </TouchableOpacity>
                 )}
               </View>
             )}

          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },
  
  headerMobile: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: UI.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  
  scrollContent: { padding: 20, paddingBottom: 100 },
  scrollContentDesktop: { padding: 40, alignItems: 'center' },
  
  pageHeaderRow: { width: '100%', maxWidth: 1200, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  backBtnDesktop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border, ...softShadow },
  backBtnText: { fontSize: 13, fontWeight: '700', color: UI.textDark },

  gridContainer: { width: '100%', maxWidth: 1200, gap: 24, flexDirection: 'column' },
  mainCol: { gap: 16 },
  sideCol: { gap: 16 },

  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: UI.border, ...softShadow },
  cardHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  
  orderIdText: { fontSize: 22, fontWeight: '900', color: UI.textDark, textAlign: 'right' },
  dateText: { fontSize: 13, color: UI.textGrey, marginTop: 4, textAlign: 'right' },
  
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 },
  badgeText: { fontSize: 13, fontWeight: '800' },
  
  notesBox: { marginTop: 16, padding: 16, backgroundColor: '#FEF3C7', borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  notesText: { flex: 1, fontSize: 13, color: '#92400E', textAlign: 'right', lineHeight: 20, fontWeight: '600' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: UI.textDark, marginBottom: 20, textAlign: 'right' },
  
  timelineRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  timelineStep: { alignItems: 'center', gap: 8 },
  timelineDot: { width: 14, height: 14, borderRadius: 7 },
  timelineText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  timelineLine: { height: 2, flex: 1, marginHorizontal: 4, marginTop: -20 },

  itemsCount: { fontSize: 13, fontWeight: '600', color: UI.textMuted },
  itemsWrapper: { marginTop: 8 },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 16, gap: 16 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: UI.border },
  itemImagePlaceholder: { width: 56, height: 56, borderRadius: 12, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  itemMeta: { fontSize: 13, color: UI.textGrey, marginTop: 4, textAlign: 'right' },
  itemTotal: { fontSize: 16, fontWeight: '800', color: UI.primary, textAlign: 'left' },
  itemQtyBadge: { fontSize: 12, fontWeight: '700', color: UI.textGrey, backgroundColor: UI.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' },

  customerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatarBig: { width: 56, height: 56, borderRadius: 28, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  avatarBigText: { fontSize: 20, fontWeight: '800', color: UI.textGrey },
  customerNameBig: { fontSize: 18, fontWeight: '800', color: UI.textDark, textAlign: 'right' },

  infoList: { gap: 16 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  infoIcon: { marginTop: 2 },
  infoLabel: { fontSize: 12, color: UI.textGrey, textAlign: 'right', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: UI.textDark, textAlign: 'right', lineHeight: 20 },
  callIconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: UI.primary, alignItems: 'center', justifyContent: 'center' },

  paymentMethodBox: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: UI.border, marginBottom: 20 },
  paymentMethodText: { fontSize: 14, fontWeight: '700', color: UI.textDark },
  
  summaryLines: { gap: 12, borderBottomWidth: 1, borderBottomColor: UI.border, paddingBottom: 16, marginBottom: 16 },
  summaryLine: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  summaryLineLabel: { fontSize: 14, color: UI.textGrey, fontWeight: '600' },
  summaryLineValue: { fontSize: 15, fontWeight: '800', color: UI.textDark },
  
  summaryTotalLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  summaryTotalLabel: { fontSize: 16, fontWeight: '900', color: UI.textDark },
  summaryTotalValue: { fontSize: 24, fontWeight: '900', color: UI.primary },

  actionsCard: { padding: 24, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: UI.border, ...softShadow, gap: 12 },
  btnPrimary: { height: 52, backgroundColor: UI.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  btnReject: { height: 52, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnRejectText: { color: UI.red, fontSize: 14, fontWeight: '700' },
});
