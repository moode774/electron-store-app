import { ExpoConfig, ConfigContext } from 'expo/config';
import {
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
} from './public-config';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? PUBLIC_SUPABASE_URL;

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'متجر - العميل',
  slug: 'marketplace-customer',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'marketplace-customer',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#1B2B4B'
  },
  ios: {
    supportsTablet: false,
    buildNumber: '1',
    bundleIdentifier: 'com.marketplace.customer',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'نحتاج موقعك لتوصيل طلباتك',
      NSCameraUsageDescription: 'نحتاج الكاميرا لرفع صور',
      NSPhotoLibraryUsageDescription: 'نحتاج مكتبة الصور لاختيار صورك'
    }
  },
  android: {
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1B2B4B'
    },
    package: 'com.marketplace.customer',
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'CAMERA'
    ]
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png'
  },
  plugins: [
    'expo-localization',
    'expo-font',
    'expo-location',
    'expo-image-picker',
    ['expo-notifications', { color: '#2563EB' }],
  ],
  extra: {
    supportsRTL: true,
    supabaseUrl,
    supabasePublishableKey,
    // Backward compatibility for older mobile bundles.
    supabaseAnonKey: supabasePublishableKey,
    easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  }
});
