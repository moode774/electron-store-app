import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS, VEHICLE_TYPE } from '@marketplace/shared-utils';
import { Input, Button } from '@marketplace/shared-ui';
import { useAuthStore, getDeliveryProfile, updateDeliveryProfileByUser, updateUserProfile } from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { useTranslation } from '../../i18n';

const VEHICLES = [
  { key: VEHICLE_TYPE.MOTORCYCLE, labelKey: 'delivery.motorcycle', icon: 'bicycle-outline' },
  { key: VEHICLE_TYPE.CAR, labelKey: 'delivery.car', icon: 'car-outline' },
  { key: VEHICLE_TYPE.BICYCLE, labelKey: 'delivery.bicycle', icon: 'bicycle-outline' },
];

export default function DeliveryProfileScreen({ navigation }: any) {
  const { t } = useTranslation();
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
      setProfileError(error instanceof Error && error.message ? error.message : t('delivery.profileLoadFailed'));
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
      Alert.alert(t('auth.alert'), t('delivery.enterName'));
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateUserProfile(user.id, { full_name: name.trim() });
      await updateDeliveryProfileByUser(user.id, { vehicle_type: vehicle, vehicle_plate: plateNumber.trim() || undefined });
      await refreshUser();
      Alert.alert(t('delivery.savedTitle'), t('delivery.savedText'), [
        { text: t('delivery.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert(t('shared.error'), e?.message ?? t('delivery.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('delivery.back')}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('delivery.profileVehicle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} keyboardShouldPersistTaps="handled">
        {profileLoading ? <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 20 }} accessibilityLabel={t('delivery.loadingProfile')} /> : null}
        {profileError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{profileError}</Text>
            <TouchableOpacity onPress={() => void loadProfile()} accessibilityRole="button" accessibilityLabel={t('delivery.reloadProfile')}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Input label={t('delivery.fullName')} placeholder={t('delivery.yourName')} value={name} onChangeText={setName} />

        <Text style={styles.label}>{t('delivery.vehicleType')}</Text>
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
                accessibilityLabel={t(v.labelKey)}
                accessibilityState={{ checked: active }}
              >
                <Ionicons name={v.icon as any} size={26} color={active ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.vehicleLabel, active && { color: '#FFFFFF' }]}>{t(v.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input label={t('delivery.plateOptional')} placeholder={t('delivery.plateExample')} value={plateNumber} onChangeText={setPlateNumber} />

        <Text style={styles.label}>{t('delivery.verificationStatus')}</Text>
        <View style={styles.docCard}>
          <View style={styles.docIcon}>
            <Ionicons name="card-outline" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.docTitle}>{t('delivery.nationalCard')}</Text>
            <Text style={[styles.docStatus, { color: hasNationalId ? '#059669' : '#D97706' }]}>
              {hasNationalId ? t('delivery.nationalDataSaved') : t('delivery.nationalDataMissing')}
            </Text>
          </View>
        </View>
        <View style={styles.docCard}>
          <View style={styles.docIcon}>
            <Ionicons name={isApproved ? 'shield-checkmark-outline' : 'time-outline'} size={20} color={isApproved ? '#059669' : '#D97706'} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.docTitle}>{t('delivery.accountApproval')}</Text>
            <Text style={[styles.docStatus, { color: isApproved ? '#059669' : '#D97706' }]}>
              {isApproved ? t('delivery.accountApproved') : t('delivery.accountPendingReview')}
            </Text>
          </View>
        </View>
        <Text style={styles.verificationNote}>{t('delivery.verificationNote')}</Text>

        <View style={{ height: 20 }} />
        <Button title={saving ? t('delivery.saving') : t('delivery.saveChanges')} onPress={handleSave} disabled={saving} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 38, paddingBottom: 18,
    width: '100%', maxWidth: 820, alignSelf: 'center',
  },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: FONTS.bold, color: COLORS.ink },
  scrollContent: { padding: 24, width: '100%', maxWidth: 820, alignSelf: 'center', paddingBottom: 80 },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, marginBottom: 18, alignItems: 'center', gap: 8 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },
  label: { fontSize: 13, color: COLORS.ink, marginBottom: 10, fontWeight: '600' },
  vehiclesRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 20 },
  vehiclesRowCompact: { flexWrap: 'wrap' },
  vehicleCard: {
    flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.hairline,
  },
  vehicleCardCompact: { flexBasis: '46%', flexGrow: 1 },
  vehicleCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  vehicleLabel: { fontSize: 11.5, fontWeight: '700', color: COLORS.inkSecondary },
  docCard: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.hairline, marginBottom: 10,
  },
  docIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.ink },
  docStatus: { fontSize: 11.5, color: '#059669', marginTop: 3, fontWeight: '600' },
  verificationNote: { fontSize: 11.5, color: COLORS.inkSecondary, lineHeight: 18, textAlign: 'right', marginBottom: 8 },
});
