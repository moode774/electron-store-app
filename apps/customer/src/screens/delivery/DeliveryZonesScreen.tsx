import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Switch, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { useAuthStore, getServiceAreas, getDeliveryServiceAreaIds, setDeliveryServiceArea } from '@marketplace/shared-hooks';

type Zone = { id: string; name: string; orders: string; active: boolean };

export default function DeliveryZonesScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    Promise.all([getServiceAreas(), getDeliveryServiceAreaIds(user.id)])
      .then(([areas, activeIds]) => {
        const set = new Set(activeIds);
        setZones(areas.map((a) => ({
          id: a.id,
          name: a.city,
          orders: set.has(a.id) ? 'نشط — تستقبل الطلبات' : 'غير مُفعّل',
          active: set.has(a.id),
        })));
      })
      .catch(() => setZones([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const toggleZone = async (id: string) => {
    if (!user?.id) return;
    const zone = zones.find((z) => z.id === id);
    if (!zone) return;
    const next = !zone.active;
    // تحديث تفاؤلي
    setZones((prev) => prev.map((z) => (z.id === id
      ? { ...z, active: next, orders: next ? 'نشط — تستقبل الطلبات' : 'غير مُفعّل' }
      : z)));
    try {
      await setDeliveryServiceArea(user.id, id, next);
    } catch {
      // تراجع عند الفشل
      setZones((prev) => prev.map((z) => (z.id === id
        ? { ...z, active: !next, orders: !next ? 'نشط — تستقبل الطلبات' : 'غير مُفعّل' }
        : z)));
      Alert.alert('خطأ', 'تعذّر حفظ التغيير، حاول مرة أخرى');
    }
  };

  const activeCount = zones.filter((z) => z.active).length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>مناطق العمل</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoCard}>
          <Ionicons name="map-outline" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>
            فعّل المناطق التي تريد استقبال طلبات منها. أنت الآن نشط في <Text style={{ fontWeight: '800' }}>{activeCount}</Text> مناطق.
          </Text>
        </View>

        {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />}
        {!loading && zones.length === 0 && (
          <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginTop: 20 }}>لا توجد مناطق متاحة</Text>
        )}
        {zones.map((zone) => (
          <View key={zone.id} style={[styles.zoneCard, zone.active && styles.zoneCardActive]}>
            <View style={[styles.zoneIcon, zone.active && { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="location" size={18} color={zone.active ? '#059669' : '#9CA3AF'} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.zoneName}>{zone.name}</Text>
              <Text style={styles.zoneOrders}>{zone.orders}</Text>
            </View>
            <Switch
              value={zone.active}
              onValueChange={() => toggleZone(zone.id)}
              trackColor={{ false: '#E5E7EB', true: '#A7F3D0' }}
              thumbColor={zone.active ? '#059669' : '#9CA3AF'}
            />
          </View>
        ))}
      </ScrollView>
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
  scrollContent: { padding: 20, gap: 10 },
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#F0F4FF',
    borderRadius: 14, padding: 14, marginBottom: 6,
  },
  infoText: { flex: 1, fontSize: 12.5, color: COLORS.primary, lineHeight: 19, fontWeight: '600' },
  zoneCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  zoneCardActive: { borderColor: '#A7F3D0' },
  zoneIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  zoneName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  zoneOrders: { fontSize: 11.5, color: '#9CA3AF', marginTop: 3 },
});
