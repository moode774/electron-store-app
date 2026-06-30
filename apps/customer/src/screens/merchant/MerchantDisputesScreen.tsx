import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, formatPrice, formatRelativeTime } from '@marketplace/shared-utils';
import {
  useAuthStore, getComplaintsAgainstMe, resolveComplaint, getMerchantRefunds, respondToRefund,
  Complaint, MerchantRefund,
} from '@marketplace/shared-hooks';

const REFUND_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'بانتظار الرد', color: '#B45309', bg: '#FEF3C7' },
  approved: { label: 'مقبول', color: '#059669', bg: '#D1FAE5' },
  rejected: { label: 'مرفوض', color: '#DC2626', bg: '#FEE2E2' },
  processing: { label: 'قيد المعالجة', color: '#1D4ED8', bg: '#DBEAFE' },
  completed: { label: 'مكتمل', color: '#059669', bg: '#D1FAE5' },
};
const COMPLAINT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'مفتوحة', color: '#B45309', bg: '#FEF3C7' },
  in_review: { label: 'قيد المراجعة', color: '#1D4ED8', bg: '#DBEAFE' },
  resolved: { label: 'محلولة', color: '#059669', bg: '#D1FAE5' },
  closed: { label: 'مغلقة', color: '#6B7280', bg: '#F3F4F6' },
};
const REFUND_REASON: Record<string, string> = {
  wrong_item: 'منتج خاطئ', damaged: 'تالف', not_as_described: 'مختلف عن الوصف',
  changed_mind: 'تغيّر الرأي', not_received: 'لم يصل', other: 'أخرى',
};

export default function MerchantDisputesScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'refunds' | 'complaints'>('refunds');
  const [refunds, setRefunds] = useState<MerchantRefund[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    setError(false);
    Promise.all([getMerchantRefunds(user.id), getComplaintsAgainstMe(user.id)])
      .then(([r, c]) => { setRefunds(r); setComplaints(c); })
      .catch(() => { setError(true); setRefunds([]); setComplaints([]); })
      .finally(() => setLoading(false));
  }, [user?.id]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const handleRefund = (r: MerchantRefund, status: 'approved' | 'rejected') => {
    Alert.alert(status === 'approved' ? 'قبول الاسترجاع' : 'رفض الاسترجاع',
      `طلب ${r.orders?.order_number ?? ''} بمبلغ ${formatPrice(r.refund_amount)}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        try { await respondToRefund(r.id, status); load(); } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر التحديث'); }
      } },
    ]);
  };

  const handleResolve = (c: Complaint) => {
    Alert.alert('حلّ الشكوى', `وضع شكوى "${c.title}" كمحلولة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تم الحل', onPress: async () => {
        try { await resolveComplaint(c.id, 'تمت المعالجة من قِبل المتجر'); load(); } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر التحديث'); }
      } },
    ]);
  };

  const pendingRefunds = refunds.filter((r) => r.status === 'pending').length;
  const openComplaints = complaints.filter((c) => c.status !== 'resolved' && c.status !== 'closed').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الشكاوى والمرتجعات</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'refunds' && styles.tabActive]} onPress={() => setTab('refunds')} activeOpacity={0.7}>
          <Text style={[styles.tabText, tab === 'refunds' && styles.tabTextActive]}>المرتجعات{pendingRefunds > 0 ? ` (${pendingRefunds})` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'complaints' && styles.tabActive]} onPress={() => setTab('complaints')} activeOpacity={0.7}>
          <Text style={[styles.tabText, tab === 'complaints' && styles.tabTextActive]}>الشكاوى{openComplaints > 0 ? ` (${openComplaints})` : ''}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={52} color="#FCA5A5" />
          <Text style={styles.errorText}>تعذّر تحميل البيانات</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }} activeOpacity={0.85}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {tab === 'refunds' ? (
            refunds.length === 0 ? <Empty icon="cube-outline" text="لا توجد طلبات استرجاع" /> :
            refunds.map((r) => {
              const st = REFUND_STATUS[r.status] ?? REFUND_STATUS.pending;
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>طلب {r.orders?.order_number ?? ''}</Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text></View>
                  </View>
                  <Text style={styles.cardLine}>السبب: {REFUND_REASON[r.reason] ?? r.reason} · {formatPrice(r.refund_amount)}</Text>
                  {!!r.description && <Text style={styles.cardDesc}>{r.description}</Text>}
                  <Text style={styles.cardDate}>{formatRelativeTime(r.created_at)}</Text>
                  {r.status === 'pending' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.actBtn, styles.reject]} onPress={() => handleRefund(r, 'rejected')} activeOpacity={0.8}>
                        <Text style={[styles.actText, { color: '#DC2626' }]}>رفض</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actBtn, styles.approve]} onPress={() => handleRefund(r, 'approved')} activeOpacity={0.8}>
                        <Text style={[styles.actText, { color: '#FFFFFF' }]}>قبول</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            complaints.length === 0 ? <Empty icon="chatbox-ellipses-outline" text="لا توجد شكاوى" /> :
            complaints.map((c) => {
              const st = COMPLAINT_STATUS[c.status] ?? COMPLAINT_STATUS.open;
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
                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.actBtn, styles.approve, { flex: 1 }]} onPress={() => handleResolve(c)} activeOpacity={0.8}>
                        <Text style={[styles.actText, { color: '#FFFFFF' }]}>وضع كمحلولة</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function Empty({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={56} color="#D1D5DB" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  tabTextActive: { color: '#FFFFFF' },
  scroll: { padding: 20, gap: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardLine: { fontSize: 12.5, color: '#374151', fontWeight: '600', marginTop: 2 },
  cardDesc: { fontSize: 12.5, color: '#6B7280', marginTop: 4, lineHeight: 19 },
  cardDate: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  approve: { backgroundColor: COLORS.primary },
  reject: { backgroundColor: '#FEE2E2' },
  actText: { fontSize: 13.5, fontWeight: '800' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#9CA3AF' },
  errorBox: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  errorText: { fontSize: 15, fontWeight: '700', color: '#9CA3AF' },
  retryBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 22, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
});
