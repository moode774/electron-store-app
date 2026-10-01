import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, ScrollView, Platform, TextInput,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import {
  getAdminSupportTickets, getAdminSupportTicketThread, replyToSupportTicket,
  updateSupportTicketStatus, SupportMessage,
} from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useTranslation } from '../../i18n';

const UI = {
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  bg: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  success: COLORS.success,
  danger: COLORS.error,
  warning: COLORS.warning,
};

const STATUS_FILTERS = [
  { key: 'open', labelKey: 'adminUi.supportOpen' },
  { key: 'in_progress', labelKey: 'adminUi.supportInProgress' },
  { key: 'waiting_user', labelKey: 'adminUi.supportWaitingUser' },
  { key: 'resolved', labelKey: 'adminUi.supportResolved' },
  { key: 'closed', labelKey: 'adminUi.supportClosed' },
  { key: '', labelKey: 'adminUi.all' },
];

const STATUS_META: Record<string, { labelKey: string; color: string; bg: string }> = {
  open: { labelKey: 'adminUi.supportOpen', color: UI.danger, bg: '#FEF2F2' },
  in_progress: { labelKey: 'adminUi.supportInProgress', color: UI.warning, bg: '#FFFBEB' },
  waiting_user: { labelKey: 'adminUi.supportWaitingUser', color: '#7C3AED', bg: '#F5F3FF' },
  resolved: { labelKey: 'adminUi.supportResolved', color: UI.success, bg: '#ECFDF5' },
  closed: { labelKey: 'adminUi.supportClosed', color: UI.textMuted, bg: '#F1F5F9' },
};

const CATEGORY_LABELS: Record<string, string> = {
  order: 'adminUi.supportCategoryOrder',
  payment: 'adminUi.supportCategoryPayment',
  account: 'adminUi.supportCategoryAccount',
  delivery: 'adminUi.supportCategoryDelivery',
  merchant: 'adminUi.supportCategoryMerchant',
  technical: 'adminUi.supportCategoryTechnical',
  order_complaint: 'adminUi.supportCategoryComplaint',
  general: 'adminUi.supportCategoryGeneral',
  other: 'adminUi.supportCategoryOther',
};

const NEXT_STATUSES = [
  { key: 'in_progress', labelKey: 'adminUi.supportInProgress', color: UI.warning },
  { key: 'waiting_user', labelKey: 'adminUi.supportWaitingUser', color: '#7C3AED' },
  { key: 'resolved', labelKey: 'adminUi.supportMarkResolved', color: UI.success },
  { key: 'closed', labelKey: 'adminUi.supportCloseTicket', color: UI.textMuted },
];

export default function AdminSupportScreen({ navigation }: any) {
  const { t, language } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
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
      setLoadError(t('adminUi.supportLoadFailed'));
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
      setThreadError(t('adminUi.supportThreadLoadFailed'));
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
      Alert.alert(t('adminUi.error'), e instanceof Error ? e.message : t('adminUi.supportStatusUpdateFailed'));
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
      Alert.alert(t('adminUi.supportReplyFailed'), e instanceof Error ? e.message : t('adminUi.supportMessageNotSent'));
    } finally {
      setSendingReply(false);
    }
  };

  const renderTicket = ({ item }: { item: any }) => {
    const statusInfo = STATUS_META[item.status] ?? { labelKey: '', color: UI.textMuted, bg: '#F1F5F9' };
    const user = item.users as any;
    const date = new Date(item.created_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return (
      <TouchableOpacity style={s.card} onPress={() => openTicket(item)} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={`${t('adminUi.supportOpenTicket')} ${item.subject}`}>
        <View style={s.cardTop}>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.labelKey ? t(statusInfo.labelKey) : item.status}</Text>
          </View>
          <View style={s.categoryBadge}>
            <Text style={s.categoryText}>{CATEGORY_LABELS[item.category ?? ''] ? t(CATEGORY_LABELS[item.category ?? '']) : item.category ?? t('adminUi.supportCategoryOther')}</Text>
          </View>
        </View>
        <Text style={s.subject} numberOfLines={2}>{item.subject}</Text>
        
        <View style={s.divider} />

        <View style={s.cardBottom}>
          <View style={s.userInfoRow}>
             <View style={s.userAvatar}><Ionicons name="person" size={14} color={UI.primary} /></View>
             <Text style={s.userName}>{user?.full_name ?? t('adminUi.unknown')}</Text>
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
        <View style={[s.headerContent, { width: contentWidth }]}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{t('adminUi.technicalSupport')}</Text>
          </View>
          <Text style={s.headerCount}>{tickets.length} {t('adminUi.supportTicketCount')}</Text>
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
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{t(f.labelKey)}</Text>
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
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>{t('adminUi.retry')}</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tickets}
          key={`support-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          keyExtractor={i => i.id}
          renderItem={renderTicket}
          contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="headset-outline" size={48} color={UI.border} />
              <Text style={s.emptyText}>{t('adminUi.supportNoTickets')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)} accessibilityViewIsModal>
        <View style={[s.modalOverlay, !compact && s.modalOverlayDesktop]}>
          <View style={[s.modalBox, !compact && s.modalBoxDesktop, { width: Math.min(Math.max(width - 24, 280), 760) }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('adminUi.supportTicketDetails')}</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                <Ionicons name="close" size={24} color={UI.textMuted} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{gap: 20}}>
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>{t('adminUi.supportSubject')}</Text>
                  <Text style={s.detailValueMain}>{selected.subject}</Text>
                </View>
                
                <View style={s.detailBlock}>
                  <Text style={s.detailLabel}>{t('adminUi.supportConversation')}</Text>
                  {threadLoading ? <ActivityIndicator color={UI.primary} style={{ alignSelf: 'center', marginVertical: 20 }} /> : threadError ? (
                    <View style={s.threadErrorBox}>
                      <Text style={s.errorText}>{threadError}</Text>
                      <TouchableOpacity onPress={() => openTicket(selected)} style={s.smallRetry}><Text style={s.retryText}>{t('adminUi.supportReloadConversation')}</Text></TouchableOpacity>
                    </View>
                  ) : messages.length ? messages.map((message) => {
                    const isAdmin = message.users?.role === 'admin';
                    return (
                      <View key={message.id} style={[s.messageBubble, isAdmin ? s.adminBubble : s.userBubble]}>
                        <Text style={s.messageSender}>{message.users?.full_name ?? (isAdmin ? t('adminUi.supportAdministration') : t('adminUi.supportUser'))}</Text>
                        <Text style={s.detailValueMsg}>{message.message}</Text>
                        <Text style={s.messageDate}>{new Date(message.created_at).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</Text>
                      </View>
                    );
                  }) : <Text style={s.noMessages}>{t('adminUi.supportNoMessages')}</Text>}
                </View>
                
                <View style={s.detailRow2}>
                  <View style={s.detailBlockHalf}>
                    <Text style={s.detailLabel}>{t('adminUi.supportUser')}</Text>
                    <Text style={s.detailValueInfo}>{(selected.users as any)?.full_name ?? t('adminUi.unavailable')}</Text>
                  </View>
                  <View style={s.detailBlockHalf}>
                    <Text style={s.detailLabel}>{t('adminUi.supportCategory')}</Text>
                    <Text style={s.detailValueInfo}>{CATEGORY_LABELS[selected.category ?? ''] ? t(CATEGORY_LABELS[selected.category ?? '']) : t('adminUi.supportCategoryOther')}</Text>
                  </View>
                </View>
                
                <View style={s.actionsContainer}>
                  <Text style={s.actionLabel}>{t('adminUi.supportChangeStatusTo')}</Text>
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
                        <Text style={[s.statusActionText, { color: n.color }]}>{t(n.labelKey)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {selected.status !== 'closed' && (
                  <View style={s.replySection}>
                    <Text style={s.actionLabel}>{t('adminUi.supportAdminReply')}</Text>
                    <TextInput
                      style={s.replyInput}
                      value={reply}
                      onChangeText={setReply}
                      placeholder={t('adminUi.supportReplyPlaceholder')}
                      placeholderTextColor={UI.textMuted}
                      multiline
                      maxLength={4000}
                      textAlign={language === 'ar' ? 'right' : 'left'}
                      accessibilityLabel={t('adminUi.supportReplyA11y')}
                    />
                    <TouchableOpacity
                      style={[s.sendBtn, (!reply.trim() || sendingReply) && s.sendBtnDisabled]}
                      onPress={handleSendReply}
                      disabled={!reply.trim() || sendingReply}
                      accessibilityRole="button"
                    >
                      {sendingReply ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="send" size={17} color="#FFF" /><Text style={s.sendText}>{t('adminUi.supportSendReply')}</Text></>}
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
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 10, elevation: 1,
    zIndex: 10
  },
  headerContent: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  headerTitle: { fontSize: 22, fontFamily: FONTS.bold, color: UI.text },
  backBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  headerCount: { fontSize: 13, color: UI.primary, fontWeight: '700', backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 8 },
  filterScroll: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { alignSelf: 'center', paddingTop: 8, gap: 12, paddingBottom: 112 },
  columnRow: { gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 14 },
  emptyText: { fontSize: 16, color: UI.textMuted, fontWeight: '700' },
  errorText: { fontSize: 14, color: UI.danger, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  retryBtn: { backgroundColor: UI.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: 20, padding: 20, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.02, shadowRadius: 12, elevation: 1, borderWidth: 1, borderColor: UI.border },
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
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  modalOverlayDesktop: { justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: UI.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '90%' },
  modalBoxDesktop: { borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: UI.text },
  closeBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
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
  statusActionBtn: { minHeight: 38, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 13, borderWidth: 1.5, backgroundColor: UI.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.025, shadowRadius: 4, elevation: 1 },
  statusActionText: { fontSize: 14, fontWeight: '800' },
  replySection: { borderTopWidth: 1, borderTopColor: UI.border, paddingTop: 20 },
  replyInput: { minHeight: 100, borderWidth: 1, borderColor: UI.border, borderRadius: 14, backgroundColor: '#F8FAFC', padding: 14, textAlignVertical: 'top', color: UI.text },
  sendBtn: { marginTop: 12, minHeight: 48, borderRadius: 13, backgroundColor: UI.primary, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontWeight: '900' },
});
