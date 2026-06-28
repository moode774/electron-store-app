import React from 'react';
import { View, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';

import DeliveryOffersScreen from '../screens/delivery/DeliveryOffersScreen';
import ActiveDeliveryScreen from '../screens/delivery/ActiveDeliveryScreen';
import EarningsScreen from '../screens/delivery/EarningsScreen';
import DeliveryAccountScreen from '../screens/delivery/DeliveryAccountScreen';
import DeliveryWalletScreen from '../screens/delivery/DeliveryWalletScreen';
import DeliveryProfileScreen from '../screens/delivery/DeliveryProfileScreen';
import DeliveryZonesScreen from '../screens/delivery/DeliveryZonesScreen';
import RoleNotificationsScreen from '../screens/shared/RoleNotificationsScreen';

export type DeliveryAccountStackParamList = {
  AccountMain: undefined;
  DeliveryProfile: undefined;
  DeliveryZones: undefined;
  DeliveryWallet: undefined;
  RoleNotifications: { role: 'delivery' };
};

const AccountStack = createNativeStackNavigator<DeliveryAccountStackParamList>();
function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountMain" component={DeliveryAccountScreen} />
      <AccountStack.Screen name="DeliveryProfile" component={DeliveryProfileScreen} />
      <AccountStack.Screen name="DeliveryZones" component={DeliveryZonesScreen} />
      <AccountStack.Screen name="DeliveryWallet" component={DeliveryWalletScreen} />
      <AccountStack.Screen name="RoleNotifications" component={RoleNotificationsScreen} />
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
  DeliveryAction: undefined;
  DeliveryEarnings: undefined;
  DeliveryMore: undefined;
};

const Tab = createBottomTabNavigator<DeliveryTabParamList>();

export default function DeliveryTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F3F4F6',
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          height: Platform.OS === 'ios' ? 88 : 70,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          position: 'absolute',
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 4 },
      }}
    >
      <Tab.Screen
        name="DeliveryHome"
        component={OffersNavigator}
        options={{
          tabBarLabel: 'الرئيسية',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="DeliveryOrders"
        component={ActiveDeliveryScreen}
        options={{
          tabBarLabel: 'الطلبات',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="DeliveryAction"
        component={OffersNavigator} // Placeholder
        options={{
          tabBarLabel: 'التوصيل',
          tabBarIcon: ({ focused }) => (
            <View style={{
              width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB',
              alignItems: 'center', justifyContent: 'center',
              marginTop: -32, borderWidth: 4, borderColor: '#F9FAFB',
              shadowColor: '#2563EB', shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
            }}>
              <Ionicons name="git-network-outline" size={26} color="#FFFFFF" style={{ transform: [{ rotate: '90deg' }] }} />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 11, fontWeight: '800', color: '#2563EB', marginTop: 4 },
        }}
      />
      <Tab.Screen
        name="DeliveryEarnings"
        component={EarningsScreen}
        options={{
          tabBarLabel: 'الأرباح',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="DeliveryMore"
        component={AccountNavigator}
        options={{
          tabBarLabel: 'المزيد',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} size={22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
