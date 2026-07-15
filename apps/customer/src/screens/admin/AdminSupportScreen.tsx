import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, ScrollView, Platform, TextInput
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import {
  getAdminSupportTickets, getAdminSupportTicketThread, replyToSupportTicket,
  updateSupportTicketStatus, SupportMessage,
} from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#059669',
  danger: '#DC2626',
  warning: '#D97706',
};

const STATUS_FILTERS = [
  { key: 'open', label: 'مفتوحة' },
  { key: 'in_progress', label: 'قيد المعالجة' },
  { key: 'waiting_user', label: 'بانتظار المستخدم' },
  { key: 'resolved', label: 'محلولة' },
  { key: 'closed', label: 'مغلقة' },
  { key: '', label: 'الكل' },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'مفتوحة', color: UI.danger, bg: '#FEF2F2' },
  in_progress: { label: 'قيد المعالجة', color: UI.warning, bg: '#FFFBEB' },
  waiting_user: { label: 'بانتظار المستخدم', color: '#7C3AED', bg: '#F5F3FF' },
  resolved: { label: 'محلولة', color: UI.success, bg: '#ECFDF5' },
  closed: { label: 'مغلقة', color: UI.textMuted, bg: '#F1F5F9' },
};

const CATEGORY_LABELS: Record<string, string> = {
  order: 'طلب',
  payment: 'دفع',
  account: 'حساب',
  delivery: 'توصيل',
  merchant: 'تاجر',
  technical: 'مشكلة تقنية',
  order_complaint: 'شكوى طلب',
  general: 'عام',
  other: 'أخرى',
};

const NEXT_STATUSES = [
  { key: 'in_progress', label: 'قيد المعالجة', color: UI.warning },
  { key: 'waiting_user', label: 'بانتظار المستخدم', color: '#7C3AED' },
  { key: 'resolved', label: 'تم الحل', color: UI.success },
  { key: 'closed', label: 'إغلاق التذكرة', color: UI.textMuted },
];

export default function AdminSupportScreen({ navigation }: any) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('open');
  const [selected, setSelected] = useState<any | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await getAdminSupportTickets(filter || undefined);
      setTickets(data);
    } catch (e) {
      console.error('Failed to load support tickets:', e);
      setLoadError('تعذر تحميل تذاكر الدعم. تحقق من الاتصال ثم أعد المحاولة.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [filter]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const openTicket = async (ticket: any) => {
    setSelected(ticket);
    setMessages([]);
    setReply('');
    setThreadError(null);
    setThreadLoading(true);
    try {
      const thread = await getAdminSupportTicketThread(ticket.id);
      setSelected((current: any) => current?.id === ticket.id ? { ...current, ...thread.ticket } : current);
      setMessages(thread.messages);
    } catch (e) {
      console.error('Failed to load support ticket thread:', e);
      setThreadError('تعذر تحميل محادثة التذكرة.');
    } finally {
      setThreadLoading(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, status: string) => {
    if (processing) return;
    setProcessing(ticketId);
    try {
      await updateSupportTicketStatus(ticketId, status);
      setTickets((current) => filter && status !== filter
        ? current.filter((ticket) => ticket.id !== ticketId)
        : current.map((ticket) => ticket.id === ticketId ? { ...ticket, status } : ticket));
      setSelected((current: any) => current?.id === ticketId ? { ...current, status } : current);
    } catch (e) {
      console.error('Failed to update support ticket status:', e);
      Alert.alert('خطأ', e instanceof Error ? e.message : 'فشل تحديث حالة التذكرة');
    }
    finally { setProcessing(null); }
  };

  const handleSendReply = async () => {
    if (!selected || !reply.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      await replyToSupportTicket(selected.id, reply);
      setReply('');
      const thread = await getAdminSupportTicketThread(selected.id);
      setMessages(thread.messages);
      setSelected((current: any) => current?.id === selected.id ? { ...current, ...thread.ticket } : current);
      setTickets((current) => filter && thread.ticket.status !== filter
        ? current.filter((ticket) => ticket.id !== selected.id)
        : current.map((ticket) => ticket.id === selected.id ? { ...ticket, status: thread.ticket.status } : ticket));
    } catch (e) {
      console.error('Failed to reply to support ticket:', e);
      Alert.alert('تعذر إرسال الرد', e instanceof Error ? e.message : 'لم يتم إرسال الرسالة.');
    } finally {
      setSendingReply(false);
    }
  };

  const renderTicket = ({ item }: { item: any }) => {
    const statusInfo = STATUS_META[item.status] ?? { label: item.status, color: UI.textMuted, bg: '#F1F5F9' };
    const user = item.users as any;
    const date = new Date(item.created_at).toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return (
      <TouchableOpacity style={s.card} onPress={() => openTicket(item)} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={`فتح تذكرة ${item.subject}`}>
        <View style={s.cardTop}>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
          <View style={s.categoryBadge}>
            <Text style={s.categoryText}>{CATEGORY_LABELS[item.category ?? ''] ?? item.category ?? 'أخرى'}</Text>
          </View>
        </View>
        <Text style={s.subject} numberOfLines={2}>{item.subject}</Text>
        
        <View style={s.divider} />

        <View style={s.cardBottom}>
          <View style={s.userInfoRow}>
             <View style={s.userAvatar}><Ionicons name="person" size={14} color={UI.primary} /></View>
             <Text style={s.userName}>{user?.full_name ?? 'غير معروف'}</Text>
          </View>
          <Text style={s.dateText}>{date}</Text>
        </View>
        {processing === item.id && <ActivityIndicator size="small" color={UI.primary} style={{ marginTop: 12 }} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>الدعم الفني</Text>
          </View>
          <Text style={s.headerCount}>{tickets.length} تذكرة</Text>
        </View>
      </View>

      <View style={s.filterRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : loadError ? (
        <View style={s.center} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={48} color={UI.danger} />
          <Text style={s.errorText}>{loadError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>إعادة المحاولة</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={i => i.id}
          renderItem={renderTicket}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="headset-outline" size={48} color={UI.border} />
              <Text style={s.emptyText}>لا توجد تذاكر دعم حالياً</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)} accessibilityViewIsModal>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>تفاصيل التذكرة</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                <Ionicons name="close" size={24} color={UI.textMuted} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{gap: 20}}>
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>الموضوع</Text>
                  <Text style={s.detailValueMain}>{selected.subject}</Text>
                </View>
                
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>المحادثة</Text>
                  {threadLoading ? <ActivityIndicator color={UI.primary} style={{ alignSelf: 'center', marginVertical: 20 }} /> : threadError ? (
                    <View style={s.threadErrorBox}>
                      <Text style={s.errorText}>{threadError}</Text>
                      <TouchableOpacity onPress={() => openTicket(selected)} style={s.smallRetry}><Text style={s.retryText}>إعادة تحميل المحادثة</Text></TouchableOpacity>
                    </View>
                  ) : messages.length ? messages.map((message) => {
                    const isAdmin = message.users?.role === 'admin';
                    return (
                      <View key={message.id} style={[s.messageBubble, isAdmin ? s.adminBubble : s.userBubble]}>
                        <Text style={s.messageSender}>{message.users?.full_name ?? (isAdmin ? 'الإدارة' : 'المستخدم')}</Text>
                        <Text style={s.detailValueMsg}>{message.message}</Text>
                        <Text style={s.messageDate}>{new Date(message.created_at).toLocaleString('ar-SA')}</Text>
                      </View>
                    );
                  }) : <Text style={s.noMessages}>لا توجد رسائل ظاهرة في هذه التذكرة.</Text>}
                </View>
                
                <View style={s.detailRow2}>
                  <View style={s.detailBlockHalf}>
                    <Text style={s.detailLabel}>المستخدم</Text>
                    <Text style={s.detailValueInfo}>{(selected.users as any)?.full_name ?? 'غير متوفر'}</Text>
                  </View>
                  <View style={s.detailBlockHalf}>
                    <Text style={s.detailLabel}>القسم / الفئة</Text>
                    <Text style={s.detailValueInfo}>{CATEGORY_LABELS[selected.category ?? ''] ?? 'أخرى'}</Text>
                  </View>
                </View>
                
                <View style={s.actionsContainer}>
                  <Text style={s.actionLabel}>تغيير حالة التذكرة إلى:</Text>
                  <View style={s.statusActionsRow}>
                    {NEXT_STATUSES.filter(n => n.key !== selected.status).map(n => (
                      <TouchableOpacity
                        key={n.key}
                        style={[s.statusActionBtn, { borderColor: n.color }]}
                        onPress={() => handleUpdateStatus(selected.id, n.key)}
                        disabled={processing === selected.id}
                        activeOpacity={0.8}
                        accessibilityState={{ disabled: processing === selected.id, busy: processing === selected.id }}
                      >
                        <Text style={[s.statusActionText, { color: n.color }]}>{n.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {selected.status !== 'closed' && (
                  <View style={s.replySection}>
                    <Text style={s.actionLabel}>رد الإدارة</Text>
                    <TextInput
                      style={s.replyInput}
                      value={reply}
                      onChangeText={setReply}
                      placeholder="اكتب رداً واضحاً للمستخدم..."
                      placeholderTextColor={UI.textMuted}
                      multiline
                      maxLength={4000}
                      textAlign="right"
                      accessibilityLabel="نص رد الإدارة"
                    />
                    <TouchableOpacity
                      style={[s.sendBtn, (!reply.trim() || sendingReply) && s.sendBtnDisabled]}
                      onPress={handleSendReply}
                      disabled={!reply.trim() || sendingReply}
                      accessibilityRole="button"
                    >
                      {sendingReply ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="send" size={17} color="#FFF" /><Text style={s.sendText}>إرسال الرد</Text></>}
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { 
    backgroundColor: UI.card, 
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20, 
    borderBottomWidth: 1, borderColor: UI.border,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
    zIndex: 10
  },
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text },
  backBtn: { padding: 4 },
  headerCount: { fontSize: 13, color: UI.primary, fontWeight: '700', backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterScroll: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { padding: 20, paddingTop: 6, gap: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 14 },
  emptyText: { fontSize: 16, color: UI.textMuted, fontWeight: '700' },
  errorText: { fontSize: 14, color: UI.danger, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  retryBtn: { backgroundColor: UI.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  card: { backgroundColor: UI.card, borderRadius: 24, padding: 20, shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '800' },
  categoryBadge: { backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  categoryText: { fontSize: 12, fontWeight: '800', color: UI.primary },
  subject: { fontSize: 16, fontWeight: '800', color: UI.text, textAlign: 'right', lineHeight: 24 },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 16 },
  cardBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  userInfoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  userAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 13, color: UI.text, fontWeight: '700' },
  dateText: { fontSize: 12, color: UI.textMuted, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: '#0F172A66', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: UI.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  detailBlock: { alignItems: 'flex-end' },
  detailBlockHalf: { flex: 1, alignItems: 'flex-end', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: UI.border },
  detailLabel: { fontSize: 13, color: UI.textMuted, fontWeight: '700', marginBottom: 6 },
  detailValueMain: { fontSize: 18, color: UI.text, fontWeight: '800', textAlign: 'right', lineHeight: 28 },
  messageBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, width: '100%', borderWidth: 1, borderColor: UI.border },
  detailValueMsg: { fontSize: 15, color: UI.text, fontWeight: '500', textAlign: 'right', lineHeight: 26 },
  messageBubble: { width: '90%', padding: 14, borderRadius: 16, marginTop: 10 },
  adminBubble: { alignSelf: 'flex-start', backgroundColor: '#EFF6FF', borderBottomLeftRadius: 4 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#F1F5F9', borderBottomRightRadius: 4 },
  messageSender: { color: UI.primary, fontSize: 11, fontWeight: '900', textAlign: 'right', marginBottom: 4 },
  messageDate: { color: UI.textMuted, fontSize: 10, marginTop: 5 },
  noMessages: { color: UI.textMuted, backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, textAlign: 'center', width: '100%' },
  threadErrorBox: { width: '100%', alignItems: 'center', gap: 10, backgroundColor: '#FEF2F2', padding: 14, borderRadius: 12 },
  smallRetry: { backgroundColor: UI.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  detailValueInfo: { fontSize: 15, color: UI.text, fontWeight: '800', textAlign: 'right' },
  detailRow2: { flexDirection: 'row-reverse', gap: 16 },
  actionsContainer: { marginTop: 10, borderTopWidth: 1, borderTopColor: UI.border, paddingTop: 20 },
  actionLabel: { fontSize: 15, fontWeight: '800', color: UI.text, textAlign: 'right', marginBottom: 16 },
  statusActionsRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  statusActionBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statusActionText: { fontSize: 14, fontWeight: '800' },
  replySection: { borderTopWidth: 1, borderTopColor: UI.border, paddingTop: 20 },
  replyInput: { minHeight: 100, borderWidth: 1, borderColor: UI.border, borderRadius: 14, backgroundColor: '#F8FAFC', padding: 14, textAlignVertical: 'top', color: UI.text },
  sendBtn: { marginTop: 12, minHeight: 48, borderRadius: 13, backgroundColor: UI.primary, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontWeight: '900' },
});
