import React from 'react';
import { Platform, useWindowDimensions, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

import ApiKeysScreen from '../screens/shared/ApiKeysScreen';
import MerchantDashboardScreen from '../screens/merchant/MerchantDashboardScreen';
import MerchantOrdersScreen from '../screens/merchant/MerchantOrdersScreen';
import MerchantOrderDetailsScreen from '../screens/merchant/MerchantOrderDetailsScreen';
import MerchantProductsScreen from '../screens/merchant/MerchantProductsScreen';
import AddProductScreen from '../screens/merchant/AddProductScreen';
import MerchantAccountScreen from '../screens/merchant/MerchantAccountScreen';
import MerchantReportsScreen from '../screens/merchant/MerchantReportsScreen';
import MerchantWalletScreen from '../screens/merchant/MerchantWalletScreen';
import StoreSettingsScreen from '../screens/merchant/StoreSettingsScreen';
import RoleNotificationsScreen from '../screens/shared/RoleNotificationsScreen';
import MerchantHistoryScreen from '../screens/merchant/MerchantHistoryScreen';
import MerchantSupportScreen from '../screens/merchant/MerchantSupportScreen';
import MerchantCouponsScreen from '../screens/merchant/MerchantCouponsScreen';
import MerchantRefundsScreen from '../screens/merchant/MerchantRefundsScreen';
import MerchantPhysicalReturnsScreen from '../screens/merchant/MerchantPhysicalReturnsScreen';
import SupportTicketThreadScreen from '../screens/shared/SupportTicketThreadScreen';

export type MerchantHistoryStackParamList = {
  HistoryList: undefined;
  OrderDetails: { orderId: string };
};

const HistoryStack = createNativeStackNavigator<MerchantHistoryStackParamList>();
function HistoryNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={{ headerShown: false }}>
      <HistoryStack.Screen name="HistoryList" component={MerchantHistoryScreen} />
      <HistoryStack.Screen name="OrderDetails" component={MerchantOrderDetailsScreen} />
    </HistoryStack.Navigator>
  );
}

export type MerchantOrdersStackParamList = {
  OrdersList: undefined;
  OrderDetails: { orderId: string };
};

const OrdersStack = createNativeStackNavigator<MerchantOrdersStackParamList>();
function OrdersNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerShown: false }}>
      <OrdersStack.Screen name="OrdersList" component={MerchantOrdersScreen} />
      <OrdersStack.Screen name="OrderDetails" component={MerchantOrderDetailsScreen} />
    </OrdersStack.Navigator>
  );
}

export type MerchantProductsStackParamList = {
  ProductsList: undefined;
  AddProduct: undefined;
};

const ProductsStack = createNativeStackNavigator<MerchantProductsStackParamList>();
function ProductsNavigator() {
  return (
    <ProductsStack.Navigator screenOptions={{ headerShown: false }}>
      <ProductsStack.Screen name="ProductsList" component={MerchantProductsScreen} />
      <ProductsStack.Screen name="AddProduct" component={AddProductScreen} />
    </ProductsStack.Navigator>
  );
}

export type MerchantAccountStackParamList = {
  AccountMain: undefined;
  ApiKeys: undefined;
  StoreSettings: undefined;
  Reports: undefined;
  Wallet: undefined;
  RoleNotifications: { role: 'merchant' };
  Support: undefined;
  SupportTicket: { ticketId: string };
  Coupons: undefined;
  Refunds: undefined;
  PhysicalReturns: undefined;
};

const AccountStack = createNativeStackNavigator<MerchantAccountStackParamList>();
function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountMain" component={MerchantAccountScreen} />
      <AccountStack.Screen name="ApiKeys" component={ApiKeysScreen} />
      <AccountStack.Screen name="StoreSettings" component={StoreSettingsScreen} />
      <AccountStack.Screen name="Reports" component={MerchantReportsScreen} />
      <AccountStack.Screen name="Wallet" component={MerchantWalletScreen} />
      <AccountStack.Screen name="RoleNotifications" component={RoleNotificationsScreen} />
      <AccountStack.Screen name="Support" component={MerchantSupportScreen} />
      <AccountStack.Screen name="SupportTicket" component={SupportTicketThreadScreen} />
      <AccountStack.Screen name="Coupons" component={MerchantCouponsScreen} />
      <AccountStack.Screen name="Refunds" component={MerchantRefundsScreen} />
      <AccountStack.Screen name="PhysicalReturns" component={MerchantPhysicalReturnsScreen} />
    </AccountStack.Navigator>
  );
}

export type MerchantSupportStackParamList = {
  SupportHome: undefined;
  SupportTicket: { ticketId: string };
};

const SupportStack = createNativeStackNavigator<MerchantSupportStackParamList>();
function SupportNavigator() {
  return (
    <SupportStack.Navigator screenOptions={{ headerShown: false }}>
      <SupportStack.Screen name="SupportHome" component={MerchantSupportScreen} />
      <SupportStack.Screen name="SupportTicket" component={SupportTicketThreadScreen} />
    </SupportStack.Navigator>
  );
}

export type MerchantTabParamList = {
  MerchantDashboard: undefined;
  MerchantOrders: undefined;
  MerchantHistory: undefined;
  MerchantProducts: undefined;
  MerchantAccount: undefined;
  MerchantStoreSettings: undefined;
  MerchantWallet: undefined;
  MerchantSupport: undefined;
};

const Tab = createBottomTabNavigator<MerchantTabParamList>();

import { getFocusedRouteNameFromRoute, useNavigation, useNavigationState } from '@react-navigation/native';
import { useAuthStore } from '@marketplace/shared-hooks';

function DesktopSidebar() {
  const navigation = useNavigation<any>();
  const routeName = useNavigationState((state) => {
    if (!state) return 'MerchantDashboard';
    const currentRoute = state.routes[state.index];
    if (currentRoute.state && currentRoute.state.index !== undefined) {
      // If it's a nested navigator, we can try to get its active child, but the tab name is usually sufficient
    }
    return currentRoute.name;
  });
  const signOut = useAuthStore((s) => s.signOut);

  const TABS = [
    { name: 'MerchantDashboard',    label: 'الرئيسية',   icon: 'grid-outline',          activeIcon: 'grid'           },
    { name: 'MerchantOrders',       label: 'الطلبات',   icon: 'receipt-outline',       activeIcon: 'receipt'        },
    { name: 'MerchantProducts',     label: 'المنتجات',  icon: 'cube-outline',          activeIcon: 'cube'           },
    { name: 'MerchantHistory',      label: 'السجل',    icon: 'time-outline',          activeIcon: 'time'           },
    { name: 'MerchantAccount',      label: 'حسابي',  icon: 'person-outline', activeIcon: 'person'  },
    { name: 'MerchantWallet',       label: 'المحفظة',   icon: 'wallet-outline',        activeIcon: 'wallet'         },
    { name: 'MerchantSupport',      label: 'الدعم',     icon: 'headset-outline',       activeIcon: 'headset'        },
    { name: 'MerchantStoreSettings',label: 'المعلومات', icon: 'storefront-outline',    activeIcon: 'storefront'     },
  ];

  return (
    <View style={sidebarStyles.container}>
      <View style={sidebarStyles.logoArea}>
        <Ionicons name="storefront" size={24} color={COLORS.textPrimary} />
      </View>

      <View style={sidebarStyles.menu}>
        {TABS.map((tab) => {
          const isActive = routeName === tab.name || (routeName === 'Reports' && tab.name === 'MerchantAccount');
          return (
            <TouchableOpacity
              key={tab.name}
              style={[sidebarStyles.menuItem, isActive && sidebarStyles.menuItemActive]}
              onPress={() => navigation.navigate(tab.name as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons name={isActive ? tab.activeIcon : tab.icon as any} size={21} color={isActive ? COLORS.surface : COLORS.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={sidebarStyles.footer}>
        <TouchableOpacity style={sidebarStyles.menuItem} onPress={signOut} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="تسجيل الخروج">
          <Ionicons name="log-out-outline" size={22} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    width: 80,
    backgroundColor: COLORS.surface,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 1,
    borderColor: COLORS.border,
    zIndex: 10,
  },
  logoArea: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
    transform: [{ rotate: '-4deg' }],
  },
  menu: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  menuItem: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  menuItemActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
});

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function MerchantTabNavigator() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet;
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 8);

  const barStyle: any = isDesktop ? { display: 'none' } : {
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.hairline,
    elevation: 0,
    shadowOpacity: 0,
    height: 60 + bottomInset,
    paddingBottom: bottomInset,
    paddingTop: 6,
    position: 'absolute',
    ...(isTablet ? {
      left: Math.max(24, (width - 680) / 2),
      right: Math.max(24, (width - 680) / 2),
      bottom: 14,
      borderWidth: 1,
      borderColor: COLORS.hairline,
      borderRadius: RADIUS.xl,
    } : {}),
  };

  const tabIcon = (outline: IconName, filled: IconName) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <View style={tabStyles.tabIconWrap}>
        <Ionicons name={focused ? filled : outline} size={22} color={color} />
        {focused ? <View style={tabStyles.tabIndicator} /> : null}
      </View>
    );

  // Screens the desktop sidebar opens directly. On phones and tablets they
  // live under "المزيد" so the bottom bar keeps five destinations only.
  const hiddenOnBar = isDesktop ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

  // Listed right-to-left. Native apps run with forceRTL and lay the row out
  // from the right already; the web build renders LTR, so reverse it there.
  const tabs: { name: keyof MerchantTabParamList; component: React.ComponentType<any>; options: any }[] = [
    {
      name: 'MerchantDashboard',
      component: MerchantDashboardScreen,
      options: { tabBarLabel: 'الرئيسية', tabBarIcon: tabIcon('home-outline', 'home') },
    },
    {
      name: 'MerchantProducts',
      component: ProductsNavigator,
      // Screens with their own sticky action bar hide the tab bar.
      options: ({ route }: any) => ({
        tabBarLabel: 'المنتجات',
        tabBarAccessibilityLabel: 'منتجات المتجر',
        tabBarIcon: tabIcon('cube-outline', 'cube'),
        tabBarStyle: getFocusedRouteNameFromRoute(route) === 'AddProduct' ? { display: 'none' } : barStyle,
      }),
    },
    {
      name: 'MerchantOrders',
      component: OrdersNavigator,
      options: ({ route }: any) => ({
        tabBarLabel: 'الطلبات',
        tabBarAccessibilityLabel: 'الطلبات النشطة',
        tabBarIcon: ({ focused }: { focused: boolean }) => (
          <View style={[tabStyles.centerAction, !focused && tabStyles.centerActionIdle]}>
            <Ionicons name="receipt" size={24} color={COLORS.surface} />
          </View>
        ),
        tabBarLabelStyle: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.primary, marginTop: 2 },
        tabBarStyle: getFocusedRouteNameFromRoute(route) === 'OrderDetails' ? { display: 'none' } : barStyle,
      }),
    },
    {
      name: 'MerchantHistory',
      component: HistoryNavigator,
      options: ({ route }: any) => ({
        tabBarLabel: 'السجل',
        tabBarAccessibilityLabel: 'سجل الطلبات',
        tabBarIcon: tabIcon('time-outline', 'time'),
        tabBarStyle: getFocusedRouteNameFromRoute(route) === 'OrderDetails' ? { display: 'none' } : barStyle,
      }),
    },
    {
      name: 'MerchantAccount',
      component: AccountNavigator,
      // Sub-pages opened from المزيد are full-screen with their own back button.
      options: ({ route }: any) => {
        const focused = getFocusedRouteNameFromRoute(route);
        return {
          tabBarLabel: 'المزيد',
          tabBarAccessibilityLabel: 'المزيد',
          tabBarIcon: tabIcon('ellipsis-horizontal-circle-outline', 'ellipsis-horizontal-circle'),
          tabBarStyle: focused && focused !== 'AccountMain' ? { display: 'none' } : barStyle,
        };
      },
    },
    {
      name: 'MerchantWallet',
      component: MerchantWalletScreen,
      options: { tabBarLabel: 'المحفظة', tabBarStyle: { display: 'none' }, ...hiddenOnBar },
    },
    {
      name: 'MerchantSupport',
      component: SupportNavigator,
      options: { tabBarLabel: 'الدعم', tabBarStyle: { display: 'none' }, ...hiddenOnBar },
    },
    {
      name: 'MerchantStoreSettings',
      component: StoreSettingsScreen,
      options: { tabBarLabel: 'المعلومات', tabBarStyle: { display: 'none' }, ...hiddenOnBar },
    },
  ];
  const visible = tabs.slice(0, 5);
  const orderedTabs = Platform.OS === 'web' ? [...visible].reverse().concat(tabs.slice(5)) : tabs;

  const content = (
    <Tab.Navigator
      initialRouteName="MerchantDashboard"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.inkTertiary,
        tabBarStyle: barStyle,
        tabBarLabelStyle: { fontSize: 11, fontFamily: FONTS.medium, marginTop: 2 },
      }}
    >
      {orderedTabs.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component} options={tab.options} />
      ))}
    </Tab.Navigator>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row-reverse', backgroundColor: COLORS.background }}>
        <DesktopSidebar />
        <View style={{ flex: 1, padding: 24, paddingBottom: 0 }}>
          <DesktopTopHeader />
          <View style={{ flex: 1, borderRadius: RADIUS.xl, overflow: 'hidden' }}>
            {content}
          </View>
        </View>
      </View>
    );
  }

  return content;
}

const UI = {
  textDark: COLORS.textPrimary,
  textGrey: COLORS.textSecondary,
  primary: COLORS.primary,
};

const softShadow = {
  shadowColor: COLORS.primaryDark,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.07,
  shadowRadius: 20,
  elevation: 3,
};

function DesktopTopHeader() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const showFullNavigation = width >= BREAKPOINTS.wide;
  const routeName = useNavigationState((state) => {
    if (!state) return 'MerchantDashboard';
    const currentRoute = state.routes[state.index];
    if (currentRoute.state && currentRoute.state.index !== undefined) {
      // nested route logic if needed
    }
    return currentRoute.name;
  });

  const getStyle = (targetRoute: string, alias?: string) => {
    const isActive = routeName === targetRoute || routeName === alias;
    return isActive ? topHeaderStyles.navLinkActive : topHeaderStyles.navLink;
  };

  const currentLabel = ({
    MerchantDashboard: 'نظرة عامة',
    MerchantOrders: 'الطلبات',
    MerchantProducts: 'المنتجات',
    MerchantHistory: 'سجل الطلبات',
    MerchantAccount: 'الحساب',
    MerchantWallet: 'المحفظة',
    MerchantSupport: 'الدعم',
    MerchantStoreSettings: 'بيانات المتجر',
  } as Record<string, string>)[routeName] ?? 'مساحة التاجر';

  return (
    <View style={topHeaderStyles.topHeader}>
      <View style={topHeaderStyles.workspaceIdentity}>
        <View style={topHeaderStyles.workspaceMark}><Text style={topHeaderStyles.workspaceMarkText}>م</Text></View>
        <View style={topHeaderStyles.workspaceCopy}>
          <Text style={topHeaderStyles.workspaceTitle}>مساحة التاجر</Text>
          <Text style={topHeaderStyles.workspaceSubtitle}>إدارة المتجر</Text>
        </View>
      </View>

      {showFullNavigation ? (
        <View style={topHeaderStyles.navLinks}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantDashboard')} accessibilityRole="button" accessibilityLabel="الرئيسية">
            <Text style={getStyle('MerchantDashboard')}>الرئيسية</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantAccount', { screen: 'Reports' })} accessibilityRole="button" accessibilityLabel="التقارير">
            <Text style={getStyle('MerchantAccount', 'Reports')}>التقارير</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantProducts')} accessibilityRole="button" accessibilityLabel="المنتجات">
            <Text style={getStyle('MerchantProducts')}>المنتجات</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantOrders')} accessibilityRole="button" accessibilityLabel="الطلبات">
            <Text style={getStyle('MerchantOrders')}>الطلبات</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantHistory')} accessibilityRole="button" accessibilityLabel="سجل الطلبات">
            <Text style={getStyle('MerchantHistory')}>السجل</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantWallet')} accessibilityRole="button" accessibilityLabel="المحفظة">
            <Text style={getStyle('MerchantWallet')}>المحفظة</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantSupport')} accessibilityRole="button" accessibilityLabel="الدعم">
            <Text style={getStyle('MerchantSupport')}>الدعم</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantStoreSettings')} accessibilityRole="button" accessibilityLabel="بيانات المتجر">
            <Text style={getStyle('MerchantStoreSettings')}>المعلومات</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={topHeaderStyles.currentContext}>
          <View style={topHeaderStyles.currentContextDot} />
          <Text style={topHeaderStyles.currentContextText}>{currentLabel}</Text>
        </View>
      )}

      <View style={topHeaderStyles.headerRight}>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('MerchantOrders')} accessibilityRole="button" accessibilityLabel="فتح الطلبات">
          <Ionicons name="search-outline" size={20} color={UI.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('MerchantAccount', { screen: 'RoleNotifications', params: { role: 'merchant' } })} accessibilityRole="button" accessibilityLabel="الإشعارات">
          <Ionicons name="notifications-outline" size={20} color={UI.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.avatarMini} onPress={() => navigation.navigate('MerchantAccount')} accessibilityRole="button" accessibilityLabel="حساب التاجر">
          <Ionicons name="person" size={16} color={COLORS.surface} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const topHeaderStyles = StyleSheet.create({
  topHeader: {
    minHeight: 54, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, gap: 18,
  },
  workspaceIdentity: { minWidth: 160, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  workspaceMark: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }],
  },
  workspaceMarkText: { color: COLORS.textPrimary, fontSize: 18, fontFamily: FONTS.bold },
  workspaceCopy: { alignItems: 'flex-end' },
  workspaceTitle: { color: COLORS.textPrimary, fontSize: 13, fontFamily: FONTS.bold },
  workspaceSubtitle: { color: COLORS.textMuted, fontSize: 10, fontFamily: FONTS.regular, marginTop: 2 },
  navLinks: {
    flexDirection: 'row-reverse', backgroundColor: COLORS.surface, borderRadius: RADIUS.full,
    paddingHorizontal: 7, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border, ...softShadow,
  },
  navLink: { fontSize: 11, fontFamily: FONTS.medium, color: UI.textGrey, paddingHorizontal: 11, paddingVertical: 8 },
  navLinkActive: {
    fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.primary, paddingHorizontal: 11,
    paddingVertical: 8, backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.full,
  },
  currentContext: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, minHeight: 40,
  },
  currentContextDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  currentContextText: { color: COLORS.textPrimary, fontSize: 13, fontFamily: FONTS.semiBold },
  headerRight: { minWidth: 160, flexDirection: 'row-reverse', justifyContent: 'flex-start', alignItems: 'center', gap: 9 },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', ...softShadow,
  },
  avatarMini: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: UI.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});

const tabStyles = StyleSheet.create({
  centerAction: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
    borderWidth: 4,
    borderColor: COLORS.surface,
    ...Platform.select({
      web: { boxShadow: '0 6px 16px rgba(23,37,84,0.25)' } as any,
      default: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  centerActionIdle: { backgroundColor: COLORS.primaryLight },
  tabIconWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  tabIndicator: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
});
