import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getNotifications, markAllNotificationsRead, Notification } from '@marketplace/shared-hooks';

export default function RoleNotificationsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    getNotifications(user.id)
      .then((data) => { setItems(data); markAllNotificationsRead(user.id).catch(() => {}); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>لا توجد إشعارات</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, !item.is_read && styles.cardUnread]} activeOpacity={0.7}>
              <View style={[styles.iconWrap, { backgroundColor: `${COLORS.primary}15` }]}>
                <Ionicons name="notifications-outline" size={22} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  {!item.is_read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.time}>{new Date(item.created_at).toLocaleDateString('ar-SA')}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContent: { padding: 20, gap: 12 },
  card: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  cardUnread: { borderColor: `${COLORS.primary}30`, backgroundColor: '#FDFDFF' },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '800', color: '#111827' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  body: { fontSize: 12.5, color: '#6B7280', lineHeight: 19, marginTop: 4 },
  time: { fontSize: 11, color: '#9CA3AF', marginTop: 8 },
});
