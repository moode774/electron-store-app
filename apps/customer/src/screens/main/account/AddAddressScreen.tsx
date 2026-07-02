import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert } from 'react-native';
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SERVICE_AREAS } from '@marketplace/shared-utils';
import { Button, Input, Card } from '@marketplace/shared-ui';
import { useAuthStore, createAddress } from '@marketplace/shared-hooks';
import AppMap from '../../../components/AppMap';

export default function AddAddressScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [label, setLabel] = useState('المنزل');
  const [selectedArea, setSelectedArea] = useState<string>(SERVICE_AREAS.SANAA);
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [saving, setSaving] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const LABELS = ['المنزل', 'العمل', 'أخرى'];

  const captureLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('تنبيه', 'يجب السماح بالوصول إلى الموقع لتحديد عنوانك');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(Number(pos.coords.latitude.toFixed(6)));
      setLng(Number(pos.coords.longitude.toFixed(6)));
    } catch {
      Alert.alert('خطأ', 'تعذّر تحديد الموقع، حاول مرة أخرى أو أدخل العنوان يدوياً');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً'); return; }
    if (!street.trim()) { Alert.alert('تنبيه', 'الرجاء إدخال الشارع/الحي'); return; }
    setSaving(true);
    try {
      await createAddress({
        user_id: user.id,
        label: label === 'المنزل' ? 'home' : label === 'العمل' ? 'work' : label,
        full_address: `${street.trim()}${landmark.trim() ? ' - ' + landmark.trim() : ''}`,
        city: selectedArea,
        latitude: lat ?? undefined,
        longitude: lng ?? undefined,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر حفظ العنوان');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>→</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إضافة عنوان</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* الخريطة: تحديد الموقع الحالي ثم تعديل الدبّوس بالضغط */}
        {lat != null && lng != null ? (
          <View>
            <AppMap
              style={styles.mapContainer}
              latitude={lat}
              longitude={lng}
              markers={[{ id: 'addr', latitude: lat, longitude: lng, title: 'موقع التوصيل' }]}
              onPress={(la, ln) => { setLat(Number(la.toFixed(6))); setLng(Number(ln.toFixed(6))); }}
            />
            <Text style={styles.mapHint}>اضغط على الخريطة لتعديل موقع الدبّوس</Text>
            <Button
              title={locating ? 'جاري التحديد...' : 'إعادة تحديد موقعي الحالي'}
              onPress={captureLocation}
              disabled={locating}
              variant="outline"
              style={{ marginHorizontal: SPACING.md, marginTop: 8, height: 40 }}
            />
          </View>
        ) : (
          <View style={styles.mapContainer}>
            <Text style={styles.mapEmoji}>🗺️</Text>
            <Text style={styles.mapText}>حدد موقعك على الخريطة</Text>
            <Button
              title={locating ? 'جاري التحديد...' : 'تحديد الموقع الحالي'}
              onPress={captureLocation}
              disabled={locating}
              style={{ marginTop: 12, width: 220, height: 40 }}
            />
          </View>
        )}

        <Card style={styles.formCard} variant="elevated">
          <Text style={styles.sectionTitle}>تفاصيل العنوان</Text>
          
          <Text style={styles.inputLabel}>تسمية العنوان</Text>
          <View style={styles.labelsRow}>
            {LABELS.map((lbl) => (
              <TouchableOpacity
                key={lbl}
                style={[styles.labelChip, label === lbl && styles.labelChipActive]}
                onPress={() => setLabel(lbl)}
              >
                <Text style={[styles.labelChipText, label === lbl && styles.labelChipTextActive]}>
                  {lbl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>المنطقة / المدينة</Text>
          <View style={styles.areasRow}>
            {Object.values(SERVICE_AREAS).map((area) => (
              <TouchableOpacity
                key={area}
                style={[styles.areaChip, selectedArea === area && styles.areaChipActive]}
                onPress={() => setSelectedArea(area)}
              >
                <Text style={[styles.areaChipText, selectedArea === area && styles.areaChipTextActive]}>
                  {area === SERVICE_AREAS.SANAA ? 'صنعاء' :
                   area === SERVICE_AREAS.ADEN ? 'عدن' :
                   area === SERVICE_AREAS.IBB ? 'إب' :
                   area === SERVICE_AREAS.TAIZ ? 'تعز' : area}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="الشارع / الحي"
            placeholder="مثال: شارع حدة، خلف المول"
            value={street}
            onChangeText={setStreet}
            containerStyle={{ marginBottom: 16 }}
          />
          <Input
            label="أقرب معلم بارز"
            placeholder="مسجد، مدرسة، مستشفى..."
            value={landmark}
            onChangeText={setLandmark}
            containerStyle={{ marginBottom: 16 }}
          />
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <Button
          title={saving ? 'جاري الحفظ...' : 'حفظ العنوان'}
          onPress={handleSave}
          disabled={!street || saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: 60, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: COLORS.background },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'El Messiri' },
  scrollContent: { paddingBottom: 100 },
  mapContainer: { height: 200, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
  mapEmoji: { fontSize: 40, opacity: 0.5 },
  mapText: { color: '#1976D2', marginTop: 10, fontWeight: '600' },
  mapHint: { fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center', marginTop: 8, fontWeight: '600' },
  formCard: { margin: SPACING.md, padding: SPACING.md, marginTop: -20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginBottom: 16, fontFamily: 'El Messiri' },
  inputLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, marginBottom: 8, fontWeight: '500', fontFamily: 'IBM Plex Sans Arabic' },
  labelsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  labelChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  labelChipActive: { backgroundColor: `${COLORS.primary}15`, borderColor: COLORS.primary },
  labelChipText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: 'IBM Plex Sans Arabic', fontWeight: '500' },
  labelChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  areasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  areaChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  areaChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  areaChipText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: 'IBM Plex Sans Arabic', fontWeight: '500' },
  areaChipTextActive: { color: COLORS.surface },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, padding: SPACING.md, paddingBottom: 30, borderTopWidth: 1, borderTopColor: COLORS.border },
});
