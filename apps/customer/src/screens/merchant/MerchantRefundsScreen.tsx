import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getMerchantProfile, getMerchantRefundRequests, respondToRefundRequest,
  supabase, useAuthStore,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'بانتظار المراجعة', color: '#B45309', bg: '#FFFBEB' },
  approved: { label: 'مقبول', color: '#1D4ED8', bg: '#EFF6FF' },
  processing: { label: 'قيد التنفيذ المالي', color: '#7C3AED', bg: '#F5F3FF' },
  completed: { label: 'مكتمل', color: '#047857', bg: '#ECFDF5' },
  rejected: { label: 'مرفوض', color: '#B91C1C', bg: '#FEF2F2' },
};

export default function MerchantRefundsScreen({ navigation }: any) {
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isTablet = width >= BREAKPOINTS.tablet;

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setError('');
    try {
      const profile = await getMerchantProfile(user.id);
      if (!profile?.id) throw new Error('تعذّر العثور على ملف المتجر.');
      setItems(await getMerchantRefundRequests(profile.id));
    } catch (loadError: any) {
      setError(loadError?.message ?? 'تعذّر تحميل طلبات الاسترداد.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase
      .channel(`merchant-refunds-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refund_requests' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const visibleItems = useMemo(() => filter ? items.filter((item) => item.status === filter) : items, [filter, items]);

  const openResponse = (item: any) => {
    setSelected(item);
    setResponse(item.merchant_response ?? '');
  };

  const sendResponse = async () => {
    if (!selected || !response.trim() || sending) return;
    setSending(true);
    try {
      await respondToRefundRequest(selected.id, response);
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, merchant_response: response.trim() } : item));
      setSelected(null);
      Alert.alert('تم حفظ الرد', 'أضيف ردك إلى ملف الاسترداد دون تغيير قرار الإدارة.');
    } catch (sendError: any) {
      Alert.alert('تعذّر حفظ الرد', sendError?.message ?? 'تحقق من الاتصال وحاول مجددًا.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={[styles.header, isCompact && styles.headerCompact, isTablet && styles.headerWide]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة">
          <Ionicons name="arrow-forward" size={23} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>طلبات الاسترداد</Text>
          <Text style={styles.subtitle}>راجع الطلب وقدّم معلوماتك؛ قرار القبول والتنفيذ المالي من صلاحية الإدارة.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, isTablet && styles.filtersWide]}>
        {[
          { key: '', label: 'الكل' }, { key: 'pending', label: 'قيد المراجعة' },
          { key: 'approved', label: 'مقبول' }, { key: 'processing', label: 'قيد التنفيذ' },
          { key: 'completed', label: 'مكتمل' }, { key: 'rejected', label: 'مرفوض' },
        ].map((option) => (
          <TouchableOpacity key={option.key} style={[styles.filter, filter === option.key && styles.filterActive]} onPress={() => setFilter(option.key)} accessibilityRole="button" accessibilityState={{ selected: filter === option.key }}>
            <Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#111827" /></View> : error ? (
        <View style={styles.center} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={44} color="#B91C1C" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); void load(); }} accessibilityRole="button"><Text style={styles.retryText}>إعادة المحاولة</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          numColumns={isTablet ? 2 : 1}
          key={isTablet ? 'refund-grid' : 'refund-list'}
          columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyText}>لا توجد طلبات استرداد بهذه الحالة.</Text></View>}
          renderItem={({ item }) => {
            const meta = STATUS[item.status] ?? { label: item.status, color: '#64748B', bg: '#F1F5F9' };
            const orderItems = Array.isArray(item.orders?.order_items) ? item.orders.order_items : [];
            return (
              <View style={[styles.card, isCompact && styles.cardCompact]}>
                <View style={[styles.cardHeader, isCompact && styles.cardHeaderCompact]}>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}><Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text></View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.orderNumber}>طلب #{item.orders?.order_number ?? item.order_id?.slice?.(0, 8)}</Text>
                    <Text style={styles.date}>{new Date(item.created_at).toLocaleString('ar-SA')}</Text>
                  </View>
                </View>
                <View style={[styles.amountRow, isCompact && styles.amountRowCompact]}>
                  <Text style={styles.amount}>{Number(item.refund_amount ?? 0).toFixed(2)} ر.ي</Text>
                  <Text style={styles.amountLabel}>المبلغ المحسوب للاسترداد</Text>
                </View>
                <Text style={styles.label}>السبب</Text>
                <Text style={styles.body}>{item.reason ?? '—'}</Text>
                {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
                {orderItems.length ? (
                  <View style={styles.itemsBox}>
                    <Text style={styles.label}>عناصر الطلب</Text>
                    {orderItems.map((orderItem: any, index: number) => <Text key={`${orderItem.product_name}-${index}`} style={styles.itemLine}>{orderItem.product_name ?? 'منتج'} × {orderItem.quantity ?? 0}</Text>)}
                  </View>
                ) : null}
                {item.merchant_response ? <View style={styles.responseBox}><Text style={styles.label}>رد المتجر</Text><Text style={styles.body}>{item.merchant_response}</Text></View> : null}
                {item.decision_reason ? <View style={styles.adminBox}><Text style={styles.label}>سبب القرار</Text><Text style={styles.body}>{item.decision_reason}</Text></View> : null}
                {item.status === 'pending' ? (
                  <TouchableOpacity style={styles.responseButton} onPress={() => openResponse(item)} accessibilityRole="button" accessibilityLabel="إضافة رد التاجر">
                    <Text style={styles.responseButtonText}>{item.merchant_response ? 'تحديث رد المتجر' : 'إضافة معلومات للإدارة'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => !sending && setSelected(null)} accessibilityViewIsModal>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>رد المتجر على طلب الاسترداد</Text>
            <Text style={styles.modalHint}>اكتب حالة تجهيز الطلب أو أي معلومة تساعد الإدارة. هذا الرد لا يرفض الطلب ولا يغير حالته.</Text>
            <TextInput style={styles.input} value={response} onChangeText={setResponse} multiline maxLength={2000} textAlign="right" placeholder="تفاصيل رد المتجر..." placeholderTextColor="#94A3B8" accessibilityLabel="رد المتجر" />
            <View style={[styles.modalActions, isCompact && styles.modalActionsCompact]}>
              <TouchableOpacity style={styles.cancel} onPress={() => setSelected(null)} disabled={sending}><Text style={styles.cancelText}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirm, (!response.trim() || sending) && { opacity: 0.5 }]} onPress={sendResponse} disabled={!response.trim() || sending}>
                {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>حفظ الرد</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerCompact: { paddingHorizontal: 14 },
  headerWide: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  backButton: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.textPrimary, fontSize: 21, fontFamily: FONTS.bold, textAlign: 'right' },
  subtitle: { color: '#64748B', fontSize: 11.5, lineHeight: 18, textAlign: 'right', marginTop: 3 },
  filters: { flexDirection: 'row-reverse', padding: 14, gap: 8 },
  filtersWide: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.full, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  filterActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { color: '#64748B', fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },
  list: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 16, paddingTop: 2, gap: 12, paddingBottom: 80 },
  columnWrapper: { gap: 12 },
  card: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg, padding: 17, borderWidth: 1, borderColor: '#E2E8F0' },
  cardCompact: { padding: 14, borderRadius: RADIUS.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeaderCompact: { flexDirection: 'column', alignItems: 'stretch' },
  badge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  orderNumber: { color: '#0F172A', fontWeight: '900', fontSize: 15 },
  date: { color: '#94A3B8', fontSize: 10.5, marginTop: 3 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: 11, padding: 12, marginTop: 14 },
  amountRowCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 5 },
  amount: { color: '#111827', fontWeight: '900', fontSize: 17 },
  amountLabel: { color: '#64748B', fontSize: 11.5, fontWeight: '700' },
  label: { color: '#64748B', fontSize: 11, fontWeight: '800', textAlign: 'right', marginTop: 11 },
  body: { color: '#0F172A', fontSize: 13.5, lineHeight: 21, textAlign: 'right', marginTop: 3 },
  description: { color: '#334155', fontSize: 12.5, lineHeight: 20, textAlign: 'right', marginTop: 5 },
  itemsBox: { marginTop: 10, backgroundColor: '#F8FAFC', padding: 11, borderRadius: 10 },
  itemLine: { color: '#334155', fontSize: 12, textAlign: 'right', marginTop: 5 },
  responseBox: { marginTop: 11, backgroundColor: '#EFF6FF', padding: 11, borderRadius: 10 },
  adminBox: { marginTop: 11, backgroundColor: '#FFFBEB', padding: 11, borderRadius: 10 },
  responseButton: { minHeight: 44, marginTop: 14, backgroundColor: COLORS.primary, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  responseButtonText: { color: '#FFFFFF', fontWeight: '800' },
  center: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#B91C1C', textAlign: 'center', lineHeight: 21 },
  emptyText: { color: '#64748B', fontWeight: '700' },
  retry: { minHeight: 44, justifyContent: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 17, borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: '#0F172A99', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 540, maxHeight: '92%', backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg },
  modalContent: { padding: 20 },
  modalTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', textAlign: 'right' },
  modalHint: { color: '#64748B', fontSize: 12.5, lineHeight: 20, textAlign: 'right', marginTop: 7 },
  input: { minHeight: 120, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 13, marginTop: 15, color: '#0F172A', textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 15 },
  modalActionsCompact: { flexDirection: 'column' },
  cancel: { flex: 1, minHeight: 44, justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: 11, paddingHorizontal: 12, alignItems: 'center' },
  cancelText: { color: '#64748B', fontWeight: '800' },
  confirm: { flex: 2, minHeight: 44, justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: 11, paddingHorizontal: 12, alignItems: 'center' },
  confirmText: { color: '#FFFFFF', fontWeight: '900' },
});
