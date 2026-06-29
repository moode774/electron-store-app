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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, getAccountStats, getLoyaltyPoints, getReferralCode } from '@marketplace/shared-hooks';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AccountStackParamList } from '../../../navigation/types';

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
  { id: '10', title: 'محادثاتي', icon: 'chatbubbles-outline', route: 'Conversations' },
  { id: '6', title: 'التقييمات والمراجعات', icon: 'star-outline', route: 'Reviews' },
  { id: '7', title: 'مركز المساعدة', icon: 'headset-outline', route: 'HelpCenter' },
  { id: '8', title: 'سياسة الخصوصية', icon: 'shield-checkmark-outline', route: 'Legal', params: { type: 'privacy' } },
  { id: '9', title: 'الشروط والأحكام', icon: 'document-text-outline', route: 'Legal', params: { type: 'terms' } },
];

export default function AccountScreen({ navigation }: Props): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [counts, setCounts] = useState({ orders: 0, coupons: 0, addresses: 0, favorites: 0 });
  const [points, setPoints] = useState(0);
  const [referral, setReferral] = useState('');

  const loadStats = useCallback(() => {
    if (!user?.id) return;
    getAccountStats(user.id).then(setCounts).catch(() => {});
    getLoyaltyPoints(user.id).then(setPoints).catch(() => {});
    getReferralCode(user.id).then(setReferral).catch(() => {});
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const STATS = [
    { id: '1', title: 'الطلبات', value: String(counts.orders), icon: 'bag-handle-outline' },
    { id: '2', title: 'الكوبونات', value: String(counts.coupons), icon: 'ticket-outline' },
    { id: '3', title: 'العناوين', value: String(counts.addresses), icon: 'location-outline' },
    { id: '4', title: 'المفضلة', value: String(counts.favorites), icon: 'heart-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn}>
          <Ionicons name="settings-outline" size={24} color="#111827" />
        </TouchableOpacity>
        <Image
          source={require('../../../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <TouchableOpacity style={styles.iconBtn}>
          <Ionicons name="notifications-outline" size={24} color="#111827" />
          <View style={styles.badge} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Profile Card */}
        <ImageBackground
          source={require('../../../../assets/images/profile_card_art.png')}
          style={styles.profileCard}
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

        {/* Promo Banner */}
        <TouchableOpacity activeOpacity={0.9} style={styles.promoBannerWrapper}>
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
  profileCard: {
    borderRadius: 24,
    padding: 24,
    minHeight: 140,
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
