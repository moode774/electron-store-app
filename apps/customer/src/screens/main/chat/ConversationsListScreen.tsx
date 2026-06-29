import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, formatRelativeTime } from '@marketplace/shared-utils';
import { useAuthStore, getConversations, ChatConversation } from '@marketplace/shared-hooks';

export default function ConversationsListScreen({ navigation, route }: any) {
  const asMerchant: boolean = route?.params?.asMerchant ?? false;
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    getConversations(user.id, asMerchant).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id, asMerchant]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const renderItem = ({ item }: { item: ChatConversation }) => {
    const otherName = asMerchant ? (item.customer?.full_name ?? 'عميل') : (item.merchant_user?.full_name ?? 'المتجر');
    const unread = asMerchant ? item.merchant_unread : item.customer_unread;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Chat', { conversationId: item.id, title: otherName, asMerchant })}
      >
        <View style={styles.avatar}>
          <Ionicons name={asMerchant ? 'person' : 'storefront'} size={22} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.name} numberOfLines={1}>{otherName}</Text>
          <Text style={styles.last} numberOfLines={1}>{item.last_message ?? 'ابدأ المحادثة'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {item.last_message_at && <Text style={styles.time}>{formatRelativeTime(item.last_message_at)}</Text>}
          {unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{asMerchant ? 'محادثات العملاء' : 'محادثاتي'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={56} color="#D1D5DB" />
              <Text style={styles.emptyText}>لا توجد محادثات بعد</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  last: { fontSize: 12.5, color: '#6B7280', marginTop: 3 },
  time: { fontSize: 10.5, color: '#9CA3AF' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#9CA3AF' },
});
