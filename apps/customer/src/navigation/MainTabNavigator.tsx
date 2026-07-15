import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';

import {
  HomeStackParamList,
  CartStackParamList,
  OrdersStackParamList,
  AccountStackParamList,
  MainTabParamList,
} from './types';

// Screens
import ApiKeysScreen from '../screens/shared/ApiKeysScreen';
import HomeScreen from '../screens/main/home/HomeScreen';
import StoresListScreen from '../screens/main/home/StoresListScreen';
import StoreDetailsScreen from '../screens/main/home/StoreDetailsScreen';
import ProductDetailsScreen from '../screens/main/home/ProductDetailsScreen';
import SearchScreen from '../screens/main/home/SearchScreen';
import OffersScreen from '../screens/main/home/OffersScreen';
import ChatScreen from '../screens/main/chat/ChatScreen';

import CartScreen from '../screens/main/cart/CartScreen';
import CheckoutScreen from '../screens/main/cart/CheckoutScreen';

import OrdersListScreen from '../screens/main/orders/OrdersListScreen';
import OrderTrackingScreen from '../screens/main/orders/OrderTrackingScreen';

import AccountScreen from '../screens/main/account/AccountScreen';
import AddressBookScreen from '../screens/main/account/AddressBookScreen';
import AddAddressScreen from '../screens/main/account/AddAddressScreen';
import ReviewsScreen from '../screens/main/account/ReviewsScreen';
import FavoritesScreen from '../screens/main/account/FavoritesScreen';
import NotificationsScreen from '../screens/main/account/NotificationsScreen';
import HelpCenterScreen from '../screens/main/account/HelpCenterScreen';
import SupportTicketThreadScreen from '../screens/shared/SupportTicketThreadScreen';
import EditProfileScreen from '../screens/main/account/EditProfileScreen';
import PaymentMethodsScreen from '../screens/main/account/PaymentMethodsScreen';
import LegalScreen from '../screens/main/account/LegalScreen';

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="StoresList" component={StoresListScreen} />
      <HomeStack.Screen name="StoreDetails" component={StoreDetailsScreen} />
      <HomeStack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <HomeStack.Screen name="Search" component={SearchScreen} />
      <HomeStack.Screen name="Offers" component={OffersScreen} />
      <HomeStack.Screen name="Chat" component={ChatScreen} />
    </HomeStack.Navigator>
  );
}

const CartStack = createNativeStackNavigator<CartStackParamList>();
function CartNavigator() {
  return (
    <CartStack.Navigator screenOptions={{ headerShown: false }}>
      <CartStack.Screen name="CartMain" component={CartScreen} />
      <CartStack.Screen name="Checkout" component={CheckoutScreen} />
    </CartStack.Navigator>
  );
}

const OrdersStack = createNativeStackNavigator<OrdersStackParamList>();
function OrdersNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerShown: false }}>
      <OrdersStack.Screen name="OrdersList" component={OrdersListScreen} />
      <OrdersStack.Screen name="OrderTracking" component={OrderTrackingScreen} />
    </OrdersStack.Navigator>
  );
}

const AccountStack = createNativeStackNavigator<AccountStackParamList>();
function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountMain" component={AccountScreen} />
      <AccountStack.Screen name="ApiKeys" component={ApiKeysScreen} />
      <AccountStack.Screen name="AddressBook" component={AddressBookScreen} />
      <AccountStack.Screen name="AddAddress" component={AddAddressScreen} />
      <AccountStack.Screen name="Reviews" component={ReviewsScreen} />
      <AccountStack.Screen name="Favorites" component={FavoritesScreen} />
      <AccountStack.Screen name="Notifications" component={NotificationsScreen} />
      <AccountStack.Screen name="HelpCenter" component={HelpCenterScreen} />
      <AccountStack.Screen name="SupportTicket" component={SupportTicketThreadScreen} />
      <AccountStack.Screen name="EditProfile" component={EditProfileScreen} />
      <AccountStack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <AccountStack.Screen name="Legal" component={LegalScreen} />
    </AccountStack.Navigator>
  );
}

import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useCartStore } from '@marketplace/shared-hooks';

const Tab = createBottomTabNavigator<MainTabParamList>();

const renderIcon = (focused: boolean, name: any, outlineName: any, color: string, badge?: number) => {
  return (
    <View style={{
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: focused ? '#1D4ED8' : 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Ionicons name={focused ? name : outlineName} size={20} color={focused ? '#FFFFFF' : color} />
      {badge !== undefined && (
        <View style={{
          position: 'absolute', right: -2, top: -2,
          backgroundColor: '#3B82F6', width: 16, height: 16,
          borderRadius: 8, alignItems: 'center', justifyContent: 'center',
          borderWidth: 1.5, borderColor: '#FFFFFF'
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: 'bold' }}>{badge}</Text>
        </View>
      )}
    </View>
  );
};

export default function MainTabNavigator() {
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1D4ED8',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 14,
          shadowColor: '#0F172A',
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          height: Platform.OS === 'ios' ? 88 : 76,
          paddingBottom: Platform.OS === 'ios' ? 22 : 11,
          paddingTop: 9,
        },
        tabBarItemStyle: { paddingTop: 1 },
        tabBarLabelStyle: {
          fontWeight: '700',
          fontSize: 10.5,
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="Cart"
        component={CartNavigator}
        options={{ 
          tabBarLabel: 'السلة',
          tabBarIcon: ({ color, focused }) => renderIcon(focused, 'cart', 'cart-outline', color, cartCount > 0 ? cartCount : undefined)
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersNavigator}
        options={{
          tabBarLabel: 'طلباتي',
          tabBarIcon: ({ color, focused }) => renderIcon(focused, 'receipt', 'receipt-outline', color)
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeNavigator}
        options={{ 
          tabBarLabel: 'الرئيسية',
          tabBarIcon: ({ color, focused }) => renderIcon(focused, 'home', 'home-outline', color)
        }}
      />
      <Tab.Screen
        name="Categories"
        component={StoresListScreen}
        options={{ 
          tabBarLabel: 'المتاجر',
          tabBarIcon: ({ color, focused }) => renderIcon(focused, 'storefront', 'storefront-outline', color)
        }}
      />
      <Tab.Screen
        name="More"
        component={AccountNavigator}
        options={{ 
          tabBarLabel: 'حسابي',
          tabBarIcon: ({ color, focused }) => renderIcon(focused, 'person', 'person-outline', color)
        }}
      />
    </Tab.Navigator>
  );
}
