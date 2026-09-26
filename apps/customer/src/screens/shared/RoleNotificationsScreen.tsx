import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { useAuthStore, getNotifications, markNotificationRead, Notification, supabase } from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';

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
      // Returns live in their own bottom tab (one mounted instance only).
      navigation.getParent()?.navigate('DeliveryReturnsTab');
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }, layout.desktop && styles.headerDesktop]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCopy}><Text style={styles.headerTitle}>الإشعارات</Text><Text style={styles.headerSubtitle}>آخر التحديثات والتنبيهات المهمة</Text></View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('NotificationSettings')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="إعدادات الإشعارات">
          <Ionicons name="options-outline" size={20} color={COLORS.ink} />
        </TouchableOpacity>
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
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter }]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="notifications-off-outline" size={27} color={COLORS.primary} /></View>
              <Text style={styles.emptyTitle}>لا توجد إشعارات جديدة</Text>
              <Text style={styles.emptyText}>أي تحديث مهم سيظهر لك هنا</Text>
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
              <View style={[styles.iconWrap, !item.is_read && styles.iconWrapUnread]}>
                <Ionicons name={item.is_read ? 'notifications-outline' : 'notifications'} size={20} color={COLORS.primary} />
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
  container: { flex: 1, backgroundColor: COLORS.canvas },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 38, paddingBottom: 18,
    width: '100%', maxWidth: 960, alignSelf: 'center',
  },
  headerDesktop: { paddingTop: 28 },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'flex-end', paddingHorizontal: 12 },
  headerTitle: { fontSize: 21, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  headerSubtitle: { fontSize: 10.5, color: COLORS.inkSecondary, marginTop: 2, textAlign: 'right' },
  settingsBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 4, paddingBottom: 90, gap: 9, width: '100%', maxWidth: 960, alignSelf: 'center' },
  card: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15,
    borderWidth: 1, borderColor: COLORS.hairline,
  },
  cardUnread: { borderColor: `${COLORS.primary}24`, backgroundColor: '#FFFFFF' },
  iconWrap: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  iconWrapUnread: { backgroundColor: COLORS.primarySoft },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  title: { fontSize: 13.5, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right', flexShrink: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  body: { fontSize: 11.5, color: COLORS.inkSecondary, lineHeight: 18, marginTop: 3, textAlign: 'right' },
  time: { fontSize: 9.5, color: COLORS.inkTertiary, marginTop: 7, textAlign: 'right' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 72 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  emptyTitle: { color: COLORS.ink, fontSize: 14, fontFamily: FONTS.bold },
  emptyText: { color: COLORS.inkSecondary, fontSize: 11, marginTop: 4 },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { color: '#991B1B', textAlign: 'center' },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: 11, paddingHorizontal: 17, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
});
