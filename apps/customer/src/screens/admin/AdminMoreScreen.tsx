import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@marketplace/shared-hooks';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminMoreStackParamList } from '../../navigation/AdminTabNavigator';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#059669',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
};

type Nav = NativeStackNavigationProp<AdminMoreStackParamList>;

const MENU_ITEMS = [
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

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.profileSection}>
          <View style={s.avatar}>
            <Ionicons name="shield-checkmark" size={26} color="#FFFFFF" />
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{user?.full_name ?? 'مدير النظام'}</Text>
            <View style={s.roleBadge}>
              <Text style={s.profileRole}>المدير العام</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionTitle}>الوصول السريع للأدوات</Text>
        
        <View style={s.menuGrid}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.screen}
              style={s.menuCard}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.8}
            >
              <View style={[s.menuIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon as any} size={26} color={item.color} />
              </View>
              <View style={s.menuTextGroup}>
                <Text style={s.menuTitle}>{item.title}</Text>
                <Text style={s.menuDesc}>{item.description}</Text>
              </View>
              <View style={s.menuArrowWrap}>
                <Ionicons name="chevron-back" size={20} color={UI.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.divider} />

        <TouchableOpacity style={s.logoutBtn} onPress={signOut} activeOpacity={0.8}>
          <Text style={s.logoutText}>تسجيل الخروج من الحساب</Text>
          <Ionicons name="log-out" size={22} color={UI.danger} />
        </TouchableOpacity>

        <Text style={s.versionText}>منصة الإدارة الذكية — الإصدار 1.0.0</Text>
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
  profileSection: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: UI.primary, alignItems: 'center', justifyContent: 'center', shadowColor: UI.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  profileInfo: { alignItems: 'flex-end', gap: 4 },
  profileName: { fontSize: 22, fontWeight: '900', color: UI.text, textAlign: 'right' },
  roleBadge: { backgroundColor: UI.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  profileRole: { fontSize: 13, color: UI.primary, fontWeight: '800', textAlign: 'right' },
  scroll: { padding: 20, paddingBottom: 60, gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: UI.text, marginBottom: 8, textAlign: 'right' },
  menuGrid: { gap: 14 },
  menuCard: { backgroundColor: UI.card, borderRadius: 20, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 16, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
  menuIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menuTextGroup: { flex: 1, alignItems: 'flex-end' },
  menuTitle: { fontSize: 16, fontWeight: '900', color: UI.text, textAlign: 'right', marginBottom: 4 },
  menuDesc: { fontSize: 13, color: UI.textMuted, textAlign: 'right', fontWeight: '500', lineHeight: 18 },
  menuArrowWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 12 },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 18, borderWidth: 1, borderColor: '#FEE2E2' },
  logoutText: { fontSize: 16, fontWeight: '900', color: UI.danger },
  versionText: { fontSize: 12, color: UI.textMuted, textAlign: 'center', marginTop: 24, fontWeight: '600', letterSpacing: 0.5 },
});
