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
import { t, tv } from '@marketplace/shared-i18n';

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
        <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
        <View style={sidebarStyles.logoAccent} />
      </View>

      <View style={sidebarStyles.menu}>
        {SIDEBAR_TABS.map((tab) => {
          const isActive = routeName === tab.name || (tab.name === 'AdminMore' && routeName === 'AdminMoreMain');
          return (
            <TouchableOpacity
              key={tab.name}
              style={[sidebarStyles.menuItem, isActive && sidebarStyles.menuItemActive]}
              onPress={() => handleNavigate(tab)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={tv(tab.label)}
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons name={isActive ? tab.activeIcon : tab.icon as any} size={22} color={isActive ? '#FFFFFF' : '#9CA3AF'} />
              {isActive ? <View style={sidebarStyles.activeDot} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={sidebarStyles.footer}>
        <TouchableOpacity style={sidebarStyles.menuItem} onPress={signOut} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('تسجيل الخروج')}>
          <Ionicons name="log-out-outline" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    width: 72,
    marginVertical: 16,
    marginRight: 16,
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    zIndex: 10,
    ...softShadow,
  },
  logoArea: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 5,
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
    gap: 6,
  },
  menuItem: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  menuItemActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  activeDot: {
    position: 'absolute',
    left: -5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.secondary,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
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
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminDashboard')} accessibilityRole="button" accessibilityLabel={t('الرئيسية')}>
          <Text style={getStyle('AdminDashboard')}>{t('الرئيسية')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminOrders')} accessibilityRole="button" accessibilityLabel={t('الطلبات')}>
          <Text style={getStyle('AdminOrders')}>{t('الطلبات')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMerchants')} accessibilityRole="button" accessibilityLabel={t('المتاجر')}>
          <Text style={getStyle('AdminMerchants')}>{t('المتاجر')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminUsers')} accessibilityRole="button" accessibilityLabel={t('المستخدمون')}>
          <Text style={getStyle('AdminUsers')}>{t('المستخدمون')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminDelivery' })} accessibilityRole="button" accessibilityLabel={t('السائقون')}>
          <Text style={getStyle('AdminDelivery')}>{t('السائقون')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminWallet' })} accessibilityRole="button" accessibilityLabel={t('السحب')}>
          <Text style={getStyle('AdminWallet')}>{t('السحب')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminSettings' })} accessibilityRole="button" accessibilityLabel={t('الإعدادات')}>
          <Text style={getStyle('AdminSettings')}>{t('الإعدادات')}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminSupport' })} accessibilityRole="button" accessibilityLabel={t('الدعم')}>
          <Text style={getStyle('AdminSupport')}>{t('الدعم')}</Text>
        </TouchableOpacity>
      </View>
      ) : (
        <View style={topHeaderStyles.currentContext}>
          <View style={topHeaderStyles.currentContextDot} />
          <Text style={topHeaderStyles.currentContextText}>{tv(currentLabel)}</Text>
        </View>
      )}
      <View style={topHeaderStyles.headerRight}>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('AdminOrders')} accessibilityRole="button" accessibilityLabel={t('البحث')}>
          <Ionicons name="search-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminNotifications' })} accessibilityRole="button" accessibilityLabel={t('الإشعارات')}>
          <Ionicons name="notifications-outline" size={20} color={COLORS.textPrimary} />
          <View style={topHeaderStyles.notificationDot} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.avatarMini} onPress={() => navigation.navigate('AdminMore', { screen: 'AdminSettings' })} accessibilityRole="button" accessibilityLabel={t('حساب المدير')}>
          <Ionicons name="person" size={17} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const topHeaderStyles = StyleSheet.create({
  topHeader: { minHeight: 56, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', marginBottom: 14, position: 'relative' },
  navLinks: { flexDirection: 'row-reverse', backgroundColor: COLORS.surface, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border, ...softShadow },
  navLink: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.textSecondary, paddingHorizontal: 14, paddingVertical: 8 },
  navLinkActive: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.full },
  currentContext: { minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, ...softShadow },
  currentContextDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  currentContextText: { color: COLORS.textPrimary, fontSize: 13, fontFamily: FONTS.semiBold },
  headerRight: { position: 'absolute', left: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', position: 'relative', ...softShadow },
  notificationDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.accentCoral, top: 7, right: 7, borderWidth: 2, borderColor: COLORS.surface },
  avatarMini: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#B5DB55' },
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
          left: 14,
          right: 14,
          bottom: Platform.OS === 'ios' ? 14 : 10,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderWidth: 1,
          borderColor: COLORS.border,
          elevation: 10,
          shadowColor: COLORS.primaryDark,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
          height: Platform.OS === 'ios' ? 72 : 66,
          paddingBottom: Platform.OS === 'ios' ? 14 : 9,
          paddingTop: 9,
          borderRadius: RADIUS.xl,
          position: 'absolute',
        },
        tabBarLabelStyle: { fontSize: 11.5, fontFamily: FONTS.semiBold },
      }}
    >
      <Tab.Screen name="AdminDashboard" component={AdminDashboardScreen}
        options={{ tabBarLabel: t('الرئيسية'), tabBarAccessibilityLabel: t('الرئيسية'), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminMerchants" component={AdminMerchantsScreen}
        options={{ tabBarLabel: t('التجار'), tabBarAccessibilityLabel: t('التجار'), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminOrders" component={AdminOrdersScreen}
        options={{ tabBarLabel: t('الطلبات'), tabBarAccessibilityLabel: t('الطلبات'), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminUsers" component={AdminUsersScreen}
        options={{ tabBarLabel: t('المستخدمون'), tabBarAccessibilityLabel: t('المستخدمون'), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminMore" component={MoreNavigator}
        options={{ tabBarLabel: t('المزيد'), tabBarAccessibilityLabel: t('المزيد'), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} size={22} color={color} /> }} />
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
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  desktopFrame: {
    flex: 1,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
