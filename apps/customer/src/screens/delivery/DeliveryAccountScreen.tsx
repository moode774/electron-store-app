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
import { useAuthStore, getDeliveryEarnings } from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { t, tv } from '@marketplace/shared-i18n';

const MENU_ITEMS = [
  { id: '1', title: 'بياناتي ومركبتي', icon: 'bicycle-outline', screen: 'DeliveryProfile', params: undefined },
  { id: '2', title: 'المحفظة والتحصيلات', icon: 'wallet-outline', screen: 'DeliveryWallet', params: undefined },
  { id: '3', title: 'مهام الإرجاع', icon: 'return-down-back-outline', screen: 'DeliveryReturns', params: undefined },
  { id: '4', title: 'مناطق العمل', icon: 'map-outline', screen: 'DeliveryZones', params: undefined },
  { id: '5', title: 'الإشعارات', icon: 'notifications-outline', screen: 'RoleNotifications', params: { role: 'delivery' } },
  { id: '6', title: 'مركز المساعدة', icon: 'headset-outline', screen: 'DeliverySupport', params: undefined },
  { id: '7', title: 'مفاتيح API (ربط الذكاء الاصطناعي)', icon: 'key-outline', screen: 'ApiKeys', params: undefined },
];

export default function DeliveryAccountScreen({ navigation }: any) {
  const layout = useResponsiveLayout(960);
  const { user, signOut } = useAuthStore();
  const [info, setInfo] = useState({ balance: 0, totalDeliveries: 0, count: 0 });
  const [loadError, setLoadError] = useState('');

  const loadInfo = useCallback(async () => {
    if (!user?.id) return;
    setLoadError('');
    try {
      const result = await getDeliveryEarnings(user.id);
      setInfo({ balance: result.balance, totalDeliveries: result.totalDeliveries, count: result.recordedCount });
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحديث ملخص الحساب.');
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void loadInfo();
  }, [loadInfo]));

  const STATS = [
    { id: '1', title: 'إجمالي التوصيلات', value: `${info.totalDeliveries}`, icon: 'cube-outline' },
    { id: '2', title: 'توصيلات مسجّلة', value: `${info.count}`, icon: 'checkmark-done-outline' },
    { id: '3', title: 'الرصيد', value: `${info.balance}`, icon: 'wallet-outline' },
    { id: '4', title: 'العملة', value: 'ر.ي', icon: 'cash-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('DeliveryProfile')} accessibilityRole="button" accessibilityLabel={t('إعدادات بيانات المندوب')}>
          <Ionicons name="settings-outline" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('حساب المندوب')}</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('RoleNotifications', { role: 'delivery' })} accessibilityRole="button" accessibilityLabel={t('إشعارات المندوب')}>
          <Ionicons name="notifications-outline" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]}>

        {/* Profile Card */}
        <ImageBackground
          source={require('../../../assets/images/profile_card_art.png')}
          style={styles.profileCard}
          imageStyle={styles.profileCardBg}
        >

          {/* Center Zone: Info */}
          <View style={styles.profileZoneCenter}>
            <Text style={styles.userName}>{tv(user?.full_name ?? t('مندوب التوصيل'))}</Text>
          </View>

          {/* Right Zone: Avatar */}
          <View style={styles.profileZoneRight}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={28} color="#111827" />
              </View>
              <View style={styles.premiumBadge}>
                <Ionicons name="bicycle" size={10} color="#3B82F6" />
                <Text style={styles.premiumText}>{t('مندوب توصيل')}</Text>
              </View>
            </View>
          </View>

        </ImageBackground>

        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{tv(loadError)}</Text>
            <TouchableOpacity onPress={() => void loadInfo()} accessibilityRole="button" accessibilityLabel={t('إعادة تحميل ملخص الحساب')}>
              <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Stats Row */}
        <View style={[styles.statsCardContainer, layout.compact && styles.statsCardCompact]}>
          {STATS.map((stat, index) => (
            <View key={stat.id} style={[styles.statWrapper, layout.compact && styles.statWrapperCompact]}>
              <View style={styles.statItem} accessibilityLabel={`${stat.title}: ${stat.value}`}>
                <View style={styles.statIconCircle}>
                  <Ionicons name={stat.icon as any} size={18} color="#111827" />
                </View>
                <Text style={styles.statValue}>{tv(stat.value)}</Text>
                <Text style={styles.statTitle} numberOfLines={1} adjustsFontSizeToFit>{tv(stat.title)}</Text>
              </View>
              {index < STATS.length - 1 && <View style={styles.statDivider} />}
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('حساب المندوب')}</Text>

        {/* Menu List */}
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item, index) => (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => item.screen && navigation.navigate(item.screen as any, item.params as any)}
                accessibilityRole="button"
                accessibilityLabel={tv(item.title)}
              >
                <View style={styles.menuItemRight}>
                  <Ionicons name={item.icon as any} size={22} color="#4B5563" style={styles.menuItemIcon} />
                  <Text style={styles.menuItemText}>{tv(item.title)}</Text>
                </View>
                <Ionicons name="chevron-back" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              {index < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutCard} onPress={signOut} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('تسجيل الخروج')}>
          <Ionicons name="log-out-outline" size={24} color="#3B82F6" />
          <Text style={styles.logoutText}>{t('تسجيل الخروج')}</Text>
        </TouchableOpacity>

        {/* Promo Banner */}
        <TouchableOpacity activeOpacity={0.9} style={styles.promoBannerWrapper} onPress={() => Alert.alert('قريبًا', 'سيتم نشر برامج ومزايا المندوبين المعتمدة هنا.')} accessibilityRole="button" accessibilityLabel={t('برامج ومزايا المندوبين')}>
          <Image
            source={require('../../../assets/images/account_promo.png')}
            style={styles.promoBannerFullImage}
            resizeMode="cover"
          />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
    width: '100%', maxWidth: 960, alignSelf: 'center',
  },
  iconBtn: {
    padding: 8,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    width: '100%', maxWidth: 960, alignSelf: 'center',
  },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, marginBottom: 16, alignItems: 'center', gap: 8 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: '#2563EB', fontSize: 12.5, fontWeight: '800' },
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
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'left'
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
  statsCardCompact: { flexWrap: 'wrap', alignItems: 'stretch', paddingVertical: 6 },
  statWrapper: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statWrapperCompact: { flexBasis: '50%', flexGrow: 0, paddingVertical: 8 },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  menuItemIcon: {
    marginEnd: 12,
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
