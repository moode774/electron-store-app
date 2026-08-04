import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, KeyboardAvoidingView,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAdminCoupons, createGlobalCoupon } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv } from '@marketplace/shared-i18n';

const UI = {
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  bg: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  success: COLORS.success,
  danger: COLORS.error,
};

export default function AdminCouponsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1120);
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
            <Text style={s.codeText}>{tv(item.code)}</Text>
          </View>
          <View style={[s.badge, isGlobal ? s.badgeGlobal : s.badgeLocal]}>
            <Text style={[s.badgeText, isGlobal ? s.badgeTextGlobal : s.badgeTextLocal]}>
              {tv(isGlobal ? t('عام (التطبيق)') : t('متجر خاص'))}
            </Text>
          </View>
        </View>

        <View style={s.detailsRow}>
          <Text style={s.detailLabel}>{t('الخصم:')}</Text>
          <Text style={s.detailValue}>{tv(item.type === 'percentage' ? `${item.value}%` : t('{0} ر.ي', [tv(item.value)]))}</Text>
        </View>
        
        {item.min_order_amount > 0 && (
          <View style={s.detailsRow}>
            <Text style={s.detailLabel}>{t('الحد الأدنى:')}</Text>
            <Text style={s.detailValue}>{t('{0} ر.ي', [tv(item.min_order_amount)])}</Text>
          </View>
        )}

        {!isGlobal && (
          <View style={s.detailsRow}>
            <Text style={s.detailLabel}>{t('خاص بمتجر:')}</Text>
            <Text style={s.detailValue}>{tv(item.merchant_profiles?.store_name ?? t('غير معروف'))}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <View style={[s.headerContent, { width: contentWidth }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={24} color={UI.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('إدارة الكوبونات')}</Text>
        </View>
      </View>

      <FlatList
        data={coupons}
        key={`coupons-${columns}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
        keyExtractor={i => i.id}
        contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={s.addCard}>
            <Text style={s.addTitle}>{t('إنشاء كوبون خصم عام للتطبيق')}</Text>
            
            <View style={[s.formRow, compact && s.formColumn]}>
              <View style={s.inputWrap}>
                <Text style={s.label}>{t('كود الخصم')}</Text>
                <TextInput style={s.input} placeholder={t('مثال: EID50')} value={code} onChangeText={setCode} textAlign="right" autoCapitalize="characters" />
              </View>
              <View style={s.inputWrap}>
                <Text style={s.label}>{t('نوع الخصم')}</Text>
                <View style={s.typeToggle}>
                  <TouchableOpacity style={[s.typeBtn, type === 'fixed' && s.typeBtnActive]} onPress={() => setType('fixed')}>
                    <Text style={[s.typeText, type === 'fixed' && s.typeTextActive]}>{t('مبلغ')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.typeBtn, type === 'percentage' && s.typeBtnActive]} onPress={() => setType('percentage')}>
                    <Text style={[s.typeText, type === 'percentage' && s.typeTextActive]}>{t('نسبة %')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={[s.formRow, compact && s.formColumn]}>
              <View style={s.inputWrap}>
                <Text style={s.label}>{t('الحد الأدنى للطلب')}</Text>
                <TextInput style={s.input} placeholder="0" value={minAmount} onChangeText={setMinAmount} keyboardType="numeric" textAlign="right" />
              </View>
              <View style={s.inputWrap}>
                <Text style={s.label}>{t('قيمة الخصم')}</Text>
                <TextInput style={s.input} placeholder={t('مثال: 20')} value={value} onChangeText={setValue} keyboardType="numeric" textAlign="right" />
              </View>
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={handleAddCoupon} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>{t('إصدار الكوبون')}</Text>}
            </TouchableOpacity>
          </View>
        }
        renderItem={renderCoupon}
        ListEmptyComponent={!loading ? <Text style={s.emptyText}>{t('لا توجد كوبونات حالياً')}</Text> : <ActivityIndicator size="large" color={UI.primary} style={{marginTop: 50}} />}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20, backgroundColor: UI.card, borderBottomWidth: 1, borderBottomColor: UI.border },
  headerContent: { maxWidth: 1120, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right' },
  list: { alignSelf: 'center', paddingTop: 20, paddingBottom: 112 },
  columnRow: { gap: 16 },
  
  addCard: { backgroundColor: UI.card, padding: 20, borderRadius: RADIUS.lg, marginBottom: 20, borderWidth: 1, borderColor: UI.border },
  addTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right', marginBottom: 16 },
  
  formRow: { flexDirection: 'row-reverse', gap: 12, marginBottom: 16 },
  formColumn: { flexDirection: 'column', gap: 14 },
  inputWrap: { flex: 1 },
  label: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textMuted, textAlign: 'right', marginBottom: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: UI.border, borderRadius: RADIUS.md, paddingHorizontal: 16, backgroundColor: COLORS.surfaceMuted, fontSize: 15, fontFamily: FONTS.regular, color: UI.text },
  
  typeToggle: { flexDirection: 'row-reverse', minHeight: 48, backgroundColor: COLORS.surfaceMuted, borderRadius: RADIUS.md, borderWidth: 1, borderColor: UI.border, overflow: 'hidden' },
  typeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  typeBtnActive: { backgroundColor: UI.primaryLight },
  typeText: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textMuted },
  typeTextActive: { color: UI.primary },

  saveBtn: { minHeight: 48, backgroundColor: UI.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveBtnText: { color: UI.card, fontSize: 16, fontFamily: FONTS.semiBold },

  couponCard: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: UI.border },
  couponTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  codeBox: { backgroundColor: '#F8FAFC', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: UI.border, borderStyle: 'dashed' },
  codeText: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, letterSpacing: 2 },
  
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeGlobal: { backgroundColor: UI.primaryLight },
  badgeLocal: { backgroundColor: '#FEF2F2' },
  badgeText: { fontSize: 11, fontFamily: FONTS.semiBold },
  badgeTextGlobal: { color: UI.primary },
  badgeTextLocal: { color: UI.danger },

  detailsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8 },
  detailLabel: { fontSize: 13, color: UI.textMuted, fontFamily: FONTS.medium },
  detailValue: { fontSize: 14, color: UI.text, fontFamily: FONTS.semiBold },
  
  emptyText: { textAlign: 'center', color: UI.textMuted, marginTop: 40, fontSize: 16, fontFamily: FONTS.medium }
});
