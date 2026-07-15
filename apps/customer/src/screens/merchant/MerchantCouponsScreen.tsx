import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAuthStore,
  getMerchantProfile,
  getMerchantCoupons,
  createMerchantCoupon,
  updateMerchantCoupon,
  deleteMerchantCoupon,
  MerchantCoupon,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';

const UI = {
  primary: '#111827',
  bg: '#F3F4F6',
  bgMobile: '#FFFFFF',
  textDark: '#111827',
  textGrey: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  green: '#10B981',
  red: '#EF4444',
  yellow: '#F59E0B',
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 16,
  elevation: 1,
};

function formatDate(iso: string | null) {
  if (!iso) return 'بلا انتهاء';
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function isExpired(end_date: string | null) {
  if (!end_date) return false;
  return new Date(end_date) < new Date();
}

export default function MerchantCouponsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [merchantProfileId, setMerchantProfileId] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<MerchantCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // form fields
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try {
      const profile = await getMerchantProfile(user.id);
      if (!profile?.id) throw new Error('ملف المتجر غير موجود.');
      setMerchantProfileId(profile.id);
      const data = await getMerchantCoupons(profile.id);
      setCoupons(data);
    } catch (error: any) {
      setLoadError(error?.message ?? 'تعذّر تحميل كوبونات المتجر.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  function openModal() {
    setCode('');
    setType('percentage');
    setValue('');
    setMinOrder('');
    setMaxDiscount('');
    setMaxUses('');
    setEndDate('');
    setShowModal(true);
  }

  async function handleCreate() {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) { Alert.alert('خطأ', 'أدخل كود الكوبون'); return; }
    const numValue = parseFloat(value);
    if (!numValue || numValue <= 0) { Alert.alert('خطأ', 'أدخل قيمة صحيحة'); return; }
    if (type === 'percentage' && numValue > 100) { Alert.alert('خطأ', 'النسبة لا تتجاوز 100%'); return; }
    if (!merchantProfileId) return;

    setSaving(true);
    try {
      await createMerchantCoupon({
        merchant_id: merchantProfileId,
        code: trimmedCode,
        type,
        value: numValue,
        min_order_amount: minOrder ? parseFloat(minOrder) : undefined,
        max_discount_amount: maxDiscount ? parseFloat(maxDiscount) : undefined,
        max_uses: maxUses ? parseInt(maxUses) : undefined,
        end_date: endDate || undefined,
      });
      setShowModal(false);
      load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message?.includes('duplicate') ? 'هذا الكود موجود مسبقاً' : 'فشل إنشاء الكوبون');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: MerchantCoupon) {
    if (updatingId) return;
    setUpdatingId(coupon.id);
    try {
      await updateMerchantCoupon(coupon.id, { is_active: !coupon.is_active });
      await load();
    } catch {
      Alert.alert('لم يتم التحديث', 'تعذر تغيير حالة الكوبون.');
    } finally {
      setUpdatingId(null);
    }
  }

  function confirmDelete(coupon: MerchantCoupon) {
    Alert.alert(
      'حذف الكوبون',
      `هل أنت متأكد من حذف كوبون "${coupon.code}"؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMerchantCoupon(coupon.id);
              setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
            } catch {
              Alert.alert('تعذر الحذف', 'لم يتم حذف الكوبون. أعد المحاولة.');
            }
          },
        },
      ]
    );
  }

  function getStatusInfo(coupon: MerchantCoupon) {
    if (isExpired(coupon.end_date)) return { label: 'منتهي', color: UI.red };
    if (!coupon.is_active) return { label: 'متوقف', color: UI.textMuted };
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return { label: 'نفد', color: UI.yellow };
    return { label: 'فعّال', color: UI.green };
  }

  const renderCoupon = ({ item }: { item: MerchantCoupon }) => {
    const status = getStatusInfo(item);
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          {/* Code + Status */}
          <View style={styles.codeRow}>
            <View style={[styles.statusPill, { backgroundColor: `${status.color}18` }]}>
              <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
            </View>
            <Text style={styles.codeText}>{item.code}</Text>
          </View>

          {/* Actions */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: item.is_active ? `${UI.green}18` : UI.bg }]}
              onPress={() => toggleActive(item)}
              disabled={!!updatingId}
              accessibilityRole="button"
              accessibilityLabel={`${item.is_active ? 'إيقاف' : 'تفعيل'} الكوبون ${item.code}`}
              accessibilityState={{ disabled: !!updatingId, busy: updatingId === item.id }}
              activeOpacity={0.7}
            >
              <Ionicons name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color={item.is_active ? UI.green : UI.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(item)} activeOpacity={0.7} disabled={!!updatingId} accessibilityRole="button" accessibilityLabel={`حذف الكوبون ${item.code}`} accessibilityState={{ disabled: !!updatingId }}>
              <Ionicons name="trash-outline" size={20} color={UI.red} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cardDetails}>
          {/* Type + Value */}
          <View style={styles.detailChip}>
            <Ionicons name="pricetag-outline" size={13} color={UI.textGrey} />
            <Text style={styles.detailChipText}>
              {item.type === 'percentage' ? `${item.value}%` : `${item.value} ر.ي`}
            </Text>
          </View>

          {/* Min Order */}
          {item.min_order_amount ? (
            <View style={styles.detailChip}>
              <Ionicons name="cart-outline" size={13} color={UI.textGrey} />
              <Text style={styles.detailChipText}>حد أدنى {item.min_order_amount}</Text>
            </View>
          ) : null}

          {/* End Date */}
          <View style={styles.detailChip}>
            <Ionicons name="calendar-outline" size={13} color={UI.textGrey} />
            <Text style={styles.detailChipText}>{formatDate(item.end_date)}</Text>
          </View>

          {/* Usage */}
          <View style={styles.detailChip}>
            <Ionicons name="people-outline" size={13} color={UI.textGrey} />
            <Text style={styles.detailChipText}>
              {item.used_count}{item.max_uses ? `/${item.max_uses}` : ''} استخدام
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      {/* Mobile Header */}
      {!isDesktop && (
        <View style={styles.headerMobile}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>كوبونات المتجر</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <View style={[styles.pageContent, isDesktop && styles.pageContentDesktop]}>
        {/* Page Header Row */}
        <View style={styles.pageHeaderRow}>
          <View>
            <Text style={styles.pageTitle}>الكوبونات</Text>
            <Text style={styles.pageSubtitle}>أنشئ وأدر كوبونات الخصم لمتجرك</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openModal} activeOpacity={0.85}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>كوبون جديد</Text>
          </TouchableOpacity>
        </View>

        {/* Stats bar */}
        {coupons.length > 0 && (
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{coupons.length}</Text>
              <Text style={styles.statLabel}>إجمالي</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: UI.green }]}>
                {coupons.filter((c) => c.is_active && !isExpired(c.end_date)).length}
              </Text>
              <Text style={styles.statLabel}>فعّالة</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{coupons.reduce((s, c) => s + c.used_count, 0)}</Text>
              <Text style={styles.statLabel}>استخدام</Text>
            </View>
          </View>
        )}

        {/* List */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={UI.primary} />
          </View>
        ) : loadError ? (
          <View style={styles.errorState} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={48} color={UI.red} />
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void load(); }} accessibilityRole="button">
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={coupons}
            keyExtractor={(item) => item.id}
            renderItem={renderCoupon}
            contentContainerStyle={styles.listContent}
            numColumns={isDesktop ? 2 : 1}
            key={isDesktop ? 'desktop' : 'mobile'}
            columnWrapperStyle={isDesktop ? { gap: 16 } : undefined}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="pricetag-outline" size={52} color={UI.textMuted} />
                <Text style={styles.emptyTitle}>لا توجد كوبونات بعد</Text>
                <Text style={styles.emptySubtitle}>أنشئ أول كوبون خصم لجذب المزيد من العملاء</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={openModal} activeOpacity={0.85}>
                  <Text style={styles.emptyBtnText}>إنشاء كوبون</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>

      {/* Create Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowModal(false)} activeOpacity={1} />
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>كوبون جديد</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* Code */}
              <Text style={styles.fieldLabel}>كود الكوبون *</Text>
              <TextInput
                style={styles.input}
                placeholder="SUMMER20"
                placeholderTextColor={UI.textMuted}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                autoCapitalize="characters"
              />

              {/* Type */}
              <Text style={styles.fieldLabel}>نوع الخصم *</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, type === 'percentage' && styles.typeBtnActive]}
                  onPress={() => setType('percentage')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.typeBtnText, type === 'percentage' && styles.typeBtnTextActive]}>نسبة مئوية %</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, type === 'fixed' && styles.typeBtnActive]}
                  onPress={() => setType('fixed')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.typeBtnText, type === 'fixed' && styles.typeBtnTextActive]}>مبلغ ثابت ر.ي</Text>
                </TouchableOpacity>
              </View>

              {/* Value */}
              <Text style={styles.fieldLabel}>
                {type === 'percentage' ? 'نسبة الخصم (%) *' : 'مبلغ الخصم (ر.ي) *'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={type === 'percentage' ? 'مثال: 15' : 'مثال: 50'}
                placeholderTextColor={UI.textMuted}
                value={value}
                onChangeText={setValue}
                keyboardType="numeric"
              />

              {/* Min Order */}
              <Text style={styles.fieldLabel}>الحد الأدنى للطلب (اختياري)</Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: 100"
                placeholderTextColor={UI.textMuted}
                value={minOrder}
                onChangeText={setMinOrder}
                keyboardType="numeric"
              />

              {/* Max Discount (percentage only) */}
              {type === 'percentage' && (
                <>
                  <Text style={styles.fieldLabel}>أقصى قيمة خصم (اختياري)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="مثال: 200"
                    placeholderTextColor={UI.textMuted}
                    value={maxDiscount}
                    onChangeText={setMaxDiscount}
                    keyboardType="numeric"
                  />
                </>
              )}

              {/* Max Uses */}
              <Text style={styles.fieldLabel}>الحد الأقصى للاستخدام (اختياري)</Text>
              <TextInput
                style={styles.input}
                placeholder="اتركه فارغاً = غير محدود"
                placeholderTextColor={UI.textMuted}
                value={maxUses}
                onChangeText={setMaxUses}
                keyboardType="numeric"
              />

              {/* End Date */}
              <Text style={styles.fieldLabel}>تاريخ الانتهاء (اختياري YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="2024-12-31"
                placeholderTextColor={UI.textMuted}
                value={endDate}
                onChangeText={setEndDate}
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>إنشاء الكوبون</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },

  headerMobile: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: UI.textDark },

  pageContent: { flex: 1 },
  pageContentDesktop: { padding: 32 },

  pageHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    marginBottom: 20,
  },
  pageTitle: { fontSize: 26, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  pageSubtitle: { fontSize: 13, color: UI.textGrey, textAlign: 'right', marginTop: 4 },

  addBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: UI.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    ...softShadow,
    shadowOpacity: 0.2,
    shadowColor: UI.primary,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  statsBar: {
    flexDirection: 'row-reverse',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 14,
    ...softShadow,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: UI.textDark },
  statLabel: { fontSize: 11, color: UI.textMuted, fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: UI.border },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: UI.red, textAlign: 'center' },
  retryButton: { minHeight: 44, borderRadius: 11, backgroundColor: UI.primary, justifyContent: 'center', paddingHorizontal: 18 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    ...softShadow,
  },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  codeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1 },
  codeText: { fontSize: 17, fontWeight: '800', color: UI.textDark, letterSpacing: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row-reverse', gap: 8 },
  toggleBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: `${UI.red}12`, alignItems: 'center', justifyContent: 'center' },

  cardDetails: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  detailChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: UI.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  detailChipText: { fontSize: 12, color: UI.textGrey, fontWeight: '600' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: UI.textDark, marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: UI.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { marginTop: 24, backgroundColor: UI.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: UI.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: UI.textDark, textAlign: 'right', marginBottom: 20 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: UI.textGrey, textAlign: 'right', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: UI.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: UI.textDark,
    textAlign: 'right',
    backgroundColor: UI.bg,
  },

  typeRow: { flexDirection: 'row-reverse', gap: 12 },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: UI.bg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  typeBtnText: { fontSize: 13, fontWeight: '700', color: UI.textGrey },
  typeBtnTextActive: { color: '#FFFFFF' },

  submitBtn: {
    backgroundColor: UI.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
