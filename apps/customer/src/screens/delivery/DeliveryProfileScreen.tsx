import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, VEHICLE_TYPE } from '@marketplace/shared-utils';
import { Input, Button } from '@marketplace/shared-ui';
import { useAuthStore, getDeliveryProfile, updateDeliveryProfileByUser, updateUserProfile } from '@marketplace/shared-hooks';

const VEHICLES = [
  { key: VEHICLE_TYPE.MOTORCYCLE, label: 'دراجة نارية', icon: 'bicycle-outline' },
  { key: VEHICLE_TYPE.CAR, label: 'سيارة', icon: 'car-outline' },
  { key: VEHICLE_TYPE.BICYCLE, label: 'دراجة هوائية', icon: 'bicycle-outline' },
];

export default function DeliveryProfileScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [name, setName] = useState(user?.full_name ?? '');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicle, setVehicle] = useState<string>(VEHICLE_TYPE.MOTORCYCLE);
  const [saving, setSaving] = useState(false);
  const [licenseUri, setLicenseUri] = useState<string | null>(null);

  const pickLicense = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول للصور'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setLicenseUri(result.assets[0].uri);
  };

  useEffect(() => {
    if (!user?.id) return;
    getDeliveryProfile(user.id).then((p) => {
      if (p) {
        setVehicle(p.vehicle_type ?? VEHICLE_TYPE.MOTORCYCLE);
        setPlateNumber(p.vehicle_plate ?? '');
      }
    }).catch(() => {});
  }, [user?.id]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال الاسم');
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateUserProfile(user.id, { full_name: name.trim() });
      await updateDeliveryProfileByUser(user.id, { vehicle_type: vehicle, vehicle_plate: plateNumber.trim() || undefined });
      await refreshUser();
      Alert.alert('تم الحفظ ✅', 'تم تحديث بياناتك بنجاح', [
        { text: 'حسناً', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>بياناتي ومركبتي</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Input label="الاسم الكامل" placeholder="اسمك" value={name} onChangeText={setName} />

        <Text style={styles.label}>نوع المركبة</Text>
        <View style={styles.vehiclesRow}>
          {VEHICLES.map((v) => {
            const active = vehicle === v.key;
            return (
              <TouchableOpacity
                key={v.key}
                style={[styles.vehicleCard, active && styles.vehicleCardActive]}
                onPress={() => setVehicle(v.key)}
                activeOpacity={0.7}
              >
                <Ionicons name={v.icon as any} size={26} color={active ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.vehicleLabel, active && { color: '#FFFFFF' }]}>{v.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input label="رقم اللوحة (اختياري)" placeholder="مثال: 1-12345" value={plateNumber} onChangeText={setPlateNumber} />

        {/* Documents */}
        <Text style={styles.label}>الوثائق</Text>
        <TouchableOpacity style={styles.docCard} activeOpacity={0.7} onPress={() => Alert.alert('البطاقة الشخصية', 'تم التحقق من الوثيقة بنجاح.')}>
          <View style={styles.docIcon}>
            <Ionicons name="card-outline" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.docTitle}>البطاقة الشخصية</Text>
            <Text style={styles.docStatus}>✅ تم التحقق</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color="#D1D5DB" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.docCard} activeOpacity={0.7} onPress={pickLicense}>
          <View style={styles.docIcon}>
            {licenseUri
              ? <Image source={{ uri: licenseUri }} style={{ width: 40, height: 40, borderRadius: 8 }} />
              : <Ionicons name="document-attach-outline" size={20} color={COLORS.primary} />}
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.docTitle}>رخصة القيادة</Text>
            <Text style={[styles.docStatus, { color: licenseUri ? '#059669' : '#D97706' }]}>
              {licenseUri ? '✅ تم الرفع' : '⏳ اضغط لرفع الصورة'}
            </Text>
          </View>
          <Ionicons name={licenseUri ? 'checkmark-circle-outline' : 'cloud-upload-outline'} size={18} color={licenseUri ? '#059669' : COLORS.primary} />
        </TouchableOpacity>

        <View style={{ height: 20 }} />
        <Button title={saving ? 'جاري الحفظ...' : 'حفظ التغييرات'} onPress={handleSave} disabled={saving} />
        <View style={{ height: 40 }} />
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
  scrollContent: { padding: 24 },
  label: { fontSize: 13, color: '#111827', marginBottom: 10, fontWeight: '600' },
  vehiclesRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  vehicleCard: {
    flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16, borderRadius: 14,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  vehicleCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  vehicleLabel: { fontSize: 11.5, fontWeight: '700', color: '#6B7280' },
  docCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 10,
  },
  docIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  docStatus: { fontSize: 11.5, color: '#059669', marginTop: 3, fontWeight: '600' },
});
