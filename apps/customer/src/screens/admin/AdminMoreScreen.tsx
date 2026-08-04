import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@marketplace/shared-hooks';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminMoreStackParamList } from '../../navigation/AdminTabNavigator';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv } from '@marketplace/shared-i18n';

const UI = {
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  bg: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  success: COLORS.success,
  danger: COLORS.error,
  warning: COLORS.warning,
  info: COLORS.info,
};

type Nav = NativeStackNavigationProp<AdminMoreStackParamList>;

const MENU_ITEMS = [
  {
    title: 'مراجعة المنتجات',
    description: 'اعتماد المنتجات الجديدة أو إعادتها للتاجر مع سبب واضح',
    icon: 'cube',
    color: '#2563EB',
    bg: '#EFF6FF',
    screen: 'AdminProducts' as keyof AdminMoreStackParamList,
  },
  {
    title: 'السائقون والمندوبين',
    description: 'إدارة الموافقات ومتابعة أداء المندوبين',
    icon: 'bicycle',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    screen: 'AdminDelivery' as keyof AdminMoreStackParamList,
  },
  {
    title: 'طلبات السحب',
    description: 'معالجة طلبات الأرباح للتجار والمندوبين',
    icon: 'wallet',
    color: '#EC4899',
    bg: '#FDF2F8',
    screen: 'AdminWallet' as keyof AdminMoreStackParamList,
  },
  {
    title: 'مفاتيح API (ربط الذكاء الاصطناعي)',
    description: 'إنشاء مفاتيح لربط النظام مع Claude أو أي نموذج AI',
    icon: 'key',
    color: '#1E3A8A',
    bg: '#EEF2FF',
    screen: 'ApiKeys' as keyof AdminMoreStackParamList,
  },
  {
    title: 'طلبات الاسترجاع',
    description: 'مراجعة الاسترجاعات والموافقة أو الرفض',
    icon: 'refresh',
    color: '#D97706',
    bg: '#FFFBEB',
    screen: 'AdminRefunds' as keyof AdminMoreStackParamList,
  },
  {
    title: 'الإرجاعات المادية',
    description: 'مراجعة الكميات وجدولة الاستلام والفحص وإكمال الاسترداد',
    icon: 'return-down-back',
    color: '#0F766E',
    bg: '#CCFBF1',
    screen: 'AdminPhysicalReturns' as keyof AdminMoreStackParamList,
  },
  {
    title: 'المطابقة المالية التاريخية',
    description: 'تسوية الطلبات القديمة ذات السجل المالي الناقص قبل الاسترداد',
    icon: 'git-compare',
    color: '#7C3AED',
    bg: '#F5F3FF',
    screen: 'AdminFinancialReconciliation' as keyof AdminMoreStackParamList,
  },
  {
    title: 'تحصيلات الدفع عند الاستلام',
    description: 'مراجعة عهدة النقد وإثباتات تحويل المندوبين والنزاعات',
    icon: 'cash',
    color: '#047857',
    bg: '#ECFDF5',
    screen: 'AdminCodCollections' as keyof AdminMoreStackParamList,
  },
  {
    title: 'الدعم الفني والشكاوى',
    description: 'متابعة ومعالجة تذاكر دعم المستخدمين',
    icon: 'headset',
    color: '#F97316',
    bg: '#FFF7ED',
    screen: 'AdminSupport' as keyof AdminMoreStackParamList,
  },
  {
    title: 'مناطق الخدمة والتغطية',
    description: 'تكوين المدن وإدارة تفعيل خدمة التوصيل',
    icon: 'map',
    color: '#10B981',
    bg: '#ECFDF5',
    screen: 'AdminSettings' as keyof AdminMoreStackParamList,
  },
  {
    title: 'إدارة البنرات (CMS)',
    description: 'إدارة الإعلانات والبنرات في التطبيق',
    icon: 'images',
    color: '#0ea5e9',
    bg: '#e0f2fe',
    screen: 'AdminBanners' as keyof AdminMoreStackParamList,
  },
  {
    title: 'إدارة الكوبونات (Coupons)',
    description: 'إنشاء ومتابعة الكوبونات الشاملة للتطبيق',
    icon: 'ticket',
    color: '#f43f5e',
    bg: '#ffe4e6',
    screen: 'AdminCoupons' as keyof AdminMoreStackParamList,
  },
  {
    title: 'الحملات التسويقية (Broadcast)',
    description: 'بث التنبيهات والإشعارات لمختلف المستخدمين',
    icon: 'megaphone',
    color: '#3B82F6',
    bg: '#EFF6FF',
    screen: 'AdminBroadcast' as keyof AdminMoreStackParamList,
  },
];

export default function AdminMoreScreen() {
  const navigation = useNavigation<Nav>();
  const { user, signOut } = useAuthStore();
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const desktop = width >= BREAKPOINTS.desktop;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const cardWidth = desktop ? (contentWidth - 16) / 2 : contentWidth;

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={[s.profileSection, { width: contentWidth }]}>
          <View style={s.avatar}>
            <Ionicons name="shield-checkmark" size={26} color="#FFFFFF" />
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{tv(user?.full_name ?? t('مدير النظام'))}</Text>
            <View style={s.roleBadge}>
              <Text style={s.profileRole}>{t('المدير العام')}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingHorizontal: pagePadding }]} showsVerticalScrollIndicator={false}>
        <View style={[s.content, { width: contentWidth }]}>
        <Text style={s.sectionTitle}>{t('الوصول السريع للأدوات')}</Text>
        
        <View style={s.menuGrid}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.screen}
              style={[s.menuCard, { width: cardWidth }, compact && s.menuCardCompact]}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.8}
            >
              <View style={[s.menuIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon as any} size={26} color={item.color} />
              </View>
              <View style={s.menuTextGroup}>
                <Text style={s.menuTitle}>{tv(item.title)}</Text>
                <Text style={s.menuDesc}>{tv(item.description)}</Text>
              </View>
              <View style={s.menuArrowWrap}>
                <Ionicons name="chevron-back" size={20} color={UI.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.divider} />

        <TouchableOpacity style={s.logoutBtn} onPress={signOut} activeOpacity={0.8}>
          <Text style={s.logoutText}>{t('تسجيل الخروج من الحساب')}</Text>
          <Ionicons name="log-out" size={22} color={UI.danger} />
        </TouchableOpacity>

        <Text style={s.versionText}>{t('منصة الإدارة الذكية — الإصدار 1.0.0')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { 
    backgroundColor: UI.card, 
    paddingHorizontal: 24, 
    paddingTop: Platform.OS === 'ios' ? 70 : 50, 
    paddingBottom: 30,
    borderBottomWidth: 1, borderColor: UI.border,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
    zIndex: 10
  },
  profileSection: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: RADIUS.lg, backgroundColor: UI.primary, alignItems: 'center', justifyContent: 'center', shadowColor: UI.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  profileInfo: { alignItems: 'flex-end', gap: 4 },
  profileName: { fontSize: 22, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right' },
  roleBadge: { backgroundColor: UI.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm },
  profileRole: { fontSize: 13, color: UI.primary, fontFamily: FONTS.semiBold, textAlign: 'right' },
  scroll: { alignItems: 'center', paddingTop: 20, paddingBottom: 112 },
  content: { maxWidth: 1280, gap: 16 },
  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, marginBottom: 8, textAlign: 'right' },
  menuGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16 },
  menuCard: { minHeight: 112, backgroundColor: UI.card, borderRadius: RADIUS.lg, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 16, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: UI.border },
  menuCardCompact: { paddingHorizontal: 14, gap: 12 },
  menuIcon: { width: 56, height: 56, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  menuTextGroup: { flex: 1, alignItems: 'flex-end' },
  menuTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right', marginBottom: 4 },
  menuDesc: { fontSize: 13, color: UI.textMuted, textAlign: 'right', fontFamily: FONTS.regular, lineHeight: 20 },
  menuArrowWrap: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 12 },
  logoutBtn: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.accentCoralSoft, borderRadius: RADIUS.md, paddingVertical: 14, borderWidth: 1, borderColor: COLORS.accentCoralSoft },
  logoutText: { fontSize: 16, fontFamily: FONTS.bold, color: UI.danger },
  versionText: { fontSize: 12, color: UI.textMuted, textAlign: 'center', marginTop: 24, fontFamily: FONTS.medium, letterSpacing: 0.5 },
});
