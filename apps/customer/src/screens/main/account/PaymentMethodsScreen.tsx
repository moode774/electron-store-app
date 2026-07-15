import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getPaymentMethods, PaymentMethod } from '@marketplace/shared-hooks';

const METHODS = [
  { id: 'cod', title: 'الدفع عند الاستلام', sub: 'ادفع نقداً عند وصول طلبك', icon: 'cash-outline', color: '#059669', available: true },
  { id: 'jawali', title: 'جوالي', sub: 'محفظة إلكترونية', icon: 'phone-portrait-outline', color: '#D97706', available: false },
  { id: 'kuraimi', title: 'الكريمي جوال', sub: 'تحويل بنكي مباشر', icon: 'business-outline', color: '#7C3AED', available: false },
  { id: 'card', title: 'بطاقة ائتمانية', sub: 'فيزا / ماستركارد', icon: 'card-outline', color: COLORS.primary, available: false },
];

export default function PaymentMethodsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [saved, setSaved] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      setSaved(await getPaymentMethods(user.id));
    } catch (error: any) {
      setLoadError(error?.message ?? 'تعذّر تحميل وسائل الدفع المحفوظة.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>طرق الدفع</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {METHODS.map((m) => (
          <View key={m.id} style={[styles.card, !m.available && styles.cardDisabled]}>
            <View style={[styles.iconWrap, { backgroundColor: `${m.color}15` }]}>
              <Ionicons name={m.icon as any} size={24} color={m.color} />
            </View>
            <View style={styles.info}>
              <Text style={styles.title}>{m.title}</Text>
              <Text style={styles.sub}>{m.sub}</Text>
            </View>
            {m.available ? (
              <View style={styles.activeBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text style={styles.activeText}>مفعّل</Text>
              </View>
            ) : (
              <View style={styles.soonBadge}>
                <Text style={styles.soonText}>قريباً</Text>
              </View>
            )}
          </View>
        ))}

        {/* البطاقات المحفوظة (بيانات حقيقية) */}
        <Text style={styles.savedTitle}>بطاقاتي المحفوظة</Text>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
        ) : loadError ? (
          <View style={styles.loadError} accessibilityRole="alert">
            <Text style={styles.loadErrorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void load()} accessibilityRole="button">
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : saved.length === 0 ? (
          <View style={styles.emptySaved}>
            <Ionicons name="card-outline" size={28} color="#D1D5DB" />
            <Text style={styles.emptySavedText}>لا توجد بطاقات محفوظة</Text>
          </View>
        ) : (
          saved.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: `${COLORS.primary}15` }]}>
                <Ionicons name="card" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.info}>
                <Text style={styles.title}>{m.card_brand ?? m.type} •••• {m.card_last4 ?? '----'}</Text>
                <Text style={styles.sub}>{m.card_expiry ?? ''}</Text>
              </View>
              {m.is_default && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeText}>افتراضي</Text>
                </View>
              )}
            </View>
          ))
        )}

        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.info} />
          <Text style={styles.noteText}>
            حالياً الدفع متاح نقداً عند الاستلام فقط. سيتم تفعيل المحافظ الإلكترونية والبطاقات قريباً.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scrollContent: { padding: 20, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  cardDisabled: { opacity: 0.6 },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginHorizontal: 14 },
  title: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  activeText: { fontSize: 11.5, fontWeight: '700', color: '#059669' },
  soonBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  soonText: { fontSize: 11.5, fontWeight: '700', color: '#9CA3AF' },
  noteBox: {
    flexDirection: 'row', gap: 8, backgroundColor: `${COLORS.info}10`, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: `${COLORS.info}30`, marginTop: 8,
  },
  noteText: { flex: 1, fontSize: 12.5, color: '#1E40AF', lineHeight: 19 },
  savedTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 12, marginBottom: 4 },
  emptySaved: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptySavedText: { fontSize: 13, color: '#9CA3AF' },
  loadError: { alignItems: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 12, backgroundColor: '#FEF2F2', borderRadius: 12 },
  loadErrorText: { color: '#991B1B', textAlign: 'center' },
  retryButton: { minHeight: 40, borderRadius: 10, backgroundColor: COLORS.primary, justifyContent: 'center', paddingHorizontal: 16 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
});
