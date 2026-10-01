import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useTranslation } from '../i18n';

import DeliveryOffersScreen from '../screens/delivery/DeliveryOffersScreen';
import ActiveDeliveryScreen from '../screens/delivery/ActiveDeliveryScreen';
import EarningsScreen from '../screens/delivery/EarningsScreen';
import DeliveryAccountScreen from '../screens/delivery/DeliveryAccountScreen';
import DeliveryWalletScreen from '../screens/delivery/DeliveryWalletScreen';
import DeliveryReturnsScreen from '../screens/delivery/DeliveryReturnsScreen';
import DeliveryProfileScreen from '../screens/delivery/DeliveryProfileScreen';
import DeliveryZonesScreen from '../screens/delivery/DeliveryZonesScreen';
import DeliverySupportScreen from '../screens/delivery/DeliverySupportScreen';
import RoleNotificationsScreen from '../screens/shared/RoleNotificationsScreen';
import NotificationSettingsScreen from '../screens/shared/NotificationSettingsScreen';
import SupportTicketThreadScreen from '../screens/shared/SupportTicketThreadScreen';

export type DeliveryAccountStackParamList = {
  AccountMain: undefined;
  DeliveryProfile: undefined;
  DeliveryZones: undefined;
  DeliveryWallet: undefined;
  DeliverySupport: undefined;
  SupportTicket: { ticketId: string };
  RoleNotifications: { role: 'delivery' };
  NotificationSettings: undefined;
};

const AccountStack = createNativeStackNavigator<DeliveryAccountStackParamList>();
function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountMain" component={DeliveryAccountScreen} />
      <AccountStack.Screen name="DeliveryProfile" component={DeliveryProfileScreen} />
      <AccountStack.Screen name="DeliveryZones" component={DeliveryZonesScreen} />
      <AccountStack.Screen name="DeliveryWallet" component={DeliveryWalletScreen} />
      <AccountStack.Screen name="DeliverySupport" component={DeliverySupportScreen} />
      <AccountStack.Screen name="SupportTicket" component={SupportTicketThreadScreen} />
      <AccountStack.Screen name="RoleNotifications" component={RoleNotificationsScreen} />
      <AccountStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
    </AccountStack.Navigator>
  );
}

export type DeliveryOffersStackParamList = {
  OffersList: undefined;
  ActiveDelivery: { orderId: string };
};

const OffersStack = createNativeStackNavigator<DeliveryOffersStackParamList>();
function OffersNavigator() {
  return (
    <OffersStack.Navigator screenOptions={{ headerShown: false }}>
      <OffersStack.Screen name="OffersList" component={DeliveryOffersScreen} />
      <OffersStack.Screen name="ActiveDelivery" component={ActiveDeliveryScreen} />
    </OffersStack.Navigator>
  );
}

export type DeliveryTabParamList = {
  DeliveryHome: undefined;
  DeliveryOrders: undefined;
  DeliveryReturnsTab: undefined;
  DeliveryEarnings: undefined;
  DeliveryMore: undefined;
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator<DeliveryTabParamList>();

type DeliveryNavItem = {
  route: keyof DeliveryTabParamList;
  labelKey: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
};

const DELIVERY_NAV_ITEMS: DeliveryNavItem[] = [
  { route: 'DeliveryHome', labelKey: 'navigation.home', icon: 'home-outline', activeIcon: 'home' },
  { route: 'DeliveryOrders', labelKey: 'navigation.myOrders', icon: 'receipt-outline', activeIcon: 'receipt' },
  { route: 'DeliveryReturnsTab', labelKey: 'navigation.returns', icon: 'swap-horizontal-outline', activeIcon: 'swap-horizontal' },
  { route: 'DeliveryEarnings', labelKey: 'navigation.earnings', icon: 'wallet-outline', activeIcon: 'wallet' },
  { route: 'DeliveryMore', labelKey: 'navigation.myAccount', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

function DesktopDeliverySidebar() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const activeRoute = useNavigationState((state) => state?.routes[state.index]?.name ?? 'DeliveryHome');

  return (
    <View style={styles.desktopSidebar}>
      <View style={styles.desktopBrand}>
        <View style={styles.desktopBrandMark}>
          <Ionicons name="bicycle" size={22} color={COLORS.surface} />
        </View>
        <View style={styles.desktopBrandCopy}>
          <Text style={styles.desktopBrandTitle}>{t('navigation.deliverySpace')}</Text>
          <Text style={styles.desktopBrandSubtitle}>{t('navigation.manageDelivery')}</Text>
        </View>
      </View>

      <View style={styles.desktopNav}>
        {DELIVERY_NAV_ITEMS.map((item) => {
          const active = activeRoute === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.desktopNavItem, active && styles.desktopNavItemActive]}
              onPress={() => navigation.navigate(item.route)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={t(item.labelKey)}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.desktopNavIcon, active && styles.desktopNavIconActive]}>
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={20}
                  color={active ? COLORS.surface : COLORS.textSecondary}
                />
              </View>
              <Text style={[styles.desktopNavLabel, active && styles.desktopNavLabelActive]}>{t(item.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.desktopOnlineCard}
        onPress={() => navigation.navigate('DeliveryHome')}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel={t('delivery.openReceiving')}
      >
        <View style={styles.desktopOnlineIcon}>
          <Ionicons name="radio-outline" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.desktopOnlineCopy}>
          <Text style={styles.desktopOnlineTitle}>{t('navigation.receiveOrders')}</Text>
          <Text style={styles.desktopOnlineSubtitle}>{t('navigation.onlineControl')}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export default function DeliveryTabNavigator() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet;
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 8);

  const tabIcon = (outline: IconName, filled: IconName) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <View style={styles.tabIconWrap}>
        <Ionicons name={focused ? filled : outline} size={22} color={color} />
        {focused ? <View style={styles.tabIndicator} /> : null}
      </View>
    );

  // Listed right-to-left. Native apps run with forceRTL and lay the row out
  // from the right already; the web build renders LTR, so reverse it there.
  const tabs: { name: keyof DeliveryTabParamList; component: React.ComponentType<any>; options: any }[] = [
    {
      name: 'DeliveryReturnsTab',
      component: DeliveryReturnsScreen,
      options: { tabBarLabel: t('navigation.returns'), tabBarIcon: tabIcon('swap-horizontal-outline', 'swap-horizontal') },
    },
    {
      name: 'DeliveryOrders',
      component: ActiveDeliveryScreen,
      options: { tabBarLabel: t('navigation.myOrders'), tabBarIcon: tabIcon('receipt-outline', 'receipt') },
    },
    {
      name: 'DeliveryHome',
      component: OffersNavigator,
      options: {
        tabBarLabel: t('navigation.home'),
        tabBarAccessibilityLabel: t('navigation.home'),
        tabBarIcon: tabIcon('home-outline', 'home'),
      },
    },
    {
      name: 'DeliveryEarnings',
      component: EarningsScreen,
      options: { tabBarLabel: t('navigation.earnings'), tabBarIcon: tabIcon('wallet-outline', 'wallet') },
    },
    {
      name: 'DeliveryMore',
      component: AccountNavigator,
      options: { tabBarLabel: t('navigation.myAccount'), tabBarIcon: tabIcon('person-circle-outline', 'person-circle') },
    },
  ];
  const orderedTabs = Platform.OS === 'web' ? [...tabs].reverse() : tabs;

  const content = (
    <Tab.Navigator
      initialRouteName="DeliveryHome"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.inkTertiary,
        tabBarStyle: isDesktop ? { display: 'none' } : {
          backgroundColor: COLORS.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: COLORS.hairline,
          elevation: 0,
          shadowOpacity: 0,
          height: 70 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 9,
          position: 'absolute',
          ...(isTablet ? {
            left: Math.max(24, (width - 680) / 2),
            right: Math.max(24, (width - 680) / 2),
            bottom: 14,
            borderWidth: 1,
            borderColor: COLORS.hairline,
            borderRadius: RADIUS.xl,
          } : {}),
        },
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: FONTS.medium, marginTop: 3 },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      {orderedTabs.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component} options={tab.options} />
      ))}
    </Tab.Navigator>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <DesktopDeliverySidebar />
        <View style={styles.desktopMain}>
          <View style={styles.desktopTopBar}>
            <View>
              <Text style={styles.desktopTopTitle}>{t('navigation.deliveryDashboard')}</Text>
              <Text style={styles.desktopTopSubtitle}>{t('navigation.deliveryDashboardSub')}</Text>
            </View>
            <View style={styles.desktopTopStatus}>
              <View style={styles.desktopTopStatusDot} />
              <Text style={styles.desktopTopStatusText}>{t('navigation.readyToWork')}</Text>
            </View>
          </View>
          <View style={styles.desktopFrame}>{content}</View>
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  tabIndicator: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  desktopRoot: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.background,
  },
  desktopSidebar: {
    width: 260,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: COLORS.surface,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  desktopBrand: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 6,
    marginBottom: 30,
  },
  desktopBrandMark: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  desktopBrandCopy: { flex: 1, alignItems: 'flex-end' },
  desktopBrandTitle: { color: COLORS.textPrimary, fontSize: 15, fontFamily: FONTS.bold },
  desktopBrandSubtitle: { color: COLORS.textMuted, fontSize: 11.5, fontFamily: FONTS.medium, marginTop: 2 },
  desktopNav: { flex: 1, gap: 8 },
  desktopNavItem: {
    minHeight: 54,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10,
  },
  desktopNavItemActive: { backgroundColor: COLORS.primarySoft },
  desktopNavIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  desktopNavIconActive: { backgroundColor: COLORS.primary },
  desktopNavLabel: { flex: 1, textAlign: 'right', color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.medium },
  desktopNavLabelActive: { color: COLORS.primaryDark, fontFamily: FONTS.semiBold },
  desktopOnlineCard: {
    minHeight: 74,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    backgroundColor: COLORS.secondarySoft,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  desktopOnlineIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  desktopOnlineCopy: { flex: 1, alignItems: 'flex-end' },
  desktopOnlineTitle: { color: COLORS.textPrimary, fontSize: 12.5, fontFamily: FONTS.semiBold },
  desktopOnlineSubtitle: { color: COLORS.textSecondary, fontSize: 10.5, fontFamily: FONTS.regular, marginTop: 2 },
  desktopMain: { flex: 1, minWidth: 0, padding: 20, paddingBottom: 0 },
  desktopTopBar: {
    minHeight: 64,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  desktopTopTitle: { color: COLORS.textPrimary, fontSize: 18, fontFamily: FONTS.bold, textAlign: 'right' },
  desktopTopSubtitle: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular, textAlign: 'right', marginTop: 3 },
  desktopTopStatus: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  desktopTopStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  desktopTopStatusText: { color: COLORS.textSecondary, fontSize: 12, fontFamily: FONTS.semiBold },
  desktopFrame: {
    flex: 1,
    minWidth: 0,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: COLORS.border,
  },
});
