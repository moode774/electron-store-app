import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

import ApiKeysScreen from '../screens/shared/ApiKeysScreen';
import DeliveryOffersScreen from '../screens/delivery/DeliveryOffersScreen';
import ActiveDeliveryScreen from '../screens/delivery/ActiveDeliveryScreen';
import EarningsScreen from '../screens/delivery/EarningsScreen';
import DeliveryAccountScreen from '../screens/delivery/DeliveryAccountScreen';
import DeliveryWalletScreen from '../screens/delivery/DeliveryWalletScreen';
import DeliveryReturnsScreen from '../screens/delivery/DeliveryReturnsScreen';
import DeliveryProfileScreen from '../screens/delivery/DeliveryProfileScreen';
import DeliveryZonesScreen from '../screens/delivery/DeliveryZonesScreen';
import DeliverySupportScreen from '../screens/delivery/DeliverySupportScreen';
import RoleNotificationsScreen from '../screens/shared/RoleNotificationsScreen';
import SupportTicketThreadScreen from '../screens/shared/SupportTicketThreadScreen';

export type DeliveryAccountStackParamList = {
  AccountMain: undefined;
  ApiKeys: undefined;
  DeliveryProfile: undefined;
  DeliveryZones: undefined;
  DeliveryWallet: undefined;
  DeliveryReturns: undefined;
  DeliverySupport: undefined;
  SupportTicket: { ticketId: string };
  RoleNotifications: { role: 'delivery' };
};

const AccountStack = createNativeStackNavigator<DeliveryAccountStackParamList>();
function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountMain" component={DeliveryAccountScreen} />
      <AccountStack.Screen name="ApiKeys" component={ApiKeysScreen} />
      <AccountStack.Screen name="DeliveryProfile" component={DeliveryProfileScreen} />
      <AccountStack.Screen name="DeliveryZones" component={DeliveryZonesScreen} />
      <AccountStack.Screen name="DeliveryWallet" component={DeliveryWalletScreen} />
      <AccountStack.Screen name="DeliveryReturns" component={DeliveryReturnsScreen} />
      <AccountStack.Screen name="DeliverySupport" component={DeliverySupportScreen} />
      <AccountStack.Screen name="SupportTicket" component={SupportTicketThreadScreen} />
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

type DeliveryNavItem = {
  route: keyof DeliveryTabParamList;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
};

const DELIVERY_NAV_ITEMS: DeliveryNavItem[] = [
  { route: 'DeliveryHome', label: 'الرئيسية', icon: 'home-outline', activeIcon: 'home' },
  { route: 'DeliveryOrders', label: 'الطلبات', icon: 'clipboard-outline', activeIcon: 'clipboard' },
  { route: 'DeliveryEarnings', label: 'الأرباح', icon: 'wallet-outline', activeIcon: 'wallet' },
  { route: 'DeliveryMore', label: 'الحساب', icon: 'person-outline', activeIcon: 'person' },
];

function DesktopDeliverySidebar() {
  const navigation = useNavigation<any>();
  const activeRoute = useNavigationState((state) => state?.routes[state.index]?.name ?? 'DeliveryHome');

  return (
    <View style={styles.desktopSidebar}>
      <View style={styles.desktopBrand}>
        <View style={styles.desktopBrandMark}>
          <Ionicons name="bicycle" size={22} color={COLORS.surface} />
        </View>
        <View style={styles.desktopBrandCopy}>
          <Text style={styles.desktopBrandTitle}>مساحة المندوب</Text>
          <Text style={styles.desktopBrandSubtitle}>إدارة التوصيل</Text>
        </View>
      </View>

      <View style={styles.desktopNav}>
        {DELIVERY_NAV_ITEMS.map((item) => {
          const active = activeRoute === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.desktopNavItem, active && styles.desktopNavItemActive]}
              onPress={() => navigation.navigate(item.route)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.desktopNavIcon, active && styles.desktopNavIconActive]}>
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={20}
                  color={active ? COLORS.surface : COLORS.textSecondary}
                />
              </View>
              <Text style={[styles.desktopNavLabel, active && styles.desktopNavLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.desktopOnlineCard}
        onPress={() => navigation.navigate('DeliveryHome')}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel="فتح استقبال طلبات التوصيل"
      >
        <View style={styles.desktopOnlineIcon}>
          <Ionicons name="radio-outline" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.desktopOnlineCopy}>
          <Text style={styles.desktopOnlineTitle}>استقبال الطلبات</Text>
          <Text style={styles.desktopOnlineSubtitle}>تحكم بحالة الاتصال</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export default function DeliveryTabNavigator() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet;

  const content = (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: isDesktop ? { display: 'none' } : {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          elevation: 10,
          shadowColor: COLORS.primaryDark,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          height: Platform.OS === 'ios' ? 88 : 70,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          position: 'absolute',
          ...(isTablet ? {
            left: Math.max(24, (width - 680) / 2),
            right: Math.max(24, (width - 680) / 2),
            bottom: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: RADIUS.xl,
          } : {}),
        },
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: FONTS.semiBold, marginTop: 4 },
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
        component={OffersNavigator}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('DeliveryHome');
          },
        })}
        options={{
          tabBarLabel: 'قبول',
          tabBarIcon: () => (
            <View style={{
              width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary,
              alignItems: 'center', justifyContent: 'center',
              marginTop: -32, borderWidth: 4, borderColor: '#F9FAFB',
              shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
            }}>
              <Ionicons name="git-network-outline" size={26} color="#FFFFFF" style={{ transform: [{ rotate: '90deg' }] }} />
            </View>
          ),
          tabBarLabelStyle: { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.primary, marginTop: 4 },
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

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <DesktopDeliverySidebar />
        <View style={styles.desktopMain}>
          <View style={styles.desktopTopBar}>
            <View>
              <Text style={styles.desktopTopTitle}>لوحة المندوب</Text>
              <Text style={styles.desktopTopSubtitle}>تابع التوصيلات والأرباح من مكان واحد</Text>
            </View>
            <View style={styles.desktopTopStatus}>
              <View style={styles.desktopTopStatusDot} />
              <Text style={styles.desktopTopStatusText}>جاهز للعمل</Text>
            </View>
          </View>
          <View style={styles.desktopFrame}>{content}</View>
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.background,
  },
  desktopSidebar: {
    width: 260,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: COLORS.surface,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  desktopBrand: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 6,
    marginBottom: 30,
  },
  desktopBrandMark: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  desktopBrandCopy: { flex: 1, alignItems: 'flex-end' },
  desktopBrandTitle: { color: COLORS.textPrimary, fontSize: 15, fontFamily: FONTS.bold },
  desktopBrandSubtitle: { color: COLORS.textMuted, fontSize: 11.5, fontFamily: FONTS.medium, marginTop: 2 },
  desktopNav: { flex: 1, gap: 8 },
  desktopNavItem: {
    minHeight: 54,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10,
  },
  desktopNavItemActive: { backgroundColor: COLORS.primarySoft },
  desktopNavIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  desktopNavIconActive: { backgroundColor: COLORS.primary },
  desktopNavLabel: { flex: 1, textAlign: 'right', color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.medium },
  desktopNavLabelActive: { color: COLORS.primaryDark, fontFamily: FONTS.semiBold },
  desktopOnlineCard: {
    minHeight: 74,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    backgroundColor: COLORS.secondarySoft,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  desktopOnlineIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  desktopOnlineCopy: { flex: 1, alignItems: 'flex-end' },
  desktopOnlineTitle: { color: COLORS.textPrimary, fontSize: 12.5, fontFamily: FONTS.semiBold },
  desktopOnlineSubtitle: { color: COLORS.textSecondary, fontSize: 10.5, fontFamily: FONTS.regular, marginTop: 2 },
  desktopMain: { flex: 1, minWidth: 0, padding: 20, paddingBottom: 0 },
  desktopTopBar: {
    minHeight: 64,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  desktopTopTitle: { color: COLORS.textPrimary, fontSize: 18, fontFamily: FONTS.bold, textAlign: 'right' },
  desktopTopSubtitle: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular, textAlign: 'right', marginTop: 3 },
  desktopTopStatus: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  desktopTopStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  desktopTopStatusText: { color: COLORS.textSecondary, fontSize: 12, fontFamily: FONTS.semiBold },
  desktopFrame: {
    flex: 1,
    minWidth: 0,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: COLORS.border,
  },
});
