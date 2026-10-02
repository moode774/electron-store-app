import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DirectionalIcon } from '../../../components/DirectionalIcon';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { useTranslation } from '../../../i18n';

const CONTENT_KEYS = {
  privacy: {
    title: 'customer.privacyTitle',
    sections: [
      { h: 'customer.privacy1h', p: 'customer.privacy1p' },
      { h: 'customer.privacy2h', p: 'customer.privacy2p' },
      { h: 'customer.privacy3h', p: 'customer.privacy3p' },
      { h: 'customer.privacy4h', p: 'customer.privacy4p' },
      { h: 'customer.privacy5h', p: 'customer.privacy5p' },
    ],
  },
  terms: {
    title: 'customer.termsTitle',
    sections: [
      { h: 'customer.terms1h', p: 'customer.terms1p' },
      { h: 'customer.terms2h', p: 'customer.terms2p' },
      { h: 'customer.terms3h', p: 'customer.terms3p' },
      { h: 'customer.terms4h', p: 'customer.terms4p' },
      { h: 'customer.terms5h', p: 'customer.terms5p' },
      { h: 'customer.terms6h', p: 'customer.terms6p' },
    ],
  },
} as const;

export default function LegalScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const layout = useCustomerLayout(820);
  const type: 'privacy' | 'terms' = route?.params?.type ?? 'terms';
  const content = CONTENT_KEYS[type];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('merchant.back')}>
            <DirectionalIcon name="arrow-forward" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t(content.title)}</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>{t('customer.lastUpdated')}</Text>
        {content.sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(s.h)}</Text>
            <Text style={styles.sectionBody}>{t(s.p)}</Text>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingTop: Platform.OS === 'ios' ? 48 : 32 },
  headerInner: { width: '100%', maxWidth: 820, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, paddingHorizontal: 12, fontSize: 18, fontFamily: FONTS.bold, color: COLORS.textPrimary, textAlign: 'center' },
  scrollContent: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingTop: 24, paddingBottom: 48 },
  updated: { fontSize: 12, color: '#9CA3AF', marginBottom: 20, fontWeight: '600' },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.textPrimary, marginBottom: 8 },
  sectionBody: { fontSize: 13.5, fontFamily: FONTS.regular, color: COLORS.textSecondary, lineHeight: 23, textAlign: 'right' },
});
