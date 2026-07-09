import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Linking, TextInput, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, createSupportTicket, getSupportTickets, SupportTicket } from '@marketplace/shared-hooks';

const UI = {
  primary: '#111827',
  bg: '#F3F4F6',
  bgMobile: '#F9FAFB',
  textDark: '#111827',
  textGrey: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  green: '#10B981',
  blue: '#3B82F6',
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
  { value: 'orders', label: 'الطلبات' },
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
  { id: '1', q: 'كيف أستلم أرباحي من الطلبات الإلكترونية؟', a: 'يتم تحويل الأرباح للمحفظة فور إكمال الطلب، ويمكنك سحب الرصيد لحسابك البنكي من خلال شاشة المحفظة.' },
  { id: '2', q: 'كيف أقوم بإلغاء طلب العميل؟', a: 'يمكنك رفض الطلب فقط إذا كان في حالة "بانتظار القبول". إذا تم القبول لا يمكن الإلغاء إلا من خلال الدعم الفني تجنباً للمشاكل.' },
  { id: '3', q: 'متى يصل المندوب لاستلام الطلب؟', a: 'بمجرد تحويل حالة الطلب إلى "جاهز"، سيتم تنبيه أقرب مندوب للتوجه إليك فوراً.' },
  { id: '4', q: 'كيف أعدّل أوقات العمل لمتجري؟', a: 'من خلال "حسابي" ثم "بيانات المتجر"، يمكنك تعديل أوقات العمل، وسيظهر المتجر مغلقاً للعملاء خارج هذه الأوقات.' },
];

export default function MerchantSupportScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('payment');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const loadTickets = useCallback(() => {
    if (user?.id) getSupportTickets(user.id).then(setTickets).catch(() => {});
  }, [user?.id]);
  
  useEffect(() => { loadTickets(); }, [loadTickets]);

  const submitTicket = async () => {
    if (!subject.trim() || !message.trim()) { Alert.alert('تنبيه', 'الرجاء إدخال الموضوع والتفاصيل'); return; }
    if (!user?.id) return;
    setSending(true);
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), category, message: message.trim() });
      setSubject(''); setMessage('');
      Alert.alert('تم الإرسال ✅', 'تم فتح تذكرة دعم خاصة بالتاجر وسيتم الرد عليك في أسرع وقت.');
      loadTickets();
    } catch (e: any) { Alert.alert('خطأ', e?.message ?? 'تعذّر الإرسال'); }
    finally { setSending(false); }
  };

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />
      
      {!isDesktop && (
        <View style={styles.headerMobile}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitleMobile}>الدعم الفني للشركاء</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
        
        {isDesktop && (
          <View style={styles.pageHeaderRow}>
            <TouchableOpacity style={styles.backBtnDesktop} onPress={() => navigation.goBack()}>
                <Text style={styles.backBtnText}>العودة لحسابي</Text>
                <Ionicons name="arrow-back" size={16} color={UI.textDark} />
             </TouchableOpacity>
             <View>
               <Text style={styles.pageTitle}>مركز مساعدة الشركاء</Text>
               <Text style={styles.pageSubtitle}>نحن هنا لخدمتك ودعم متجرك على مدار الساعة</Text>
             </View>
          </View>
        )}

        {/* Contact Channels */}
        <View style={styles.channelsRow}>
          <TouchableOpacity style={styles.channelCard} activeOpacity={0.8} onPress={() => Linking.openURL('https://wa.me/967700000000')}>
            <View style={[styles.channelIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="logo-whatsapp" size={28} color="#059669" />
            </View>
            <Text style={styles.channelTitle}>دعم الواتساب</Text>
            <Text style={styles.channelSub}>رد فوري للشركاء</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.channelCard} activeOpacity={0.8} onPress={() => Linking.openURL('tel:+967700000000')}>
            <View style={[styles.channelIcon, { backgroundColor: '#F0F4FF' }]}>
              <Ionicons name="call" size={28} color={UI.blue} />
            </View>
            <Text style={styles.channelTitle}>مركز الاتصال</Text>
            <Text style={styles.channelSub}>متاح 24 ساعة</Text>
          </TouchableOpacity>
        </View>

        {/* Form and Tickets Wrapper */}
        <View style={[styles.gridContainer, isDesktop && { flexDirection: 'row-reverse' }]}>
           
           <View style={[styles.mainCol, isDesktop && { flex: 3 }]}>
              {/* Ticket Form */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>فتح تذكرة دعم فني</Text>
                <Text style={styles.sectionDesc}>فريقنا التقني جاهز لحل أي مشكلة تواجه متجرك، الرجاء توضيح المشكلة أدناه:</Text>
                
                <View style={styles.catRow}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity key={c.value} style={[styles.catChip, category === c.value && styles.catChipActive]} onPress={() => setCategory(c.value)} activeOpacity={0.7}>
                      <Text style={[styles.catChipText, category === c.value && styles.catChipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput style={styles.inputField} placeholder="عنوان المشكلة الملحّة..." placeholderTextColor={UI.textMuted} value={subject} onChangeText={setSubject} textAlign="right" />
                <TextInput style={[styles.inputField, styles.textArea]} placeholder="اشرح لنا تفاصيل المشكلة أو طلب المساعدة هنا..." placeholderTextColor={UI.textMuted} value={message} onChangeText={setMessage} multiline textAlign="right" textAlignVertical="top" />
                
                <TouchableOpacity style={[styles.submitBtn, sending && { opacity: 0.6 }]} onPress={submitTicket} disabled={sending} activeOpacity={0.85}>
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                    <>
                       <Text style={styles.submitBtnText}>إرسال التذكرة لفريق الدعم</Text>
                       <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Tickets List */}
              {tickets.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>تذاكري السابقة</Text>
                  {tickets.map((t, i) => {
                    const st = TICKET_STATUS[t.status] || { label: t.status, color: UI.textGrey };
                    return (
                      <View key={t.id} style={[styles.ticketRow, i === tickets.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ticketSubject}>{t.subject}</Text>
                          <Text style={styles.ticketDate}>{new Date(t.created_at).toLocaleDateString('ar-SA')}</Text>
                        </View>
                        <View style={[styles.ticketStatusBadge, { backgroundColor: `${st.color}15` }]}>
                          <Text style={[styles.ticketStatusText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
           </View>

           <View style={[styles.sideCol, isDesktop && { flex: 2 }]}>
              {/* FAQs */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>الأسئلة الشائعة للتجار</Text>
                {FAQS.map((faq, index) => {
                  const isOpen = expandedId === faq.id;
                  return (
                    <View key={faq.id} style={[styles.faqItem, index === FAQS.length - 1 && { borderBottomWidth: 0 }]}>
                      <TouchableOpacity style={styles.faqHeader} onPress={() => setExpandedId(isOpen ? null : faq.id)} activeOpacity={0.7}>
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
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontWeight: '800', color: UI.textDark },
  
  scrollContent: { padding: 20, paddingBottom: 100 },
  scrollContentDesktop: { padding: 40, alignItems: 'center' },
  
  pageHeaderRow: { width: '100%', maxWidth: 1000, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  backBtnDesktop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border, ...softShadow },
  backBtnText: { fontSize: 13, fontWeight: '700', color: UI.textDark },

  channelsRow: { flexDirection: 'row-reverse', gap: 16, marginBottom: 24, width: '100%', maxWidth: 1000 },
  channelCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: UI.border, ...softShadow },
  channelIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  channelTitle: { fontSize: 16, fontWeight: '800', color: UI.textDark },
  channelSub: { fontSize: 12, color: UI.textGrey, marginTop: 4, fontWeight: '600' },

  gridContainer: { width: '100%', maxWidth: 1000, gap: 24, flexDirection: 'column' },
  mainCol: { gap: 24 },
  sideCol: { gap: 24 },

  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: UI.border, ...softShadow },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: UI.textDark, marginBottom: 8, textAlign: 'right' },
  sectionDesc: { fontSize: 13, color: UI.textGrey, marginBottom: 20, textAlign: 'right', lineHeight: 20 },

  catRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  catChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: UI.bg, borderWidth: 1, borderColor: 'transparent' },
  catChipActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  catChipText: { fontSize: 13, fontWeight: '700', color: UI.textGrey },
  catChipTextActive: { color: '#FFFFFF' },

  inputField: { backgroundColor: UI.bgMobile, borderRadius: 12, borderWidth: 1, borderColor: UI.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: UI.textDark, marginBottom: 12, fontWeight: '600' },
  textArea: { minHeight: 120 },
  
  submitBtn: { flexDirection: 'row-reverse', backgroundColor: UI.primary, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

  ticketRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: UI.border },
  ticketSubject: { fontSize: 14, fontWeight: '800', color: UI.textDark, textAlign: 'right' },
  ticketDate: { fontSize: 12, color: UI.textMuted, marginTop: 4, textAlign: 'right', fontWeight: '600' },
  ticketStatusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  ticketStatusText: { fontSize: 12, fontWeight: '800' },

  faqItem: { borderBottomWidth: 1, borderBottomColor: UI.border, paddingVertical: 4 },
  faqHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  faqQuestion: { flex: 1, fontSize: 14, fontWeight: '800', color: UI.textDark, marginRight: 12, textAlign: 'right' },
  faqAnswer: { fontSize: 13, color: UI.textGrey, lineHeight: 24, paddingBottom: 20, textAlign: 'right', fontWeight: '600' },
});
