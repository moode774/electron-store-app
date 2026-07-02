import { create } from 'zustand';
import { Platform } from 'react-native';
import {
  translate,
  getTheme,
  type Language,
  type ThemeMode,
  type ThemeColors,
} from '@marketplace/shared-utils';

// ---- تخزين متوافق مع الويب والجوال ----
const LANG_KEY = 'marketplace_language';
const THEME_KEY = 'marketplace_theme';

async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  }
  const SecureStore = require('expo-secure-store');
  return SecureStore.getItemAsync(key);
}
async function storeSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  const SecureStore = require('expo-secure-store');
  await SecureStore.setItemAsync(key, value);
}

interface SettingsState {
  language: Language;
  theme: ThemeMode;
  colors: ThemeColors;
  isRTL: boolean;
  t: (key: string) => string;
  hydrate: () => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: 'ar',
  theme: 'light',
  colors: getTheme('light'),
  isRTL: true,
  t: (key: string) => translate('ar', key),

  hydrate: async (): Promise<void> => {
    const [lang, theme] = await Promise.all([storeGet(LANG_KEY), storeGet(THEME_KEY)]);
    const language = (lang === 'en' ? 'en' : 'ar') as Language;
    const mode = (theme === 'dark' ? 'dark' : 'light') as ThemeMode;
    set({
      language,
      theme: mode,
      colors: getTheme(mode),
      isRTL: language === 'ar',
      t: (key: string) => translate(language, key),
    });
  },

  setLanguage: async (language: Language): Promise<void> => {
    await storeSet(LANG_KEY, language);
    set({ language, isRTL: language === 'ar', t: (key: string) => translate(language, key) });
  },

  setTheme: async (mode: ThemeMode): Promise<void> => {
    await storeSet(THEME_KEY, mode);
    set({ theme: mode, colors: getTheme(mode) });
  },

  toggleTheme: async (): Promise<void> => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    await get().setTheme(next);
  },
}));
