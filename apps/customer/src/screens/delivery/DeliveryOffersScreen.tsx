import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import {
  claimDeliveryOrder,
  getDeliveryEarnings,
  getMyOfferRejections,
  OrderSummary,
  rejectDeliveryOffer,
  supabase,
  useAuthStore,
} from '@marketplace/shared-hooks';
import { COLORS, FONTS } from '@marketplace/shared-utils';
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

const normalizeCity = (city?: string | null) => (city ?? '').trim().toLowerCase();

// ترتيب العروض بحسب القرب: عروض مدينة عمل المندوب أولاً (استلامًا ثم تسليمًا)،
// ثم الأقدم فالأحدث. القاعدة تُرجع الطلبات الجاهزة؛ الترتيب هنا يقرّب الأنسب للمندوب.
const sortOffersByProximity = (
  offers: OrderSummary[],
  profile: DeliveryRuntimeProfile | null,
): OrderSummary[] => {
  const workCity = normalizeCity(profile?.work_city);
  if (!workCity) return offers;

  const score = (order: OrderSummary): number => {
    const pickupCity = normalizeCity(order.merchant_profiles?.city);
    const dropoffCity = normalizeCity(order.addresses?.city);
    if (pickupCity === workCity && dropoffCity === workCity) return 0;
    if (pickupCity === workCity) return 1;
    if (dropoffCity === workCity) return 2;
    return 3;
  };

  return [...offers].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
};

export default function DeliveryOffersScreen({ navigation }: any) {
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [profile, setProfile] = useState<DeliveryRuntimeProfile | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [onlineUpdating, setOnlineUpdating] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [earningsFailed, setEarningsFailed] = useState(false);
  const [todayDeliveries, setTodayDeliveries] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
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
      // فشل جلب الأرباح لا يمنع عرض العروض، لكن يجب ألّا يظهر كأن الدخل صفر
      const [runtimeProfile, earningsSettled] = await Promise.all([
        getDeliveryRuntimeProfile(user.id),
        getDeliveryEarnings(user.id).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const, value: null }),
        ),
      ]);
      const earningsResult = earningsSettled.ok ? earningsSettled.value : null;
      setEarningsFailed(!earningsSettled.ok);

      if (!runtimeProfile) {
        setProfile(null);
        setOrders([]);
        setLoadError('ملف المندوب غير موجود. أكمل بيانات المندوب ثم حاول مجددًا.');
        return;
      }

      setProfile(runtimeProfile);

      if (earningsResult) {
        const today = new Date().toDateString();
        const todays = earningsResult.earnings
          .filter((earning) => new Date(earning.created_at).toDateString() === today);
        setTodayEarnings(todays.reduce((sum, earning) => sum + (earning.total_earning ?? 0), 0));
        setTodayDeliveries(todays.length);
        setTotalDeliveries(earningsResult.totalDeliveries ?? 0);
        setWalletBalance(earningsResult.balance ?? 0);
      }
      setLastUpdatedAt(Date.now());

      if (!runtimeProfile.is_online || !runtimeProfile.is_approved) {
        setOrders([]);
        return;
      }

      // الرفض مسجَّل في السيرفر: يبقى مخفياً بعد إعادة التشغيل وعبر الأجهزة
      const [available, rejectedIds] = await Promise.all([
        getAvailableDeliveryOffers(),
        getMyOfferRejections().catch(() => [] as string[]),
      ]);
      rejectedIds.forEach((id) => dismissedOrderIds.current.add(id));
      setOrders(
        sortOffersByProximity(
          available.filter((order) => !dismissedOrderIds.current.has(order.id)),
          runtimeProfile,
        ),
      );
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
        // العروض هي الطلبات الجاهزة فقط — التصفية على السيرفر تمنع إعادة تحميل
        // على كل تغيير في أي طلب (حالات العميل/التاجر/التوصيل الجارية)
        { event: '*', schema: 'public', table: 'orders', filter: 'status=eq.ready' },
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
    const rejectedId = current.id;
    dismissedOrderIds.current.add(rejectedId);
    setShowIncomingModal(false);
    setOrders((previous) => previous.filter((order) => order.id !== rejectedId));
    // يُسجَّل في السيرفر ليبقى مرفوضاً بعد إعادة التشغيل وليتوفر سجل للرفض
    void rejectDeliveryOffer(rejectedId).catch(() => { /* الإخفاء المحلي يبقى ساريًا */ });
  }, [accepting, current]);

  const openNotifications = useCallback(() => {
    navigation.getParent()?.navigate('DeliveryMore', {
      screen: 'RoleNotifications',
      params: { role: 'delivery' },
    });
  }, [navigation]);

  const openEarnings = useCallback(() => {
    navigation.getParent()?.navigate('DeliveryEarnings');
  }, [navigation]);

  const firstName = (user?.full_name ?? '').trim().split(/\s+/)[0] || 'كابتن';
  const todayLabel = new Date().toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const controlsDisabled = onlineUpdating || initialLoading || !profile;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          {/* 1. Header */}
          <View style={styles.header}>
            <View style={styles.avatar} accessibilityLabel={isOnline ? 'حالتك: متصل' : 'حالتك: غير متصل'}>
              <Ionicons name="person" size={20} color={COLORS.primary} />
              <View style={[styles.avatarDot, { backgroundColor: isOnline ? COLORS.statusOnline : COLORS.inkTertiary }]} />
            </View>
            <View style={styles.greeting}>
              <Text style={styles.eyebrow}>مساحة المندوب</Text>
              <Text style={styles.greetingTitle} numberOfLines={1}>أهلًا {firstName}</Text>
              <Text style={styles.greetingCaption} numberOfLines={1}>{todayLabel}</Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={openNotifications}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="الإشعارات"
            >
              <Ionicons name="notifications-outline" size={22} color={COLORS.ink} />
            </TouchableOpacity>
          </View>

          {/* 2. Online toggle */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={handleToggleOnline}
            disabled={controlsDisabled}
            accessibilityRole="switch"
            accessibilityLabel="استقبال طلبات التوصيل"
            accessibilityState={{ checked: isOnline, disabled: controlsDisabled, busy: onlineUpdating }}
          >
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={[styles.sectionTitle, !isOnline && styles.mutedTitle]}>
                  {isOnline ? 'جاهز لاستقبال الطلبات' : 'استقبال الطلبات متوقف'}
                </Text>
                <Text style={styles.caption}>
                  {!isApproved && profile
                    ? 'بانتظار اعتماد حسابك لاستقبال الطلبات'
                    : isOnline
                      ? 'سنرسل لك الطلبات المناسبة فور توفرها'
                      : 'فعّل الاستقبال عندما تكون جاهزًا للعمل'}
                </Text>
              </View>
              {onlineUpdating ? (
                <View style={styles.switchSlot}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              ) : (
                <OnlineSwitch value={isOnline} />
              )}
            </View>
          </TouchableOpacity>

          {/* 3. Today summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <Text style={styles.summaryLabel}>ملخص اليوم</Text>
              <TouchableOpacity
                onPress={openEarnings}
                style={styles.detailsLink}
                accessibilityRole="button"
                accessibilityLabel="تفاصيل الأرباح"
              >
                <Text style={styles.detailsText}>التفاصيل</Text>
                <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
            {initialLoading ? (
              <View style={styles.amountSkeleton} />
            ) : (
              <View style={styles.amountRow}>
                <CountUpAmount value={earningsFailed ? 0 : todayEarnings} style={styles.amount} />
                <Text style={styles.currency}>ر.ي أرباح</Text>
              </View>
            )}
            {earningsFailed && !initialLoading ? (
              <Text style={styles.summaryNote}>تعذّر تحميل الأرباح الآن</Text>
            ) : null}
            <View style={styles.summaryDivider} />
            <View style={styles.statsRow}>
              <SummaryStat value={initialLoading ? null : formatInt(todayDeliveries)} label="توصيلات اليوم" />
              <View style={styles.statsDivider} />
              <SummaryStat value={initialLoading ? null : formatInt(totalDeliveries)} label="إجمالي التوصيلات" />
              <View style={styles.statsDivider} />
              <SummaryStat value={initialLoading ? null : formatMoney(walletBalance)} label="رصيد المحفظة" />
            </View>
          </View>

          {/* 4. Search state */}
          <View style={[styles.card, styles.stateCard]}>
            {initialLoading ? (
              <View style={styles.stateSkeleton}>
                <View style={styles.skeletonCircle} />
                <View style={styles.skeletonLineWide} />
                <View style={styles.skeletonLine} />
              </View>
            ) : loadError ? (
              <>
                <View style={[styles.stateIcon, styles.stateIconError]}>
                  <Ionicons name="cloud-offline-outline" size={24} color={COLORS.error} />
                </View>
                <Text style={styles.stateTitle}>تعذّر تحديث الطلبات</Text>
                <Text style={styles.stateCaption}>{loadError}</Text>
                <RefreshButton refreshing={refreshing} onPress={() => void loadData(true)} label="إعادة المحاولة" />
              </>
            ) : !isApproved ? (
              <>
                <View style={styles.stateIcon}>
                  <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} />
                </View>
                <Text style={styles.stateTitle}>حسابك قيد المراجعة</Text>
                <Text style={styles.stateCaption}>ستتمكن من استقبال الطلبات فور اعتماد بياناتك.</Text>
              </>
            ) : !isOnline ? (
              <>
                <View style={styles.stateIcon}>
                  <Ionicons name="pause" size={22} color={COLORS.inkSecondary} />
                </View>
                <Text style={styles.stateTitle}>استقبال الطلبات متوقف</Text>
                <Text style={styles.stateCaption}>عند الاتصال ستصلك الطلبات الجاهزة القريبة منك.</Text>
                <TouchableOpacity
                  style={[styles.primaryButton, controlsDisabled && styles.disabled]}
                  onPress={handleToggleOnline}
                  disabled={controlsDisabled}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="ابدأ استقبال الطلبات"
                >
                  <Text style={styles.primaryButtonText}>ابدأ استقبال الطلبات</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <SearchPulse />
                <Text style={styles.stateTitle}>
                  {current ? 'لديك طلب جديد' : 'أنت جاهز للعمل'}
                </Text>
                <Text style={styles.stateCaption}>
                  {current ? 'راجع تفاصيل الطلب قبل القبول' : <LastUpdated at={lastUpdatedAt} />}
                </Text>
                {realtimeDegraded ? (
                  <View style={styles.warningChip}>
                    <Ionicons name="alert-circle-outline" size={14} color={COLORS.warningInk} />
                    <Text style={styles.warningChipText}>التحديث اللحظي متوقف مؤقتًا</Text>
                  </View>
                ) : null}
                <RefreshButton refreshing={refreshing} onPress={() => void loadData(true)} label="تحديث الآن" />
              </>
            )}
          </View>

          {locationMessage ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.inkSecondary} />
              <Text style={styles.infoText}>{locationMessage}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

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

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

// Western digits match the rest of the app and stay unambiguous with the
// Arabic font (its decimal/thousands separators render almost identically).
const formatMoney = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatInt = (value: number) => value.toLocaleString('en-US');
const secondsLabel = (n: number) => (n >= 3 && n <= 10 ? 'ثوانٍ' : 'ثانية');
const minutesLabel = (n: number) => (n >= 3 && n <= 10 ? 'دقائق' : 'دقيقة');

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduce(enabled); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

function OnlineSwitch({ value }: { value: boolean }) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  // RTL: "on" sits at the leading (right) edge of the track.
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });
  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.hairline, COLORS.primary],
  });

  return (
    <View style={styles.switchSlot} importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.switchTrack, { backgroundColor }]}>
        <Animated.View style={[styles.switchThumb, { transform: [{ translateX }] }]} />
      </Animated.View>
    </View>
  );
}

function CountUpAmount({ value, style }: { value: number; style: any }) {
  const reduceMotion = useReduceMotion();
  const animated = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const id = animated.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(animated, {
      toValue: value,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animated.removeListener(id);
  }, [animated, reduceMotion, value]);

  return (
    <Text style={style} accessibilityLabel={`${formatMoney(value)} ريال يمني`}>
      {formatMoney(display)}
    </Text>
  );
}

function SummaryStat({ value, label }: { value: string | null; label: string }) {
  return (
    <View style={styles.stat}>
      {value === null ? (
        <View style={styles.statSkeleton} />
      ) : (
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      )}
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SearchPulse() {
  const reduceMotion = useReduceMotion();
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, ring]);

  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={styles.pulse} importantForAccessibility="no-hide-descendants">
      {!reduceMotion ? (
        <Animated.View style={[styles.pulseRing, { opacity, transform: [{ scale }] }]} />
      ) : null}
      <View style={styles.pulseHalo} />
      <View style={styles.pulseCore}>
        <Ionicons name="navigate" size={22} color={COLORS.surface} />
      </View>
    </View>
  );
}

function LastUpdated({ at }: { at: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  if (!at) return <Text>ستظهر الطلبات الجديدة تلقائيًا</Text>;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const text = seconds < 5
    ? 'آخر تحديث الآن'
    : seconds < 60
      ? `آخر تحديث قبل ${formatInt(seconds)} ${secondsLabel(seconds)}`
      : `آخر تحديث قبل ${formatInt(Math.round(seconds / 60))} ${minutesLabel(Math.round(seconds / 60))}`;
  return <Text>{text}</Text>;
}

function RefreshButton({ refreshing, onPress, label }: { refreshing: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.textButton}
      disabled={refreshing}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: refreshing, disabled: refreshing }}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <>
          <Ionicons name="refresh" size={16} color={COLORS.primary} />
          <Text style={styles.textButtonLabel}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 4px 16px rgba(15,23,42,0.06)' } as any,
  default: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  content: { paddingHorizontal: 16 },
  page: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 14 },

  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.canvas,
  },
  greeting: { flex: 1, alignItems: 'flex-end' },
  eyebrow: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.primary, textAlign: 'right', marginBottom: 1 },
  greetingTitle: { fontFamily: FONTS.semiBold, fontSize: 20, lineHeight: 28, color: COLORS.ink, textAlign: 'right' },
  greetingCaption: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: COLORS.inkSecondary, textAlign: 'right' },
  iconButton: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.hairline,
    alignItems: 'center', justifyContent: 'center',
  },

  card: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: COLORS.hairline, ...CARD_SHADOW },
  toggleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  toggleCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sectionTitle: { fontFamily: FONTS.semiBold, fontSize: 18, lineHeight: 25, color: COLORS.ink, textAlign: 'right' },
  mutedTitle: { color: COLORS.inkSecondary },
  caption: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: COLORS.inkSecondary, textAlign: 'right' },
  switchSlot: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center' },
  switchTrack: { width: 52, height: 28, borderRadius: 14, padding: 2, alignItems: 'flex-end', justifyContent: 'center' },
  switchThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surface,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(15,23,42,0.2)' } as any,
      default: { shadowColor: COLORS.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 },
    }),
  },

  summaryCard: { backgroundColor: COLORS.primary, borderRadius: 22, padding: 22, overflow: 'hidden', ...CARD_SHADOW },
  summaryTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: FONTS.medium, fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.78)' },
  detailsLink: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 4 },
  detailsText: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  amountRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6, marginTop: 2 },
  amount: {
    fontFamily: FONTS.bold, fontSize: 28, lineHeight: 39, color: COLORS.surface,
    fontVariant: ['tabular-nums', 'lining-nums'],
  },
  currency: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  amountSkeleton: { width: 140, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 6, alignSelf: 'flex-end' },
  summaryNote: { fontFamily: FONTS.regular, fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'right', marginTop: 2 },
  summaryDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 16 },
  statsRow: { flexDirection: 'row-reverse', alignItems: 'center' },
  statsDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.14)' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: FONTS.semiBold, fontSize: 15, lineHeight: 21, color: COLORS.surface, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.7)' },
  statSkeleton: { width: 36, height: 16, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 2.5 },

  stateCard: { alignItems: 'center', paddingVertical: 28, gap: 7, minHeight: 210 },
  stateIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  stateIconError: { backgroundColor: '#FDECEC' },
  stateTitle: { fontFamily: FONTS.semiBold, fontSize: 18, lineHeight: 25, color: COLORS.ink, textAlign: 'center' },
  stateCaption: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: COLORS.inkSecondary, textAlign: 'center' },

  pulse: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  pulseRing: { position: 'absolute', width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.primary },
  pulseHalo: { position: 'absolute', width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(23,37,84,0.1)' },
  pulseCore: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  warningChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.warningSoft, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  warningChipText: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.warningInk },

  textButton: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, minWidth: 120, paddingHorizontal: 16, marginTop: 6, borderRadius: 12,
  },
  textButtonLabel: { fontFamily: FONTS.semiBold, fontSize: 15, color: COLORS.primary },

  primaryButton: {
    alignSelf: 'stretch', minHeight: 48, borderRadius: 12, marginTop: 12,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: FONTS.semiBold, fontSize: 15, color: COLORS.surface },
  disabled: { opacity: 0.5 },

  stateSkeleton: { alignItems: 'center', gap: 10, width: '100%' },
  skeletonCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.surfaceMuted },
  skeletonLineWide: { width: '60%', height: 16, borderRadius: 6, backgroundColor: COLORS.surfaceMuted },
  skeletonLine: { width: '40%', height: 12, borderRadius: 6, backgroundColor: COLORS.surfaceMuted },

  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  infoText: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: COLORS.inkSecondary, textAlign: 'right' },
});
