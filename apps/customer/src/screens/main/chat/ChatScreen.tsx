import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  StatusBar, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getMessages, sendMessage, markConversationRead, ChatMessage } from '@marketplace/shared-hooks';

export default function ChatScreen({ navigation, route }: any) {
  const conversationId: string = route?.params?.conversationId;
  const title: string = route?.params?.title ?? 'المحادثة';
  const asMerchant: boolean = route?.params?.asMerchant ?? false;
  const user = useAuthStore((s) => s.user);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!conversationId) { setLoading(false); return; }
    try {
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
      markConversationRead(conversationId, asMerchant).catch(() => {});
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [conversationId, asMerchant]);

  useEffect(() => { load(); }, [load]);

  // تحديث دوري بسيط (polling) لجلب الرسائل الجديدة
  useEffect(() => {
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || !user?.id || !conversationId) return;
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
    } catch { /* ignore */ }
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
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>ابدأ المحادثة الآن</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="اكتب رسالة..."
          placeholderTextColor="#9CA3AF"
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]} onPress={handleSend} disabled={!text.trim() || sending} activeOpacity={0.8}>
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center' },
  listContent: { padding: 16, gap: 10, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-start' },
  rowOther: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomLeftRadius: 4 },
  bubbleOther: { backgroundColor: '#FFFFFF', borderBottomRightRadius: 4, borderWidth: 1, borderColor: '#F3F4F6' },
  bubbleText: { fontSize: 14, color: '#111827', lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: '#9CA3AF', marginTop: 4, textAlign: 'left' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  input: {
    flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 14, color: '#111827', maxHeight: 100,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
});
