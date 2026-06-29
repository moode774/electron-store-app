import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, TextInput, Switch, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, formatPrice } from '@marketplace/shared-utils';
import { useAuthStore, getMerchantCoupons, createCoupon, setCouponActive, deleteCoupon, MerchantCoupon } from '@marketplace/shared-hooks';

export default function MerchantCouponsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [coupons, setCoupons] = useState<MerchantCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // نموذج الإنشاء
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [usageLimit, setUsageLimit] = useState('');

  const load = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    getMerchantCoupons(user.id).then(setCoupons).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const resetForm = () => { setCode(''); setType('percentage'); setValue(''); setMinOrder(''); setUsageLimit(''); };

  const submit = async () => {
    if (!user?.id) return;
    if (!code.trim()) { Alert.alert('تنبيه', 'أدخل كود الخصم'); return; }
    const val = Number(value);
    if (!val || val <= 0) { Alert.alert('تنبيه', 'أدخل قيمة خصم صحيحة'); return; }
    if (type === 'percentage' && val > 100) { Alert.alert('تنبيه', 'نسبة الخصم لا تتجاوز 100%'); return; }
    setSaving(true);
    try {
      await createCoupon({
        merchant_id: user.id,
        code,
        type,
        value: val,
        min_order_amount: minOrder ? Number(minOrder) : null,
        usage_limit: usageLimit ? Number(usageLimit) : null,
      });
      resetForm(); setShowForm(false); load();
      Alert.alert('تم', 'تم إنشاء الكوبون بنجاح');
    } catch (e: any) {
      Alert.alert('خطأ', e?.code === '23505' ? 'هذا الكود مستخدم بالفعل' : (e?.message ?? 'تعذّر إنشاء الكوبون'));
    } finally { setSaving(false); }
  };

  const toggle = async (c: MerchantCoupon) => {
    setCoupons((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: !x.is_active } : x));
    try { await setCouponActive(c.id, !c.is_active); } catch { load(); }
  };

  const remove = (c: MerchantCoupon) => {
    Alert.alert('حذف الكوبون', `حذف الكود ${c.code}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await deleteCoupon(c.id); load(); } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الحذف'); }
      } },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>العروض والكوبونات</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)} activeOpacity={0.7}>
          <Ionicons name={showForm ? 'close' : 'add'} size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>كوبون جديد</Text>
            <TextInput style={styles.input} placeholder="كود الخصم (مثال: WELCOME10)" placeholderTextColor="#9CA3AF" value={code} onChangeText={setCode} autoCapitalize="characters" />
            <View style={styles.typeRow}>
              <TouchableOpacity style={[styles.typeChip, type === 'percentage' && styles.typeChipActive]} onPress={() => setType('percentage')} activeOpacity={0.7}>
                <Text style={[styles.typeChipText, type === 'percentage' && styles.typeChipTextActive]}>نسبة %</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeChip, type === 'fixed' && styles.typeChipActive]} onPress={() => setType('fixed')} activeOpacity={0.7}>
                <Text style={[styles.typeChipText, type === 'fixed' && styles.typeChipTextActive]}>مبلغ ثابت</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder={type === 'percentage' ? 'نسبة الخصم (1-100)' : 'قيمة الخصم (ر.ي)'} placeholderTextColor="#9CA3AF" value={value} onChangeText={setValue} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="الحد الأدنى للطلب (اختياري)" placeholderTextColor="#9CA3AF" value={minOrder} onChangeText={setMinOrder} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="حد الاستخدام الكلي (اختياري)" placeholderTextColor="#9CA3AF" value={usageLimit} onChangeText={setUsageLimit} keyboardType="numeric" />
            <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>إنشاء الكوبون</Text>}
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : coupons.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="pricetags-outline" size={56} color="#D1D5DB" />
            <Text style={styles.emptyText}>لا توجد كوبونات بعد</Text>
            <Text style={styles.emptySub}>اضغط + لإنشاء أول عرض لمتجرك</Text>
          </View>
        ) : coupons.map((c) => (
          <View key={c.id} style={[styles.couponCard, !c.is_active && { opacity: 0.6 }]}>
            <View style={styles.couponLeft}>
              <View style={styles.couponIcon}>
                <Ionicons name="pricetag" size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.couponCode}>{c.code}</Text>
                <Text style={styles.couponDesc}>
                  {c.type === 'percentage' ? `خصم ${c.value}%` : `خصم ${formatPrice(c.value)}`}
                  {c.min_order_amount ? ` · حد أدنى ${formatPrice(c.min_order_amount)}` : ''}
                </Text>
                <Text style={styles.couponUsage}>
                  استُخدم {c.usage_count}{c.usage_limit ? ` / ${c.usage_limit}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.couponActions}>
              <Switch value={c.is_active} onValueChange={() => toggle(c)} trackColor={{ true: COLORS.primary, false: '#E5E7EB' }} thumbColor="#FFFFFF" />
              <TouchableOpacity onPress={() => remove(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20 },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 20 },
  formTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 14 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827', marginBottom: 10, textAlign: 'right' },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  typeChip: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  typeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeChipText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  typeChipTextActive: { color: '#FFFFFF' },
  submitBtn: { backgroundColor: COLORS.primary, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 8 },
  emptySub: { fontSize: 13, color: '#9CA3AF' },
  couponCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 12 },
  couponLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  couponIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  couponCode: { fontSize: 15, fontWeight: '800', color: '#111827' },
  couponDesc: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  couponUsage: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  couponActions: { alignItems: 'center', gap: 10 },
});
