import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import {
  getSupportTicketThread, replyToSupportTicket, SupportMessage, SupportTicket,
  supabase, useAuthStore,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

const STATUS_LABELS: Record<string, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد المعالجة',
  waiting_user: 'بانتظار ردك',
  resolved: 'محلولة',
  closed: 'مغلقة',
};

export default function SupportTicketThreadScreen({ navigation, route }: any) {
  const layout = useResponsiveLayout(960);
  const ticketId: string | undefined = route?.params?.ticketId;
  const user = useAuthStore((state) => state.user);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!ticketId) {
      setError('لم يتم تحديد تذكرة الدعم.');
      setLoading(false);
      return;
    }
    try {
      const thread = await getSupportTicketThread(ticketId);
      setTicket(thread.ticket);
      setMessages(thread.messages);
      setError('');
    } catch (loadError: any) {
      setError(loadError?.message ?? 'تعذّر تحميل محادثة الدعم.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!ticketId) return undefined;
    const channel = supabase
      .channel(`support-thread-${ticketId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `ticket_id=eq.${ticketId}`,
      }, () => { void load(); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'support_tickets',
        filter: `id=eq.${ticketId}`,
      }, () => { void load(); })
      .subscribe();
    const fallback = setInterval(() => { void load(); }, 30000);
    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [load, ticketId]);

  const sendReply = async () => {
    const body = reply.trim();
    if (!ticketId || !body || sending) return;
    if (body.length > 4000) {
      Alert.alert('الرد طويل جداً', 'الحد الأقصى 4000 حرف.');
      return;
    }
    setSending(true);
    try {
      await replyToSupportTicket(ticketId, body);
      setReply('');
      await load();
    } catch (sendError: any) {
      Alert.alert('تعذّر إرسال الرد', sendError?.message ?? 'تحقق من الاتصال وحاول مجددًا.');
    } finally {
      setSending(false);
    }
  };

  const isClosed = ticket?.status === 'closed';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[styles.threadShell, layout.desktop && styles.threadShellDesktop]}>
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('العودة')}>
          <Ionicons name="arrow-forward" size={23} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{tv(ticket?.subject ?? t('تذكرة الدعم'))}</Text>
          {ticket ? <Text style={styles.status}>{tv(STATUS_LABELS[ticket.status] ?? ticket.status)}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : error && !ticket ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={42} color="#B91C1C" />
          <Text style={styles.errorText}>{tv(error)}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()} accessibilityRole="button" accessibilityLabel={t('إعادة تحميل التذكرة')}>
            <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {error ? (
            <TouchableOpacity style={styles.inlineError} onPress={() => void load()} accessibilityRole="button">
              <Text style={styles.inlineErrorText}>{t('{0} — اضغط لإعادة المحاولة', [tv(error)])}</Text>
            </TouchableOpacity>
          ) : null}
          {ticket?.order_id ? (
            <View style={styles.orderReference}>
              <Ionicons name="receipt-outline" size={17} color="#1D4ED8" />
              <Text style={styles.orderReferenceText}>{t('هذه التذكرة مرتبطة بطلب')}</Text>
            </View>
          ) : null}
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.messageList, { paddingHorizontal: layout.gutter }]}
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              return (
                <View style={[styles.messageRow, mine ? styles.mineRow : styles.otherRow]}>
                  <View style={[styles.messageBubble, mine ? styles.mineBubble : styles.otherBubble]}>
                    {!mine ? <Text style={styles.senderName}>{tv(item.users?.full_name ?? t('فريق الدعم'))}</Text> : null}
                    <Text style={[styles.messageText, mine && styles.mineText]}>{tv(item.message)}</Text>
                    <Text style={[styles.messageTime, mine && styles.mineTime]}>{tv(new Date(item.created_at).toLocaleString(getLocale()))}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('لا توجد رسائل ظاهرة في هذه التذكرة.')}</Text>}
          />
        </>
      )}

      {!loading && ticket ? (
        isClosed ? (
          <View style={styles.closedBar}><Text style={styles.closedText}>{t('هذه التذكرة مغلقة. افتح تذكرة جديدة إذا احتجت متابعة أخرى.')}</Text></View>
        ) : (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={reply}
              onChangeText={setReply}
              placeholder={t('اكتب ردك...')}
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={4000}
              accessibilityLabel={t('رد تذكرة الدعم')}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!reply.trim() || sending) && styles.disabled]}
              onPress={sendReply}
              disabled={!reply.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel={t('إرسال الرد')}
              accessibilityState={{ disabled: !reply.trim() || sending, busy: sending }}
            >
              {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="send" size={19} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        )
      ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  threadShell: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center', backgroundColor: '#F8FAFC', overflow: 'hidden' },
  threadShellDesktop: { marginVertical: 20, borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 58 : 38, paddingBottom: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerText: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  title: { color: '#111827', fontSize: 16, fontWeight: '800', maxWidth: '100%' },
  status: { color: '#6B7280', fontSize: 11, fontWeight: '700', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#991B1B', textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  inlineError: { margin: 12, marginBottom: 0, padding: 11, backgroundColor: '#FEF2F2', borderRadius: 11 },
  inlineErrorText: { color: '#991B1B', fontSize: 12, textAlign: 'center' },
  orderReference: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, margin: 12, marginBottom: 0, padding: 9, borderRadius: 10, backgroundColor: '#EFF6FF' },
  orderReferenceText: { color: '#1D4ED8', fontSize: 12, fontWeight: '700' },
  messageList: { padding: 16, gap: 10, flexGrow: 1 },
  messageRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-start' },
  otherRow: { justifyContent: 'flex-end' },
  messageBubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  mineBubble: { backgroundColor: COLORS.primary, borderBottomLeftRadius: 4 },
  otherBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderBottomRightRadius: 4 },
  senderName: { color: '#1D4ED8', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  messageText: { color: '#111827', fontSize: 14, lineHeight: 21 },
  mineText: { color: '#FFFFFF' },
  messageTime: { color: '#9CA3AF', fontSize: 9.5, marginTop: 5 },
  mineTime: { color: 'rgba(255,255,255,0.72)' },
  emptyText: { color: '#9CA3AF', textAlign: 'center', marginTop: 50 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  input: { flex: 1, maxHeight: 110, minHeight: 44, backgroundColor: '#F3F4F6', color: '#111827', borderRadius: 19, paddingHorizontal: 15, paddingVertical: 10, textAlign: 'right' },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  closedBar: { padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14, backgroundColor: '#F3F4F6', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  closedText: { color: '#6B7280', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
