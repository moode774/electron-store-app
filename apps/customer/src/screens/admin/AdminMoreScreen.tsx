import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@marketplace/shared-hooks';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminMoreStackParamList } from '../../navigation/AdminTabNavigator';
import { BREAKPOINTS, COLORS, FONTS } from '@marketplace/shared-utils';
import { useTranslation } from '../../i18n';

type Nav = NativeStackNavigationProp<AdminMoreStackParamList>;
const MENU_ITEMS = [
  { titleKey: 'adminUi.platformSettings', descriptionKey: 'adminUi.platformSettingsDesc', icon: 'settings-outline', screen: 'AdminSettings' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.notificationsCenter', descriptionKey: 'adminUi.notificationsCenterDesc', icon: 'notifications-outline', screen: 'AdminNotifications' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.reviewProducts', descriptionKey: 'adminUi.reviewProductsDesc', icon: 'cube', screen: 'AdminProducts' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.driversManagement', descriptionKey: 'adminUi.driversManagementDesc', icon: 'bicycle', screen: 'AdminDelivery' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.withdrawals', descriptionKey: 'adminUi.withdrawalsDesc', icon: 'wallet', screen: 'AdminWallet' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.apiKeys', descriptionKey: 'adminUi.apiKeysDesc', icon: 'key', screen: 'ApiKeys' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.refunds', descriptionKey: 'adminUi.refundsDesc', icon: 'refresh', screen: 'AdminRefunds' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.physicalReturns', descriptionKey: 'adminUi.physicalReturnsDesc', icon: 'return-down-back', screen: 'AdminPhysicalReturns' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.financialReconciliation', descriptionKey: 'adminUi.financialReconciliationDesc', icon: 'git-compare', screen: 'AdminFinancialReconciliation' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.codCollections', descriptionKey: 'adminUi.codCollectionsDesc', icon: 'cash', screen: 'AdminCodCollections' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.technicalSupport', descriptionKey: 'adminUi.technicalSupportDesc', icon: 'headset', screen: 'AdminSupport' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.bannersCms', descriptionKey: 'adminUi.bannersCmsDesc', icon: 'images', screen: 'AdminBanners' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.couponsManagement', descriptionKey: 'adminUi.couponsManagementDesc', icon: 'ticket', screen: 'AdminCoupons' as keyof AdminMoreStackParamList },
  { titleKey: 'adminUi.broadcast', descriptionKey: 'adminUi.broadcastDesc', icon: 'megaphone', screen: 'AdminBroadcast' as keyof AdminMoreStackParamList },
];


const GROUPS = [
  { titleKey: 'adminUi.groupOperations', screens: ['AdminProducts', 'AdminDelivery', 'AdminSupport'] },
  { titleKey: 'adminUi.groupFinance', screens: ['AdminWallet', 'AdminRefunds', 'AdminPhysicalReturns', 'AdminCodCollections', 'AdminFinancialReconciliation'] },
  { titleKey: 'adminUi.groupMarketing', screens: ['AdminBanners', 'AdminCoupons', 'AdminBroadcast', 'AdminNotifications'] },
  { titleKey: 'adminUi.groupPlatform', screens: ['AdminSettings', 'ApiKeys'] },
] as const;
export default function AdminMoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const signOut = useAuthStore(s => s.signOut);
  const [search, setSearch] = useState('');
  const { width } = useWindowDimensions();
  const desktop = width >= BREAKPOINTS.desktop;
  const query = search.trim();
  const matches = MENU_ITEMS.filter(item => (t(item.titleKey) + ' ' + t(item.descriptionKey)).includes(query));
  return <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, 16) }]} keyboardShouldPersistTaps="handled">
    <View style={s.heading}>
      <View style={s.icon}><Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} /></View>
      <View style={{ flex: 1 }}><Text style={s.title}>{t('adminUi.appManagement')}</Text><Text style={s.subtitle}>{t('adminUi.appManagementDesc')}</Text></View>
    </View>
    <View style={s.search}>
      <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
      <TextInput value={search} onChangeText={setSearch} placeholder={t('adminUi.searchTool')} accessibilityLabel={t('adminUi.searchAdminTools')} style={s.input} />
      {!!search && <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel={t('adminUi.clearSearch')} style={s.clear}><Ionicons name="close" size={20} color={COLORS.textMuted} /></TouchableOpacity>}
    </View>
    <Text style={s.subtitle}>{matches.length} {t('adminUi.adminTools')}</Text>
    {GROUPS.map(group => {
      const items = matches.filter(item => group.screens.includes(item.screen));
      if (!items.length) return null;
      return <View key={group.titleKey} style={s.section}>
        <Text style={s.sectionTitle}>{t(group.titleKey)}</Text>
        <View style={s.grid}>{items.map(item => <TouchableOpacity key={item.screen} accessibilityRole="button" accessibilityLabel={t(item.titleKey)} onPress={() => navigation.navigate(item.screen)} style={[s.card, desktop && s.desktopCard]} activeOpacity={0.7}>
          <View style={s.icon}><Ionicons name={item.icon as any} size={22} color={COLORS.primary} /></View>
          <View style={s.copy}><Text style={s.cardTitle}>{t(item.titleKey)}</Text><Text style={s.description}>{t(item.descriptionKey)}</Text></View>
          <Ionicons name="chevron-back" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>)}</View>
      </View>;
    })}
    {!matches.length && <Text style={s.empty}>{t('adminUi.noMatchingTools')}</Text>}
    <TouchableOpacity onPress={signOut} style={s.logout} accessibilityRole="button"><Ionicons name="log-out-outline" size={20} color={COLORS.error} /><Text style={s.logoutText}>{t('adminUi.signOut')}</Text></TouchableOpacity>
  </ScrollView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 18, paddingBottom: 36, gap: 14 },
  heading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 6 },
  title: { fontFamily: FONTS.bold, fontSize: 25, color: COLORS.textPrimary, textAlign: 'right' },
  subtitle: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 20, color: COLORS.textSecondary, textAlign: 'right' },
  search: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 15, paddingHorizontal: 13, minHeight: 46 },
  input: { flex: 1, minWidth: 0, textAlign: 'right', fontFamily: FONTS.regular, fontSize: 16, color: COLORS.textPrimary, paddingVertical: 10 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 9, marginTop: 2 },
  sectionTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: COLORS.textPrimary, textAlign: 'right' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9 },
  card: { width: '100%', minHeight: 78, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, padding: 12, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  desktopCard: { width: '49%' },
  icon: { width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: COLORS.textPrimary, textAlign: 'right' },
  description: { fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 18, color: COLORS.textSecondary, textAlign: 'right' },
  empty: { padding: 24, textAlign: 'center', color: COLORS.textMuted, fontFamily: FONTS.regular },
  logout: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 46, marginTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  logoutText: { color: COLORS.error, fontFamily: FONTS.medium, fontSize: 14 },
});
