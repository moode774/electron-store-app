import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';

import MerchantDashboardScreen from '../screens/merchant/MerchantDashboardScreen';
import MerchantOrdersScreen from '../screens/merchant/MerchantOrdersScreen';
import MerchantOrderDetailsScreen from '../screens/merchant/MerchantOrderDetailsScreen';
import MerchantProductsScreen from '../screens/merchant/MerchantProductsScreen';
import AddProductScreen from '../screens/merchant/AddProductScreen';
import MerchantAccountScreen from '../screens/merchant/MerchantAccountScreen';
import MerchantReportsScreen from '../screens/merchant/MerchantReportsScreen';
import MerchantWalletScreen from '../screens/merchant/MerchantWalletScreen';
import StoreSettingsScreen from '../screens/merchant/StoreSettingsScreen';
import MerchantCouponsScreen from '../screens/merchant/MerchantCouponsScreen';
import ConversationsListScreen from '../screens/main/chat/ConversationsListScreen';
import ChatScreen from '../screens/main/chat/ChatScreen';
import RoleNotificationsScreen from '../screens/shared/RoleNotificationsScreen';

export type MerchantOrdersStackParamList = {
  OrdersList: undefined;
  OrderDetails: { order?: object };
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
  StoreSettings: undefined;
  Reports: undefined;
  Wallet: undefined;
  Coupons: undefined;
  Conversations: { asMerchant?: boolean } | undefined;
  Chat: { conversationId: string; title?: string; asMerchant?: boolean };
  RoleNotifications: { role: 'merchant' };
};

const AccountStack = createNativeStackNavigator<MerchantAccountStackParamList>();
function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountMain" component={MerchantAccountScreen} />
      <AccountStack.Screen name="StoreSettings" component={StoreSettingsScreen} />
      <AccountStack.Screen name="Reports" component={MerchantReportsScreen} />
      <AccountStack.Screen name="Wallet" component={MerchantWalletScreen} />
      <AccountStack.Screen name="Coupons" component={MerchantCouponsScreen} />
      <AccountStack.Screen name="Conversations" component={ConversationsListScreen} />
      <AccountStack.Screen name="Chat" component={ChatScreen} />
      <AccountStack.Screen name="RoleNotifications" component={RoleNotificationsScreen} />
    </AccountStack.Navigator>
  );
}

export type MerchantTabParamList = {
  MerchantDashboard: undefined;
  MerchantOrders: undefined;
  MerchantProducts: undefined;
  MerchantAccount: undefined;
};

const Tab = createBottomTabNavigator<MerchantTabParamList>();

export default function MerchantTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: '#3B5BDB',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
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
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantOrders"
        component={OrdersNavigator}
        options={{
          tabBarLabel: 'الطلبات',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantProducts"
        component={ProductsNavigator}
        options={{
          tabBarLabel: 'منتجاتي',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'cube' : 'cube-outline'} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MerchantAccount"
        component={AccountNavigator}
        options={{
          tabBarLabel: 'حسابي',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
