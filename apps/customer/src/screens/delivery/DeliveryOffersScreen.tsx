import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform, Dimensions, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAuthStore, getAvailableDeliveryOrders, claimDeliveryOrder, getDeliveryEarnings, recordAssignmentAttempt, updateDeliveryLocation, OrderSummary } from '@marketplace/shared-hooks';
import { formatPrice, calculateDeliveryEarning, rankDeliveryOffers, estimateRoadKm, estimateEtaMinutes, formatEtaRange, type LatLng } from '@marketplace/shared-utils';

const { width, height } = Dimensions.get('window');

export default function DeliveryOffersScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [courierLoc, setCourierLoc] = useState<LatLng | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  // تحديد موقع المندوب لترتيب العروض حسب القرب (أفضل جهد)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCourierLoc(loc);
        if (user?.id) updateDeliveryLocation(user.id, loc.latitude, loc.longitude).catch(() => {});
      } catch { /* تجاهل: نرتّب بلا موقع */ }
    })();
  }, [user?.id]);

  const load = useCallback(async () => {
    try { setOrders(await getAvailableDeliveryOrders()); } catch { setOrders([]); }
    finally { setLoading(false); }
    if (user?.id) {
      try {
        const e = await getDeliveryEarnings(user.id);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const sum = e.earnings
          .filter((x) => new Date(x.created_at) >= today)
          .reduce((s, x) => s + (x.total_earning ?? 0), 0);
        setTodayEarnings(sum);
      } catch { /* ignore */ }
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  // ترتيب العروض حسب القرب + الأجر + الأقدمية، واستبعاد المتجاهَلة
  const ranked = useMemo(() => {
    const offers = orders
      .filter((o) => !skipped.includes(o.id))
      .map((o) => ({
        id: o.id,
        deliveryFee: o.delivery_fee ?? 0,
        createdAt: o.created_at,
        pickup: o.merchant_profiles?.latitude != null
          ? { latitude: o.merchant_profiles.latitude, longitude: o.merchant_profiles.longitude ?? 0 }
          : null,
        order: o,
      }));
    return rankDeliveryOffers(offers, courierLoc);
  }, [orders, skipped, courierLoc]);

  const top = ranked[0];
  const current = top?.offer.order;

  // مسافة ووقت مقدّر للعرض الحالي
  const offerDistanceKm = top?.distanceKm ?? null;
  const offerEta = useMemo(() => {
    if (offerDistanceKm == null) return null;
    const road = estimateRoadKm(courierLoc!, { latitude: current!.merchant_profiles!.latitude!, longitude: current!.merchant_profiles!.longitude! });
    return estimateEtaMinutes(road);
  }, [offerDistanceKm, courierLoc, current]);

  const handleSkip = async () => {
    if (!current || !user?.id) return;
    recordAssignmentAttempt(current.id, user.id, 'rejected', 'skipped_by_courier').catch(() => {});
    setSkipped((s) => [...s, current.id]);
  };

  const handleAccept = async () => {
    if (!current || !user?.id) return;
    setClaiming(true);
    try {
      const ok = await claimDeliveryOrder(current.id, user.id);
      if (ok) {
        const acceptedId = current.id;
        recordAssignmentAttempt(acceptedId, user.id, 'accepted').catch(() => {});
        load();
        navigation.navigate('ActiveDelivery', { orderId: acceptedId });
      } else {
        Alert.alert('تنبيه', 'هذا الطلب لم يعد متاحاً (قبله مندوب آخر)');
        load();
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر قبول الطلب');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* 1. Map Background Simulation */}
      <View style={StyleSheet.absoluteFillObject}>
        <Image 
          source={{ uri: 'https://www.transparenttextures.com/patterns/cubes.png' }} 
          style={[StyleSheet.absoluteFillObject, { opacity: 0.1, tintColor: '#2563EB' }]} 
        />
        <View style={styles.mapGridLine1} />
        <View style={styles.mapGridLine2} />
        <View style={styles.mapGridLine3} />
        <View style={styles.mapGridLine4} />
      </View>

      {/* 2. Map Pins (Simulated) */}
      <View style={styles.centerPulseOuter}>
        <View style={styles.centerPulseInner}>
          <Ionicons name="navigate" size={16} color="#FFFFFF" style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
      </View>

      <View style={styles.randomPin1} />
      <View style={styles.randomPin2} />

      {/* 3. Top Floating UI */}
      <View style={styles.topSafeArea}>
        
        {/* Header Row */}
        <View style={styles.headerRow}>
          {/* Menu Button (Left natively, so it's 2nd in RTL? No, we use flex-direction row-reverse if needed, or just let RTL place it. First item is Right. So Menu should be LAST in code if we want it Left. But if the app is RTL, first is Right. Wait! I will use absolute positioning for left/right to guarantee layout.) */}
          
          <View style={styles.headerAbsoluteWrap}>
            <TouchableOpacity style={styles.menuBtn}>
              <Ionicons name="menu" size={24} color="#111827" />
              <View style={styles.menuDot} />
            </TouchableOpacity>

            <View style={styles.centerStatus}>
              <Text style={styles.statusTextTop}>متصل الآن</Text>
              <View style={styles.statusDotTop} />
            </View>

            <View style={styles.avatarWrap}>
              <Ionicons name="person" size={24} color="#9CA3AF" />
              <View style={styles.avatarOnlineDot} />
            </View>
          </View>
        </View>

        {/* Earnings Pill */}
        <View style={styles.earningsPillWrap}>
          <View style={styles.earningsPill}>
            <View style={styles.walletIconWrap}>
              <Ionicons name="wallet" size={18} color="#2563EB" />
            </View>
            <View style={styles.earningsTexts}>
              <Text style={styles.earningsLabel}>أرباح اليوم</Text>
              <Text style={styles.earningsValue}>{formatPrice(todayEarnings, { withSymbol: false })} <Text style={styles.earningsCurrency}>ر.ي</Text></Text>
            </View>
          </View>
        </View>

        {/* Connected Status Dropdown Pill */}
        <View style={styles.connectionDropdownWrap}>
          <View style={styles.connectionDropdown}>
            <View style={styles.connectionDotLarge} />
            <Text style={styles.connectionText}>متصل بالطلبات</Text>
            <Ionicons name="chevron-down" size={16} color="#6B7280" />
          </View>
        </View>

      </View>

      {/* 4. Bottom Order Card Overlay */}
      <View style={styles.bottomCardWrap}>
        {loading ? (
          <View style={[styles.orderCard, { alignItems: 'center', paddingVertical: 40 }]}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : !current ? (
          <View style={[styles.orderCard, { alignItems: 'center', paddingVertical: 40 }]}>
            <Ionicons name="cube-outline" size={40} color="#D1D5DB" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 12 }}>لا توجد طلبات متاحة حالياً</Text>
            <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>ستظهر الطلبات الجاهزة هنا تلقائياً</Text>
            <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={{ marginTop: 16 }}>
              <Text style={{ color: '#2563EB', fontWeight: '700' }}>تحديث</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.orderCard}>

          {/* Card Header: Store Info */}
          <View style={styles.cardHeader}>
            <View style={styles.newBadge}>
              <Ionicons name="sparkles" size={12} color="#2563EB" />
              <Text style={styles.newBadgeText}>جديد</Text>
            </View>

            <View style={styles.storeInfoWrap}>
              <View style={styles.storeTexts}>
                <Text style={styles.storeName}>{current.merchant_profiles?.store_name ?? 'المتجر'}</Text>
                <View style={styles.storeLocRow}>
                  <Ionicons name="location-outline" size={12} color="#2563EB" />
                  <Text style={styles.storeLocText}>{current.merchant_profiles?.city ?? current.merchant_profiles?.address ?? 'غير محدد'}</Text>
                </View>
              </View>
              <View style={styles.storeIconBox}>
                <Ionicons name="bag-handle-outline" size={20} color="#2563EB" />
              </View>
            </View>
          </View>

          {/* العنوان وجهة التوصيل */}
          <View style={styles.logoRow}>
            <View style={[styles.storeLogoCircle, { width: '100%', borderRadius: 16, flexDirection: 'row', paddingHorizontal: 14, gap: 8, justifyContent: 'flex-start' }]}>
              <Ionicons name="navigate-circle-outline" size={22} color="#2563EB" />
              <Text style={{ flex: 1, fontSize: 12.5, color: '#4B5563', fontWeight: '600' }} numberOfLines={1}>
                التوصيل إلى: {current.addresses?.full_address ?? 'عنوان العميل'}
              </Text>
            </View>
          </View>

          {/* شريط المسافة والوقت المقدّر للوصول للمتجر */}
          {offerDistanceKm != null && (
            <View style={styles.distanceStrip}>
              <View style={styles.distanceItem}>
                <Ionicons name="navigate-outline" size={15} color="#2563EB" />
                <Text style={styles.distanceText}>{offerDistanceKm.toFixed(1)} كم للمتجر</Text>
              </View>
              {offerEta != null && (
                <>
                  <View style={styles.distanceDot} />
                  <View style={styles.distanceItem}>
                    <Ionicons name="time-outline" size={15} color="#2563EB" />
                    <Text style={styles.distanceText}>{formatEtaRange(offerEta)}</Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* 3-Column Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCol}>
              <View style={styles.metricValRow}>
                <View style={styles.metricIconWrap}><Ionicons name="cash-outline" size={16} color="#111827" /></View>
                <Text style={styles.metricVal}>{formatPrice(current.total_amount ?? 0, { withSymbol: false })} <Text style={styles.metricUnit}>ر.ي</Text></Text>
              </View>
              <Text style={styles.metricLabel}>قيمة الطلب</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricCol}>
              <View style={styles.metricValRow}>
                <View style={styles.metricIconWrap}><Ionicons name="bicycle-outline" size={16} color="#111827" /></View>
                <Text style={styles.metricVal}>{formatPrice(calculateDeliveryEarning(current.delivery_fee ?? 0), { withSymbol: false })} <Text style={styles.metricUnit}>ر.ي</Text></Text>
              </View>
              <Text style={styles.metricLabel}>أجر التوصيل</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricCol}>
              <View style={styles.metricValRow}>
                <View style={styles.metricIconWrap}><Ionicons name="receipt-outline" size={16} color="#111827" /></View>
                <Text style={styles.metricVal}>{current.order_number?.slice(-4) ?? '----'}</Text>
              </View>
              <Text style={styles.metricLabel}>رقم الطلب</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.skipBtn} activeOpacity={0.8} onPress={handleSkip} disabled={claiming}>
              <Text style={styles.skipBtnText}>تجاهل</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.acceptBigBtn, { flex: 1 }, claiming && { opacity: 0.6 }]} activeOpacity={0.9} onPress={handleAccept} disabled={claiming}>
              {claiming ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.acceptBigBtnText}>قبول الطلب</Text>
                  <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </View>

        </View>
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FC' },
  
  // Map Simulation
  mapGridLine1: { position: 'absolute', top: '20%', left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF', transform: [{ rotate: '-15deg' }] },
  mapGridLine2: { position: 'absolute', top: '40%', left: 0, right: 0, height: 2, backgroundColor: '#FFFFFF', transform: [{ rotate: '10deg' }] },
  mapGridLine3: { position: 'absolute', top: 0, bottom: 0, left: '30%', width: 1, backgroundColor: '#FFFFFF', transform: [{ rotate: '20deg' }] },
  mapGridLine4: { position: 'absolute', top: 0, bottom: 0, left: '70%', width: 2, backgroundColor: '#FFFFFF', transform: [{ rotate: '-5deg' }] },

  centerPulseOuter: { position: 'absolute', top: '45%', left: '45%', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(37, 99, 235, 0.15)', alignItems: 'center', justifyContent: 'center' },
  centerPulseInner: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6, borderWidth: 3, borderColor: '#FFFFFF' },
  
  randomPin1: { position: 'absolute', top: '30%', left: '25%', width: 16, height: 16, borderRadius: 8, backgroundColor: '#2563EB', borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#2563EB', shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },
  randomPin2: { position: 'absolute', top: '40%', right: '20%', width: 16, height: 16, borderRadius: 8, backgroundColor: '#2563EB', borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#2563EB', shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },

  // Top UI
  topSafeArea: { paddingTop: Platform.OS === 'ios' ? 60 : 40, width: '100%', position: 'absolute', top: 0, zIndex: 10 },
  headerRow: { height: 50, justifyContent: 'center' },
  headerAbsoluteWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  
  menuBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  menuDot: { position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB', borderWidth: 1.5, borderColor: '#FFFFFF' },
  
  centerStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statusTextTop: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  statusDotTop: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2563EB' },

  avatarWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  avatarOnlineDot: { position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', borderWidth: 2.5, borderColor: '#FFFFFF' },

  earningsPillWrap: { alignItems: 'center', marginTop: 12 },
  earningsPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 4, gap: 12 },
  earningsTexts: { alignItems: 'center' },
  earningsLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', marginBottom: 2 },
  earningsValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  earningsCurrency: { fontSize: 11, fontWeight: '700' },
  walletIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },

  connectionDropdownWrap: { alignItems: 'center', marginTop: 20 },
  connectionDropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 3, gap: 12 },
  connectionText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  connectionDotLarge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#2563EB' },

  // Bottom Card
  bottomCardWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: Platform.OS === 'ios' ? 120 : 100 },
  orderCard: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 10 },
  
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  newBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  newBadgeText: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  
  storeInfoWrap: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  storeTexts: { alignItems: 'flex-end' },
  storeName: { fontSize: 19, fontWeight: '800', color: '#111827', marginBottom: 6 },
  storeLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeLocText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  storeIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },

  logoRow: { alignItems: 'flex-start', marginTop: -10, paddingLeft: 10 },
  storeLogoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F3F4F6' },

  metricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 28, backgroundColor: '#F9FAFB', paddingVertical: 18, paddingHorizontal: 16, borderRadius: 24 },
  metricCol: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: 30, backgroundColor: '#E5E7EB' },
  metricValRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  metricVal: { fontSize: 17, fontWeight: '800', color: '#111827' },
  metricUnit: { fontSize: 11, fontWeight: '600' },
  metricIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  acceptBigBtn: { width: '100%', height: 60, borderRadius: 20, backgroundColor: '#1D4ED8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8, gap: 12 },
  acceptBigBtnText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },

  distanceStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#EFF6FF', borderRadius: 16, paddingVertical: 12, marginTop: 16 },
  distanceItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distanceText: { fontSize: 13, fontWeight: '800', color: '#1D4ED8' },
  distanceDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#93C5FD' },

  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skipBtn: { height: 60, paddingHorizontal: 22, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontSize: 15, fontWeight: '800', color: '#6B7280' },

});
