import React, { useEffect, useState, useCallback, useRef } from 'react';
import { I18nManager, Platform, View, ActivityIndicator, AppState, Text, TextInput, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

// تعطيل الشاشات الأصلية لحل مشكلة إغلاق الكيبورد الفوري على أندرويد
// https://github.com/software-mansion/react-native-screens/issues/1342
enableScreens(false);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreenExpo from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Ionicons } from '@expo/vector-icons';

// Use the bundled font on web and native; do not request Google Fonts at runtime.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = { fontFamily: 'IBMPlexSansArabic_400Regular' };
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = { fontFamily: 'IBMPlexSansArabic_400Regular' };


import { useAuthStore, useCartStore, getMerchantProfile, getDeliveryProfile } from '@marketplace/shared-hooks';
import { USER_ROLES } from '@marketplace/shared-utils';

import SplashScreen from './src/screens/auth/SplashScreen';
import OnboardingScreen from './src/screens/auth/OnboardingScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import OtpScreen from './src/screens/auth/OtpScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import MerchantTabNavigator from './src/navigation/MerchantTabNavigator';
import DeliveryTabNavigator from './src/navigation/DeliveryTabNavigator';
import MerchantOnboardingScreen from './src/screens/onboarding/MerchantOnboardingScreen';
import DeliveryOnboardingScreen from './src/screens/onboarding/DeliveryOnboardingScreen';
import AdminTabNavigator from './src/navigation/AdminTabNavigator';
import { configurePushNotifications, installForegroundNotificationHandler } from './src/services/pushNotifications';

SplashScreenExpo.preventAutoHideAsync();

const ONBOARDING_KEY = 'marketplace_onboarding_done';

// Screens that are hidden tabs — reset to home when app comes to foreground
const HIDDEN_MERCHANT_TABS = ['MerchantStoreSettings', 'MerchantWallet', 'MerchantSupport'];
const navRef = createNavigationContainerRef<any>();

type PendingPushDestination = {
  identifier: string;
  data: Record<string, unknown>;
};

function openPushDestination(data: Record<string, unknown>, role: string | null): void {
  if (!navRef.isReady()) return;
  const ticketId = typeof data.ticket_id === 'string' ? data.ticket_id : null;
  const orderId = typeof data.order_id === 'string' ? data.order_id : null;
  const type = typeof data.type === 'string' ? data.type : '';
  if (ticketId) {
    if (role === USER_ROLES.MERCHANT) navRef.navigate('MerchantAccount', { screen: 'SupportTicket', params: { ticketId } });
    else if (role === USER_ROLES.DELIVERY) navRef.navigate('DeliveryMore', { screen: 'SupportTicket', params: { ticketId } });
    else navRef.navigate('More', { screen: 'SupportTicket', params: { ticketId } });
    return;
  }
  if (role === USER_ROLES.MERCHANT && (typeof data.refund_id === 'string' || type.includes('refund'))) {
    navRef.navigate('MerchantAccount', { screen: 'Refunds' });
    return;
  }
  if (orderId) {
    if (role === USER_ROLES.MERCHANT) navRef.navigate('MerchantOrders', { screen: 'OrderDetails', params: { orderId } });
    else if (role === USER_ROLES.DELIVERY) navRef.navigate('DeliveryOrders', { orderId });
    else navRef.navigate('Orders', { screen: 'OrderTracking', params: { orderId } });
    return;
  }
  if (type.includes('withdrawal')) {
    if (role === USER_ROLES.MERCHANT) navRef.navigate('MerchantAccount', { screen: 'Wallet' });
    else if (role === USER_ROLES.DELIVERY) navRef.navigate('DeliveryEarnings');
  }
}

// تخزين بسيط متوافق مع الويب والجوال
const storage = {
  get: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    }
    return SecureStore.getItemAsync(key);
  },
  set: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
};

if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string };
  Register: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const OtpScreenWrapper = ({ navigation, route }: any) => (
  <OtpScreen
    phone={route.params.phone}
    onBack={() => navigation.goBack()}
  />
);

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Otp" component={OtpScreenWrapper} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function RootNavigator(): React.JSX.Element {
  const { isAuthenticated, role, user } = useAuthStore();
  const [profileChecked, setProfileChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileCheckError, setProfileCheckError] = useState('');
  const [profileCheckAttempt, setProfileCheckAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !user?.id) {
      setProfileChecked(true);
      setNeedsOnboarding(false);
      setProfileCheckError('');
      return () => { cancelled = true; };
    }
    setProfileChecked(false);
    setNeedsOnboarding(false);
    setProfileCheckError('');
    const check = async () => {
      try {
        if (role === USER_ROLES.MERCHANT) {
          const profile = await getMerchantProfile(user.id);
          if (!cancelled) setNeedsOnboarding(!profile);
        } else if (role === USER_ROLES.DELIVERY) {
          const profile = await getDeliveryProfile(user.id);
          if (!cancelled) setNeedsOnboarding(!profile);
        }
      } catch (error: any) {
        if (!cancelled) setProfileCheckError(error?.message ?? 'تعذّر التحقق من الملف التشغيلي للحساب.');
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id, role, profileCheckAttempt]);

  if (!isAuthenticated) return <AuthNavigator />;

  if (!profileChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (profileCheckError && (role === USER_ROLES.MERCHANT || role === USER_ROLES.DELIVERY)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 28, gap: 12 }} accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={50} color="#B91C1C" />
        <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'center' }}>تعذّر فتح مساحة العمل</Text>
        <Text style={{ color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>{profileCheckError}</Text>
        <TouchableOpacity
          style={{ minHeight: 46, minWidth: 160, borderRadius: 13, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}
          onPress={() => setProfileCheckAttempt((value) => value + 1)}
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (needsOnboarding) {
    if (role === USER_ROLES.MERCHANT) {
      return <MerchantOnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
    }
    if (role === USER_ROLES.DELIVERY) {
      return <DeliveryOnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
    }
  }

  if (role === USER_ROLES.ADMIN) return <AdminTabNavigator />;
  if (role === USER_ROLES.MERCHANT) return <MerchantTabNavigator />;
  if (role === USER_ROLES.DELIVERY) return <DeliveryTabNavigator />;
  return <MainTabNavigator />;
}

export default function App(): React.JSX.Element | null {
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const initialize = useAuthStore((s) => s.initialize);
  const sessionUserId = useAuthStore((s) => s.user?.id ?? null);
  const sessionRole = useAuthStore((s) => s.role);
  const clearCart = useCartStore((s) => s.clearCart);
  const previousSessionUserId = useRef<string | null | undefined>(undefined);
  const handledPushResponseId = useRef<string | null>(null);
  const pendingPushDestination = useRef<PendingPushDestination | null>(null);

  const openPendingPushDestination = useCallback(() => {
    const pending = pendingPushDestination.current;
    if (!pending || !navRef.isReady() || !sessionUserId || !sessionRole) return;
    openPushDestination(pending.data, sessionRole);
    handledPushResponseId.current = pending.identifier;
    pendingPushDestination.current = null;
  }, [sessionRole, sessionUserId]);

  // السلة مؤقتة لكنها يجب ألا تنتقل بين حسابين على الجهاز نفسه.
  useEffect(() => {
    const previous = previousSessionUserId.current;
    if (previous !== undefined && previous !== sessionUserId) clearCart();
    previousSessionUserId.current = sessionUserId;
  }, [clearCart, sessionUserId]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    installForegroundNotificationHandler();
    if (sessionUserId) {
      configurePushNotifications(false).catch((error) => console.warn('Push registration failed:', error));
    }
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      if (handledPushResponseId.current === identifier) return;
      pendingPushDestination.current = {
        identifier,
        data: response.notification.request.content.data as Record<string, unknown>,
      };
      openPendingPushDestination();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    Notifications.getLastNotificationResponseAsync().then((response) => { if (response) handleResponse(response); }).catch(() => {});
    return () => subscription.remove();
  }, [openPendingPushDestination, sessionUserId]);

  useEffect(() => {
    openPendingPushDestination();
  }, [openPendingPushDestination]);

  // Preload the Arabic text font and the Ionicons font together.  Ionicons are
  // glyphs, so this prevents their late "pop in" on the web.
  useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    ...Ionicons.font,
  });

  // Reset to home screen when app comes to foreground from a hidden merchant tab
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && navRef.isReady()) {
        const current = navRef.getCurrentRoute()?.name ?? '';
        if (HIDDEN_MERCHANT_TABS.includes(current)) {
          navRef.navigate('MerchantDashboard');
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const prepare = async () => {
      try {
        await initialize();
        const done = await storage.get(ONBOARDING_KEY);
        setShowOnboarding(done !== '1');
      } catch (e) {
        console.error('Failed to initialize auth:', e);
      } finally {
        setAppReady(true);
        await SplashScreenExpo.hideAsync();
      }
    };
    prepare();
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleOnboardingFinish = useCallback(() => {
    setShowOnboarding(false);
    storage.set(ONBOARDING_KEY, '1').catch(() => {});
  }, []);

  // Never keep the application on a blank screen if a browser delays a font.
  // The bundled font is applied as soon as it is ready.
  if (!appReady) return null;

  // 🧪 وضع اختبار الكيبورد: غيّر إلى true لعرض شاشة الدخول بدون طبقة التنقل
  const KEYBOARD_DEBUG = false;
  if (KEYBOARD_DEBUG) {
    return <LoginScreen />;
  }

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <NavigationContainer ref={navRef} onReady={openPendingPushDestination}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
