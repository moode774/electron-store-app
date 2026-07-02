import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '@marketplace/shared-hooks';

import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminMerchantsScreen from '../screens/admin/AdminMerchantsScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import SettingsScreen from '../screens/shared/SettingsScreen';

export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminUsers: undefined;
  AdminMerchants: undefined;
  AdminOrders: undefined;
  AdminSettings: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

export default function AdminTabNavigator(): React.JSX.Element {
  const colors = useSettingsStore((s) => s.colors);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
          paddingBottom: 9,
          paddingTop: 9,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen name="AdminDashboard" component={AdminDashboardScreen}
        options={{ tabBarLabel: 'الرئيسية', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="AdminOrders" component={AdminOrdersScreen}
        options={{ tabBarLabel: 'الطلبات', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="AdminMerchants" component={AdminMerchantsScreen}
        options={{ tabBarLabel: 'المتاجر', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="AdminUsers" component={AdminUsersScreen}
        options={{ tabBarLabel: 'المستخدمون', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="AdminSettings" component={SettingsScreen}
        options={{ tabBarLabel: 'الإعدادات', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} /> }} />
    </Tab.Navigator>
  );
}
