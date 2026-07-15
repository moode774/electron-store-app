import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  ImageBackground,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, getAccountStats, getLoyaltyPoints, getReferralCode, deleteMyAccount } from '@marketplace/shared-hooks';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AccountStackParamList } from '../../../navigation/types';
import { Alert } from '../../../components/appAlert';

type AccountScreenNavigationProp = NativeStackNavigationProp<AccountStackParamList, 'AccountMain'>;

interface Props {
  navigation: AccountScreenNavigationProp;
}

const MENU_ITEMS: { id: string; title: string; icon: string; route: keyof AccountStackParamList | null; params?: object }[] = [
  { id: '1', title: 'معلومات الحساب', icon: 'person-outline', route: 'EditProfile' },
  { id: '2', title: 'المفضلة', icon: 'heart-outline', route: 'Favorites' },
  { id: '3', title: 'طرق الدفع', icon: 'card-outline', route: 'PaymentMethods' },
  { id: '4', title: 'العناوين المحفوظة', icon: 'location-outline', route: 'AddressBook' },
  { id: '5', title: 'الإشعارات', icon: 'notifications-outline', route: 'Notifications' },
  { id: '6', title: 'التقييمات والمراجعات', icon: 'star-outline', route: 'Reviews' },
  { id: '7', title: 'مركز المساعدة', icon: 'headset-outline', route: 'HelpCenter' },
  { id: '10', title: 'مفاتيح API (ربط الذكاء الاصطناعي)', icon: 'key-outline', route: 'ApiKeys' },
  { id: '8', title: 'سياسة الخصوصية', icon: 'shield-checkmark-outline', route: 'Legal', params: { type: 'privacy' } },
  { id: '9', title: 'الشروط والأحكام', icon: 'document-text-outline', route: 'Legal', params: { type: 'terms' } },
];

export default function AccountScreen({ navigation }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;
  const cardWidth = isDesktop
    ? Math.min(Math.max((width - 100) * 0.45, 0), 620)
    : Math.min(Math.max(width - 40, 0), 560);
  const profileCardHeight = Math.min(Math.max(Math.round(cardWidth * 0.42), 132), 190);
  const promoHeight = isDesktop ? 190 : Math.min(Math.max(Math.round(cardWidth * 0.32), 104), 150);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [counts, setCounts] = useState({ orders: 0, coupons: 0, addresses: 0, favorites: 0 });
  const [points, setPoints] = useState(0);
  const [referral, setReferral] = useState('');
  const [statsError, setStatsError] = useState('');

  const loadStats = useCallback(async () => {
    if (!user?.id) return;
    setStatsError('');
    const results = await Promise.allSettled([
      getAccountStats(user.id),
      getLoyaltyPoints(user.id),
      getReferralCode(user.id),
    ]);
    if (results[0].status === 'fulfilled') setCounts(results[0].value);
    if (results[1].status === 'fulfilled') setPoints(results[1].value);
    if (results[2].status === 'fulfilled') setReferral(results[2].value);
    if (results.some((result) => result.status === 'rejected')) {
      setStatsError('تعذّر تحديث بعض بيانات الحساب.');
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void loadStats(); }, [loadStats]));

  const STATS = [
    { id: '1', title: 'الطلبات', value: String(counts.orders), icon: 'bag-handle-outline' },
    { id: '2', title: 'الكوبونات', value: String(counts.coupons), icon: 'ticket-outline' },
    { id: '3', title: 'العناوين', value: String(counts.addresses), icon: 'location-outline' },
    { id: '4', title: 'المفضلة', value: String(counts.favorites), icon: 'heart-outline' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}>
        <View style={isDesktop ? styles.desktopColumns : undefined}>
        <View style={isDesktop ? styles.desktopSummary : undefined}>

        {/* Profile Card */}
        <ImageBackground
          source={require('../../../../assets/images/profile_card_art.png')}
          style={[styles.profileCard, { height: profileCardHeight }]}
          imageStyle={styles.profileCardBg}
        >

          {/* Right Zone: Avatar */}
          <View style={styles.profileZoneRight}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={28} color="#111827" />
              </View>
              <View style={styles.premiumBadge}>
                <Ionicons name="sparkles" size={10} color="#3B82F6" />
                <Text style={styles.premiumText}>عضو مميز</Text>
              </View>
            </View>
          </View>

        </ImageBackground>

        {/* Stats Row */}
        <View style={styles.statsCardContainer}>
          {STATS.map((stat, index) => (
            <View key={stat.id} style={styles.statWrapper}>
              <TouchableOpacity style={styles.statItem} activeOpacity={0.7}>
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
        {!!statsError && (
          <TouchableOpacity style={styles.statsError} onPress={() => void loadStats()} accessibilityRole="button">
            <Ionicons name="refresh-circle-outline" size={18} color="#B91C1C" />
            <Text style={styles.statsErrorText}>{statsError} اضغط لإعادة المحاولة.</Text>
          </TouchableOpacity>
        )}

        {/* بطاقة الولاء والإحالة */}
        <View style={styles.loyaltyCard}>
          <View style={styles.loyaltyRow}>
            <View style={styles.loyaltyIcon}>
              <Ionicons name="sparkles" size={22} color="#D97706" />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={styles.loyaltyLabel}>نقاط الولاء</Text>
              <Text style={styles.loyaltyValue}>{points} نقطة</Text>
            </View>
          </View>
          {!!referral && (
            <View style={styles.referralBox}>
              <Text style={styles.referralLabel}>كود الإحالة الخاص بك</Text>
              <Text style={styles.referralCode}>{referral}</Text>
            </View>
          )}
        </View>
        </View>

        <View style={isDesktop ? styles.desktopSettings : undefined}>
        <Text style={styles.sectionTitle}>حسابي</Text>

        {/* Menu List */}
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item, index) => (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => item.route && navigation.navigate(item.route as any, item.params as any)}
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
        <TouchableOpacity style={styles.logoutCard} onPress={signOut} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={24} color="#3B82F6" />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>

        {/* Delete Account (متطلّب متاجر التطبيقات) */}
        <TouchableOpacity
          style={[styles.logoutCard, { marginTop: 12 }]}
          activeOpacity={0.7}
          onPress={() =>
            Alert.alert(
              'حذف الحساب نهائياً',
              'سيتم حذف حسابك وكل بياناتك (الطلبات، العناوين، المفضلة...) ولا يمكن التراجع. هل أنت متأكد؟',
              [
                { text: 'تراجع', style: 'cancel' },
                {
                  text: 'حذف نهائي',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteMyAccount();
                      await signOut();
                    } catch (e: any) {
                      Alert.alert('خطأ', e?.message ?? 'تعذّر حذف الحساب، حاول لاحقاً');
                    }
                  },
                },
              ],
            )
          }
        >
          <Ionicons name="trash-outline" size={22} color="#EF4444" />
          <Text style={[styles.logoutText, { color: '#EF4444' }]}>حذف الحساب نهائياً</Text>
        </TouchableOpacity>
        </View>
        </View>

        {/* Promo Banner */}
        <TouchableOpacity activeOpacity={0.9} style={[styles.promoBannerWrapper, { height: promoHeight }]}>
          <Image
            source={require('../../../../assets/images/account_promo.png')}
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
  logo: {
    width: 40,
    height: 40,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  scrollContentDesktop: {
    width: '100%',
    maxWidth: 1260,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 56,
  },
  desktopColumns: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 28,
  },
  desktopSummary: { flex: 0.9 },
  desktopSettings: { flex: 1.1 },
  profileCard: {
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
    width: '100%',
    height: '100%',
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
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  premiumBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  premiumText: {
    color: '#3B82F6',
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 4,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: '#3B82F6',
    width: 20,
    height: 20,
    borderRadius: 10,
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
  statsError: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 10, marginTop: -10, marginBottom: 18 },
  statsErrorText: { color: '#991B1B', fontSize: 12, fontWeight: '700', textAlign: 'right' },
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
    maxHeight: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
  },
  loyaltyCard: { backgroundColor: '#FFFBEB', borderRadius: 20, padding: 18, marginBottom: 20, borderWidth: 1.5, borderColor: '#FDE68A' },
  loyaltyRow: { flexDirection: 'row', alignItems: 'center' },
  loyaltyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  loyaltyLabel: { fontSize: 12, color: '#B45309', fontWeight: '600' },
  loyaltyValue: { fontSize: 20, fontWeight: '800', color: '#92400E', marginTop: 2 },
  referralBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#FDE68A', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  referralLabel: { fontSize: 12.5, color: '#B45309', fontWeight: '600' },
  referralCode: { fontSize: 15, fontWeight: '800', color: '#92400E', letterSpacing: 1 },
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
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
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
