import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, createSupportTicket, getSupportTickets, SupportTicket, supabase } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

const UI = {
  primary: COLORS.primary,
  bg: COLORS.background,
  bgMobile: COLORS.background,
  textDark: COLORS.textPrimary,
  textGrey: COLORS.textSecondary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  green: COLORS.success,
  blue: COLORS.info,
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 16,
  elevation: 2,
};

const CATEGORIES = [
  { value: 'technical', label: 'مشكلة تقنية' },
  { value: 'payment', label: 'المدفوعات والمحفظة' },
  { value: 'order', label: 'الطلبات' },
  { value: 'account', label: 'حساب المتجر' },
  { value: 'other', label: 'أخرى' },
];

const TICKET_STATUS: Record<string, { label: string, color: string }> = {
  open: { label: 'مفتوحة', color: UI.green },
  in_progress: { label: 'قيد المعالجة', color: UI.blue },
  waiting_user: { label: 'بانتظارك', color: '#F59E0B' },
  resolved: { label: 'محلولة', color: UI.textGrey },
  closed: { label: 'مغلقة', color: UI.textMuted },
};

const FAQS = [
  { id: '1', q: 'متى يظهر الرصيد في المحفظة؟', a: 'يظهر الرصيد بعد اكتمال تسوية الطلب. إذا بقي الطلب مسلماً دون تسوية، افتح تذكرة دعم وأرفق رقم الطلب.' },
  { id: '2', q: 'كيف ألغي طلباً؟', a: 'افتح تفاصيل الطلب واضغط «إلغاء الطلب» واختر السبب. الإلغاء متاح قبل تحويل الطلب إلى «جاهز للمندوب»، ويُعاد المخزون تلقائياً ويُشعَر العميل. بعد مرحلة الجاهزية تواصل مع الدعم.' },
  { id: '3', q: 'متى يستلم المندوب الطلب؟', a: 'بعد تحويله إلى «جاهز للمندوب» يبقى بانتظار مطالبة مندوب، ثم تظهر مراحل الإسناد والاستلام والتوصيل تلقائياً.' },
  { id: '4', q: 'كيف أفتح أو أغلق متجري؟', a: 'من «بيانات المتجر» يمكنك تغيير حالة المتجر يدوياً. الجدولة الآلية لساعات العمل غير مفعلة حالياً.' },
];

export default function MerchantSupportScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('payment');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState('');
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isDesktop = width >= BREAKPOINTS.desktop;

  const loadTickets = useCallback(async () => {
    if (!user?.id) { setTicketsLoading(false); return; }
    setTicketsLoading(true);
    setTicketsError('');
    try { setTickets(await getSupportTickets(user.id)); }
    catch (error) { setTicketsError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل تذاكر الدعم.'); }
    finally { setTicketsLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void loadTickets();
    if (!user?.id) return undefined;
    const channel = supabase
      .channel(`merchant-support-${user.id}`)
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
      Alert.alert('تم الإرسال ✅', 'تم فتح التذكرة، ويمكنك متابعة حالتها من هذه الشاشة.');
      loadTickets();
    } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإرسال'); }
    finally { setSending(false); }
  };

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />
      
      {!isDesktop && (
        <View style={[styles.headerMobile, isCompact && styles.headerMobileCompact]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitleMobile}>الدعم الفني للشركاء</Text>
          <View style={{ width: 44 }} />
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact, isDesktop && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
        
        {isDesktop && (
          <View style={styles.pageHeaderRow}>
            <TouchableOpacity style={styles.backBtnDesktop} onPress={() => navigation.goBack()}>
                <Text style={styles.backBtnText}>العودة لحسابي</Text>
                <Ionicons name="arrow-back" size={16} color={UI.textDark} />
             </TouchableOpacity>
             <View>
               <Text style={styles.pageTitle}>مركز مساعدة الشركاء</Text>
               <Text style={styles.pageSubtitle}>افتح تذكرة وتابع ردود فريق الدعم من المكان نفسه</Text>
             </View>
          </View>
        )}

        {/* Contact Channels */}
        <View style={[styles.channelsRow, isCompact && styles.channelsRowCompact]}>
          <View style={styles.channelCard}>
            <View style={[styles.channelIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="logo-whatsapp" size={28} color="#059669" />
            </View>
            <Text style={styles.channelTitle}>قناة واتساب</Text>
            <Text style={styles.channelSub}>غير مفعلة حالياً</Text>
          </View>

          <View style={styles.channelCard}>
            <View style={[styles.channelIcon, { backgroundColor: '#F0F4FF' }]}>
              <Ionicons name="call" size={28} color={UI.blue} />
            </View>
            <Text style={styles.channelTitle}>تذاكر الدعم</Text>
            <Text style={styles.channelSub}>القناة المتاحة حالياً</Text>
          </View>
        </View>

        {/* Form and Tickets Wrapper */}
        <View style={[styles.gridContainer, isDesktop && { flexDirection: 'row-reverse' }]}>
           
           <View style={[styles.mainCol, isDesktop && { flex: 3 }]}>
              {/* Ticket Form */}
              <View style={[styles.card, isCompact && styles.cardCompact]}>
                <Text style={styles.sectionTitle}>فتح تذكرة دعم فني</Text>
                <Text style={styles.sectionDesc}>وضّح المشكلة والطلب المرتبط بها إن وجد، ثم تابع حالة التذكرة والردود من القائمة أدناه:</Text>
                
                <View style={styles.catRow}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity key={c.value} style={[styles.catChip, category === c.value && styles.catChipActive]} onPress={() => setCategory(c.value)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={c.label} accessibilityState={{ selected: category === c.value }}>
                      <Text style={[styles.catChipText, category === c.value && styles.catChipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput style={styles.inputField} placeholder="عنوان المشكلة الملحّة..." placeholderTextColor={UI.textMuted} value={subject} onChangeText={setSubject} textAlign="right" accessibilityLabel="عنوان تذكرة الدعم" />
                <TextInput style={[styles.inputField, styles.textArea]} placeholder="اشرح لنا تفاصيل المشكلة أو طلب المساعدة هنا..." placeholderTextColor={UI.textMuted} value={message} onChangeText={setMessage} multiline textAlign="right" textAlignVertical="top" accessibilityLabel="تفاصيل تذكرة الدعم" />
                
                <TouchableOpacity style={[styles.submitBtn, sending && { opacity: 0.6 }]} onPress={submitTicket} disabled={sending} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="إرسال تذكرة الدعم" accessibilityState={{ disabled: sending, busy: sending }}>
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                    <>
                       <Text style={styles.submitBtnText}>إرسال التذكرة لفريق الدعم</Text>
                       <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Tickets List */}
              {ticketsLoading && <ActivityIndicator color={UI.primary} style={{ marginVertical: 18 }} />}
              {ticketsError ? (
                <View style={styles.ticketErrorCard} accessibilityRole="alert">
                  <Text style={styles.ticketErrorText}>{ticketsError}</Text>
                  <TouchableOpacity onPress={() => void loadTickets()} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="إعادة تحميل تذاكر الدعم">
                    <Text style={styles.retryText}>إعادة المحاولة</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {tickets.length > 0 && (
                <View style={[styles.card, isCompact && styles.cardCompact]}>
                  <Text style={styles.sectionTitle}>تذاكري السابقة</Text>
                  {tickets.map((t, i) => {
                    const st = TICKET_STATUS[t.status] || { label: t.status, color: UI.textGrey };
                    return (
                      <TouchableOpacity key={t.id} style={[styles.ticketRow, i === tickets.length - 1 && { borderBottomWidth: 0 }]} onPress={() => navigation.navigate('SupportTicket', { ticketId: t.id })} accessibilityRole="button" accessibilityLabel={`فتح تذكرة ${t.subject}`}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ticketSubject}>{t.subject}</Text>
                          <Text style={styles.ticketDate}>{new Date(t.created_at).toLocaleDateString('ar-SA')}</Text>
                        </View>
                        <View style={[styles.ticketStatusBadge, { backgroundColor: `${st.color}15` }]}>
                          <Text style={[styles.ticketStatusText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
           </View>

           <View style={[styles.sideCol, isDesktop && { flex: 2 }]}>
              {/* FAQs */}
              <View style={[styles.card, isCompact && styles.cardCompact]}>
                <Text style={styles.sectionTitle}>الأسئلة الشائعة للتجار</Text>
                {FAQS.map((faq, index) => {
                  const isOpen = expandedId === faq.id;
                  return (
                    <View key={faq.id} style={[styles.faqItem, index === FAQS.length - 1 && { borderBottomWidth: 0 }]}>
                      <TouchableOpacity style={styles.faqHeader} onPress={() => setExpandedId(isOpen ? null : faq.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={faq.q} accessibilityState={{ expanded: isOpen }}>
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={UI.textMuted} />
                        <Text style={styles.faqQuestion}>{faq.q}</Text>
                      </TouchableOpacity>
                      {isOpen && <Text style={styles.faqAnswer}>{faq.a}</Text>}
                    </View>
                  );
                })}
              </View>
           </View>

        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },
  
  headerMobile: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: UI.border, backgroundColor: '#FFFFFF' },
  headerMobileCompact: { paddingHorizontal: 14 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontFamily: FONTS.bold, color: UI.textDark },
  
  scrollContent: { padding: 20, paddingBottom: 100 },
  scrollContentCompact: { paddingHorizontal: 14 },
  scrollContentDesktop: { padding: 40, alignItems: 'center' },
  
  pageHeaderRow: { width: '100%', maxWidth: 1200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  backBtnDesktop: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border, ...softShadow },
  backBtnText: { fontSize: 13, fontWeight: '700', color: UI.textDark },

  channelsRow: { flexDirection: 'row-reverse', gap: 16, marginBottom: 24, width: '100%', maxWidth: 1200 },
  channelsRowCompact: { flexDirection: 'column' },
  channelCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: UI.border, ...softShadow },
  channelIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  channelTitle: { fontSize: 16, fontWeight: '800', color: UI.textDark },
  channelSub: { fontSize: 12, color: UI.textGrey, marginTop: 4, fontWeight: '600' },

  gridContainer: { width: '100%', maxWidth: 1200, gap: 24, flexDirection: 'column' },
  mainCol: { gap: 24 },
  sideCol: { gap: 24 },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 24, borderWidth: 1, borderColor: UI.border, ...softShadow },
  cardCompact: { padding: 14, borderRadius: RADIUS.md },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: UI.textDark, marginBottom: 8, textAlign: 'right' },
  sectionDesc: { fontSize: 13, color: UI.textGrey, marginBottom: 20, textAlign: 'right', lineHeight: 20 },

  catRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  catChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: RADIUS.full, backgroundColor: UI.bg, borderWidth: 1, borderColor: 'transparent' },
  catChipActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  catChipText: { fontSize: 13, fontWeight: '700', color: UI.textGrey },
  catChipTextActive: { color: '#FFFFFF' },

  inputField: { backgroundColor: UI.bgMobile, borderRadius: 12, borderWidth: 1, borderColor: UI.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: UI.textDark, marginBottom: 12, fontWeight: '600' },
  textArea: { minHeight: 120 },
  
  submitBtn: { flexDirection: 'row-reverse', backgroundColor: UI.primary, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

  ticketRow: { flexDirection: 'row-reverse', alignItems: 'center', minHeight: 56, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: UI.border },
  ticketSubject: { fontSize: 14, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  ticketDate: { fontSize: 12, color: UI.textMuted, marginTop: 4, textAlign: 'right', fontWeight: '600' },
  ticketStatusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  ticketStatusText: { fontSize: 12, fontWeight: '800' },
  ticketErrorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16, alignItems: 'center', gap: 10, marginBottom: 12 },
  ticketErrorText: { color: '#B91C1C', fontSize: 12.5, textAlign: 'center', lineHeight: 19, fontWeight: '600' },
  retryBtn: { minHeight: 44, justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 14 },
  retryText: { color: UI.blue, fontSize: 12.5, fontWeight: '800' },

  faqItem: { borderBottomWidth: 1, borderBottomColor: UI.border, paddingVertical: 4 },
  faqHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingVertical: 12 },
  faqQuestion: { flex: 1, fontSize: 14, fontWeight: '800', color: UI.textDark, marginRight: 12, textAlign: 'right' },
  faqAnswer: { fontSize: 13, color: UI.textGrey, lineHeight: 24, paddingBottom: 20, textAlign: 'right', fontWeight: '600' },
});
