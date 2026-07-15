import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getNotifications, markNotificationRead, Notification, supabase } from '@marketplace/shared-hooks';
import { NotificationPreferencesCard } from '../../../components/NotificationPreferencesCard';

export default function NotificationsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try { setNotifications(await getNotifications(user.id)); }
    catch (error) { setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل الإشعارات.'); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    void load();

    const channel = supabase
      .channel(`customer-notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}`,
        select: ['id', 'user_id', 'title', 'body', 'type', 'data', 'is_read', 'channel', 'created_at'],
      }, (payload) => setNotifications((current) => [payload.new as Notification, ...current]))
      .subscribe();
    const fallback = setInterval(() => { void load(); }, 30000);
    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [load, user?.id]);

  const openNotification = async (item: Notification) => {
    if (!item.is_read) {
      setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry));
      try {
        await markNotificationRead(item.id);
      } catch {
        setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: false } : entry));
      }
    }
    const data = item.data ?? {};
    const ticketId = typeof data.ticket_id === 'string' ? data.ticket_id : null;
    const orderId = typeof data.order_id === 'string' ? data.order_id : null;
    if (ticketId) navigation.navigate('SupportTicket', { ticketId });
    else if (orderId) navigation.getParent()?.navigate('Orders', { screen: 'OrderTracking', params: { orderId } });
  };

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
      ) : loadError ? (
        <View style={styles.errorState} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={46} color="#B91C1C" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void load(); }} accessibilityRole="button"><Text style={styles.retryText}>إعادة المحاولة</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<NotificationPreferencesCard />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>لا توجد إشعارات</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.is_read && styles.cardUnread]}
              activeOpacity={0.7}
              onPress={() => openNotification(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title ?? 'إشعار'}. ${item.body ?? ''}`}
              accessibilityState={{ selected: !item.is_read }}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${COLORS.primary}15` }]}>
                <Ionicons name="notifications-outline" size={22} color={COLORS.primary} />
              </View>
              <View style={styles.info}>
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
    backgroundColor: '#F9FAFB',
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
  info: { flex: 1, marginHorizontal: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '800', color: '#111827' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  body: { fontSize: 12.5, color: '#6B7280', lineHeight: 19, marginTop: 4 },
  time: { fontSize: 11, color: '#9CA3AF', marginTop: 8 },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#991B1B', textAlign: 'center' },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: 11, paddingHorizontal: 17, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
});
