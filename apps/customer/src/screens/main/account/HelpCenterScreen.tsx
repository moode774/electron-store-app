import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Linking, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, createSupportTicket, getSupportTickets, SupportTicket } from '@marketplace/shared-hooks';

const CATEGORIES = [
  { value: 'technical', label: 'مشكلة تقنية' },
  { value: 'payment', label: 'دفع' },
  { value: 'delivery', label: 'توصيل' },
  { value: 'account', label: 'حساب' },
  { value: 'other', label: 'أخرى' },
];
const TICKET_STATUS: Record<string, string> = {
  open: 'مفتوحة', in_progress: 'قيد المعالجة', waiting_user: 'بانتظارك', resolved: 'محلولة', closed: 'مغلقة',
};

const FAQS = [
  { id: '1', q: 'كيف أتتبع طلبي؟', a: 'من تبويب "طلباتي" اضغط على الطلب لعرض حالته ومسار التوصيل لحظة بلحظة.' },
  { id: '2', q: 'ما هي طرق الدفع المتاحة؟', a: 'حالياً الدفع نقداً عند الاستلام (COD)، وقريباً المحافظ الإلكترونية المحلية.' },
  { id: '3', q: 'كيف أسترجع منتجاً؟', a: 'يمكنك طلب الإرجاع خلال 3 أيام من الاستلام بشرط أن يكون المنتج بحالته الأصلية، عبر التواصل مع الدعم.' },
  { id: '4', q: 'كم تستغرق مدة التوصيل؟', a: 'داخل المدينة من 1 إلى 3 ساعات حسب المنطقة، وبين المدن من 1 إلى 3 أيام.' },
  { id: '5', q: 'كيف أعدّل عنواني؟', a: 'من "حسابي" ثم "عناويني" يمكنك إضافة أو تعديل أو حذف عناوينك المحفوظة.' },
];

export default function HelpCenterScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('technical');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const loadTickets = useCallback(() => {
    if (user?.id) getSupportTickets(user.id).then(setTickets).catch(() => {});
  }, [user?.id]);
  useEffect(() => { loadTickets(); }, [loadTickets]);

  const submitTicket = async () => {
    if (!subject.trim() || !message.trim()) { Alert.alert('تنبيه', 'أدخل الموضوع والرسالة'); return; }
    if (!user?.id) return;
    setSending(true);
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), category, message: message.trim() });
      setSubject(''); setMessage('');
      Alert.alert('تم الإرسال ✅', 'تم فتح تذكرة دعم وسيتم الرد قريباً');
      loadTickets();
    } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإرسال'); }
    finally { setSending(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>مركز المساعدة</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Contact Channels */}
        <View style={styles.channelsRow}>
          <TouchableOpacity
            style={styles.channelCard}
            activeOpacity={0.8}
            onPress={() => Linking.openURL('https://wa.me/967700000000')}
          >
            <View style={[styles.channelIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="logo-whatsapp" size={24} color="#059669" />
            </View>
            <Text style={styles.channelTitle}>واتساب</Text>
            <Text style={styles.channelSub}>رد خلال دقائق</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.channelCard}
            activeOpacity={0.8}
            onPress={() => Linking.openURL('tel:+967700000000')}
          >
            <View style={[styles.channelIcon, { backgroundColor: '#F0F4FF' }]}>
              <Ionicons name="call-outline" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.channelTitle}>اتصال مباشر</Text>
            <Text style={styles.channelSub}>9ص - 9م يومياً</Text>
          </TouchableOpacity>
        </View>

        {/* إرسال تذكرة دعم */}
        <Text style={styles.sectionTitle}>إرسال طلب دعم</Text>
        <View style={styles.ticketForm}>
          <View style={styles.catRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c.value} style={[styles.catChip, category === c.value && styles.catChipActive]} onPress={() => setCategory(c.value)} activeOpacity={0.7}>
                <Text style={[styles.catChipText, category === c.value && styles.catChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.ticketInput} placeholder="الموضوع" placeholderTextColor="#9CA3AF" value={subject} onChangeText={setSubject} />
          <TextInput style={[styles.ticketInput, styles.ticketArea]} placeholder="اشرح مشكلتك..." placeholderTextColor="#9CA3AF" value={message} onChangeText={setMessage} multiline />
          <TouchableOpacity style={[styles.submitTicket, sending && { opacity: 0.6 }]} onPress={submitTicket} disabled={sending} activeOpacity={0.85}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitTicketText}>إرسال التذكرة</Text>}
          </TouchableOpacity>
        </View>

        {tickets.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>تذاكري</Text>
            <View style={styles.faqContainer}>
              {tickets.map((t, i) => (
                <View key={t.id} style={[styles.ticketRow, i === tickets.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketSubject}>{t.subject}</Text>
                    <Text style={styles.ticketDate}>{new Date(t.created_at).toLocaleDateString('ar-SA')}</Text>
                  </View>
                  <View style={styles.ticketStatusBadge}>
                    <Text style={styles.ticketStatusText}>{TICKET_STATUS[t.status] ?? t.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* FAQs */}
        <Text style={styles.sectionTitle}>الأسئلة الشائعة</Text>
        <View style={styles.faqContainer}>
          {FAQS.map((faq, index) => {
            const isOpen = expandedId === faq.id;
            return (
              <View key={faq.id} style={[styles.faqItem, index === FAQS.length - 1 && { borderBottomWidth: 0 }]}>
                <TouchableOpacity
                  style={styles.faqHeader}
                  onPress={() => setExpandedId(isOpen ? null : faq.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.faqQuestion}>{faq.q}</Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
                </TouchableOpacity>
                {isOpen && <Text style={styles.faqAnswer}>{faq.a}</Text>}
              </View>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scrollContent: { padding: 20 },
  channelsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  channelCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  channelIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  channelTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  channelSub: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 14, marginTop: 8 },
  ticketForm: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 12 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB' },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  catChipTextActive: { color: '#FFFFFF' },
  ticketInput: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827', marginBottom: 10 },
  ticketArea: { minHeight: 90, textAlignVertical: 'top' },
  submitTicket: { backgroundColor: COLORS.primary, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitTicketText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  ticketRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  ticketSubject: { fontSize: 14, fontWeight: '700', color: '#111827' },
  ticketDate: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  ticketStatusBadge: { backgroundColor: '#F0F4FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  ticketStatusText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  faqContainer: {
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  faqItem: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 4 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  faqQuestion: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827', marginLeft: 8 },
  faqAnswer: { fontSize: 13, color: '#6B7280', lineHeight: 21, paddingBottom: 16 },
});
