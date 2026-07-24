import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useAuthStore, getMessages, sendMessage, markConversationRead, ChatMessage, supabase } from '@marketplace/shared-hooks';
import { Alert } from '../../../components/appAlert';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';

export default function ChatScreen({ navigation, route }: any) {
  const layout = useCustomerLayout(960);
  const conversationId: string = route?.params?.conversationId;
  const title: string = route?.params?.title ?? 'المحادثة';
  const asMerchant: boolean = route?.params?.asMerchant ?? false;
  const user = useAuthStore((s) => s.user);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!conversationId) {
      setLoadError('تعذّر تحديد المحادثة المطلوبة.');
      setLoading(false);
      return;
    }
    try {
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
      setLoadError('');
      markConversationRead(conversationId, asMerchant).catch(() => {});
    } catch (error: any) {
      setLoadError(error?.message ?? 'تعذّر تحميل الرسائل. تحقق من الاتصال وحاول مجددًا.');
    }
    finally { setLoading(false); }
  }, [conversationId, asMerchant]);

  useEffect(() => { load(); }, [load]);

  // Realtime is the primary path; a slow refresh remains as a network-recovery fallback.
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => { load(); })
      .subscribe();
    const fallback = setInterval(load, 30000);
    return () => {
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || !user?.id || !conversationId || sending) return;
    setText('');
    setSending(true);
    // تفاؤلياً نضيفها فوراً
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, conversation_id: conversationId, sender_id: user.id,
      message: msg, message_type: 'text', is_read: false, created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      await sendMessage(conversationId, user.id, msg);
      await load();
    } catch (error: any) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setText((current) => current || msg);
      Alert.alert('تعذّر إرسال الرسالة', error?.message ?? 'تحقق من الاتصال وحاول مجددًا. لم تُرسل الرسالة.');
    }
    finally { setSending(false); }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const mine = item.sender_id === user?.id;
    return (
      <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, mine && { color: '#FFFFFF' }]}>{item.message}</Text>
          <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>
            {new Date(item.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="العودة">
            <Ionicons name="arrow-forward" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <>
          {loadError ? (
            <TouchableOpacity style={[styles.errorBanner, { width: layout.usableWidth }]} onPress={load} accessibilityRole="button" accessibilityLabel="إعادة تحميل الرسائل">
              <Ionicons name="cloud-offline-outline" size={18} color="#B91C1C" />
              <Text style={styles.errorText}>{loadError} اضغط لإعادة المحاولة.</Text>
            </TouchableOpacity>
          ) : null}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter }]}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>ابدأ المحادثة الآن</Text>
              </View>
            }
          />
        </>
      )}

      <View style={styles.inputShell}>
        <View style={[styles.inputBar, { paddingHorizontal: layout.gutter }]}>
          <TextInput
            style={styles.input}
            placeholder="اكتب رسالة..."
            placeholderTextColor={COLORS.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            accessibilityLabel="نص الرسالة"
          />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]} onPress={handleSend} disabled={!text.trim() || sending} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="إرسال الرسالة">
            <Ionicons name="send" size={20} color={COLORS.surface} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 48 : 32,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerInner: { width: '100%', maxWidth: 960, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: FONTS.bold, color: COLORS.textPrimary, textAlign: 'center', paddingHorizontal: 12 },
  list: { width: '100%', maxWidth: 960, alignSelf: 'center' },
  listContent: { paddingVertical: 16, gap: 10, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-start' },
  rowOther: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.lg },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomLeftRadius: 4 },
  bubbleOther: { backgroundColor: '#FFFFFF', borderBottomRightRadius: 4, borderWidth: 1, borderColor: '#F3F4F6' },
  bubbleText: { fontSize: 14, fontFamily: FONTS.regular, color: COLORS.textPrimary, lineHeight: 20 },
  bubbleTime: { fontSize: 10, fontFamily: FONTS.regular, color: COLORS.textMuted, marginTop: 4, textAlign: 'left' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  errorBanner: { maxWidth: 912, alignSelf: 'center', marginTop: 12, marginBottom: 0, padding: 12, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { flex: 1, color: '#991B1B', fontSize: 12, lineHeight: 18 },
  inputShell: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  inputBar: {
    width: '100%', maxWidth: 960, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16,
    minHeight: 44, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 14, fontFamily: FONTS.regular, color: COLORS.textPrimary, maxHeight: 120,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
});
