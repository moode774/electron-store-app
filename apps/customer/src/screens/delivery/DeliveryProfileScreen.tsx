import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, VEHICLE_TYPE } from '@marketplace/shared-utils';
import { Input, Button } from '@marketplace/shared-ui';
import { useAuthStore, getDeliveryProfile, updateDeliveryProfileByUser, updateUserProfile } from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { t, tv } from '@marketplace/shared-i18n';

const VEHICLES = [
  { key: VEHICLE_TYPE.MOTORCYCLE, label: 'دراجة نارية', icon: 'bicycle-outline' },
  { key: VEHICLE_TYPE.CAR, label: 'سيارة', icon: 'car-outline' },
  { key: VEHICLE_TYPE.BICYCLE, label: 'دراجة هوائية', icon: 'bicycle-outline' },
];

export default function DeliveryProfileScreen({ navigation }: any) {
  const layout = useResponsiveLayout(820);
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [name, setName] = useState(user?.full_name ?? '');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicle, setVehicle] = useState<string>(VEHICLE_TYPE.MOTORCYCLE);
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [hasNationalId, setHasNationalId] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfileLoading(false);
      return;
    }
    setProfileError('');
    try {
      const p = await getDeliveryProfile(user.id);
      if (p) {
        setVehicle(p.vehicle_type ?? VEHICLE_TYPE.MOTORCYCLE);
        setPlateNumber(p.vehicle_plate ?? '');
        setIsApproved(p.is_approved);
        setHasNationalId(Boolean(p.national_id));
      }
    } catch (error) {
      setProfileError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل بيانات المندوب.');
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    setProfileLoading(true);
    void loadProfile();
  }, [loadProfile]));

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
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('العودة')}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('بياناتي ومركبتي')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} keyboardShouldPersistTaps="handled">
        {profileLoading ? <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 20 }} accessibilityLabel={t('جاري تحميل بيانات المندوب')} /> : null}
        {profileError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{tv(profileError)}</Text>
            <TouchableOpacity onPress={() => void loadProfile()} accessibilityRole="button" accessibilityLabel={t('إعادة تحميل بيانات المندوب')}>
              <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Input label={t('الاسم الكامل')} placeholder={t('اسمك')} value={name} onChangeText={setName} />

        <Text style={styles.label}>{t('نوع المركبة')}</Text>
        <View style={[styles.vehiclesRow, layout.compact && styles.vehiclesRowCompact]}>
          {VEHICLES.map((v) => {
            const active = vehicle === v.key;
            return (
              <TouchableOpacity
                key={v.key}
                style={[styles.vehicleCard, layout.compact && styles.vehicleCardCompact, active && styles.vehicleCardActive]}
                onPress={() => setVehicle(v.key)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={tv(v.label)}
                accessibilityState={{ checked: active }}
              >
                <Ionicons name={v.icon as any} size={26} color={active ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.vehicleLabel, active && { color: '#FFFFFF' }]}>{tv(v.label)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input label={t('رقم اللوحة (اختياري)')} placeholder={t('مثال: 1-12345')} value={plateNumber} onChangeText={setPlateNumber} />

        <Text style={styles.label}>{t('حالة التحقق')}</Text>
        <View style={styles.docCard}>
          <View style={styles.docIcon}>
            <Ionicons name="card-outline" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.docTitle}>{t('البطاقة الشخصية')}</Text>
            <Text style={[styles.docStatus, { color: hasNationalId ? '#059669' : '#D97706' }]}>
              {tv(hasNationalId ? t('البيانات مسجلة لدى الإدارة') : t('لم تُسجّل بيانات البطاقة بعد'))}
            </Text>
          </View>
        </View>
        <View style={styles.docCard}>
          <View style={styles.docIcon}>
            <Ionicons name={isApproved ? 'shield-checkmark-outline' : 'time-outline'} size={20} color={isApproved ? '#059669' : '#D97706'} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.docTitle}>{t('اعتماد حساب المندوب')}</Text>
            <Text style={[styles.docStatus, { color: isApproved ? '#059669' : '#D97706' }]}>
              {tv(isApproved ? t('الحساب معتمد') : t('الحساب بانتظار مراجعة الإدارة'))}
            </Text>
          </View>
        </View>
        <Text style={styles.verificationNote}>{t('رفع الوثائق والتحقق منها يحتاجان مسارًا آمنًا لدى الإدارة، لذلك لا يعرض التطبيق حالة تحقق غير مؤكدة.')}</Text>

        <View style={{ height: 20 }} />
        <Button title={saving ? t('جاري الحفظ...') : t('حفظ التغييرات')} onPress={handleSave} disabled={saving} />
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
    width: '100%', maxWidth: 820, alignSelf: 'center',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scrollContent: { padding: 24, width: '100%', maxWidth: 820, alignSelf: 'center', paddingBottom: 80 },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, marginBottom: 18, alignItems: 'center', gap: 8 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },
  label: { fontSize: 13, color: '#111827', marginBottom: 10, fontWeight: '600' },
  vehiclesRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  vehiclesRowCompact: { flexWrap: 'wrap' },
  vehicleCard: {
    flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16, borderRadius: 14,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  vehicleCardCompact: { flexBasis: '46%', flexGrow: 1 },
  vehicleCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  vehicleLabel: { fontSize: 11.5, fontWeight: '700', color: '#6B7280' },
  docCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 10,
  },
  docIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontSize: 13.5, fontWeight: '700', color: '#111827' },
  docStatus: { fontSize: 11.5, color: '#059669', marginTop: 3, fontWeight: '600' },
  verificationNote: { fontSize: 11.5, color: '#6B7280', lineHeight: 18, textAlign: 'right', marginBottom: 8 },
});
