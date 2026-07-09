import { NavigatorScreenParams } from '@react-navigation/native';

export type HomeStackParamList = {
  HomeMain: undefined;
  StoresList: { categoryId?: string; filter?: string };
  StoreDetails: { storeId: string };
  ProductDetails: { productId: string };
  Search: { initialQuery?: string } | undefined;
  Offers: undefined;
  Chat: { conversationId: string; title?: string; asMerchant?: boolean };
};

export type CartStackParamList = {
  CartMain: undefined;
  Checkout: undefined;
};

export type OrdersStackParamList = {
  OrdersList: undefined;
  OrderTracking: { orderId: string };
};

export type AccountStackParamList = {
  AccountMain: undefined;
  AddressBook: undefined;
  AddAddress: undefined;
  Reviews: undefined;
  Favorites: undefined;
  Notifications: undefined;
  HelpCenter: undefined;
  EditProfile: undefined;
  PaymentMethods: undefined;
  Legal: { type: 'privacy' | 'terms' };
};

export type MainTabParamList = {
  Categories: undefined;
  Orders: NavigatorScreenParams<OrdersStackParamList>;
  Home: NavigatorScreenParams<HomeStackParamList>;
  Cart: NavigatorScreenParams<CartStackParamList>;
  More: NavigatorScreenParams<AccountStackParamList>;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
