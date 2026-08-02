import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import * as Location from 'expo-location';
import { Alert } from '../../../components/appAlert';
import { COLORS, SPACING, FONT_SIZE, RADIUS, SERVICE_AREAS, FONTS } from '@marketplace/shared-utils';
import { Button, Input, Card } from '@marketplace/shared-ui';
import { useAuthStore, createAddress } from '@marketplace/shared-hooks';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';

export default function AddAddressScreen({ navigation }: any) {
  const layout = useCustomerLayout(820);
  const user = useAuthStore((s) => s.user);
  const [label, setLabel] = useState('المنزل');
  const [selectedArea, setSelectedArea] = useState<string>(SERVICE_AREAS.SANAA);
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const LABELS = ['المنزل', 'العمل', 'أخرى'];

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('إذن الموقع', 'لم يتم السماح بالوصول إلى الموقع. فعّل إذن الموقع من إعدادات الجهاز.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoords(current);

      try {
        const reverseResults = await Location.reverseGeocodeAsync(current);
        const place = reverseResults?.[0];
        if (place) {
          const detectedCity = place.city || place.region || place.subregion || '';
          if (detectedCity.includes('عدن') || detectedCity.includes('Aden')) setSelectedArea(SERVICE_AREAS.ADEN);
          else if (detectedCity.includes('إب') || detectedCity.includes('Ibb')) setSelectedArea(SERVICE_AREAS.IBB);
          else if (detectedCity.includes('تعز') || detectedCity.includes('Taiz')) setSelectedArea(SERVICE_AREAS.TAIZ);
          else setSelectedArea(SERVICE_AREAS.SANAA);

          const detectedStreet = [place.street, place.district, place.subregion, place.name]
            .filter(Boolean)
            .join(' - ');
          if (detectedStreet) setStreet(detectedStreet);
          if (place.name && !landmark) setLandmark(place.name);
        }
      } catch {
        // الإحداثيات كافية حتى لو فشل تحويلها إلى عنوان نصي
      }

      if (!street) {
        setStreet((prev) => prev || `موقعي الحالي (${current.latitude.toFixed(4)}, ${current.longitude.toFixed(4)})`);
      }
      Alert.alert('تم تحديد موقعك 📍', 'تم جلب إحداثياتك وسيتم حفظها مع العنوان.');
    } catch {
      Alert.alert('خطأ في تحديد الموقع', 'تعذّر جلب موقعك. تأكد من تفعيل GPS والسماح بالصلاحيات.');
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
        latitude: coords?.latitude,
        longitude: coords?.longitude,
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
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة">
            <Text style={styles.backIcon}>→</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>إضافة عنوان</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} keyboardShouldPersistTaps="handled">
        <View style={styles.contentInner}>
        
        {/* تحديد الموقع الحالي */}
        <View style={styles.mapContainer}>
          <Text style={styles.mapEmoji}>{coords ? '📍' : '🗺️'}</Text>
          <Text style={styles.mapText}>
            {coords
              ? `تم تحديد موقعك (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`
              : 'حدد موقعك لتعبئة العنوان تلقائياً'}
          </Text>
          <Button
            title={locating ? 'جاري تحديد الموقع...' : coords ? 'إعادة تحديد الموقع' : 'تحديد الموقع الحالي'}
            style={styles.locationButton}
            onPress={handleUseCurrentLocation}
            disabled={locating}
          />
        </View>

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

        </View>
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={[styles.bottomBarInner, { paddingHorizontal: layout.gutter }]}>
          <Button
            title={saving ? 'جاري الحفظ...' : 'حفظ العنوان'}
            onPress={handleSave}
            disabled={!street || saving}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingTop: 48, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerInner: { width: '100%', maxWidth: 820, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.background },
  headerSpacer: { width: 44 },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.bold },
  scrollContent: { paddingBottom: 132 },
  contentInner: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  mapContainer: { minHeight: 220, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg, marginTop: 16, padding: 20 },
  mapEmoji: { fontSize: 40, opacity: 0.5 },
  mapText: { color: '#1976D2', marginTop: 10, fontWeight: '600' },
  locationButton: { minWidth: 200, minHeight: 44, marginTop: 12 },
  formCard: { width: '100%', padding: SPACING.md, marginTop: 16 },
  sectionTitle: { fontSize: 16, color: COLORS.primary, marginBottom: 16, fontFamily: FONTS.bold },
  inputLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, marginBottom: 8, fontFamily: FONTS.medium },
  labelsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  labelChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  labelChipActive: { backgroundColor: `${COLORS.primary}15`, borderColor: COLORS.primary },
  labelChipText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  labelChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  areasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  areaChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  areaChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  areaChipText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  areaChipTextActive: { color: COLORS.surface },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  bottomBarInner: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingTop: 12, paddingBottom: 24 },
});
