import { COLORS, FONTS } from '@marketplace/shared-utils';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, TextInput, ActivityIndicator } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { DirectionalIcon } from '../../components/DirectionalIcon';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, createSupportTicket, getSupportTickets, SupportTicket, supabase } from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { useTranslation } from '../../i18n';

const UI = {
  primary: '#111827',
  bg: '#F3F4F6',
  bgMobile: '#F9FAFB',
  textDark: '#111827',
  textGrey: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  green: '#10B981',
  blue: COLORS.primary,
};

const CATEGORIES = [
  { value: 'technical', labelKey: 'delivery.supportTechnical' },
  { value: 'payment', labelKey: 'delivery.supportPayment' },
  { value: 'order', labelKey: 'delivery.supportOrders' },
  { value: 'account', labelKey: 'delivery.supportAccount' },
  { value: 'other', labelKey: 'delivery.supportOther' },
] as const;

const TICKET_STATUS: Record<string, { labelKey: string; color: string }> = {
  open: { labelKey: 'delivery.statusOpen', color: UI.green },
  in_progress: { labelKey: 'delivery.statusProgress', color: UI.blue },
  waiting_user: { labelKey: 'delivery.statusWaiting', color: '#F59E0B' },
  resolved: { labelKey: 'delivery.statusResolved', color: UI.textGrey },
  closed: { labelKey: 'delivery.statusClosed', color: UI.textMuted },
};

const FAQS = [
  { id: '1', qKey: 'delivery.faq1q', aKey: 'delivery.faq1a' },
  { id: '2', qKey: 'delivery.faq2q', aKey: 'delivery.faq2a' },
  { id: '3', qKey: 'delivery.faq3q', aKey: 'delivery.faq3a' },
  { id: '4', qKey: 'delivery.faq4q', aKey: 'delivery.faq4a' },
] as const;

export default function DeliverySupportScreen({ navigation }: any) {
  const { t } = useTranslation();
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
      setTicketsError(error instanceof Error && error.message ? error.message : t('delivery.ticketsLoadFailed'));
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
    if (!subject.trim() || !message.trim()) { Alert.alert(t('auth.alert'), t('delivery.supportFieldsRequired')); return; }
    if (!user?.id) return;
    setSending(true);
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), category, message: message.trim() });
      setSubject(''); setMessage('');
      Alert.alert(t('delivery.ticketSent'), t('delivery.ticketSentText'));
      await loadTickets();
    } catch (e: any) { Alert.alert(t('shared.error'), e?.message ?? t('delivery.sendFailed')); }
    finally { setSending(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={UI.bgMobile} />

      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('delivery.back')}>
          <DirectionalIcon name="arrow-forward" size={24} color={UI.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('delivery.helpCenter')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} showsVerticalScrollIndicator={false}>

        {/* Contact Channels */}
        <View style={[styles.channelsRow, layout.compact && styles.channelsRowCompact]}>
          <View style={styles.channelCard}>
            <View style={[styles.channelIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="logo-whatsapp" size={28} color="#059669" />
            </View>
            <Text style={styles.channelTitle}>{t('delivery.whatsapp')}</Text>
            <Text style={styles.channelSub}>{t('delivery.disabledNow')}</Text>
          </View>

          <View style={styles.channelCard}>
            <View style={[styles.channelIcon, { backgroundColor: COLORS.primarySoft }]}>
              <Ionicons name="call" size={28} color={UI.blue} />
            </View>
            <Text style={styles.channelTitle}>{t('delivery.call')}</Text>
            <Text style={styles.channelSub}>{t('delivery.useSupportTicket')}</Text>
          </View>
        </View>

        {/* Ticket Form */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('delivery.openTicket')}</Text>
          <Text style={styles.sectionDesc}>{t('delivery.openTicketSub')}</Text>

          <View style={styles.catRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.catChip, category === c.value && styles.catChipActive]}
                onPress={() => setCategory(c.value)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={t(c.labelKey)}
                accessibilityState={{ checked: category === c.value }}
              >
                <Text style={[styles.catChipText, category === c.value && styles.catChipTextActive]}>{t(c.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.inputField}
            placeholder={t('delivery.subjectPlaceholder')}
            placeholderTextColor={UI.textMuted}
            value={subject}
            onChangeText={setSubject}
            textAlign="right"
            accessibilityLabel={t('delivery.subjectA11y')}
          />
          <TextInput
            style={[styles.inputField, styles.textArea]}
            placeholder={t('delivery.messagePlaceholder')}
            placeholderTextColor={UI.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlign="right"
            textAlignVertical="top"
            accessibilityLabel={t('delivery.messageA11y')}
          />

          <TouchableOpacity
            style={[styles.submitBtn, sending && { opacity: 0.6 }]}
            onPress={submitTicket}
            disabled={sending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('delivery.sendTicketA11y')}
            accessibilityState={{ disabled: sending, busy: sending }}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Text style={styles.submitBtnText}>{t('delivery.sendTicket')}</Text>
                <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {ticketsLoading && <ActivityIndicator color={UI.blue} accessibilityLabel={t('delivery.loadingTickets')} />}
        {ticketsError ? (
          <View style={styles.ticketErrorCard}>
            <Text style={styles.ticketErrorText}>{ticketsError}</Text>
            <TouchableOpacity onPress={() => void loadTickets()} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel={t('delivery.reloadTickets')}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Previous Tickets */}
        {tickets.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('delivery.previousTickets')}</Text>
            {tickets.map((ticket, i) => {
              const st = TICKET_STATUS[ticket.status] || { labelKey: ticket.status, color: UI.textGrey };
              return (
                <TouchableOpacity key={ticket.id} style={[styles.ticketRow, i === tickets.length - 1 && { borderBottomWidth: 0 }]} onPress={() => navigation.navigate('SupportTicket', { ticketId: ticket.id })} accessibilityRole="button" accessibilityLabel={`${t('delivery.openTicketA11y')} ${ticket.subject}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                    <Text style={styles.ticketDate}>{new Date(ticket.created_at).toLocaleDateString('ar-SA')}</Text>
                  </View>
                  <View style={[styles.ticketStatusBadge, { backgroundColor: `${st.color}15` }]}>
                    <Text style={[styles.ticketStatusText, { color: st.color }]}>{t(st.labelKey)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* FAQs */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('delivery.faqTitle')}</Text>
          {FAQS.map((faq, index) => {
            const isOpen = expandedId === faq.id;
            return (
              <View key={faq.id} style={[styles.faqItem, index === FAQS.length - 1 && { borderBottomWidth: 0 }]}>
                <TouchableOpacity
                  style={styles.faqHeader}
                  onPress={() => setExpandedId(isOpen ? null : faq.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t(faq.qKey)}
                  accessibilityState={{ expanded: isOpen }}
                >
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={UI.textMuted} />
                  <Text style={styles.faqQuestion}>{t(faq.qKey)}</Text>
                </TouchableOpacity>
                {isOpen && <Text style={styles.faqAnswer}>{t(faq.aKey)}</Text>}
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
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 38, paddingBottom: 18,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: UI.border,
    width: '100%', maxWidth: 1000, alignSelf: 'center',
  },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: FONTS.bold, color: UI.textDark },
  scrollContent: { padding: 20, paddingBottom: 100, gap: 16, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  channelsRow: { flexDirection: 'row-reverse', gap: 12 },
  channelsRowCompact: { flexDirection: 'column' },
  channelCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.hairline,
  },
  channelIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  channelTitle: { fontSize: 14, fontWeight: '800', color: UI.textDark },
  channelSub: { fontSize: 11.5, color: UI.textGrey, marginTop: 3, fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: COLORS.hairline },
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
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, height: 52, borderRadius: 15, marginTop: 4,
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
