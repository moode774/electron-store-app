import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  AdminProductReview,
  getAdminProducts,
  ProductApprovalStatus,
  reviewAdminProduct,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

type Filter = ProductApprovalStatus | 'all';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'pending', label: 'قيد المراجعة' },
  { value: 'approved', label: 'المعتمدة' },
  { value: 'rejected', label: 'المرفوضة' },
  { value: 'all', label: 'الكل' },
];

const STATUS_META: Record<ProductApprovalStatus, { label: string; color: string; background: string }> = {
  pending: { label: 'قيد المراجعة', color: '#92400E', background: '#FEF3C7' },
  approved: { label: 'معتمد', color: '#166534', background: '#DCFCE7' },
  rejected: { label: 'مرفوض', color: '#991B1B', background: '#FEE2E2' },
};

export default function AdminProductsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.tablet ? 2 : 1;
  const pagePadding = compact ? 12 : 20;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const cardWidth = columns === 2 ? (contentWidth - 12) / 2 : contentWidth;
  const [filter, setFilter] = useState<Filter>('pending');
  const [products, setProducts] = useState<AdminProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError('');
    try {
      setProducts(await getAdminProducts(filter));
    } catch (error: any) {
      setLoadError(error?.message ?? 'تعذر تحميل قائمة المنتجات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const approve = (product: AdminProductReview) => {
    Alert.alert(
      'اعتماد المنتج',
      `سيظهر «${product.name_ar || product.name}» للعملاء ويصبح قابلاً للطلب.`,
      [
        { text: 'تراجع', style: 'cancel' },
        {
          text: 'اعتماد',
          onPress: async () => {
            setProcessingId(product.id);
            try {
              await reviewAdminProduct(product.id, 'approved');
              await load(true);
            } catch (error: any) {
              Alert.alert('تعذر الاعتماد', error?.message ?? 'حاول مرة أخرى.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const reject = async (productId: string) => {
    const reason = rejectionReason.trim();
    if (reason.length < 3) {
      Alert.alert('سبب الرفض مطلوب', 'اكتب سببًا واضحًا ليعرف التاجر ما الذي يحتاج إلى تعديل.');
      return;
    }
    setProcessingId(productId);
    try {
      await reviewAdminProduct(productId, 'rejected', reason);
      setRejectingId(null);
      setRejectionReason('');
      await load(true);
    } catch (error: any) {
      Alert.alert('تعذر رفض المنتج', error?.message ?? 'حاول مرة أخرى.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingHorizontal: pagePadding + Math.max((width - contentWidth) / 2, 0) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerButton} accessibilityLabel="العودة">
          <Ionicons name="arrow-forward" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerCopy}>
          <Text style={s.title}>مراجعة المنتجات</Text>
          <Text style={s.subtitle}>لا يظهر المنتج الجديد قبل قرار الإدارة</Text>
        </View>
        <View style={s.headerButton} />
      </View>

      <View style={[s.filters, { width: contentWidth }]}>
        {FILTERS.map((item) => (
          <TouchableOpacity
            key={item.value}
            onPress={() => setFilter(item.value)}
            style={[s.filterButton, filter === item.value && s.filterButtonActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item.value }}
          >
            <Text style={[s.filterText, filter === item.value && s.filterTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1E3A8A" /></View>
      ) : loadError ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={42} color="#DC2626" />
          <Text style={s.errorText}>{loadError}</Text>
          <TouchableOpacity style={s.retryButton} onPress={() => void load()}>
            <Text style={s.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {products.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color="#16A34A" />
              <Text style={s.emptyTitle}>لا توجد منتجات في هذه القائمة</Text>
              <Text style={s.emptyText}>ستظهر المنتجات هنا فور إرسالها أو تغيير حالتها.</Text>
            </View>
          ) : products.map((product) => {
            const status = STATUS_META[product.approval_status] ?? STATUS_META.pending;
            const busy = processingId === product.id;
            const rejecting = rejectingId === product.id;
            return (
              <View key={product.id} style={[s.card, { width: cardWidth }]}>
                <View style={s.productRow}>
                  {product.primary_image ? (
                    <Image source={{ uri: product.primary_image }} style={s.image} />
                  ) : (
                    <View style={[s.image, s.imagePlaceholder]}>
                      <Ionicons name="cube-outline" size={30} color="#94A3B8" />
                    </View>
                  )}
                  <View style={s.productCopy}>
                    <View style={s.statusRow}>
                      <View style={[s.statusBadge, { backgroundColor: status.background }]}>
                        <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                      </View>
                      <Text style={s.storeName}>{product.merchant_profiles?.store_name ?? 'متجر غير معروف'}</Text>
                    </View>
                    <Text style={s.productName}>{product.name_ar || product.name}</Text>
                    <Text style={s.price}>{Number(product.sale_price ?? product.base_price).toFixed(2)} ر.ي</Text>
                    <Text style={s.meta}>المخزون: {product.stock_quantity ?? 0} · أضيف {new Date(product.created_at).toLocaleDateString('ar-SA')}</Text>
                  </View>
                </View>

                {(product.description_ar || product.description) ? (
                  <Text style={s.description} numberOfLines={3}>{product.description_ar || product.description}</Text>
                ) : null}
                {product.approval_note ? (
                  <View style={s.noteBox}><Text style={s.noteText}>سبب القرار: {product.approval_note}</Text></View>
                ) : null}

                {rejecting ? (
                  <View style={s.rejectBox}>
                    <TextInput
                      value={rejectionReason}
                      onChangeText={setRejectionReason}
                      placeholder="اذكر التعديل المطلوب من التاجر..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      maxLength={1000}
                      style={s.input}
                      textAlign="right"
                    />
                    <View style={s.actions}>
                      <TouchableOpacity
                        style={[s.actionButton, s.rejectButton, busy && s.disabled]}
                        disabled={busy}
                        onPress={() => void reject(product.id)}
                      >
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.rejectButtonText}>تأكيد الرفض</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionButton, s.cancelButton]}
                        disabled={busy}
                        onPress={() => { setRejectingId(null); setRejectionReason(''); }}
                      >
                        <Text style={s.cancelButtonText}>تراجع</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={[s.actionButton, s.approveButton, busy && s.disabled]}
                      disabled={busy || product.approval_status === 'approved'}
                      onPress={() => approve(product)}
                    >
                      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.approveButtonText}>اعتماد</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionButton, s.outlineRejectButton, busy && s.disabled]}
                      disabled={busy}
                      onPress={() => { setRejectingId(product.id); setRejectionReason(product.approval_note ?? ''); }}
                    >
                      <Text style={s.outlineRejectText}>رفض مع السبب</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.surface, paddingTop: 48, paddingBottom: 16, flexDirection: 'row-reverse', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerButton: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  title: { color: COLORS.textPrimary, fontSize: 20, fontFamily: FONTS.bold },
  subtitle: { color: COLORS.textMuted, fontSize: 11, fontFamily: FONTS.regular, marginTop: 3 },
  filters: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, padding: 12, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filterButton: { flexGrow: 1, minWidth: 100, minHeight: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted },
  filterButtonActive: { backgroundColor: COLORS.primary },
  filterText: { color: COLORS.textSecondary, fontSize: 12, fontFamily: FONTS.semiBold },
  filterTextActive: { color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  errorText: { color: '#991B1B', textAlign: 'center', lineHeight: 21 },
  retryButton: { minHeight: 44, justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: 20, paddingVertical: 11 },
  retryText: { color: COLORS.surface, fontFamily: FONTS.semiBold },
  list: { alignSelf: 'center', flexDirection: 'row-reverse', flexWrap: 'wrap', paddingTop: 14, paddingBottom: 112, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyTitle: { color: '#0F172A', fontWeight: '900', fontSize: 17, marginTop: 14 },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 6 },
  card: { minWidth: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 15, borderWidth: 1, borderColor: COLORS.border, gap: 11 },
  productRow: { flexDirection: 'row-reverse', gap: 12 },
  image: { width: 82, height: 82, borderRadius: 13, backgroundColor: '#F1F5F9' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productCopy: { flex: 1, alignItems: 'flex-end' },
  statusRow: { alignSelf: 'stretch', flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '900' },
  storeName: { flex: 1, color: '#64748B', fontSize: 11, textAlign: 'right' },
  productName: { color: '#0F172A', fontSize: 16, fontWeight: '900', textAlign: 'right', marginTop: 7 },
  price: { color: '#1E3A8A', fontSize: 14, fontWeight: '900', marginTop: 4 },
  meta: { color: '#64748B', fontSize: 10.5, marginTop: 5, textAlign: 'right' },
  description: { color: '#475569', fontSize: 12, lineHeight: 19, textAlign: 'right' },
  noteBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FECACA' },
  noteText: { color: '#991B1B', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  rejectBox: { gap: 9 },
  input: { minHeight: 88, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 11, padding: 11, color: '#0F172A', textAlignVertical: 'top', backgroundColor: '#FFFFFF' },
  actions: { flexDirection: 'row-reverse', gap: 9 },
  actionButton: { flex: 1, minHeight: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  approveButton: { backgroundColor: '#15803D' },
  approveButtonText: { color: '#FFFFFF', fontWeight: '900' },
  outlineRejectButton: { borderWidth: 1, borderColor: '#DC2626', backgroundColor: '#FFFFFF' },
  outlineRejectText: { color: '#B91C1C', fontWeight: '900' },
  rejectButton: { backgroundColor: '#B91C1C' },
  rejectButtonText: { color: '#FFFFFF', fontWeight: '900' },
  cancelButton: { backgroundColor: '#F1F5F9' },
  cancelButtonText: { color: '#475569', fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
