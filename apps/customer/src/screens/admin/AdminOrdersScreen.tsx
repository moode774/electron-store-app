import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Platform, Modal, TextInput
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAdminOrders } from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#059669',
  danger: '#DC2626',
  warning: '#D97706',
};

const STATUS_FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'pending', label: 'جديد' },
  { key: 'preparing', label: 'تحضير' },
  { key: 'ready', label: 'جاهز' },
  { key: 'assigned', label: 'تعيين سائق' },
  { key: 'picked_up', label: 'تم الاستلام' },
  { key: 'on_the_way', label: 'في الطريق' },
  { key: 'delivered', label: 'مسلّم' },
  { key: 'cancelled', label: 'ملغي' },
];

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'جديد', color: '#D97706', bg: '#FEF3C7' },
  confirmed: { label: 'مؤكد', color: '#2563EB', bg: '#DBEAFE' },
  preparing: { label: 'يُحضَّر', color: '#7C3AED', bg: '#EDE9FE' },
  ready: { label: 'جاهز', color: '#0891B2', bg: '#CFFAFE' },
  assigned: { label: 'تعيين سائق', color: '#DB2777', bg: '#FCE7F3' },
  picked_up: { label: 'تم الاستلام', color: '#EA580C', bg: '#FFEDD5' },
  on_the_way: { label: 'في الطريق', color: '#059669', bg: '#D1FAE5' },
  delivered: { label: 'مسلّم', color: '#059669', bg: '#A7F3D0' },
  cancelled: { label: 'ملغي', color: '#DC2626', bg: '#FEE2E2' },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً عند الاستلام', card: 'بطاقة', wallet: 'المحفظة', stc_pay: 'STC Pay', apple_pay: 'Apple Pay',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار التحصيل', paid: 'مدفوع', failed: 'فشل الدفع', refunded: 'مسترد', partially_refunded: 'مسترد جزئياً',
};

export default function AdminOrdersScreen({ navigation, route }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [search, setSearch] = useState(route?.params?.initialSearch ?? '');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getAdminOrders(filter || undefined);
      setOrders(data);
    } catch (e) {
      console.error('Failed to load admin orders:', e);
      setError('تعذر تحميل الطلبات. تحقق من الاتصال ثم أعد المحاولة.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [filter]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const normalizedSearch = search.trim().toLowerCase();
  const visibleOrders = normalizedSearch
    ? orders.filter((order) => [
        order.order_number,
        order.id,
        order.merchant_profiles?.store_name,
        order.customer?.full_name ?? order.users?.full_name,
        order.customer?.phone ?? order.users?.phone,
        order.delivery_profiles?.users?.full_name,
      ].some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch)))
    : orders;

  const renderOrder = ({ item }: { item: any }) => {
    const statusInfo = STATUS_LABELS[item.status] ?? { label: item.status, color: UI.textMuted, bg: '#F1F5F9' };
    const merchant = item.merchant_profiles;
    const address = item.addresses;
    const date = new Date(item.created_at).toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
          <View style={s.orderMeta}>
            <Text style={s.orderNum}>#{item.order_number ?? item.id.slice(0, 8)}</Text>
            <Text style={s.orderDate}>{date}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.detailsBlock}>
          <View style={s.detailRow}>
            <View style={s.detailIcon}><Ionicons name="storefront" size={14} color={UI.primary} /></View>
            <Text style={s.detailText}>{merchant?.store_name ?? 'غير متوفر'}</Text>
          </View>
          {address && (
            <View style={s.detailRow}>
              <View style={[s.detailIcon, { backgroundColor: '#F1F5F9' }]}><Ionicons name="location" size={14} color={UI.textMuted} /></View>
              <Text style={s.detailText}>{address.full_address ?? address.city ?? 'غير متوفر'}</Text>
            </View>
          )}
        </View>

        <View style={s.cardBottom}>
          <View style={s.amountWrap}>
            <Text style={s.totalAmount}>{item.total_amount?.toFixed(2)} ر.ي</Text>
            <Text style={s.deliveryFee}>التوصيل: {item.delivery_fee?.toFixed(2) ?? '0.00'} ر.ي</Text>
          </View>
          <TouchableOpacity style={s.viewDetailsBtn} activeOpacity={0.8} onPress={() => setSelected(item)} accessibilityRole="button" accessibilityLabel={`تفاصيل الطلب ${item.order_number ?? item.id}`}>
             <Text style={s.viewDetailsText}>التفاصيل</Text>
             <Ionicons name="chevron-back" size={14} color={UI.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>الطلبات</Text>
          </View>
          <Text style={s.headerCount}>{visibleOrders.length} طلب</Text>
        </View>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={20} color={UI.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="رقم الطلب، العميل، الهاتف أو المتجر..."
            placeholderTextColor={UI.textMuted}
            textAlign="right"
            accessibilityLabel="البحث في طلبات الإدارة"
          />
          {!!search && <TouchableOpacity onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="مسح البحث"><Ionicons name="close-circle" size={20} color={UI.textMuted} /></TouchableOpacity>}
        </View>
      </View>

      <View style={s.filterRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : error ? (
        <View style={s.center} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={48} color={UI.danger} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>إعادة المحاولة</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleOrders}
          keyExtractor={i => i.id}
          renderItem={renderOrder}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="receipt-outline" size={48} color={UI.border} />
              <Text style={s.emptyText}>لا توجد طلبات لعرضها</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)} accessibilityViewIsModal>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>تفاصيل الطلب #{selected?.order_number ?? ''}</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                <Ionicons name="close" size={22} color={UI.textMuted} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
                <View style={s.detailBlock}><Text style={s.detailLbl}>الحالة</Text>
                  <Text style={[s.detailVal, { color: STATUS_LABELS[selected.status]?.color ?? UI.textMuted }]}>{STATUS_LABELS[selected.status]?.label ?? selected.status}</Text>
                </View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>المتجر</Text><Text style={s.detailVal}>{selected.merchant_profiles?.store_name ?? '—'}</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>العميل</Text><Text style={s.detailVal}>{selected.customer?.full_name ?? selected.users?.full_name ?? '—'}</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>هاتف العميل</Text><Text style={s.detailVal}>{selected.customer?.phone ?? selected.users?.phone ?? '—'}</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>المندوب</Text><Text style={s.detailVal}>{selected.delivery_profiles?.users?.full_name ?? selected.drivers?.full_name ?? 'لم يتم التعيين'}</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>العنوان</Text><Text style={s.detailVal}>{selected.addresses?.full_address ?? selected.addresses?.city ?? '—'}</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>الإجمالي الفرعي</Text><Text style={s.detailVal}>{Number(selected.subtotal ?? 0).toFixed(2)} ر.ي</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>المبلغ الإجمالي</Text><Text style={s.detailVal}>{selected.total_amount?.toFixed(2)} ر.ي</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>رسوم التوصيل</Text><Text style={s.detailVal}>{selected.delivery_fee?.toFixed(2) ?? '0.00'} ر.ي</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>طريقة الدفع</Text><Text style={s.detailVal}>{PAYMENT_METHOD_LABELS[selected.payment_method] ?? selected.payment_method ?? '—'}</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>حالة الدفع</Text><Text style={s.detailVal}>{PAYMENT_STATUS_LABELS[selected.payment_status] ?? selected.payment_status ?? '—'}</Text></View>
                <View style={s.detailBlock}><Text style={s.detailLbl}>التاريخ</Text><Text style={s.detailVal}>{new Date(selected.created_at).toLocaleString('ar-SA')}</Text></View>
                {selected.delivered_at ? <View style={s.detailBlock}><Text style={s.detailLbl}>وقت التسليم</Text><Text style={s.detailVal}>{new Date(selected.delivered_at).toLocaleString('ar-SA')}</Text></View> : null}
                {Array.isArray(selected.order_items) && selected.order_items.length > 0 ? (
                  <View style={s.sectionBlock}>
                    <Text style={s.sectionTitle}>العناصر</Text>
                    {selected.order_items.map((item: any) => (
                      <View key={item.id} style={s.itemRow}>
                        <Text style={s.itemPrice}>{Number(item.total_price ?? ((item.unit_price ?? 0) * (item.quantity ?? 0))).toFixed(2)} ر.ي</Text>
                        <Text style={s.itemName}>{item.product_name ?? item.products?.name ?? 'منتج'} × {item.quantity}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {Array.isArray(selected.order_tracking) && selected.order_tracking.length > 0 ? (
                  <View style={s.sectionBlock}>
                    <Text style={s.sectionTitle}>سجل الحالة</Text>
                    {selected.order_tracking.map((entry: any) => (
                      <View key={entry.id} style={s.trackingRow}>
                        <Text style={s.trackingDate}>{new Date(entry.created_at).toLocaleString('ar-SA')}</Text>
                        <Text style={s.trackingStatus}>{STATUS_LABELS[entry.status]?.label ?? entry.status}</Text>
                      </View>
                    ))}
                  </View>
                ) : <Text style={s.noTracking}>لا توجد أحداث تتبع مسجلة لهذا الطلب.</Text>}
                {selected.notes ? <View style={s.detailBlock}><Text style={s.detailLbl}>ملاحظات</Text><Text style={s.detailVal}>{selected.notes}</Text></View> : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { 
    backgroundColor: UI.card, 
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20, 
    borderBottomWidth: 1, borderColor: UI.border,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
    zIndex: 10
  },
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text },
  backBtn: { padding: 4 },
  headerCount: { fontSize: 13, color: UI.primary, fontWeight: '700', backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  searchBox: { marginHorizontal: 20, marginTop: 16, height: 48, borderWidth: 1, borderColor: UI.border, borderRadius: 14, backgroundColor: UI.bg, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 14, color: UI.text, fontWeight: '600' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterScroll: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { padding: 20, paddingTop: 6, gap: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: UI.textMuted, fontWeight: '600' },
  errorText: { maxWidth: 420, textAlign: 'center', color: UI.danger, fontSize: 15, fontWeight: '700', lineHeight: 23 },
  retryBtn: { backgroundColor: UI.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  card: { backgroundColor: UI.card, borderRadius: 24, padding: 18, shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '800' },
  orderMeta: { alignItems: 'flex-start' },
  orderNum: { fontSize: 16, fontWeight: '900', color: UI.text },
  orderDate: { fontSize: 12, color: UI.textMuted, marginTop: 4, fontWeight: '500' },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 16 },
  detailsBlock: { gap: 12 },
  detailRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  detailIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  detailText: { fontSize: 14, color: UI.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  cardBottom: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, backgroundColor: '#F8FAFC', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: UI.border },
  amountWrap: { alignItems: 'flex-end' },
  totalAmount: { fontSize: 18, fontWeight: '900', color: UI.text },
  deliveryFee: { fontSize: 12, color: UI.textMuted, fontWeight: '600', marginTop: 2 },
  viewDetailsBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: UI.border },
  viewDetailsText: { fontSize: 12, fontWeight: '700', color: UI.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: UI.text },
  closeBtn: { padding: 4 },
  detailBlock: { gap: 4 },
  detailLbl: { fontSize: 11, fontWeight: '700', color: UI.textMuted, textAlign: 'right' },
  detailVal: { fontSize: 14, fontWeight: '600', color: UI.text, textAlign: 'right' },
  sectionBlock: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: UI.border },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: UI.text, textAlign: 'right' },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12 },
  itemName: { flex: 1, textAlign: 'right', fontSize: 13, color: UI.text, fontWeight: '700' },
  itemPrice: { fontSize: 12, color: UI.primary, fontWeight: '800' },
  trackingRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 12, borderRightWidth: 3, borderRightColor: UI.primary, paddingRight: 10 },
  trackingStatus: { color: UI.text, fontSize: 13, fontWeight: '800' },
  trackingDate: { color: UI.textMuted, fontSize: 11 },
  noTracking: { color: UI.warning, backgroundColor: '#FFFBEB', padding: 12, borderRadius: 10, textAlign: 'right', fontWeight: '700' },
});
