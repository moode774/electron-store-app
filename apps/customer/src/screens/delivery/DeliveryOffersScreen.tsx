import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import IncomingOrderModal from '../../components/IncomingOrderModal';
import * as Location from 'expo-location';
import { useAuthStore, getAvailableDeliveryOrders, claimDeliveryOrder, getDeliveryEarnings, OrderSummary } from '@marketplace/shared-hooks';

export default function DeliveryOffersScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [mapError, setMapError] = useState('');
  const [showIncomingModal, setShowIncomingModal] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const load = useCallback(async () => {
    try { setOrders(await getAvailableDeliveryOrders()); } catch { setOrders([]); }
    finally { setLoading(false); }
    // أرباح اليوم الحقيقية (كانت سابقاً قيمة ثابتة 320)
    if (user?.id) {
      try {
        const { earnings } = await getDeliveryEarnings(user.id);
        const todayStr = new Date().toDateString();
        setTodayEarnings(
          earnings
            .filter((e) => new Date(e.created_at).toDateString() === todayStr)
            .reduce((s, e) => s + (e.total_earning ?? 0), 0),
        );
      } catch { /* تبقى صفراً */ }
    }
  }, [user?.id]);

  useEffect(() => {
    if (orders.length > 0 && !loading && !showIncomingModal) {
      // Simulate real-time ringing by showing modal when a new order appears
      setShowIncomingModal(true);
    } else if (orders.length === 0) {
      setShowIncomingModal(false);
    }
  }, [orders, loading]);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') {
        setMapError('الخرائط غير مدعومة بالكامل على الويب.');
        return;
      }
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setMapError('لم يتم منح إذن الوصول للموقع');
        return;
      }
      try {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } catch (e) {
        setMapError('تعذر تحديد موقعك بدقة');
      }
    })();
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const current = orders[0];

  const handleAccept = async () => {
    if (!current || !user?.id) return;
    setLoading(true);
    try {
      const ok = await claimDeliveryOrder(current.id, user.id);
      if (ok) {
        const acceptedId = current.id;
        load();
        navigation.navigate('ActiveDelivery', { orderId: acceptedId });
      } else {
        Alert.alert('تنبيه', 'هذا الطلب لم يعد متاحاً (قبله مندوب آخر)');
        load();
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر قبول الطلب');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* 1. Location Status UI (Instead of crashing MapView) */}
      <View style={StyleSheet.absoluteFillObject}>
        <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4' }]}>
          <View style={styles.centerPulseOuter}>
            <View style={styles.centerPulseInner}>
              <Ionicons name="navigate" size={32} color="#059669" />
            </View>
          </View>
          <Text style={{ marginTop: 24, color: '#059669', fontWeight: '800', fontSize: 18 }}>
            نظام التتبع مفعل
          </Text>
          <Text style={{ marginTop: 8, color: '#6B7280', fontWeight: '600', fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>
            {location ? `موقعك الحالي: ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}` : 'جاري تحديد موقعك الجغرافي للبحث عن الطلبات...'}
          </Text>
          {mapError ? (
            <Text style={{ marginTop: 12, color: '#DC2626', fontWeight: 'bold' }}>{mapError}</Text>
          ) : null}
        </View>
      </View>

      {/* 3. Top Floating UI */}
      <View style={styles.topSafeArea}>
        
        {/* Header Row */}
        <View style={styles.headerRow}>
          {/* Menu Button (Left natively, so it's 2nd in RTL? No, we use flex-direction row-reverse if needed, or just let RTL place it. First item is Right. So Menu should be LAST in code if we want it Left. But if the app is RTL, first is Right. Wait! I will use absolute positioning for left/right to guarantee layout.) */}
          
          <View style={styles.headerAbsoluteWrap}>
            <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.navigate('DeliveryAccount')}>
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
              <Text style={styles.earningsValue}>{todayEarnings} <Text style={styles.earningsCurrency}>ر.س</Text></Text>
            </View>
          </View>
        </View>

        {/* Connected Status Dropdown Pill */}
        <View style={styles.connectionDropdownWrap}>
          <TouchableOpacity
            style={[styles.connectionDropdown, !isOnline && { backgroundColor: '#FEE2E2' }]}
            activeOpacity={0.7}
            onPress={() => setIsOnline((v) => !v)}
          >
            <View style={[styles.connectionDotLarge, !isOnline && { backgroundColor: '#EF4444' }]} />
            <Text style={styles.connectionText}>{isOnline ? 'متصل بالطلبات' : 'غير متصل'}</Text>
            <Ionicons name="chevron-down" size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>

      </View>

      {/* 4. Bottom Order Card / Scanner Overlay */}
      <View style={styles.bottomCardWrap}>
        <View style={[styles.orderCard, { alignItems: 'center', paddingVertical: 30 }]}>
           {loading ? (
             <ActivityIndicator size="large" color="#2563EB" />
           ) : (
             <>
               <Ionicons name="radio-outline" size={40} color="#2563EB" style={{ opacity: 0.8 }} />
               <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 12 }}>
                 جاري البحث عن طلبات قريبة...
               </Text>
               <Text style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4, textAlign: 'center' }}>
                 تأكد من تواجدك في منطقة حيوية لزيادة فرصتك في استلام الطلبات.
               </Text>
               <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={{ marginTop: 16, padding: 8 }}>
                 <Text style={{ color: '#2563EB', fontWeight: '700' }}>تحديث يدوي</Text>
               </TouchableOpacity>
             </>
           )}
        </View>
      </View>

      <IncomingOrderModal
        visible={showIncomingModal}
        order={current}
        onAccept={handleAccept}
        onReject={() => {
           setShowIncomingModal(false);
           // In real scenario, we would dismiss this order or pass to another driver
           setOrders((prev) => prev.slice(1));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FC' },
  
  // Map Styles (Converted to Radar Styles)
  centerPulseOuter: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(5, 150, 105, 0.15)', alignItems: 'center', justifyContent: 'center' },
  centerPulseInner: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(5, 150, 105, 0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#059669' },

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

});
