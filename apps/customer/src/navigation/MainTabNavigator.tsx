import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
import { CustomerTabBar } from '../components/customer/CustomerTabBar';

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

// The stores tab needs its own stack. Mounting StoresListScreen directly as a
// tab left StoreDetails outside the active navigator and made store taps fail.
const CategoriesStack = createNativeStackNavigator<any>();
function CategoriesNavigator() {
  return (
    <CategoriesStack.Navigator screenOptions={{ headerShown: false }}>
      <CategoriesStack.Screen name="StoresList" component={StoresListScreen} />
      <CategoriesStack.Screen name="StoreDetails" component={StoreDetailsScreen as React.ComponentType<any>} />
      <CategoriesStack.Screen name="ProductDetails" component={ProductDetailsScreen as React.ComponentType<any>} />
      <CategoriesStack.Screen name="Chat" component={ChatScreen} />
    </CategoriesStack.Navigator>
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

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <CustomerTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Cart"
        component={CartNavigator}
        options={{ tabBarLabel: 'السلة' }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersNavigator}
        options={{ tabBarLabel: 'طلباتي' }}
      />
      <Tab.Screen
        name="Home"
        component={HomeNavigator}
        options={{ tabBarLabel: 'الرئيسية' }}
      />
      <Tab.Screen
        name="Categories"
        component={CategoriesNavigator}
        options={{ tabBarLabel: 'المتاجر' }}
      />
      <Tab.Screen
        name="More"
        component={AccountNavigator}
        options={{ tabBarLabel: 'حسابي' }}
      />
    </Tab.Navigator>
  );
}
