import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguageStore, useTranslation } from '../i18n';

export default function LanguageSwitcher(): React.JSX.Element {
  const { language, isRTL, t } = useTranslation();
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <View style={[styles.container, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('common.language')}</Text>
      <View style={styles.options}>
        {(['ar', 'en'] as const).map((item) => (
          <TouchableOpacity
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: language === item }}
            onPress={() => void setLanguage(item)}
            style={[styles.option, language === item && styles.active]}
          >
            <Text style={[styles.optionText, language === item && styles.activeText]}>
              {item === 'ar' ? 'العربية' : 'English'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 48, alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  label: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  options: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#F3F4F6' },
  option: { minWidth: 74, minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  active: { backgroundColor: '#111827' },
  optionText: { color: '#6B7280', fontSize: 13, fontWeight: '700' },
  activeText: { color: '#FFFFFF' },
});