import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, KeyboardAvoidingView
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAdminCoupons, createGlobalCoupon } from '@marketplace/shared-hooks';

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
};

export default function AdminCouponsScreen({ navigation }: any) {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // New Coupon Form
  const [code, setCode] = useState('');
  const [type, setType] = useState<'fixed' | 'percentage'>('percentage');
  const [value, setValue] = useState('');
  const [minAmount, setMinAmount] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getAdminCoupons();
      setCoupons(data);
    } catch { Alert.alert('خطأ', 'فشل تحميل الكوبونات'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleAddCoupon = async () => {
    if (!code.trim() || !value.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال كود الخصم والقيمة');
      return;
    }
    setSaving(true);
    try {
      await createGlobalCoupon({
        code: code.trim().toUpperCase(),
        type,
        value: parseFloat(value),
        min_order_amount: parseFloat(minAmount) || 0,
        max_discount_amount: null,
        max_uses: null,
        end_date: null
      });
      Alert.alert('تم', 'تم إضافة الكوبون العام بنجاح');
      setCode('');
      setValue('');
      setMinAmount('');
      load();
    } catch { Alert.alert('خطأ', 'فشل إضافة الكوبون'); }
    finally { setSaving(false); }
  };

  const renderCoupon = ({ item }: { item: any }) => {
    const isGlobal = !item.merchant_id;
    return (
      <View style={s.couponCard}>
        <View style={s.couponTop}>
          <View style={s.codeBox}>
            <Text style={s.codeText}>{item.code}</Text>
          </View>
          <View style={[s.badge, isGlobal ? s.badgeGlobal : s.badgeLocal]}>
            <Text style={[s.badgeText, isGlobal ? s.badgeTextGlobal : s.badgeTextLocal]}>
              {isGlobal ? 'عام (التطبيق)' : 'متجر خاص'}
            </Text>
          </View>
        </View>

        <View style={s.detailsRow}>
          <Text style={s.detailLabel}>الخصم:</Text>
          <Text style={s.detailValue}>{item.type === 'percentage' ? `${item.value}%` : `${item.value} ر.ي`}</Text>
        </View>
        
        {item.min_order_amount > 0 && (
          <View style={s.detailsRow}>
            <Text style={s.detailLabel}>الحد الأدنى:</Text>
            <Text style={s.detailValue}>{item.min_order_amount} ر.ي</Text>
          </View>
        )}

        {!isGlobal && (
          <View style={s.detailsRow}>
            <Text style={s.detailLabel}>خاص بمتجر:</Text>
            <Text style={s.detailValue}>{item.merchant_profiles?.store_name ?? 'غير معروف'}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <View style={s.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={24} color={UI.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>إدارة الكوبونات</Text>
        </View>
      </View>

      <FlatList
        data={coupons}
        keyExtractor={i => i.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={s.addCard}>
            <Text style={s.addTitle}>إنشاء كوبون خصم عام للتطبيق</Text>
            
            <View style={s.formRow}>
              <View style={s.inputWrap}>
                <Text style={s.label}>كود الخصم</Text>
                <TextInput style={s.input} placeholder="مثال: EID50" value={code} onChangeText={setCode} textAlign="right" autoCapitalize="characters" />
              </View>
              <View style={s.inputWrap}>
                <Text style={s.label}>نوع الخصم</Text>
                <View style={s.typeToggle}>
                  <TouchableOpacity style={[s.typeBtn, type === 'fixed' && s.typeBtnActive]} onPress={() => setType('fixed')}>
                    <Text style={[s.typeText, type === 'fixed' && s.typeTextActive]}>مبلغ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.typeBtn, type === 'percentage' && s.typeBtnActive]} onPress={() => setType('percentage')}>
                    <Text style={[s.typeText, type === 'percentage' && s.typeTextActive]}>نسبة %</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={s.formRow}>
              <View style={s.inputWrap}>
                <Text style={s.label}>الحد الأدنى للطلب</Text>
                <TextInput style={s.input} placeholder="0" value={minAmount} onChangeText={setMinAmount} keyboardType="numeric" textAlign="right" />
              </View>
              <View style={s.inputWrap}>
                <Text style={s.label}>قيمة الخصم</Text>
                <TextInput style={s.input} placeholder="مثال: 20" value={value} onChangeText={setValue} keyboardType="numeric" textAlign="right" />
              </View>
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={handleAddCoupon} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>إصدار الكوبون</Text>}
            </TouchableOpacity>
          </View>
        }
        renderItem={renderCoupon}
        ListEmptyComponent={!loading ? <Text style={s.emptyText}>لا توجد كوبونات حالياً</Text> : <ActivityIndicator size="large" color={UI.primary} style={{marginTop: 50}} />}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { padding: 24, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: UI.border },
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: UI.text },
  list: { padding: 20, paddingBottom: 100 },
  
  addCard: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: UI.border },
  addTitle: { fontSize: 16, fontWeight: '900', color: UI.text, textAlign: 'right', marginBottom: 16 },
  
  formRow: { flexDirection: 'row-reverse', gap: 12, marginBottom: 16 },
  inputWrap: { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', color: UI.textMuted, textAlign: 'right', marginBottom: 8 },
  input: { height: 48, borderWidth: 1, borderColor: UI.border, borderRadius: 12, paddingHorizontal: 16, backgroundColor: '#F8FAFC', fontSize: 15, color: UI.text },
  
  typeToggle: { flexDirection: 'row-reverse', height: 48, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: UI.border, overflow: 'hidden' },
  typeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  typeBtnActive: { backgroundColor: UI.primaryLight },
  typeText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  typeTextActive: { color: UI.primary },

  saveBtn: { height: 48, backgroundColor: UI.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  couponCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: UI.border },
  couponTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  codeBox: { backgroundColor: '#F8FAFC', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: UI.border, borderStyle: 'dashed' },
  codeText: { fontSize: 16, fontWeight: '900', color: UI.text, letterSpacing: 2 },
  
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeGlobal: { backgroundColor: UI.primaryLight },
  badgeLocal: { backgroundColor: '#FEF2F2' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  badgeTextGlobal: { color: UI.primary },
  badgeTextLocal: { color: UI.danger },

  detailsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8 },
  detailLabel: { fontSize: 13, color: UI.textMuted, fontWeight: '600' },
  detailValue: { fontSize: 14, color: UI.text, fontWeight: '800' },
  
  emptyText: { textAlign: 'center', color: UI.textMuted, marginTop: 40, fontSize: 16 }
});
