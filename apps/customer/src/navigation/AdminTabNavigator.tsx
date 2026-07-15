import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@marketplace/shared-hooks';

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

const A = { purple: '#7C3AED', purpleLight: '#EDE9FE', bg: '#F5F3FF', dark: '#111827' };

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

const SIDEBAR_TABS = [
  { name: 'AdminDashboard', label: 'الرئيسية', icon: 'home-outline', activeIcon: 'home' },
  { name: 'AdminMerchants', label: 'المتاجر', icon: 'storefront-outline', activeIcon: 'storefront' },
  { name: 'AdminOrders', label: 'الطلبات', icon: 'receipt-outline', activeIcon: 'receipt' },
  { name: 'AdminUsers', label: 'المستخدمون', icon: 'people-outline', activeIcon: 'people' },
  { name: 'AdminDelivery', label: 'السائقون', icon: 'bicycle-outline', activeIcon: 'bicycle', isMore: true },
  { name: 'AdminWallet', label: 'طلبات السحب', icon: 'wallet-outline', activeIcon: 'wallet', isMore: true },
  { name: 'AdminPhysicalReturns', label: 'الإرجاعات المادية', icon: 'return-down-back-outline', activeIcon: 'return-down-back', isMore: true },
  { name: 'AdminCodCollections', label: 'تحصيلات الدفع', icon: 'cash-outline', activeIcon: 'cash', isMore: true },
  { name: 'AdminFinancialReconciliation', label: 'المطابقة المالية', icon: 'git-compare-outline', activeIcon: 'git-compare', isMore: true },
  { name: 'AdminSettings', label: 'الإعدادات', icon: 'settings-outline', activeIcon: 'settings', isMore: true },
  { name: 'AdminSupport', label: 'الدعم الفني', icon: 'headset-outline', activeIcon: 'headset', isMore: true },
];

function AdminSidebar({ navigation, state }: any) {
  let routeName = 'AdminDashboard';
  if (state) {
    const route = state.routes[state.index];
    if (route.name === 'AdminMore') {
      const moreState = route.state as any;
      if (moreState && moreState.routes) {
        routeName = moreState.routes[moreState.index].name;
      } else {
        routeName = 'AdminMoreMain';
      }
    } else {
      routeName = route.name;
    }
  }

  const signOut = useAuthStore((s) => s.signOut);

  const handleNavigate = (tab: any) => {
    if (!navigation) return;
    if (tab.isMore) {
      navigation.navigate('AdminMore', { screen: tab.name });
    } else {
      navigation.navigate(tab.name);
    }
  };

  return (
    <View style={ss.sidebar}>
      <View style={ss.logoArea}>
        <View style={ss.logoIconWrap}>
          <Ionicons name="shield-half" size={24} color="#FFFFFF" />
        </View>
        <View>
          <Text style={ss.logoText}>لوحة التحكم</Text>
          <Text style={ss.logoSubText}>إدارة التطبيق</Text>
        </View>
      </View>

      <View style={ss.menu}>
        {SIDEBAR_TABS.map((tab) => {
          const active = routeName === tab.name || (tab.name === 'AdminMore' && routeName === 'AdminMoreMain');
          return (
            <TouchableOpacity
              key={tab.name}
              style={[ss.menuItem, active && ss.menuItemActive]}
              onPress={() => handleNavigate(tab)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`الانتقال إلى ${tab.label}`}
              accessibilityState={{ selected: active }}
            >
              {active && <View style={ss.activeIndicator} />}
              <Text style={[ss.menuLabel, active && ss.menuLabelActive]}>{tab.label}</Text>
              <Ionicons name={(active ? tab.activeIcon : tab.icon) as any} size={22} color={active ? '#1E3A8A' : '#9CA3AF'} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={ss.bottomMenu}>
        <TouchableOpacity
          style={ss.logoutBtn}
          onPress={signOut}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="تسجيل الخروج من لوحة الإدارة"
        >
           <Text style={ss.logoutText}>تسجيل الخروج</Text>
           <Ionicons name="log-out-outline" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  sidebar: { width: 260, backgroundColor: '#FFFFFF', paddingVertical: 24, borderLeftWidth: 1, borderLeftColor: '#F3F4F6' },
  logoArea: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 24, marginBottom: 40 },
  logoIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1E3A8A', alignItems: 'center', justifyContent: 'center', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  logoText: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'right' },
  logoSubText: { fontSize: 12, color: '#6B7280', textAlign: 'right', marginTop: 2, fontWeight: '500' },
  menu: { flex: 1, gap: 4, paddingHorizontal: 12 },
  menuItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, position: 'relative' },
  menuItemActive: { backgroundColor: '#EFF6FF' },
  activeIndicator: { position: 'absolute', right: 0, top: '25%', bottom: '25%', width: 4, backgroundColor: '#1E3A8A', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  menuLabel: { fontSize: 15, fontWeight: '700', color: '#6B7280', flex: 1, textAlign: 'right' },
  menuLabelActive: { color: '#1E3A8A', fontWeight: '900' },
  bottomMenu: { paddingHorizontal: 12, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#F3F4F6', marginHorizontal: 12 },
  logoutBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12 },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#6B7280', flex: 1, textAlign: 'right' },
});

export default function AdminTabNavigator() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const [desktopTabs, setDesktopTabs] = React.useState<{ navigation: any; state: any } | null>(null);
  const updateDesktopTabs = React.useCallback((next: { navigation: any; state: any }) => setDesktopTabs(next), []);

  const content = (
    <Tab.Navigator
      initialRouteName="AdminDashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: A.purple,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: isDesktop ? { display: 'none' } : {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          elevation: 10,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
      tabBar={isDesktop ? (props) => <DesktopTabBridge {...props} onUpdate={updateDesktopTabs} /> : undefined}
    >
      <Tab.Screen name="AdminDashboard" component={AdminDashboardScreen}
        options={{ tabBarLabel: 'الرئيسية', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminMerchants" component={AdminMerchantsScreen}
        options={{ tabBarLabel: 'التجار', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminOrders" component={AdminOrdersScreen}
        options={{ tabBarLabel: 'الطلبات', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminUsers" component={AdminUsersScreen}
        options={{ tabBarLabel: 'المستخدمون', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tab.Screen name="AdminMore" component={MoreNavigator}
        options={{ tabBarLabel: 'المزيد', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} size={22} color={color} /> }} />
    </Tab.Navigator>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row-reverse', backgroundColor: '#F3F4F6' }}>
        <AdminSidebar navigation={desktopTabs?.navigation} state={desktopTabs?.state} />
        <View style={{ flex: 1 }}>{content}</View>
      </View>
    );
  }
  return content;
}

function DesktopTabBridge({ navigation, state, onUpdate }: any) {
  React.useEffect(() => { onUpdate({ navigation, state }); }, [navigation, onUpdate, state]);
  return null;
}
