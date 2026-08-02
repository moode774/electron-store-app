import { ExpoConfig, ConfigContext } from 'expo/config';

// Public client values: safe to embed in web/mobile bundles. Authorization
// remains enforced by Supabase RLS. Never place a secret/service-role key here.
const PUBLIC_SUPABASE_URL = 'https://sghaihfjuttwqikdszgh.supabase.co';
const PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yHRZdDnJ54Py3ZOPkHbUXQ_PF7LnRdk';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? PUBLIC_SUPABASE_URL;

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// مسار النشر الفرعي: يبقى فارغاً على Vercel/النطاق الجذري، ويُضبط إلى "/repo-name"
// عند النشر على GitHub Pages تحت مسار فرعي وإلا فشل تحميل ملفات البناء (مسارات تبدأ بـ /).
const rawBasePath = (process.env.EXPO_PUBLIC_BASE_PATH ?? '').trim();
const baseUrl = rawBasePath && rawBasePath !== '/'
  ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
  : '';

// معرّف مشروع EAS مطلوب لربط البناء بالحساب
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? process.env.EAS_PROJECT_ID;

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
  experiments: {
    // فارغ = نشر على جذر النطاق (Vercel). يُملأ من EXPO_PUBLIC_BASE_PATH لـ GitHub Pages.
    baseUrl,
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
    easProjectId,
    // EAS يقرأ المعرّف من هذا المسار تحديداً (extra.eas.projectId)
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  }
});
