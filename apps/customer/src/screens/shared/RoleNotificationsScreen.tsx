import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getNotifications, markNotificationRead, Notification, supabase } from '@marketplace/shared-hooks';
import { NotificationPreferencesCard } from '../../components/NotificationPreferencesCard';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

export default function RoleNotificationsScreen({ navigation, route }: any) {
  const layout = useResponsiveLayout(960);
  const user = useAuthStore((s) => s.user);
  const role: 'merchant' | 'delivery' = route?.params?.role === 'delivery' ? 'delivery' : 'merchant';
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try { setItems(await getNotifications(user.id)); }
    catch (error) { setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل الإشعارات.'); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    void load();

    const channel = supabase
      .channel(`role-notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}`,
        select: ['id', 'user_id', 'title', 'body', 'type', 'data', 'is_read', 'channel', 'created_at'],
      }, (payload) => setItems((current) => [payload.new as Notification, ...current]))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const openNotification = async (item: Notification) => {
    if (!item.is_read) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry));
      try {
        await markNotificationRead(item.id);
      } catch {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: false } : entry));
      }
    }
    const data = item.data ?? {};
    const ticketId = typeof data.ticket_id === 'string' ? data.ticket_id : null;
    const orderId = typeof data.order_id === 'string' ? data.order_id : null;
    const refundId = typeof data.refund_id === 'string' ? data.refund_id : null;
    const returnRequestId = typeof data.return_request_id === 'string' ? data.return_request_id : null;
    const isCodEvent = item.type?.startsWith('cod_') ?? false;
    const isPhysicalReturnEvent = item.type?.startsWith('physical_return_') ?? false;
    if (ticketId) {
      navigation.navigate('SupportTicket', { ticketId });
    } else if (role === 'merchant' && (refundId || item.type?.includes('refund'))) {
      navigation.navigate('Refunds');
    } else if (role === 'delivery' && isCodEvent) {
      navigation.navigate('DeliveryWallet');
    } else if (role === 'delivery' && (returnRequestId || isPhysicalReturnEvent)) {
      navigation.navigate('DeliveryReturns');
    } else if (orderId && role === 'merchant') {
      navigation.getParent()?.navigate('MerchantOrders', { screen: 'OrderDetails', params: { orderId } });
    } else if (orderId && role === 'delivery') {
      navigation.getParent()?.navigate('DeliveryOrders', { orderId });
    } else if (item.type?.includes('withdrawal')) {
      if (role === 'merchant') navigation.navigate('Wallet');
      else navigation.getParent()?.navigate('DeliveryEarnings');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }, layout.desktop && styles.headerDesktop]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('الإشعارات')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.errorState} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={46} color="#B91C1C" />
          <Text style={styles.errorText}>{tv(loadError)}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); void load(); }} accessibilityRole="button"><Text style={styles.retryText}>{t('إعادة المحاولة')}</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter }]}
          ListHeaderComponent={<NotificationPreferencesCard />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>{t('لا توجد إشعارات')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.is_read && styles.cardUnread]}
              activeOpacity={0.7}
              onPress={() => openNotification(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title ?? t('إشعار')}. ${item.body ?? ''}`}
              accessibilityState={{ selected: !item.is_read }}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${COLORS.primary}15` }]}>
                <Ionicons name="notifications-outline" size={22} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{tv(item.title)}</Text>
                  {!item.is_read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.body} numberOfLines={2}>{tv(item.body)}</Text>
                <Text style={styles.time}>{tv(new Date(item.created_at).toLocaleDateString(getLocale()))}</Text>
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
    width: '100%', maxWidth: 960, alignSelf: 'center',
  },
  headerDesktop: { paddingTop: 28 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContent: { padding: 20, gap: 12, width: '100%', maxWidth: 960, alignSelf: 'center', paddingBottom: 80 },
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
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#991B1B', textAlign: 'center' },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: 11, paddingHorizontal: 17, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
});
