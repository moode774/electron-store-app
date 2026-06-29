import React, { useEffect, useState, useCallback } from 'react';
import { I18nManager, Platform, View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

// تعطيل الشاشات الأصلية لحل مشكلة إغلاق الكيبورد الفوري على أندرويد
// https://github.com/software-mansion/react-native-screens/issues/1342
enableScreens(false);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreenExpo from 'expo-splash-screen';

import { useAuthStore, getMerchantProfile, getDeliveryProfile } from '@marketplace/shared-hooks';
import { USER_ROLES } from '@marketplace/shared-utils';
import { registerForPushNotificationsAsync } from './src/services/notifications';

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

SplashScreenExpo.preventAutoHideAsync();

const ONBOARDING_KEY = 'marketplace_onboarding_done';

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

// روابط عميقة: فتح منتج/متجر/تتبّع طلب من رابط خارجي أو إشعار
const linking: any = {
  prefixes: ['marketplace-customer://', 'https://metjar-alyemen.app'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: {
            screens: {
              ProductDetails: 'product/:productId',
              StoreDetails: 'store/:storeId',
            },
          },
          Orders: {
            screens: {
              OrderTracking: 'order/:orderId',
            },
          },
        },
      },
    },
  },
};

type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string };
  Register: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const LoginScreenWrapper = ({ navigation }: any) => (
  <LoginScreen
    onNavigateToRegister={() => navigation.navigate('Register')}
    onNavigateToOtp={(phone: string) => navigation.navigate('Otp', { phone })}
  />
);

const OtpScreenWrapper = ({ navigation, route }: any) => (
  <OtpScreen
    phone={route.params.phone}
    onBack={() => navigation.goBack()}
  />
);

const RegisterScreenWrapper = ({ navigation }: any) => (
  <RegisterScreen
    onBack={() => navigation.goBack()}
    onNavigateToOtp={(phone: string) => navigation.navigate('Otp', { phone })}
  />
);

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreenWrapper} />
      <AuthStack.Screen name="Otp" component={OtpScreenWrapper} />
      <AuthStack.Screen name="Register" component={RegisterScreenWrapper} />
    </AuthStack.Navigator>
  );
}

function RootNavigator(): React.JSX.Element {
  const { isAuthenticated, role, user } = useAuthStore();
  const [profileChecked, setProfileChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) { setProfileChecked(true); return; }
    // تسجيل رمز الإشعارات الفورية (أفضل جهد، لا يعطّل التطبيق)
    registerForPushNotificationsAsync(user.id).catch(() => {});
    const check = async () => {
      try {
        if (role === USER_ROLES.MERCHANT) {
          const profile = await getMerchantProfile(user.id);
          setNeedsOnboarding(!profile);
        } else if (role === USER_ROLES.DELIVERY) {
          const profile = await getDeliveryProfile(user.id);
          setNeedsOnboarding(!profile);
        }
      } catch { /* allow through on error */ }
      setProfileChecked(true);
    };
    check();
  }, [isAuthenticated, user?.id, role]);

  if (!isAuthenticated) return <AuthNavigator />;

  if (!profileChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
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

  if (role === USER_ROLES.MERCHANT) return <MerchantTabNavigator />;
  if (role === USER_ROLES.DELIVERY) return <DeliveryTabNavigator />;
  return <MainTabNavigator />;
}

export default function App(): React.JSX.Element | null {
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const initialize = useAuthStore((s) => s.initialize);

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

  if (!appReady) return null;

  // 🧪 وضع اختبار الكيبورد: غيّر إلى true لعرض شاشة الدخول بدون طبقة التنقل
  const KEYBOARD_DEBUG = false;
  if (KEYBOARD_DEBUG) {
    return (
      <LoginScreen
        onNavigateToRegister={() => {}}
        onNavigateToOtp={() => {}}
      />
    );
  }

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <NavigationContainer linking={linking}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
