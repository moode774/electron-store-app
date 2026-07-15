import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, getMerchantProfile, getMerchantStats } from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';

const MENU_ITEMS = [
  { id: '1', title: 'بيانات المتجر', icon: 'storefront-outline', screen: 'StoreSettings', params: undefined },
  { id: '2', title: 'التقارير والإحصائيات', icon: 'bar-chart-outline', screen: 'Reports', params: undefined },
  { id: '3', title: 'المحفظة والمدفوعات', icon: 'wallet-outline', screen: 'Wallet', params: undefined },
  { id: '4', title: 'كوبونات المتجر', icon: 'pricetag-outline', screen: 'Coupons', params: undefined },
  { id: '4b', title: 'طلبات الاسترداد', icon: 'refresh-circle-outline', screen: 'Refunds', params: undefined },
  { id: '4c', title: 'المرتجعات الفعلية', icon: 'return-down-back-outline', screen: 'PhysicalReturns', params: undefined },
  { id: '5', title: 'الإشعارات', icon: 'notifications-outline', screen: 'RoleNotifications', params: { role: 'merchant' } },
  { id: '6', title: 'مركز المساعدة', icon: 'headset-outline', screen: 'Support', params: undefined },
  { id: '7', title: 'مفاتيح API (ربط الذكاء الاصطناعي)', icon: 'key-outline', screen: 'ApiKeys', params: undefined },
];

export default function MerchantAccountScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [stat, setStat] = useState({ todayOrders: 0, todayRevenue: 0, totalProducts: 0, pendingOrders: 0 });
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMerchantProfile>>>(null);
  const [loadError, setLoadError] = useState('');

  const loadAccount = useCallback(async () => {
    if (!user?.id) return;
    setLoadError('');
    try {
      const merchant = await getMerchantProfile(user.id);
      if (!merchant?.id) throw new Error('تعذّر العثور على ملف المتجر.');
      setProfile(merchant);
      setStat(await getMerchantStats(merchant.id));
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل بيانات حساب التاجر.');
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void loadAccount(); }, [loadAccount]));

  const STATS = [
    { id: '1', title: 'قيمة طلبات اليوم', value: `${stat.todayRevenue} ر.ي`, icon: 'cash-outline', target: 'Reports' },
    { id: '2', title: 'طلبات اليوم', value: `${stat.todayOrders}`, icon: 'cube-outline', target: 'MerchantOrders' },
    { id: '3', title: 'المنتجات', value: `${stat.totalProducts}`, icon: 'pricetags-outline', target: 'MerchantProducts' },
    { id: '4', title: 'قيد الانتظار', value: `${stat.pendingOrders}`, icon: 'time-outline', target: 'MerchantOrders' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('StoreSettings')} accessibilityRole="button" accessibilityLabel="إعدادات المتجر">
          <Ionicons name="settings-outline" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>حساب التاجر</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('RoleNotifications', { role: 'merchant' })} accessibilityRole="button" accessibilityLabel="إشعارات التاجر">
          <Ionicons name="notifications-outline" size={24} color="#111827" />
          <View style={styles.badge} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {loadError ? (
          <TouchableOpacity style={styles.errorCard} onPress={() => void loadAccount()} accessibilityRole="button" accessibilityLabel="إعادة تحميل حساب التاجر">
            <Text style={styles.errorText}>{loadError} اضغط لإعادة المحاولة.</Text>
          </TouchableOpacity>
        ) : null}

        {/* Profile Card */}
        <ImageBackground
          source={require('../../../assets/images/profile_card_art.png')}
          style={styles.profileCard}
          imageStyle={styles.profileCardBg}
        >

          {/* Center Zone: Info */}
          <View style={styles.profileZoneCenter}>
            <Text style={styles.userName}>{profile?.store_name ?? user?.full_name ?? 'متجري'}</Text>
          </View>

          {/* Right Zone: Avatar */}
          <View style={styles.profileZoneRight}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Ionicons name="storefront" size={28} color="#111827" />
              </View>
              <View style={styles.premiumBadge}>
                <Ionicons name="sparkles" size={10} color="#3B82F6" />
                <Text style={styles.premiumText}>{profile?.is_approved ? 'تاجر معتمد' : 'قيد المراجعة'}</Text>
              </View>
            </View>
          </View>

        </ImageBackground>

        {/* Stats Row */}
        <View style={styles.statsCardContainer}>
          {STATS.map((stat, index) => (
            <View key={stat.id} style={styles.statWrapper}>
              <TouchableOpacity
                style={styles.statItem}
                activeOpacity={0.7}
                onPress={() => stat.target === 'Reports' ? navigation.navigate('Reports') : navigation.getParent()?.navigate(stat.target)}
                accessibilityRole="button"
                accessibilityLabel={`${stat.title}: ${stat.value}`}
              >
                <View style={styles.statIconCircle}>
                  <Ionicons name={stat.icon as any} size={18} color="#111827" />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statTitle} numberOfLines={1} adjustsFontSizeToFit>{stat.title}</Text>
              </TouchableOpacity>
              {index < STATS.length - 1 && <View style={styles.statDivider} />}
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>حساب التاجر</Text>

        {/* Menu List */}
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item, index) => (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => item.screen && navigation.navigate(item.screen as any, item.params as any)}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={styles.menuItemRight}>
                  <Ionicons name={item.icon as any} size={22} color="#4B5563" style={styles.menuItemIcon} />
                  <Text style={styles.menuItemText}>{item.title}</Text>
                </View>
                <Ionicons name="chevron-back" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              {index < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutCard}
          onPress={() =>
            Alert.alert('تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج من حساب متجرك؟', [
              { text: 'تراجع', style: 'cancel' },
              { text: 'تسجيل الخروج', style: 'destructive', onPress: () => signOut() },
            ])
          }
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="تسجيل الخروج"
        >
          <Ionicons name="log-out-outline" size={24} color="#EF4444" />
          <Text style={[styles.logoutText, { color: '#EF4444' }]}>تسجيل الخروج</Text>
        </TouchableOpacity>

        {/* Promo Banner */}
        <View style={styles.promoBannerWrapper}>
          <Image
            source={require('../../../assets/images/account_promo.png')}
            style={styles.promoBannerFullImage}
            resizeMode="cover"
          />
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  errorCard: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 13, padding: 12, marginBottom: 12 },
  errorText: { color: '#991B1B', fontSize: 12, lineHeight: 19, textAlign: 'right', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  iconBtn: {
    padding: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    borderWidth: 1.5,
    borderColor: '#F9FAFB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  profileCard: {
    borderRadius: 24,
    padding: 24,
    minHeight: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  profileCardBg: {
    borderRadius: 24,
    resizeMode: 'cover',
  },
  profileZoneRight: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileZoneCenter: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'right'
  },
  premiumBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    position: 'absolute',
    bottom: -10,
  },
  premiumText: {
    color: '#3B82F6',
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 4,
  },
  avatarWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statsCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 3,
  },
  statWrapper: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#F3F4F6',
  },
  statIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  statTitle: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  promoBannerWrapper: {
    borderRadius: 24,
    marginTop: 24,
    marginBottom: 24,
    overflow: 'hidden',
    height: 140,
    backgroundColor: '#F3F4F6',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 3,
  },
  promoBannerFullImage: {
    width: '100%',
    height: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuItemRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  menuItemIcon: {
    marginLeft: 12,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    width: '100%',
  },
  logoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 3,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
});
