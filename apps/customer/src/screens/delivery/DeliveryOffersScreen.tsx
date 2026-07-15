import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import {
  claimDeliveryOrder,
  getDeliveryEarnings,
  OrderSummary,
  supabase,
  useAuthStore,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import IncomingOrderModal from '../../components/IncomingOrderModal';
import {
  DeliveryRuntimeProfile,
  getAvailableDeliveryOffers,
  getDeliveryRuntimeProfile,
  setDeliveryRuntimeOnline,
} from './deliveryData';

const FALLBACK_REFRESH_MS = 20_000;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function DeliveryOffersScreen({ navigation }: any) {
  const user = useAuthStore((state) => state.user);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [profile, setProfile] = useState<DeliveryRuntimeProfile | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [onlineUpdating, setOnlineUpdating] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);
  const [showIncomingModal, setShowIncomingModal] = useState(false);
  const dismissedOrderIds = useRef(new Set<string>());
  const acceptLock = useRef(false);
  const onlineLock = useRef(false);

  const readCurrentLocation = useCallback(async (): Promise<Location.LocationObject | null> => {
    if (Platform.OS === 'web') {
      setLocationMessage('تحديث الموقع المباشر متاح من تطبيق الجوال.');
      return null;
    }

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage('فعّل إذن الموقع لتحسين ترتيب العروض القريبة.');
        return null;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(currentLocation);
      setLocationMessage('');
      return currentLocation;
    } catch (error) {
      setLocationMessage(errorMessage(error, 'تعذّر تحديد موقعك الحالي.'));
      return null;
    }
  }, []);

  const loadData = useCallback(async (showRefreshIndicator = false) => {
    if (!user?.id) {
      setOrders([]);
      setProfile(null);
      setInitialLoading(false);
      return;
    }

    if (showRefreshIndicator) setRefreshing(true);
    setLoadError('');

    try {
      const [runtimeProfile, earningsResult] = await Promise.all([
        getDeliveryRuntimeProfile(user.id),
        getDeliveryEarnings(user.id).catch(() => null),
      ]);

      if (!runtimeProfile) {
        setProfile(null);
        setOrders([]);
        setLoadError('ملف المندوب غير موجود. أكمل بيانات المندوب ثم حاول مجددًا.');
        return;
      }

      setProfile(runtimeProfile);

      if (earningsResult) {
        const today = new Date().toDateString();
        setTodayEarnings(
          earningsResult.earnings
            .filter((earning) => new Date(earning.created_at).toDateString() === today)
            .reduce((sum, earning) => sum + (earning.total_earning ?? 0), 0),
        );
      }

      if (!runtimeProfile.is_online || !runtimeProfile.is_approved) {
        setOrders([]);
        return;
      }

      const available = await getAvailableDeliveryOffers();
      setOrders(available.filter((order) => !dismissedOrderIds.current.has(order.id)));
    } catch (error) {
      setLoadError(errorMessage(error, 'تعذّر تحديث عروض التوصيل. تحقق من الاتصال وحاول مجددًا.'));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void readCurrentLocation();
  }, [readCurrentLocation]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadData();

    if (!user?.id) return () => { active = false; };

    const channel = supabase
      .channel(`delivery-offers-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          if (active) void loadData();
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') setRealtimeDegraded(false);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeDegraded(true);
      });

    // Realtime may be disabled for the table. Keep a low-frequency fallback so
    // the courier still receives offers without leaking intervals on navigation.
    const refreshTimer = setInterval(() => {
      if (active) void loadData();
    }, FALLBACK_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadData, user?.id]));

  const current = orders[0] ?? null;
  const isOnline = profile?.is_online ?? false;
  const isApproved = profile?.is_approved ?? false;

  useEffect(() => {
    setShowIncomingModal(Boolean(isOnline && isApproved && current && !accepting));
  }, [accepting, current, isApproved, isOnline]);

  const handleToggleOnline = useCallback(async () => {
    if (!user?.id || onlineLock.current) return;

    const nextOnline = !isOnline;
    if (nextOnline && !isApproved) {
      Alert.alert('الحساب غير معتمد', 'لا يمكن استقبال الطلبات قبل اعتماد حساب المندوب.');
      return;
    }

    onlineLock.current = true;
    setOnlineUpdating(true);
    try {
      const currentLocation = location ?? (nextOnline ? await readCurrentLocation() : null);
      const updated = await setDeliveryRuntimeOnline(
        user.id,
        nextOnline,
        currentLocation
          ? {
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }
          : null,
      );
      setProfile(updated);

      if (!nextOnline) {
        setOrders([]);
        setShowIncomingModal(false);
      } else {
        await loadData(true);
      }
    } catch (error) {
      Alert.alert('تعذّر تغيير حالة الاتصال', errorMessage(error, 'تحقق من اتصالك وحاول مجددًا.'));
      await loadData();
    } finally {
      onlineLock.current = false;
      setOnlineUpdating(false);
    }
  }, [isApproved, isOnline, loadData, location, readCurrentLocation, user?.id]);

  const handleAccept = useCallback(async () => {
    if (!current || !user?.id || acceptLock.current) return;
    if (!isOnline || !isApproved) {
      Alert.alert('غير متاح', 'يجب أن يكون حسابك معتمدًا ومتصلًا قبل قبول الطلب.');
      return;
    }

    acceptLock.current = true;
    setAccepting(true);
    try {
      const claimed = await claimDeliveryOrder(current.id, user.id);
      if (!claimed) {
        dismissedOrderIds.current.add(current.id);
        setOrders((previous) => previous.filter((order) => order.id !== current.id));
        Alert.alert('لم يعد متاحًا', 'قبِل مندوب آخر هذا الطلب. تم تحديث العروض المتاحة.');
        await loadData();
        return;
      }

      setShowIncomingModal(false);
      setOrders((previous) => previous.filter((order) => order.id !== current.id));
      navigation.navigate('ActiveDelivery', { orderId: current.id });
    } catch (error) {
      Alert.alert('تعذّر قبول الطلب', errorMessage(error, 'تحقق من الاتصال ثم حاول مجددًا.'));
      await loadData();
    } finally {
      acceptLock.current = false;
      setAccepting(false);
    }
  }, [current, isApproved, isOnline, loadData, navigation, user?.id]);

  const handleReject = useCallback(() => {
    if (!current || accepting) return;
    dismissedOrderIds.current.add(current.id);
    setShowIncomingModal(false);
    setOrders((previous) => previous.filter((order) => order.id !== current.id));
  }, [accepting, current]);

  const openDeliveryAccount = useCallback(() => {
    navigation.getParent()?.navigate('DeliveryMore');
  }, [navigation]);

  const statusLabel = onlineUpdating
    ? 'جاري التحديث...'
    : isOnline
      ? 'متصل الآن'
      : 'غير متصل';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View style={styles.radarArea}>
        <View style={[styles.centerPulseOuter, !isOnline && styles.centerPulseOffline]}>
          <View style={[styles.centerPulseInner, !isOnline && styles.centerPulseInnerOffline]}>
            <Ionicons name={isOnline ? 'navigate' : 'pause'} size={32} color={isOnline ? '#059669' : '#9CA3AF'} />
          </View>
        </View>
        <Text style={[styles.radarTitle, !isOnline && styles.offlineText]}>
          {isOnline ? 'البحث عن عروض التوصيل مفعّل' : 'استقبال العروض متوقف'}
        </Text>
        <Text style={styles.radarSubtitle}>
          {location
            ? 'تم تحديد موقعك، وسيتم إرسال التحديثات أثناء التوصيلة النشطة فقط.'
            : locationMessage || 'جاري التحقق من الموقع...'}
        </Text>
      </View>

      <View style={styles.topSafeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={openDeliveryAccount}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="فتح حساب المندوب"
          >
            <Ionicons name="menu" size={24} color="#111827" />
          </TouchableOpacity>

          <View style={styles.centerStatus} accessibilityLiveRegion="polite">
            <Text style={styles.statusTextTop}>{statusLabel}</Text>
            <View style={[styles.statusDotTop, !isOnline && styles.statusDotOffline]} />
          </View>

          <View style={styles.avatarWrap}>
            <Ionicons name="person" size={24} color="#9CA3AF" />
            {isOnline && <View style={styles.avatarOnlineDot} />}
          </View>
        </View>

        <View style={styles.earningsPillWrap}>
          <View style={styles.earningsPill}>
            <View style={styles.walletIconWrap}>
              <Ionicons name="wallet" size={18} color="#2563EB" />
            </View>
            <View style={styles.earningsTexts}>
              <Text style={styles.earningsLabel}>أرباح اليوم</Text>
              <Text style={styles.earningsValue}>{todayEarnings.toLocaleString()} <Text style={styles.earningsCurrency}>ر.ي</Text></Text>
            </View>
          </View>
        </View>

        <View style={styles.connectionDropdownWrap}>
          <TouchableOpacity
            style={[styles.connectionDropdown, !isOnline && styles.connectionDropdownOffline]}
            activeOpacity={0.7}
            onPress={handleToggleOnline}
            disabled={onlineUpdating || initialLoading}
            accessibilityRole="switch"
            accessibilityLabel="استقبال طلبات التوصيل"
            accessibilityState={{ checked: isOnline, disabled: onlineUpdating || initialLoading, busy: onlineUpdating }}
          >
            {onlineUpdating ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <View style={[styles.connectionDotLarge, !isOnline && styles.statusDotOffline]} />
            )}
            <Text style={styles.connectionText}>{isOnline ? 'متصل بالطلبات' : 'اضغط للاتصال'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomCardWrap}>
        <View style={styles.orderCard}>
          {initialLoading ? (
            <ActivityIndicator size="large" color="#2563EB" accessibilityLabel="جاري تحميل عروض التوصيل" />
          ) : loadError ? (
            <>
              <Ionicons name="cloud-offline-outline" size={38} color="#DC2626" />
              <Text style={styles.cardTitle}>تعذّر تحديث العروض</Text>
              <Text style={styles.errorText}>{loadError}</Text>
            </>
          ) : !isApproved ? (
            <>
              <Ionicons name="shield-checkmark-outline" size={40} color="#D97706" />
              <Text style={styles.cardTitle}>الحساب بانتظار الاعتماد</Text>
              <Text style={styles.cardSubtitle}>ستتمكن من استقبال الطلبات بعد اعتماد بيانات المندوب.</Text>
            </>
          ) : !isOnline ? (
            <>
              <Ionicons name="notifications-off-outline" size={40} color="#9CA3AF" />
              <Text style={styles.cardTitle}>أنت غير متصل</Text>
              <Text style={styles.cardSubtitle}>فعّل استقبال الطلبات من الزر أعلاه.</Text>
            </>
          ) : (
            <>
              <Ionicons name="radio-outline" size={40} color="#2563EB" />
              <Text style={styles.cardTitle}>
                {current ? 'وصل عرض توصيل جديد' : 'جاري البحث عن طلبات جاهزة...'}
              </Text>
              <Text style={styles.cardSubtitle}>
                {realtimeDegraded
                  ? 'التحديث اللحظي غير متاح مؤقتًا؛ يتم التحديث تلقائيًا كل عدة ثوانٍ.'
                  : 'ستظهر العروض الجديدة تلقائيًا عند تجهيزها من المتجر.'}
              </Text>
            </>
          )}

          <TouchableOpacity
            onPress={() => void loadData(true)}
            style={styles.refreshBtn}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="تحديث عروض التوصيل"
            accessibilityState={{ busy: refreshing, disabled: refreshing }}
          >
            {refreshing
              ? <ActivityIndicator size="small" color="#2563EB" />
              : <Text style={styles.refreshText}>تحديث الآن</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <IncomingOrderModal
        visible={showIncomingModal}
        order={current}
        accepting={accepting}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FC' },
  radarArea: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 36,
  },
  centerPulseOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPulseOffline: { backgroundColor: 'rgba(156, 163, 175, 0.15)' },
  centerPulseInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(5, 150, 105, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#059669',
  },
  centerPulseInnerOffline: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
  radarTitle: { marginTop: 24, color: '#059669', fontWeight: '800', fontSize: 18, textAlign: 'center' },
  radarSubtitle: { marginTop: 8, color: '#6B7280', fontWeight: '600', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  offlineText: { color: '#6B7280' },
  topSafeArea: { paddingTop: Platform.OS === 'ios' ? 60 : 40, width: '100%', position: 'absolute', top: 0, zIndex: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  menuBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  centerStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statusTextTop: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  statusDotTop: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' },
  statusDotOffline: { backgroundColor: '#EF4444' },
  avatarWrap: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  avatarOnlineDot: { position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', borderWidth: 2.5, borderColor: '#FFFFFF' },
  earningsPillWrap: { alignItems: 'center', marginTop: 12 },
  earningsPill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 4, gap: 12,
  },
  earningsTexts: { alignItems: 'center' },
  earningsLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', marginBottom: 2 },
  earningsValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  earningsCurrency: { fontSize: 11, fontWeight: '700' },
  walletIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  connectionDropdownWrap: { alignItems: 'center', marginTop: 18 },
  connectionDropdown: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 3, gap: 12,
  },
  connectionDropdownOffline: { backgroundColor: '#FEF2F2' },
  connectionText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  connectionDotLarge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#10B981' },
  bottomCardWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: Platform.OS === 'ios' ? 120 : 100 },
  orderCard: {
    backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, minHeight: 190, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 12, textAlign: 'center' },
  cardSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 12.5, color: '#DC2626', marginTop: 6, textAlign: 'center', lineHeight: 19 },
  refreshBtn: { marginTop: 14, minHeight: 38, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: '#2563EB', fontWeight: '800', fontSize: 13 },
});
