import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'متجر - العميل',
  slug: 'marketplace-customer',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'marketplace-customer',
  userInterfaceStyle: 'light',
  splash: {
    resizeMode: 'contain',
    backgroundColor: '#1B2B4B'
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.marketplace.customer',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'نحتاج موقعك لتوصيل طلباتك',
      NSCameraUsageDescription: 'نحتاج الكاميرا لرفع صور',
      NSPhotoLibraryUsageDescription: 'نحتاج مكتبة الصور لاختيار صورك'
    }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#1B2B4B'
    },
    package: 'com.marketplace.customer',
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'RECEIVE_BOOT_COMPLETED',
      'VIBRATE'
    ]
  },
  web: {
    bundler: 'metro'
  },
  plugins: [
    'expo-secure-store',
    'expo-localization',
    'expo-font',
  ],
  extra: {
    supportsRTL: true,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  }
});
