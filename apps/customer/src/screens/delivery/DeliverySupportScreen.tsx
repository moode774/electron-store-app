import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, TextInput, ActivityIndicator } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, createSupportTicket, getSupportTickets, SupportTicket, supabase } from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

const UI = {
  primary: '#111827',
  bg: '#F3F4F6',
  bgMobile: '#F9FAFB',
  textDark: '#111827',
  textGrey: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  green: '#10B981',
  blue: '#2563EB',
};

const CATEGORIES = [
  { value: 'technical', label: 'مشكلة تقنية' },
  { value: 'payment', label: 'الأرباح والمحفظة' },
  { value: 'order', label: 'الطلبات' },
  { value: 'account', label: 'الحساب' },
  { value: 'other', label: 'أخرى' },
];

const TICKET_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'مفتوحة', color: UI.green },
  in_progress: { label: 'قيد المعالجة', color: UI.blue },
  waiting_user: { label: 'بانتظارك', color: '#F59E0B' },
  resolved: { label: 'محلولة', color: UI.textGrey },
  closed: { label: 'مغلقة', color: UI.textMuted },
};

const FAQS = [
  { id: '1', q: 'كيف أستلم أرباحي؟', a: 'تظهر التوصيلات التي تمت تسويتها في شاشة الأرباح. يمكنك تقديم طلب سحب من الشاشة نفسها ومتابعة حالته مع الدعم.' },
  { id: '2', q: 'ماذا أفعل إذا لم يفتح الطلب بعد قبوله؟', a: 'تأكد من اتصالك بالإنترنت ثم افتح تبويب "الطلبات". إذا استمرت المشكلة، تواصل مع فريق الدعم الفني عبر هذه الشاشة.' },
  { id: '3', q: 'كيف أُعدّل بيانات مركبتي؟', a: 'اذهب لـ "المزيد" ثم "بياناتي ومركبتي" وقم بتعديل نوع المركبة أو رقم اللوحة ثم احفظ.' },
  { id: '4', q: 'كيف أُبلّغ عن مشكلة مع العميل؟', a: 'يمكنك فتح تذكرة دعم أدناه موضحاً فيها رقم الطلب وتفاصيل المشكلة، ثم متابعة الرد من قائمة التذاكر.' },
];

export default function DeliverySupportScreen({ navigation }: any) {
  const layout = useResponsiveLayout(1000);
  const user = useAuthStore((s) => s.user);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('technical');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState('');

  const loadTickets = useCallback(async () => {
    if (!user?.id) {
      setTickets([]);
      setTicketsLoading(false);
      return;
    }
    setTicketsError('');
    try {
      setTickets(await getSupportTickets(user.id));
    } catch (error) {
      setTicketsError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل تذاكر الدعم.');
    } finally {
      setTicketsLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    setTicketsLoading(true);
    void loadTickets();
    if (!user?.id) return undefined;
    const channel = supabase
      .channel(`delivery-support-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` }, () => { void loadTickets(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadTickets, user?.id]));

  const submitTicket = async () => {
    if (!subject.trim() || !message.trim()) { Alert.alert('تنبيه', 'الرجاء إدخال الموضوع والتفاصيل'); return; }
    if (!user?.id) return;
    setSending(true);
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), category, message: message.trim() });
      setSubject(''); setMessage('');
      Alert.alert('تم الإرسال ✅', 'تم فتح تذكرة دعم. يمكنك فتحها من القائمة لمتابعة الرد.');
      await loadTickets();
    } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإرسال'); }
    finally { setSending(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={UI.bgMobile} />

      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('العودة')}>
          <Ionicons name="arrow-forward" size={24} color={UI.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('مركز المساعدة')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} showsVerticalScrollIndicator={false}>

        {/* Contact Channels */}
        <View style={[styles.channelsRow, layout.compact && styles.channelsRowCompact]}>
          <View style={styles.channelCard}>
            <View style={[styles.channelIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="logo-whatsapp" size={28} color="#059669" />
            </View>
            <Text style={styles.channelTitle}>{t('واتساب')}</Text>
            <Text style={styles.channelSub}>{t('غير مفعّل حالياً')}</Text>
          </View>

          <View style={styles.channelCard}>
            <View style={[styles.channelIcon, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="call" size={28} color={UI.blue} />
            </View>
            <Text style={styles.channelTitle}>{t('الاتصال')}</Text>
            <Text style={styles.channelSub}>{t('استخدم تذكرة الدعم')}</Text>
          </View>
        </View>

        {/* Ticket Form */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('فتح تذكرة دعم')}</Text>
          <Text style={styles.sectionDesc}>{t('وضّح لنا المشكلة وسيتواصل معك فريق الدعم قريباً')}</Text>

          <View style={styles.catRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.catChip, category === c.value && styles.catChipActive]}
                onPress={() => setCategory(c.value)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={tv(c.label)}
                accessibilityState={{ checked: category === c.value }}
              >
                <Text style={[styles.catChipText, category === c.value && styles.catChipTextActive]}>{tv(c.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.inputField}
            placeholder={t('موضوع المشكلة...')}
            placeholderTextColor={UI.textMuted}
            value={subject}
            onChangeText={setSubject}
            textAlign="right"
            accessibilityLabel={t('موضوع المشكلة')}
          />
          <TextInput
            style={[styles.inputField, styles.textArea]}
            placeholder={t('اشرح لنا تفاصيل المشكلة...')}
            placeholderTextColor={UI.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlign="right"
            textAlignVertical="top"
            accessibilityLabel={t('تفاصيل المشكلة')}
          />

          <TouchableOpacity
            style={[styles.submitBtn, sending && { opacity: 0.6 }]}
            onPress={submitTicket}
            disabled={sending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('إرسال تذكرة الدعم')}
            accessibilityState={{ disabled: sending, busy: sending }}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Text style={styles.submitBtnText}>{t('إرسال التذكرة')}</Text>
                <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {ticketsLoading && <ActivityIndicator color={UI.blue} accessibilityLabel={t('جاري تحميل تذاكر الدعم')} />}
        {ticketsError ? (
          <View style={styles.ticketErrorCard}>
            <Text style={styles.ticketErrorText}>{tv(ticketsError)}</Text>
            <TouchableOpacity onPress={() => void loadTickets()} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel={t('إعادة تحميل تذاكر الدعم')}>
              <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Previous Tickets */}
        {tickets.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('تذاكري السابقة')}</Text>
            {tickets.map((ticket, i) => {
              const st = TICKET_STATUS[ticket.status] || { label: ticket.status, color: UI.textGrey };
              return (
                <TouchableOpacity key={ticket.id} style={[styles.ticketRow, i === tickets.length - 1 && { borderBottomWidth: 0 }]} onPress={() => navigation.navigate('SupportTicket', { ticketId: ticket.id })} accessibilityRole="button" accessibilityLabel={t('فتح تذكرة {0}', [tv(ticket.subject)])}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketSubject}>{tv(ticket.subject)}</Text>
                    <Text style={styles.ticketDate}>{tv(new Date(ticket.created_at).toLocaleDateString(getLocale()))}</Text>
                  </View>
                  <View style={[styles.ticketStatusBadge, { backgroundColor: `${st.color}15` }]}>
                    <Text style={[styles.ticketStatusText, { color: st.color }]}>{tv(st.label)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* FAQs */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('أسئلة شائعة')}</Text>
          {FAQS.map((faq, index) => {
            const isOpen = expandedId === faq.id;
            return (
              <View key={faq.id} style={[styles.faqItem, index === FAQS.length - 1 && { borderBottomWidth: 0 }]}>
                <TouchableOpacity
                  style={styles.faqHeader}
                  onPress={() => setExpandedId(isOpen ? null : faq.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={tv(faq.q)}
                  accessibilityState={{ expanded: isOpen }}
                >
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={UI.textMuted} />
                  <Text style={styles.faqQuestion}>{tv(faq.q)}</Text>
                </TouchableOpacity>
                {isOpen && <Text style={styles.faqAnswer}>{tv(faq.a)}</Text>}
              </View>
            );
          })}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: UI.border,
    width: '100%', maxWidth: 1000, alignSelf: 'center',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  scrollContent: { padding: 20, paddingBottom: 100, gap: 16, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  channelsRow: { flexDirection: 'row', gap: 12 },
  channelsRowCompact: { flexDirection: 'column' },
  channelCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, alignItems: 'center',
    borderWidth: 1.5, borderColor: UI.border,
  },
  channelIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  channelTitle: { fontSize: 14, fontWeight: '800', color: UI.textDark },
  channelSub: { fontSize: 11.5, color: UI.textGrey, marginTop: 3, fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: UI.border },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: UI.textDark, marginBottom: 6, textAlign: 'right' },
  sectionDesc: { fontSize: 12.5, color: UI.textGrey, marginBottom: 16, textAlign: 'right', lineHeight: 20 },
  catRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, backgroundColor: UI.bg },
  catChipActive: { backgroundColor: UI.primary },
  catChipText: { fontSize: 12.5, fontWeight: '700', color: UI.textGrey },
  catChipTextActive: { color: '#FFFFFF' },
  inputField: {
    backgroundColor: UI.bgMobile, borderRadius: 12, borderWidth: 1.5, borderColor: UI.border,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: UI.textDark,
    marginBottom: 10, fontWeight: '600',
  },
  textArea: { minHeight: 110 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: UI.primary, height: 50, borderRadius: 12, marginTop: 4,
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  ticketRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: UI.border },
  ticketSubject: { fontSize: 13.5, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  ticketDate: { fontSize: 11.5, color: UI.textMuted, marginTop: 3, textAlign: 'right', fontWeight: '600' },
  ticketStatusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  ticketStatusText: { fontSize: 11.5, fontWeight: '800' },
  ticketErrorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16, alignItems: 'center', gap: 10 },
  ticketErrorText: { color: '#B91C1C', fontSize: 12.5, textAlign: 'center', lineHeight: 19, fontWeight: '600' },
  retryBtn: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: UI.blue, fontSize: 12.5, fontWeight: '800' },
  faqItem: { borderBottomWidth: 1, borderBottomColor: UI.border },
  faqHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  faqQuestion: { flex: 1, fontSize: 13.5, fontWeight: '800', color: UI.textDark, marginRight: 10, textAlign: 'right' },
  faqAnswer: { fontSize: 13, color: UI.textGrey, lineHeight: 22, paddingBottom: 16, textAlign: 'right', fontWeight: '600' },
});
