import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

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

import { useWindowDimensions, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
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
        <Ionicons name="storefront" size={28} color="#FFFFFF" />
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
              <Ionicons name={isActive ? tab.activeIcon : tab.icon as any} size={22} color={isActive ? '#FFFFFF' : '#9CA3AF'} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={sidebarStyles.footer}>
        <TouchableOpacity style={sidebarStyles.menuItem} onPress={signOut} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="تسجيل الخروج">
          <Ionicons name="log-out-outline" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    width: 80,
    backgroundColor: '#FFFFFF',
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 1,
    borderColor: '#E5E7EB',
    zIndex: 10,
  },
  logoArea: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#111827', // Primary Color
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  menu: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  menuItem: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  menuItemActive: {
    backgroundColor: '#111827',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
});

export default function MerchantTabNavigator() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const content = (
    <Tab.Navigator
      initialRouteName="MerchantDashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: isDesktop ? { display: 'none' } : {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: '#111827',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.04,
          shadowRadius: 16,
          height: 62,
          paddingBottom: 9,
          paddingTop: 9,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          position: 'absolute',
        },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="MerchantDashboard"
        component={MerchantDashboardScreen}
        options={{
          tabBarLabel: 'الرئيسية',
          tabBarAccessibilityLabel: 'الرئيسية',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantOrders"
        component={OrdersNavigator}
        options={{
          tabBarLabel: 'الطلبات',
          tabBarAccessibilityLabel: 'الطلبات النشطة',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantProducts"
        component={ProductsNavigator}
        options={{
          tabBarLabel: 'منتجاتي',
          tabBarAccessibilityLabel: 'منتجات المتجر',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'cube' : 'cube-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantHistory"
        component={HistoryNavigator}
        options={{
          tabBarLabel: 'السجل',
          tabBarAccessibilityLabel: 'سجل الطلبات',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantAccount"
        component={AccountNavigator}
        options={{
          tabBarLabel: 'حسابي',
          tabBarAccessibilityLabel: 'حساب التاجر',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantWallet"
        component={MerchantWalletScreen}
        options={{
          tabBarLabel: 'المحفظة',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={size} color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="MerchantSupport"
        component={SupportNavigator}
        options={{
          tabBarLabel: 'الدعم',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'headset' : 'headset-outline'} size={size} color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="MerchantStoreSettings"
        component={StoreSettingsScreen}
        options={{
          tabBarLabel: 'المعلومات',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={size} color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tab.Navigator>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row-reverse', backgroundColor: '#F3F4F6' }}>
        <DesktopSidebar />
        <View style={{ flex: 1, padding: 24, paddingBottom: 0 }}>
          <DesktopTopHeader />
          <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>
            {content}
          </View>
        </View>
      </View>
    );
  }

  return content;
}

const UI = {
  textDark: '#111827',
  textGrey: '#6B7280',
  primary: '#111827',
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 10,
  elevation: 2,
};

function DesktopTopHeader() {
  const navigation = useNavigation<any>();
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

  return (
    <View style={topHeaderStyles.topHeader}>
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
      <View style={topHeaderStyles.headerRight}>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('MerchantOrders')} accessibilityRole="button" accessibilityLabel="فتح الطلبات">
          <Ionicons name="search-outline" size={20} color={UI.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.headerIconBtn} onPress={() => navigation.navigate('MerchantAccount', { screen: 'RoleNotifications', params: { role: 'merchant' } })} accessibilityRole="button" accessibilityLabel="الإشعارات">
          <Ionicons name="notifications-outline" size={20} color={UI.textDark} />
        </TouchableOpacity>
        <TouchableOpacity style={topHeaderStyles.avatarMini} onPress={() => navigation.navigate('MerchantAccount')} accessibilityRole="button" accessibilityLabel="حساب التاجر">
          <Ionicons name="person" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const topHeaderStyles = StyleSheet.create({
  topHeader: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', marginBottom: 24, position: 'relative' },
  navLinks: { flexDirection: 'row-reverse', backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 8, paddingVertical: 6, ...softShadow },
  navLink: { fontSize: 13, fontWeight: '600', color: UI.textGrey, paddingHorizontal: 16, paddingVertical: 8 },
  navLinkActive: { fontSize: 13, fontWeight: '700', color: UI.textDark, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 16 },
  headerRight: { position: 'absolute', left: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...softShadow },
  avatarMini: { width: 36, height: 36, borderRadius: 18, backgroundColor: UI.primary, alignItems: 'center', justifyContent: 'center' },
});
