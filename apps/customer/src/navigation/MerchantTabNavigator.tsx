import React from 'react';
import { useWindowDimensions, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
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

import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useAuthStore } from '@marketplace/shared-hooks';
import { t, tv } from '@marketplace/shared-i18n';

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
              accessibilityLabel={tv(tab.label)}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons name={isActive ? tab.activeIcon : tab.icon as any} size={21} color={isActive ? COLORS.surface : COLORS.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={sidebarStyles.footer}>
        <TouchableOpacity style={sidebarStyles.menuItem} onPress={signOut} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('تسجيل الخروج')}>
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

export default function MerchantTabNavigator() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.desktop;

  const content = (
    <Tab.Navigator
      initialRouteName="MerchantDashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: isDesktop ? { display: 'none' } : {
          backgroundColor: COLORS.surface,
          borderTopWidth: 0,
          elevation: 14,
          shadowColor: COLORS.primaryDark,
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
          height: 72,
          paddingBottom: 10,
          paddingTop: 10,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          position: 'absolute',
        },
        tabBarItemStyle: { borderRadius: RADIUS.lg, marginHorizontal: 2 },
        tabBarLabelStyle: { fontSize: 11, fontFamily: FONTS.semiBold },
      }}
    >
      <Tab.Screen
        name="MerchantDashboard"
        component={MerchantDashboardScreen}
        options={{
          tabBarLabel: t('الرئيسية'),
          tabBarAccessibilityLabel: t('الرئيسية'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantOrders"
        component={OrdersNavigator}
        options={{
          tabBarLabel: t('الطلبات'),
          tabBarAccessibilityLabel: t('الطلبات النشطة'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantProducts"
        component={ProductsNavigator}
        options={{
          tabBarLabel: t('منتجاتي'),
          tabBarAccessibilityLabel: t('منتجات المتجر'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'cube' : 'cube-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantHistory"
        component={HistoryNavigator}
        options={{
          tabBarLabel: t('السجل'),
          tabBarAccessibilityLabel: t('سجل الطلبات'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantAccount"
        component={AccountNavigator}
        options={{
          tabBarLabel: t('حسابي'),
          tabBarAccessibilityLabel: t('حساب التاجر'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantWallet"
        component={MerchantWalletScreen}
        options={{
          tabBarLabel: t('المحفظة'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={size} color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="MerchantSupport"
        component={SupportNavigator}
        options={{
          tabBarLabel: t('الدعم'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'headset' : 'headset-outline'} size={size} color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="MerchantStoreSettings"
        component={StoreSettingsScreen}
        options={{
          tabBarLabel: t('المعلومات'),
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={size} color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />
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
        <View style={topHeaderStyles.workspaceMark}><Text style={topHeaderStyles.workspaceMarkText}>{t('م')}</Text></View>
        <View style={topHeaderStyles.workspaceCopy}>
          <Text style={topHeaderStyles.workspaceTitle}>{t('مساحة التاجر')}</Text>
          <Text style={topHeaderStyles.workspaceSubtitle}>{t('إدارة المتجر')}</Text>
        </View>
      </View>

      {showFullNavigation ? (
        <View style={topHeaderStyles.navLinks}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantDashboard')} accessibilityRole="button" accessibilityLabel={t('الرئيسية')}>
            <Text style={getStyle('MerchantDashboard')}>{t('الرئيسية')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantAccount', { screen: 'Reports' })} accessibilityRole="button" accessibilityLabel={t('التقارير')}>
            <Text style={getStyle('MerchantAccount', 'Reports')}>{t('التقارير')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantProducts')} accessibilityRole="button" accessibilityLabel={t('المنتجات')}>
            <Text style={getStyle('MerchantProducts')}>{t('المنتجات')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantOrders')} accessibilityRole="button" accessibilityLabel={t('الطلبات')}>
            <Text style={getStyle('MerchantOrders')}>{t('الطلبات')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantHistory')} accessibilityRole="button" accessibilityLabel={t('سجل الطلبات')}>
            <Text style={getStyle('MerchantHistory')}>{t('السجل')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantWallet')} accessibilityRole="button" accessibilityLabel={t('المحفظة')}>
            <Text style={getStyle('MerchantWallet')}>{t('المحفظة')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantSupport')} accessibilityRole="button" accessibilityLabel={t('الدعم')}>
            <Text style={getStyle('MerchantSupport')}>{t('الدعم')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('MerchantStoreSettings')} accessibilityRole="button" accessibilityLabel={t('بيانات المتجر')}>
            <Text style={getStyle('MerchantStoreSettings')}>{t('المعلومات')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={topHeaderStyles.currentContext}>
          <View style={topHeaderStyles.currentContextDot} />
          <Text style={topHeaderStyles.currentContextText}>{tv(currentLabel)}</Text>
        </View>
      )}

      <View style={topHeaderStyles.headerRight}>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('MerchantOrders')} accessibilityRole="button" accessibilityLabel={t('فتح الطلبات')}>
          <Ionicons name="search-outline" size={20} color={UI.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('MerchantAccount', { screen: 'RoleNotifications', params: { role: 'merchant' } })} accessibilityRole="button" accessibilityLabel={t('الإشعارات')}>
          <Ionicons name="notifications-outline" size={20} color={UI.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.avatarMini} onPress={() => navigation.navigate('MerchantAccount')} accessibilityRole="button" accessibilityLabel={t('حساب التاجر')}>
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
