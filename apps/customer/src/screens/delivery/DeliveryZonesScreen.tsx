import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '@marketplace/shared-utils';
import { getServiceAreas } from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';

type Zone = { id: string; name: string; orders: string; available: boolean };

export default function DeliveryZonesScreen({ navigation }: any) {
  const layout = useResponsiveLayout(900);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadZones = useCallback(async () => {
    setLoadError('');
    try {
      const areas = await getServiceAreas();
      setZones(areas.map((a) => ({
        id: a.id,
        name: a.city,
        orders: a.delivery_available ? 'متاح للتوصيل' : 'غير متاح',
        available: a.delivery_available,
      })));
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل نطاقات التغطية.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadZones();
  }, [loadZones]));

  const availableCount = zones.filter((zone) => zone.available).length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="العودة">
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>نطاقات التغطية</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]}>
        <View style={styles.infoCard}>
          <Ionicons name="map-outline" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>
            يعرض النظام المناطق المتاحة للتوصيل حاليًا. توجد <Text style={{ fontWeight: '800' }}>{availableCount}</Text> مناطق متاحة.
          </Text>
        </View>

        {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />}
        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => void loadZones()} accessibilityRole="button" accessibilityLabel="إعادة تحميل نطاقات التغطية">
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!loading && zones.length === 0 && (
          <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginTop: 20 }}>لا توجد مناطق متاحة</Text>
        )}
        {zones.map((zone) => (
          <View key={zone.id} style={[styles.zoneCard, zone.available && styles.zoneCardActive]} accessibilityLabel={`${zone.name}: ${zone.orders}`}>
            <View style={[styles.zoneIcon, zone.available && { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="location" size={18} color={zone.available ? '#059669' : '#9CA3AF'} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.zoneName}>{zone.name}</Text>
              <Text style={styles.zoneOrders}>{zone.orders}</Text>
            </View>
            <View style={[styles.statusBadge, zone.available && styles.statusBadgeAvailable]}>
              <Text style={[styles.statusText, zone.available && styles.statusTextAvailable]}>{zone.available ? 'متاحة' : 'متوقفة'}</Text>
            </View>
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
    width: '100%', maxWidth: 900, alignSelf: 'center',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scrollContent: { padding: 20, gap: 10, width: '100%', maxWidth: 900, alignSelf: 'center', paddingBottom: 80 },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },
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
  statusBadge: { borderRadius: 10, backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6 },
  statusBadgeAvailable: { backgroundColor: '#DCFCE7' },
  statusText: { color: '#6B7280', fontSize: 11, fontWeight: '800' },
  statusTextAvailable: { color: '#047857' },
});
