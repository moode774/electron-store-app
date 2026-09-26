import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useNavigation, useNavigationState } from '@react-navigation/native';

import ApiKeysScreen from '../screens/shared/ApiKeysScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminMerchantsScreen from '../screens/admin/AdminMerchantsScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminMoreScreen from '../screens/admin/AdminMoreScreen';
import AdminDeliveryScreen from '../screens/admin/AdminDeliveryScreen';
import AdminWalletScreen from '../screens/admin/AdminWalletScreen';
import AdminSupportScreen from '../screens/admin/AdminSupportScreen';
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen';
import AdminNotificationsScreen from '../screens/admin/AdminNotificationsScreen';
import AdminBannersScreen from '../screens/admin/AdminBannersScreen';
import AdminCouponsScreen from '../screens/admin/AdminCouponsScreen';
import AdminBroadcastScreen from '../screens/admin/AdminBroadcastScreen';
import AdminRefundsScreen from '../screens/admin/AdminRefundsScreen';
import AdminProductsScreen from '../screens/admin/AdminProductsScreen';
import AdminPhysicalReturnsScreen from '../screens/admin/AdminPhysicalReturnsScreen';
import AdminFinancialReconciliationScreen from '../screens/admin/AdminFinancialReconciliationScreen';
import AdminCodCollectionsScreen from '../screens/admin/AdminCodCollectionsScreen';

const softShadow = {
  shadowColor: COLORS.primaryDark,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.08,
  shadowRadius: 24,
  elevation: 4,
};

export type AdminMoreStackParamList = {
  AdminMoreMain: undefined;
  ApiKeys: undefined;
  AdminDelivery: undefined;
  AdminWallet: undefined;
  AdminSupport: undefined;
  AdminSettings: undefined;
  AdminNotifications: undefined;
  AdminBanners: undefined;
  AdminCoupons: undefined;
  AdminBroadcast: undefined;
  AdminRefunds: undefined;
  AdminProducts: undefined;
  AdminPhysicalReturns: undefined;
  AdminFinancialReconciliation: undefined;
  AdminCodCollections: undefined;
};

const MoreStack = createNativeStackNavigator<AdminMoreStackParamList>();
function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="AdminMoreMain" component={AdminMoreScreen} />
      <MoreStack.Screen name="ApiKeys" component={ApiKeysScreen} />
      <MoreStack.Screen name="AdminDelivery" component={AdminDeliveryScreen} />
      <MoreStack.Screen name="AdminWallet" component={AdminWalletScreen} />
      <MoreStack.Screen name="AdminSupport" component={AdminSupportScreen} />
      <MoreStack.Screen name="AdminSettings" component={AdminSettingsScreen} />
      <MoreStack.Screen name="AdminNotifications" component={AdminNotificationsScreen} />
      <MoreStack.Screen name="AdminBanners" component={AdminBannersScreen} />
      <MoreStack.Screen name="AdminCoupons" component={AdminCouponsScreen} />
      <MoreStack.Screen name="AdminBroadcast" component={AdminBroadcastScreen} />
      <MoreStack.Screen name="AdminRefunds" component={AdminRefundsScreen} />
      <MoreStack.Screen name="AdminProducts" component={AdminProductsScreen} />
      <MoreStack.Screen name="AdminPhysicalReturns" component={AdminPhysicalReturnsScreen} />
      <MoreStack.Screen name="AdminFinancialReconciliation" component={AdminFinancialReconciliationScreen} />
      <MoreStack.Screen name="AdminCodCollections" component={AdminCodCollectionsScreen} />
    </MoreStack.Navigator>
  );
}

export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminMerchants: undefined;
  AdminOrders: { initialSearch?: string } | undefined;
  AdminUsers: undefined;
  AdminMore: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

// ---- Sidebar Tabs ----
const SIDEBAR_TABS = [
  { name: 'AdminDashboard', label: 'الرئيسية', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'AdminMerchants', label: 'المتاجر', icon: 'storefront-outline', activeIcon: 'storefront' },
  { name: 'AdminOrders', label: 'الطلبات', icon: 'receipt-outline', activeIcon: 'receipt' },
  { name: 'AdminUsers', label: 'المستخدمون', icon: 'people-outline', activeIcon: 'people' },
  { name: 'AdminDelivery', label: 'السائقون', icon: 'bicycle-outline', activeIcon: 'bicycle', isMore: true },
  { name: 'AdminWallet', label: 'طلبات السحب', icon: 'wallet-outline', activeIcon: 'wallet', isMore: true },
  { name: 'AdminPhysicalReturns', label: 'الإرجاعات', icon: 'return-down-back-outline', activeIcon: 'return-down-back', isMore: true },
  { name: 'AdminCodCollections', label: 'التحصيلات', icon: 'cash-outline', activeIcon: 'cash', isMore: true },
  { name: 'AdminFinancialReconciliation', label: 'المطابقة', icon: 'git-compare-outline', activeIcon: 'git-compare', isMore: true },
  { name: 'AdminMoreMain', label: 'كل الأدوات', icon: 'options-outline', activeIcon: 'options', isMore: true },
  { name: 'AdminSettings', label: 'الإعدادات', icon: 'settings-outline', activeIcon: 'settings', isMore: true },
  { name: 'AdminSupport', label: 'الدعم', icon: 'headset-outline', activeIcon: 'headset', isMore: true },
];

// ---- Desktop floating rail ----
function DesktopSidebar() {
  const navigation = useNavigation<any>();
  const routeName = useNavigationState((state) => {
    if (!state) return 'AdminDashboard';
    const currentRoute = state.routes[state.index];
    if (currentRoute.name === 'AdminMore') {
      const moreState = currentRoute.state as any;
      if (moreState && moreState.routes) {
        return moreState.routes[moreState.index].name;
      }
      return 'AdminMoreMain';
    }
    return currentRoute.name;
  });
  const signOut = useAuthStore((s) => s.signOut);

  const handleNavigate = (tab: any) => {
    if (tab.isMore) {
      navigation.navigate('AdminMore', { screen: tab.name });
    } else {
      navigation.navigate(tab.name);
    }
  };

  return (
    <View style={sidebarStyles.container}>
      <View style={sidebarStyles.logoArea}>
        <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
        <View style={sidebarStyles.logoAccent} />
      </View>

      <View style={sidebarStyles.menu}>
        {SIDEBAR_TABS.map((tab, index) => {
          const isActive = routeName === tab.name || (tab.name === 'AdminMore' && routeName === 'AdminMoreMain');
          return (
            <React.Fragment key={tab.name}>
            <TouchableOpacity
              style={[sidebarStyles.menuItem, isActive && sidebarStyles.menuItemActive]}
              onPress={() => handleNavigate(tab)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons name={isActive ? tab.activeIcon : tab.icon as any} size={20} color={isActive ? '#FFFFFF' : '#94A3B8'} />
              {isActive ? <View style={sidebarStyles.activeDot} /> : null}
            </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>

      <View style={sidebarStyles.footer}>
        <TouchableOpacity style={sidebarStyles.menuItem} onPress={signOut} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="تسجيل الخروج">
          <Ionicons name="log-out-outline" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    width: 64,
    marginVertical: 16,
    marginRight: 16,
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 3,
  },
  logoArea: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
    elevation: 3,
    position: 'relative',
  },
  logoAccent: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.secondary,
    borderWidth: 2,
    borderColor: COLORS.surface,
    left: -2,
    top: -2,
  },
  menu: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    gap: 2,
  },
  menuItem: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  menuItemActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  activeDot: {
    position: 'absolute',
    left: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 6,
  },
});

// ---- Desktop command header ----
function DesktopTopHeader() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const showFullNavigation = width >= BREAKPOINTS.wide;
  const routeName = useNavigationState((state) => {
    if (!state) return 'AdminDashboard';
    const currentRoute = state.routes[state.index];
    if (currentRoute.name === 'AdminMore') {
      const moreState = currentRoute.state as any;
      if (moreState && moreState.routes) {
        return moreState.routes[moreState.index].name;
      }
      return 'AdminMoreMain';
    }
    return currentRoute.name;
  });

  const getStyle = (targetRoute: string, alias?: string) => {
    const isActive = routeName === targetRoute || routeName === alias;
    return isActive ? topHeaderStyles.navLinkActive : topHeaderStyles.navLink;
  };

  const currentLabel = ({
    AdminDashboard: 'الرئيسية',
    AdminOrders: 'الطلبات',
    AdminMerchants: 'المتاجر',
    AdminUsers: 'المستخدمون',
    AdminDelivery: 'السائقون',
    AdminWallet: 'طلبات السحب',
    AdminSettings: 'الإعدادات',
    AdminSupport: 'الدعم الفني',
  } as Record<string, string>)[routeName] ?? 'لوحة التحكم';

  return (
    <View style={topHeaderStyles.topHeader}>
      {showFullNavigation ? (
      <View style={topHeaderStyles.navLinks}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminDashboard')} accessibilityRole="button" accessibilityLabel="الرئيسية">
          <Text style={getStyle('AdminDashboard')}>الرئيسية</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminOrders')} accessibilityRole="button" accessibilityLabel="الطلبات">
          <Text style={getStyle('AdminOrders')}>الطلبات</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMerchants')} accessibilityRole="button" accessibilityLabel="المتاجر">
          <Text style={getStyle('AdminMerchants')}>المتاجر</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminUsers')} accessibilityRole="button" accessibilityLabel="المستخدمون">
          <Text style={getStyle('AdminUsers')}>المستخدمون</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminDelivery' })} accessibilityRole="button" accessibilityLabel="السائقون">
          <Text style={getStyle('AdminDelivery')}>السائقون</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminWallet' })} accessibilityRole="button" accessibilityLabel="السحب">
          <Text style={getStyle('AdminWallet')}>السحب</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminSettings' })} accessibilityRole="button" accessibilityLabel="الإعدادات">
          <Text style={getStyle('AdminSettings')}>الإعدادات</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminSupport' })} accessibilityRole="button" accessibilityLabel="الدعم">
          <Text style={getStyle('AdminSupport')}>الدعم</Text>
        </TouchableOpacity>
      </View>
      ) : (
        <View style={topHeaderStyles.currentContext}>
          <View style={topHeaderStyles.currentContextDot} />
          <Text style={topHeaderStyles.currentContextText}>{currentLabel}</Text>
        </View>
      )}
      <View style={topHeaderStyles.headerRight}>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('AdminOrders')} accessibilityRole="button" accessibilityLabel="البحث">
          <Ionicons name="search-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminNotifications' })} accessibilityRole="button" accessibilityLabel="الإشعارات">
          <Ionicons name="notifications-outline" size={20} color={COLORS.textPrimary} />
          <View style={topHeaderStyles.notificationDot} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.avatarMini} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminSettings' })} accessibilityRole="button" accessibilityLabel="حساب المدير">
          <Ionicons name="person" size={17} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const topHeaderStyles = StyleSheet.create({
  topHeader: { minHeight: 52, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', marginBottom: 10, position: 'relative' },
  navLinks: { flexDirection: 'row-reverse', backgroundColor: COLORS.surface, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.border },
  navLink: { fontSize: 12.5, fontFamily: FONTS.medium, color: COLORS.textSecondary, paddingHorizontal: 12, paddingVertical: 7 },
  navLinkActive: { fontSize: 12.5, fontFamily: FONTS.semiBold, color: COLORS.primary, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: COLORS.primarySoft, borderRadius: 10 },
  currentContext: { minHeight: 40, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  currentContextDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  currentContextText: { color: COLORS.textPrimary, fontSize: 13, fontFamily: FONTS.semiBold },
  headerRight: { position: 'absolute', left: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  headerIconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.accentCoral, top: 7, right: 7, borderWidth: 2, borderColor: COLORS.surface },
  avatarMini: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
});

// ---- Main Navigator ----
export default function AdminTabNavigator() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.desktop;

  const content = (
    <Tab.Navigator
      initialRouteName="AdminDashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: isDesktop ? { display: 'none' } : {
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          elevation: 0,
          shadowOpacity: 0,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 18 : 8,
          height: Platform.OS === 'ios' ? 78 : 64,

        },
        tabBarLabelStyle: { fontSize: 11.5, fontFamily: FONTS.semiBold },
      }}
    >
      <Tab.Screen name="AdminDashboard" component={AdminDashboardScreen}
        options={{ tabBarLabel: 'الرئيسية', tabBarAccessibilityLabel: 'الرئيسية', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminMerchants" component={AdminMerchantsScreen}
        options={{ tabBarLabel: 'التجار', tabBarAccessibilityLabel: 'التجار', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminOrders" component={AdminOrdersScreen}
        options={{ tabBarLabel: 'الطلبات', tabBarAccessibilityLabel: 'الطلبات', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminUsers" component={AdminUsersScreen}
        options={{ tabBarLabel: 'المستخدمون', tabBarAccessibilityLabel: 'المستخدمون', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminMore" component={MoreNavigator}
        options={{ tabBarLabel: 'الإدارة', tabBarAccessibilityLabel: 'إدارة التطبيق', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} size={22} color={color} /> }} />
    </Tab.Navigator>
  );

  if (isDesktop) {
    return (
      <View style={layoutStyles.desktopRoot}>
        <DesktopSidebar />
        <View style={layoutStyles.desktopMain}>
          <DesktopTopHeader />
          <View style={layoutStyles.desktopFrame}>
            {content}
          </View>
        </View>
      </View>
    );
  }

  return content;
}

const layoutStyles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.background,
  },
  desktopMain: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  desktopFrame: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
