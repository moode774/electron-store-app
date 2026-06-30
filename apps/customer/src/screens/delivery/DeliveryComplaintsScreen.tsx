import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, formatRelativeTime } from '@marketplace/shared-utils';
import { useAuthStore, getComplaintsAgainstMe, resolveComplaint, Complaint } from '@marketplace/shared-hooks';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'مفتوحة', color: '#B45309', bg: '#FEF3C7' },
  in_review: { label: 'قيد المراجعة', color: '#1D4ED8', bg: '#DBEAFE' },
  resolved: { label: 'محلولة', color: '#059669', bg: '#D1FAE5' },
  closed: { label: 'مغلقة', color: '#6B7280', bg: '#F3F4F6' },
};

export default function DeliveryComplaintsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    setError(false);
    getComplaintsAgainstMe(user.id)
      .then((data) => { setItems(data); })
      .catch(() => { setError(true); })
      .finally(() => setLoading(false));
  }, [user?.id]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const handleResolve = (c: Complaint) => {
    Alert.alert('حلّ الشكوى', `وضع شكوى "${c.title}" كمحلولة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تم الحل', onPress: async () => {
        try { await resolveComplaint(c.id, 'تمت المعالجة من قِبل المندوب'); load(); }
        catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر التحديث'); }
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
        <Text style={styles.headerTitle}>الشكاوى</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {error ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={56} color="#FCA5A5" />
              <Text style={styles.emptyText}>تعذّر تحميل الشكاوى</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }} activeOpacity={0.85}>
                <Text style={styles.retryText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="happy-outline" size={56} color="#D1D5DB" />
              <Text style={styles.emptyText}>لا توجد شكاوى — أداء ممتاز!</Text>
            </View>
          ) : items.map((c) => {
            const st = STATUS[c.status] ?? STATUS.open;
            return (
              <View key={c.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{c.title}</Text>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text></View>
                </View>
                {!!c.description && <Text style={styles.cardDesc}>{c.description}</Text>}
                {!!c.orders?.order_number && <Text style={styles.cardLine}>الطلب: {c.orders.order_number}</Text>}
                <Text style={styles.cardDate}>{formatRelativeTime(c.created_at)}</Text>
                {c.status !== 'resolved' && c.status !== 'closed' && (
                  <TouchableOpacity style={styles.resolveBtn} onPress={() => handleResolve(c)} activeOpacity={0.85}>
                    <Text style={styles.resolveText}>وضع كمحلولة</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scroll: { padding: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardLine: { fontSize: 12.5, color: '#374151', fontWeight: '600', marginTop: 2 },
  cardDesc: { fontSize: 12.5, color: '#6B7280', marginTop: 4, lineHeight: 19 },
  cardDate: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  resolveBtn: { backgroundColor: COLORS.primary, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  resolveText: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#9CA3AF' },
  retryBtn: { marginTop: 6, backgroundColor: COLORS.primary, paddingHorizontal: 22, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
});
