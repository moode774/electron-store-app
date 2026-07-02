import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, USER_ROLES } from '@marketplace/shared-utils';
import { useAuthStore, getConversations, type ChatConversation } from '@marketplace/shared-hooks';

export default function ConversationsListScreen({ navigation }: any): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const asMerchant = role === USER_ROLES.MERCHANT;

  const [items, setItems] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user?.id) { setLoading(false); return; }
    getConversations(user.id, asMerchant)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [user?.id, asMerchant]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const timeLabel = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('ar', { day: 'numeric', month: 'short' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>المحادثات</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>لا توجد محادثات بعد</Text>
            </View>
          }
          renderItem={({ item }) => {
            const name = asMerchant
              ? (item.customer?.full_name ?? 'عميل')
              : (item.merchant_user?.full_name ?? 'متجر');
            const unread = asMerchant ? item.merchant_unread : item.customer_unread;
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Chat', { conversationId: item.id, title: name, asMerchant })}
              >
                <View style={styles.avatar}>
                  <Ionicons name="person" size={22} color="#6B7280" />
                </View>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  <Text style={styles.preview} numberOfLines={1}>{item.last_message ?? 'ابدأ المحادثة'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.time}>{timeLabel(item.last_message_at)}</Text>
                  {unread > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  preview: { fontSize: 13, color: '#6B7280', marginTop: 3 },
  time: { fontSize: 11, color: '#9CA3AF' },
  badge: { marginTop: 6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
