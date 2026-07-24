import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import {
  getNotificationPreferences,
  NotificationPreferences,
  updateNotificationPreferences,
} from '@marketplace/shared-hooks';
import { configurePushNotifications } from '../services/pushNotifications';
import { Alert } from './appAlert';

type PreferenceKey = keyof NotificationPreferences;

const preferenceRows: Array<{
  key: PreferenceKey;
  title: string;
  description: string;
}> = [
  {
    key: 'notifications_enabled',
    title: 'إشعارات الجهاز',
    description: 'السماح بإرسال Push إلى أجهزتك المسجلة.',
  },
  {
    key: 'order_notifications',
    title: 'تحديثات الطلبات',
    description: 'حالة الطلب والعروض المتاحة للمندوب.',
  },
  {
    key: 'promo_notifications',
    title: 'العروض والحملات',
    description: 'الإعلانات والعروض التي ترسلها الإدارة.',
  },
];

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'تعذّر حفظ إعدادات الإشعارات.';
}

export function NotificationPreferencesCard() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState('');
  const [savingKey, setSavingKey] = useState<PreferenceKey | 'device' | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setPreferences(await getNotificationPreferences());
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    let active = true;
    getNotificationPreferences()
      .then((result) => { if (active) setPreferences(result); })
      .catch((error) => { if (active) setLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, []);

  const savePreference = async (key: PreferenceKey, value: boolean) => {
    if (!preferences || savingRef.current) return;
    savingRef.current = true;
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingKey(key);
    try {
      if (key === 'notifications_enabled' && value && Platform.OS !== 'web') {
        const registration = await configurePushNotifications(true);
        if (registration.status !== 'registered') throw new Error(registration.message);
      }
      setPreferences(await updateNotificationPreferences(next));
    } catch (error) {
      setPreferences(previous);
      Alert.alert('تعذّر حفظ الإعداد', errorMessage(error));
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  };

  const connectDevice = async () => {
    if (!preferences || savingRef.current) return;
    savingRef.current = true;
    setSavingKey('device');
    try {
      const registration = await configurePushNotifications(true);
      if (registration.status !== 'registered') throw new Error(registration.message);
      const next = { ...preferences, notifications_enabled: true };
      setPreferences(await updateNotificationPreferences(next));
      Alert.alert('تم التفعيل', 'تم ربط هذا الجهاز بإشعارات حسابك.');
    } catch (error) {
      Alert.alert('تعذّر تفعيل الإشعارات', errorMessage(error));
    } finally {
      savingRef.current = false;
      setSavingKey(null);
    }
  };

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.headingRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="options-outline" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.headingText}>
          <Text style={styles.title}>إعدادات الإشعارات</Text>
          <Text style={styles.subtitle}>تُحفظ على حسابك وتُطبق على كل الأجهزة.</Text>
        </View>
      </View>

      {!preferences && !loadError ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.muted}>جاري تحميل الإعدادات…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : preferences ? (
        <>
          {preferenceRows.map((row) => (
            <View key={row.key} style={styles.preferenceRow}>
              <View style={styles.preferenceText}>
                <Text style={styles.preferenceTitle}>{row.title}</Text>
                <Text style={styles.preferenceDescription}>{row.description}</Text>
              </View>
              <Switch
                value={preferences[row.key]}
                onValueChange={(value) => void savePreference(row.key, value)}
                disabled={savingKey !== null}
                trackColor={{ false: '#D1D5DB', true: `${COLORS.primary}70` }}
                thumbColor={preferences[row.key] ? COLORS.primary : '#F9FAFB'}
                accessibilityLabel={row.title}
                accessibilityState={{ checked: preferences[row.key], disabled: savingKey !== null }}
              />
            </View>
          ))}

          {Platform.OS !== 'web' ? (
            <TouchableOpacity
              style={styles.deviceButton}
              onPress={() => void connectDevice()}
              disabled={savingKey !== null}
              accessibilityRole="button"
              accessibilityLabel="ربط هذا الجهاز بإشعارات الحساب"
              accessibilityState={{ busy: savingKey === 'device', disabled: savingKey !== null }}
            >
              {savingKey === 'device' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="phone-portrait-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.deviceButtonText}>ربط أو تحديث هذا الجهاز</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 6,
    gap: 12,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: { flex: 1 },
  title: { color: '#111827', fontWeight: '900', fontSize: 15 },
  subtitle: { color: '#6B7280', fontSize: 11.5, lineHeight: 18, marginTop: 2 },
  loadingRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  muted: { color: '#6B7280', fontSize: 12 },
  preferenceRow: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },
  preferenceText: { flex: 1 },
  preferenceTitle: { color: '#1F2937', fontWeight: '800', fontSize: 13 },
  preferenceDescription: { color: '#6B7280', fontSize: 11, lineHeight: 17, marginTop: 2 },
  deviceButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  deviceButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  errorBox: { alignItems: 'center', gap: 9, backgroundColor: '#FEF2F2', borderRadius: 11, padding: 12 },
  errorText: { color: '#991B1B', textAlign: 'center', fontSize: 12 },
  retryButton: { minHeight: 44, justifyContent: 'center', backgroundColor: '#991B1B', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 7 },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
