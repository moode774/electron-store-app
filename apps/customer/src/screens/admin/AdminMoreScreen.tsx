import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@marketplace/shared-hooks';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminMoreStackParamList } from '../../navigation/AdminTabNavigator';
import { BREAKPOINTS, COLORS, FONTS } from '@marketplace/shared-utils';

type Nav = NativeStackNavigationProp<AdminMoreStackParamList>;
const MENU_ITEMS = [
  { title: 'إعدادات المنصة', description: 'العمولات ورسوم التوصيل ومناطق الخدمة', icon: 'settings-outline', screen: 'AdminSettings' as keyof AdminMoreStackParamList },
  { title: 'مركز الإشعارات', description: 'متابعة تنبيهات المنصة', icon: 'notifications-outline', screen: 'AdminNotifications' as keyof AdminMoreStackParamList },
  {
    title: 'مراجعة المنتجات',
    description: 'اعتماد المنتجات الجديدة أو إعادتها للتاجر مع سبب واضح',
    icon: 'cube',
    screen: 'AdminProducts' as keyof AdminMoreStackParamList,
  },
  {
    title: 'السائقون والمندوبين',
    description: 'إدارة الموافقات ومتابعة أداء المندوبين',
    icon: 'bicycle',
    screen: 'AdminDelivery' as keyof AdminMoreStackParamList,
  },
  {
    title: 'طلبات السحب',
    description: 'معالجة طلبات الأرباح للتجار والمندوبين',
    icon: 'wallet',
    screen: 'AdminWallet' as keyof AdminMoreStackParamList,
  },
  {
    title: 'مفاتيح API (ربط الذكاء الاصطناعي)',
    description: 'إنشاء مفاتيح لربط النظام مع Claude أو أي نموذج AI',
    icon: 'key',
    screen: 'ApiKeys' as keyof AdminMoreStackParamList,
  },
  {
    title: 'طلبات الاسترجاع',
    description: 'مراجعة الاسترجاعات والموافقة أو الرفض',
    icon: 'refresh',
    screen: 'AdminRefunds' as keyof AdminMoreStackParamList,
  },
  {
    title: 'الإرجاعات المادية',
    description: 'مراجعة الكميات وجدولة الاستلام والفحص وإكمال الاسترداد',
    icon: 'return-down-back',
    screen: 'AdminPhysicalReturns' as keyof AdminMoreStackParamList,
  },
  {
    title: 'المطابقة المالية التاريخية',
    description: 'تسوية الطلبات القديمة ذات السجل المالي الناقص قبل الاسترداد',
    icon: 'git-compare',
    screen: 'AdminFinancialReconciliation' as keyof AdminMoreStackParamList,
  },
  {
    title: 'تحصيلات الدفع عند الاستلام',
    description: 'مراجعة عهدة النقد وإثباتات تحويل المندوبين والنزاعات',
    icon: 'cash',
    screen: 'AdminCodCollections' as keyof AdminMoreStackParamList,
  },
  {
    title: 'الدعم الفني والشكاوى',
    description: 'متابعة ومعالجة تذاكر دعم المستخدمين',
    icon: 'headset',
    screen: 'AdminSupport' as keyof AdminMoreStackParamList,
  },
  {
    title: 'إدارة البنرات (CMS)',
    description: 'إدارة الإعلانات والبنرات في التطبيق',
    icon: 'images',
    screen: 'AdminBanners' as keyof AdminMoreStackParamList,
  },
  {
    title: 'إدارة الكوبونات (Coupons)',
    description: 'إنشاء ومتابعة الكوبونات الشاملة للتطبيق',
    icon: 'ticket',
    screen: 'AdminCoupons' as keyof AdminMoreStackParamList,
  },
  {
    title: 'الحملات التسويقية (Broadcast)',
    description: 'بث التنبيهات والإشعارات لمختلف المستخدمين',
    icon: 'megaphone',
    screen: 'AdminBroadcast' as keyof AdminMoreStackParamList,
  },
];


const GROUPS = [
  { title: 'التشغيل وخدمة العملاء', screens: ['AdminProducts', 'AdminDelivery', 'AdminSupport'] },
  { title: 'المالية والاسترجاع', screens: ['AdminWallet', 'AdminRefunds', 'AdminPhysicalReturns', 'AdminCodCollections', 'AdminFinancialReconciliation'] },
  { title: 'التسويق والتواصل', screens: ['AdminBanners', 'AdminCoupons', 'AdminBroadcast', 'AdminNotifications'] },
  { title: 'إعدادات المنصة والتكاملات', screens: ['AdminSettings', 'ApiKeys'] },
];
export default function AdminMoreScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const signOut = useAuthStore(s => s.signOut);
  const [search, setSearch] = useState('');
  const { width } = useWindowDimensions();
  const desktop = width >= BREAKPOINTS.desktop;
  const query = search.trim();
  const matches = MENU_ITEMS.filter(item => (item.title + ' ' + item.description).includes(query));
  return <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, 16) }]} keyboardShouldPersistTaps="handled">
    <View style={s.heading}>
      <View style={s.icon}><Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} /></View>
      <View style={{ flex: 1 }}><Text style={s.title}>إدارة التطبيق</Text><Text style={s.subtitle}>إدارة جميع المتاجر والعمليات من مكان واحد</Text></View>
    </View>
    <View style={s.search}>
      <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
      <TextInput value={search} onChangeText={setSearch} placeholder="ابحث عن أداة أو إعداد…" accessibilityLabel="البحث في أدوات الإدارة" style={s.input} />
      {!!search && <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="مسح البحث" style={s.clear}><Ionicons name="close" size={20} color={COLORS.textMuted} /></TouchableOpacity>}
    </View>
    <Text style={s.subtitle}>{matches.length} أداة إدارية</Text>
    {GROUPS.map(group => {
      const items = matches.filter(item => group.screens.includes(item.screen));
      if (!items.length) return null;
      return <View key={group.title} style={s.section}>
        <Text style={s.sectionTitle}>{group.title}</Text>
        <View style={s.grid}>{items.map(item => <TouchableOpacity key={item.screen} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => navigation.navigate(item.screen)} style={[s.card, desktop && s.desktopCard]} activeOpacity={0.7}>
          <View style={s.icon}><Ionicons name={item.icon as any} size={22} color={COLORS.primary} /></View>
          <View style={s.copy}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.description}>{item.description}</Text></View>
          <Ionicons name="chevron-back" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>)}</View>
      </View>;
    })}
    {!matches.length && <Text style={s.empty}>لا توجد أدوات مطابقة. جرّب اسمًا آخر.</Text>}
    <TouchableOpacity onPress={signOut} style={s.logout} accessibilityRole="button"><Ionicons name="log-out-outline" size={20} color={COLORS.error} /><Text style={s.logoutText}>تسجيل الخروج</Text></TouchableOpacity>
  </ScrollView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: 16, paddingBottom: 32, gap: 16 },
  heading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 8 },
  title: { fontFamily: FONTS.bold, fontSize: 23, color: COLORS.textPrimary, textAlign: 'right' },
  subtitle: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 20, color: COLORS.textSecondary, textAlign: 'right' },
  search: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  input: { flex: 1, minWidth: 0, textAlign: 'right', fontFamily: FONTS.regular, fontSize: 16, color: COLORS.textPrimary, paddingVertical: 10 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 10 },
  sectionTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: COLORS.textPrimary, textAlign: 'right' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  card: { width: '100%', minHeight: 82, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  desktopCard: { width: '49%' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  cardTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: COLORS.textPrimary, textAlign: 'right' },
  description: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 19, color: COLORS.textSecondary, textAlign: 'right' },
  empty: { padding: 24, textAlign: 'center', color: COLORS.textMuted, fontFamily: FONTS.regular },
  logout: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 48, marginTop: 8 },
  logoutText: { color: COLORS.error, fontFamily: FONTS.medium, fontSize: 14 },
});
