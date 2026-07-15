import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { STORAGE_KEYS } from '@marketplace/shared-utils';

// ---- Read env ------------------------------------------------
// Expo SDK 49+ inlines EXPO_PUBLIC_* at build time via process.env
// Falls back to Constants.expoConfig.extra for native builds
const supabaseUrl: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  Constants.expoConfig?.extra?.supabaseUrl ??
  '';

const supabaseAnonKey: string =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Missing config! Make sure .env has EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Restart with: npm run dev -- -c',
  );
}

// ---- Storage adapter (web = localStorage, native = SecureStore)
function createStorageAdapter() {
  if (Platform.OS === 'web') {
    // Web: use localStorage
    const storage = typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as any).localStorage
      : null;
    return {
      getItem: (key: string): Promise<string | null> =>
        Promise.resolve(storage ? storage.getItem(key) : null),
      setItem: (key: string, value: string): Promise<void> => {
        if (storage) storage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string): Promise<void> => {
        if (storage) storage.removeItem(key);
        return Promise.resolve();
      },
    };
  }

  // Native: use expo-secure-store مع تقسيم القيم الكبيرة (حد SecureStore ~2048 بايت)
  // جلسة Supabase (التوكنات + بيانات المستخدم) تتجاوز الحد، فنقسّمها على عدة مفاتيح
  const SecureStore = require('expo-secure-store');
  const CHUNK = 1800; // أحرف لكل جزء (آمن ضمن 2048 بايت)

  const getChunkCount = async (key: string): Promise<number> => {
    const n = await SecureStore.getItemAsync(`${key}__chunks`);
    return n ? parseInt(n, 10) : 0;
  };

  return {
    getItem: async (key: string): Promise<string | null> => {
      const count = await getChunkCount(key);
      if (count > 0) {
        let out = '';
        for (let i = 0; i < count; i++) {
          const part = await SecureStore.getItemAsync(`${key}__${i}`);
          if (part == null) return null;
          out += part;
        }
        return out;
      }
      // قيمة قديمة غير مقسّمة
      return SecureStore.getItemAsync(key);
    },
    setItem: async (key: string, value: string): Promise<void> => {
      // امسح الأجزاء القديمة أولاً
      const prev = await getChunkCount(key);
      for (let i = 0; i < prev; i++) await SecureStore.deleteItemAsync(`${key}__${i}`);
      await SecureStore.deleteItemAsync(key);

      if (value.length <= CHUNK) {
        // صغير: خزّنه مباشرة بدون تقسيم
        await SecureStore.deleteItemAsync(`${key}__chunks`);
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const count = Math.ceil(value.length / CHUNK);
      await SecureStore.setItemAsync(`${key}__chunks`, String(count));
      for (let i = 0; i < count; i++) {
        await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
      }
    },
    removeItem: async (key: string): Promise<void> => {
      const count = await getChunkCount(key);
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}__${i}`);
      await SecureStore.deleteItemAsync(`${key}__chunks`);
      await SecureStore.deleteItemAsync(key);
    },
  };
}

// Durable cross-platform storage for small operational tokens such as
// checkout idempotency attempts. It intentionally shares the same tested
// web/native adapter, but uses independent keys from the auth session.
export const appStorage = createStorageAdapter();

// ---- Typed Supabase client ----------------------------------
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: appStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: STORAGE_KEYS.SESSION,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  },
);
