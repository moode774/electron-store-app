import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAuthStore,
  getAccountStats,
  getLoyaltyPoints,
  getReferralCode,
  deleteMyAccount,
} from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '../../../theme/customerTheme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AccountStackParamList } from '../../../navigation/types';
import { Alert } from '../../../components/appAlert';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';

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
  const layout = useCustomerLayout(1260);
  const isDesktop = layout.desktop;
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const [counts, setCounts] = useState({ orders: 0, coupons: 0, addresses: 0, favorites: 0 });
  const [points, setPoints] = useState(0);
  const [referral, setReferral] = useState('');
  const [statsError, setStatsError] = useState('');
  const [statsErrorDetail, setStatsErrorDetail] = useState('');

  const loadStats = useCallback(async () => {
    if (!user?.id) return;
    setStatsError('');
    setStatsErrorDetail('');
    const results = await Promise.allSettled([
      getAccountStats(user.id),
      getLoyaltyPoints(user.id),
      getReferralCode(user.id),
    ]);
    if (results[0].status === 'fulfilled') setCounts(results[0].value);
    if (results[1].status === 'fulfilled') setPoints(results[1].value);
    if (results[2].status === 'fulfilled') setReferral(results[2].value);

    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (rejected) {
      const msg = rejected.reason?.message || String(rejected.reason || '');
      setStatsError('تعذّر تحديث بعض بيانات الحساب.');
      setStatsErrorDetail(msg);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void loadStats(); }, [loadStats]));

  const authUser = user as any;
  const userName = authUser?.full_name || 'مستخدم';
  const userSub = authUser?.email || authUser?.phone || 'حساب المستخدم';

  const STATS = [
    { id: '1', title: 'الطلبات', value: String(counts.orders), icon: 'bag-handle-outline' },
    { id: '2', title: 'الكوبونات', value: String(counts.coupons), icon: 'ticket-outline' },
    { id: '3', title: 'العناوين', value: String(counts.addresses), icon: 'location-outline' },
    { id: '4', title: 'المفضلة', value: String(counts.favorites), icon: 'heart-outline' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: layout.gutter },
          isDesktop && styles.scrollContentDesktop,
        ]}
      >
        {/* Header Title Bar */}
        <View style={styles.headerTitleRow}>
          <Text style={styles.screenHeaderTitleText}>حسابي</Text>
          <TouchableOpacity
            style={styles.headerNotificationBtn}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={21} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={isDesktop ? styles.desktopColumns : undefined}>
          <View style={isDesktop ? styles.desktopSummary : undefined}>
            {/* Profile Header Card */}
            <View style={styles.profileHeaderCard}>
              <View style={styles.profileInfoRow}>
                {/* Avatar */}
                <View style={styles.avatarRingWrap}>
                  {authUser?.avatar_url ? (
                    <Image source={{ uri: authUser.avatar_url }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarImg, styles.avatarFallback]}>
                      <Ionicons name="person-outline" size={34} color={COLORS.primary} />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.avatarEditBadge}
                    onPress={() => navigation.navigate('EditProfile')}
                  >
                    <Ionicons name="pencil" size={11} color={COLORS.surface} />
                  </TouchableOpacity>
                </View>

                {/* Name & Sub */}
                <View style={styles.profileTextCol}>
                  <View style={styles.nameBadgeRow}>
                    <Text style={styles.userNameText} numberOfLines={1}>{userName}</Text>
                  </View>
                  <Text style={styles.userSubText} numberOfLines={1}>{userSub}</Text>
                  <View style={styles.premiumBadgePill}>
                    <Ionicons name="star" size={12} color="#E9C886" />
                    <Text style={styles.premiumBadgeText}>{points.toLocaleString('ar-SA')} نقطة</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsCardContainer}>
              {STATS.map((stat, index) => (
                <View key={stat.id} style={styles.statWrapper}>
                  <TouchableOpacity
                    style={styles.statItem}
                    activeOpacity={0.75}
                    onPress={() => {
                      if (stat.id === '1') (navigation.getParent() as any)?.navigate('Orders');
                      if (stat.id === '3') navigation.navigate('AddressBook');
                      if (stat.id === '4') navigation.navigate('Favorites');
                    }}
                  >
                    <View style={styles.statIconCircle}>
                      <Ionicons name={stat.icon as any} size={18} color={COLORS.primary} />
                    </View>
                    <Text style={styles.statValue}>{stat.value}</Text>
                    <Text style={styles.statTitle} numberOfLines={1}>{stat.title}</Text>
                  </TouchableOpacity>
                  {index < STATS.length - 1 && <View style={styles.statDivider} />}
                </View>
              ))}
            </View>

            {!!statsError && (
              <TouchableOpacity
                style={styles.statsError}
                onPress={() => {
                  Alert.alert(
                    'تفاصيل مشكلة الاتصال',
                    statsErrorDetail ? `سبب الخطأ: ${statsErrorDetail}` : 'تعذّر الاتصال بالخادم مؤقتاً.',
                    [
                      { text: 'إلغاء', style: 'cancel' },
                      { text: 'إعادة المحاولة الأن', onPress: () => void loadStats() },
                    ],
                  );
                }}
                accessibilityRole="button"
              >
                <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
                <Text style={styles.statsErrorText}>{statsError} اضغط للتعرف على السبب وإعادة المحاولة.</Text>
              </TouchableOpacity>
            )}

            <View style={styles.loyaltyCard}>
              <View style={styles.loyaltyHeaderRow}>
                <View style={styles.sparklesCircleWrap}>
                  <Ionicons name="diamond-outline" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.loyaltyTextCol}>
                  <Text style={styles.loyaltyLabel}>رصيد النقاط المتاحة</Text>
                  <Text style={styles.loyaltyValue}>
                    <Text style={styles.loyaltyNumText}>{points}</Text> نقطة
                  </Text>
                </View>
              </View>
              <Text style={styles.loyaltyHint}>اجمع نقاطًا مع طلباتك واستكشف مزاياها عند توفرها.</Text>

              {/* Referral & Redeem Footer Row */}
              <View style={styles.referralBox}>
                <TouchableOpacity
                  style={styles.redeemBtn}
                  activeOpacity={0.85}
                  onPress={() => Alert.alert('نقاطك', 'تظهر مزايا النقاط المتاحة عند إتمام الطلبات.')}
                >
                  <Ionicons name="gift-outline" size={16} color={COLORS.textPrimary} style={{ marginLeft: 6 }} />
                  <Text style={styles.redeemBtnText}>كيف أستخدمها؟</Text>
                </TouchableOpacity>

                {!!referral && (
                  <View style={styles.referralCol}>
                    <Text style={styles.referralLabel}>كود الإحالة الخاصة بك</Text>
                    <TouchableOpacity
                      style={styles.referralBadge}
                      activeOpacity={0.85}
                      onPress={() => {
                        Alert.alert('كود الإحالة', referral);
                      }}
                    >
                      <Ionicons name="information-circle-outline" size={15} color={COLORS.primary} style={{ marginLeft: 6 }} />
                      <Text style={styles.referralCode}>{referral}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={isDesktop ? styles.desktopSettings : undefined}>
            <Text style={styles.sectionTitle}>إعدادات الحساب</Text>

            {/* Menu List */}
            <View style={styles.menuCard}>
              {MENU_ITEMS.map((item, index) => (
                <React.Fragment key={item.id}>
                  <TouchableOpacity
                    style={styles.menuItem}
                    activeOpacity={0.75}
                    onPress={() => item.route && navigation.navigate(item.route as any, item.params as any)}
                  >
                    <View style={styles.menuItemRight}>
                      <View style={styles.menuIconBox}>
                        <Ionicons name={item.icon as any} size={20} color={COLORS.primary} />
                      </View>
                      <Text style={styles.menuItemText}>{item.title}</Text>
                    </View>
                    <Ionicons name="chevron-back" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                  {index < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
                </React.Fragment>
              ))}
            </View>

            {/* Logout Button */}
            <TouchableOpacity style={styles.logoutCard} onPress={signOut} activeOpacity={0.75}>
              <View style={styles.menuItemRight}>
                <View style={[styles.menuIconBox, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="log-out-outline" size={20} color={COLORS.primary} />
                </View>
                <Text style={[styles.logoutText, { color: COLORS.primary }]}>تسجيل الخروج</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
            </TouchableOpacity>

            {/* Delete Account */}
            <TouchableOpacity
              style={[styles.logoutCard, { marginTop: 12 }]}
              activeOpacity={0.75}
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
              <View style={styles.menuItemRight}>
                <View style={[styles.menuIconBox, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </View>
                <Text style={[styles.logoutText, { color: '#EF4444' }]}>حذف الحساب نهائياً</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background, // #FFFFFF
  },
  headerTitleRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 32,
    paddingBottom: 16,
  },
  screenHeaderTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.textPrimary, // #0F172A
    textAlign: 'right',
  },
  headerNotificationBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.surface, // #F8FAFC
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scrollContent: {
    paddingBottom: 44,
  },
  scrollContentDesktop: {
    width: '100%',
    maxWidth: 1260,
    alignSelf: 'center',
    paddingTop: 16,
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
  profileHeaderCard: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  profileInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  avatarRingWrap: {
    position: 'relative',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#8EA9DC',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },

  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: COLORS.secondary, // #1D4ED8
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  profileTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  nameBadgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  userNameText: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.surface,
    textAlign: 'right',
  },
  userSubText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#CAD6EB',
    marginTop: 2,
    textAlign: 'right',
  },
  premiumBadgePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#243962',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  premiumBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    color: COLORS.surface,
  },
  statsCardContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsError: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 10,
    marginTop: -8,
    marginBottom: 16,
  },
  statsErrorText: {
    color: '#991B1B',
    fontSize: 12,
    fontFamily: FONTS.bold,
    textAlign: 'right',
  },
  statWrapper: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },
  statIconCircle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  statTitle: {
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  loyaltyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  loyaltyHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  sparklesCircleWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loyaltyTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  loyaltyLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginBottom: 4,
    textAlign: 'right',
  },
  loyaltyValue: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  loyaltyNumText: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.textPrimary,
  },
  loyaltyHint: {
    marginTop: 14,
    marginBottom: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'right',
  },
  progressContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    marginTop: 14,
    marginBottom: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  chartIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  progressHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  progressSubText: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  progressNumText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textPrimary,
    textAlign: 'left',
  },
  progressBarTrack: {
    height: 6,
    width: '100%',
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.textPrimary,
    borderRadius: 3,
  },
  referralBox: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.primarySoft,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  referralCol: {
    alignItems: 'flex-end',
  },
  referralLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 6,
    textAlign: 'right',
  },
  referralBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  referralCode: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  redeemBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  redeemBtnText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
    marginBottom: 12,
    textAlign: 'right',
    paddingHorizontal: 2,
  },
  menuCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  menuItem: {
    minHeight: 52,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuItemRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: '100%',
  },
  logoutCard: {
    minHeight: 56,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
  },
  promoBannerWrapper: {
    borderRadius: 22,
    marginTop: 22,
    marginBottom: 24,
    overflow: 'hidden',
    height: 140,
    backgroundColor: COLORS.surface,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  promoBannerFullImage: {
    width: '100%',
    height: '100%',
  },
});
