import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore, useAuthStore } from '@marketplace/shared-hooks';

export default function SettingsScreen({ navigation }: any): React.JSX.Element {
  const colors = useSettingsStore((s) => s.colors);
  const t = useSettingsStore((s) => s.t);
  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const confirmDelete = () => {
    Alert.alert(
      t('account.delete'),
      'سيتم حذف حسابك وكل بياناتك نهائياً ولا يمكن التراجع. متأكد؟',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => { const { error } = await deleteAccount(); if (error) Alert.alert(t('common.error'), error); },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {navigation?.goBack && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('account.settings')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* اللغة */}
        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.language')}</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['ar', 'en'] as const).map((lang) => (
            <TouchableOpacity key={lang} style={styles.optRow} onPress={() => setLanguage(lang)}>
              <Text style={[styles.optText, { color: colors.textPrimary }]}>
                {lang === 'ar' ? t('settings.arabic') : t('settings.english')}
              </Text>
              {language === lang && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* المظهر */}
        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.theme')}</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.optRow}>
            <Text style={[styles.optText, { color: colors.textPrimary }]}>{t('settings.dark')}</Text>
            <Switch value={theme === 'dark'} onValueChange={toggleTheme} />
          </View>
        </View>

        {/* الحساب */}
        <View style={{ height: 24 }} />
        <TouchableOpacity style={[styles.card, styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={signOut}>
          <Ionicons name="log-out-outline" size={22} color={colors.info} />
          <Text style={[styles.actionText, { color: colors.textPrimary }]}>{t('account.logout')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteRow} onPress={confirmDelete}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
          <Text style={[styles.deleteText, { color: colors.error }]}>{t('account.delete')}</Text>
        </TouchableOpacity>

        {/* اللغة الإنجليزية تتطلب إعادة تشغيل لتطبيق اتجاه RTL بالكامل */}
        {language === 'en' && (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Some layout changes for LTR apply after an app restart.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 22 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  section: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 8, paddingHorizontal: 4 },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  optText: { fontSize: 15, fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  actionText: { fontSize: 15, fontWeight: '700' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  deleteText: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 16 },
});
