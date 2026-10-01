import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AdminDeliveryZone, getAdminDeliveryZones, saveAdminDeliveryZone } from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { Alert } from '../../components/appAlert';

export default function AdminDeliveryZonesScreen({ navigation }: any) {
  const [zones, setZones] = useState<AdminDeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminDeliveryZone | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [city, setCity] = useState('');
  const [fee, setFee] = useState('1500');
  const [threshold, setThreshold] = useState('14000');
  const [freeEnabled, setFreeEnabled] = useState(true);
  const [active, setActive] = useState(true);
  const [available, setAvailable] = useState(true);
  const [minimum, setMinimum] = useState('0');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setZones(await getAdminDeliveryZones()); setError(''); }
    catch (e: any) { setError(e?.message || 'تعذّر تحميل مناطق التوصيل.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const openForm = (zone: AdminDeliveryZone | null) => {
    setEditing(zone); setCity(zone?.city ?? ''); setFee(String(zone?.delivery_fee ?? 1500));
    setThreshold(String(zone?.free_delivery_threshold ?? 14000));
    setFreeEnabled(zone ? zone.free_delivery_threshold !== null : true);
    setActive(zone?.is_active ?? true); setAvailable(zone?.delivery_available ?? true);
    setMinimum(String(zone?.min_order_amount ?? 0)); setShowForm(true);
  };
  const save = async () => {
    if (saving) return;
    const feeValue = Number(fee.trim());
    const thresholdValue = Number(threshold.trim());
    const minimumValue = Number(minimum.trim());
    if (!city.trim() || !fee.trim() || !Number.isFinite(feeValue) || feeValue < 0 ||
      !minimum.trim() || !Number.isFinite(minimumValue) || minimumValue < 0 ||
      (freeEnabled && (!threshold.trim() || !Number.isFinite(thresholdValue) || thresholdValue < 0))) {
      Alert.alert('تحقق من البيانات', 'أدخل المدينة ومبالغ صحيحة تساوي صفراً أو أكثر.'); return;
    }
    setSaving(true);
    try {
      await saveAdminDeliveryZone({ id: editing?.id, city: city.trim(), delivery_fee: feeValue,
        free_delivery_threshold: freeEnabled ? thresholdValue : null, is_active: active,
        min_order_amount: minimumValue, delivery_available: available });
      setShowForm(false); await load(); Alert.alert('تم الحفظ', 'تم تحديث سياسة التوصيل للمدينة.');
    } catch (e: any) { Alert.alert('تعذّر الحفظ', e?.message || 'أعد المحاولة.'); }
    finally { setSaving(false); }
  };
  return <View style={s.root}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة"><Ionicons name="arrow-forward" size={24} color={COLORS.primary} /></TouchableOpacity>
      <Text style={s.title}>مناطق ورسوم التوصيل</Text>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.intro}><Text style={s.title}>سياسة واضحة لكل مدينة</Text><Text style={s.body}>تُحسب الرسوم لكل طلب متجر حسب مدينة عنوان العميل. يصبح التوصيل مجانياً عندما تتجاوز قيمة المنتجات بعد الخصم الحد المحدد؛ عند مساواة الحد تبقى الرسوم.</Text></View>
      <TouchableOpacity style={s.primary} disabled={saving} onPress={() => openForm(null)} accessibilityRole="button"><Text style={s.buttonText}>إضافة مدينة</Text></TouchableOpacity>
      {loading ? <ActivityIndicator size="large" color={COLORS.primary} /> : error ? <View style={s.card}><Text style={s.error}>{error}</Text><TouchableOpacity onPress={() => void load()} accessibilityRole="button"><Text style={s.link}>إعادة المحاولة</Text></TouchableOpacity></View> : zones.length === 0 ? <Text style={s.body}>لا توجد مناطق توصيل مسجلة.</Text> : zones.map(zone => <View key={zone.id} style={s.card}>
        <View style={s.row}><Text style={s.title}>{zone.city}</Text><Text style={[s.badge, (!zone.is_active || !zone.delivery_available) && s.inactive]}>{!zone.is_active ? 'موقوفة' : zone.delivery_available ? 'التوصيل متاح' : 'التوصيل متوقف'}</Text></View>
        <Text style={s.amount}>{zone.delivery_fee.toLocaleString()} <Text style={s.body}>ر.ي للتوصيل</Text></Text>
        <Text style={s.body}>{zone.free_delivery_threshold === null ? 'التوصيل المجاني غير مفعّل' : `توصيل مجاني للطلبات التي تتجاوز ${zone.free_delivery_threshold.toLocaleString()} ر.ي بعد الخصم`}</Text>
        <TouchableOpacity onPress={() => openForm(zone)} disabled={saving} accessibilityRole="button" accessibilityLabel={`تعديل رسوم ${zone.city}`}><Text style={s.link}>تعديل السياسة</Text></TouchableOpacity>
      </View>)}
      {showForm && <View style={s.card}>
        <Text style={s.title}>{editing ? `تعديل ${editing.city}` : 'مدينة جديدة'}</Text>
        <Text style={s.label}>اسم المدينة</Text><TextInput style={s.input} value={city} onChangeText={setCity} editable={!saving} accessibilityLabel="اسم المدينة" placeholder="مثال: تعز" />
        <Text style={s.label}>رسوم التوصيل (ر.ي)</Text><TextInput style={s.input} value={fee} onChangeText={setFee} keyboardType="decimal-pad" editable={!saving} accessibilityLabel="رسوم التوصيل" />
        <Text style={s.label}>الحد الأدنى لقيمة المنتجات قبل الخصم (ر.ي)</Text><TextInput style={s.input} value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" editable={!saving} accessibilityLabel="الحد الأدنى للطلب" />
        <View style={s.row}><Text style={s.label}>تفعيل التوصيل المجاني</Text><Switch value={freeEnabled} onValueChange={setFreeEnabled} disabled={saving} accessibilityLabel="تفعيل التوصيل المجاني" /></View>
        {freeEnabled && <><Text style={s.label}>مجاني عند تجاوز هذا المبلغ بعد الخصم (ر.ي)</Text><TextInput style={s.input} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" editable={!saving} accessibilityLabel="حد التوصيل المجاني" /></>}
        <View style={s.row}><Text style={s.label}>المنطقة مفعّلة</Text><Switch value={active} onValueChange={setActive} disabled={saving} accessibilityLabel="تفعيل المدينة" /></View>
        <View style={s.row}><Text style={s.label}>التوصيل متاح حالياً</Text><Switch value={available} onValueChange={setAvailable} disabled={saving} accessibilityLabel="إتاحة التوصيل" /></View>
        <TouchableOpacity style={s.primary} onPress={() => void save()} disabled={saving} accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.buttonText}>حفظ السياسة</Text>}</TouchableOpacity>
        <TouchableOpacity onPress={() => setShowForm(false)} disabled={saving} accessibilityRole="button"><Text style={s.link}>إلغاء</Text></TouchableOpacity>
      </View>}
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 22, paddingTop: 54, paddingBottom: 20, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface },
  content: { width: '100%', maxWidth: 880, alignSelf: 'center', padding: 20, paddingBottom: 100, gap: 16 },
  intro: { backgroundColor: COLORS.primarySoft, padding: 20, borderRadius: RADIUS.lg, gap: 10 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 20, gap: 12, borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: FONTS.bold, color: COLORS.textPrimary, fontSize: 18, textAlign: 'right' },
  body: { fontFamily: FONTS.regular, color: COLORS.textMuted, fontSize: 13, lineHeight: 22, textAlign: 'right' },
  label: { fontFamily: FONTS.medium, color: COLORS.textPrimary, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  amount: { fontFamily: FONTS.bold, color: COLORS.primary, fontSize: 24, textAlign: 'right' },
  badge: { backgroundColor: COLORS.primarySoft, color: COLORS.primary, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, fontFamily: FONTS.medium },
  inactive: { color: COLORS.textMuted, backgroundColor: COLORS.background },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, minHeight: 48, padding: 12, textAlign: 'right', color: COLORS.textPrimary, fontFamily: FONTS.regular },
  primary: { backgroundColor: COLORS.primary, padding: 14, borderRadius: RADIUS.md, alignItems: 'center', minHeight: 48 },
  buttonText: { color: '#FFF', fontFamily: FONTS.bold, fontSize: 14 },
  link: { color: COLORS.primary, paddingVertical: 10, textAlign: 'right', fontFamily: FONTS.bold },
  error: { color: COLORS.error, textAlign: 'right', fontFamily: FONTS.regular },
});
