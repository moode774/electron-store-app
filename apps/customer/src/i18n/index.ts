import { I18nManager, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { AppLanguage, resources } from './translations';

const LANGUAGE_KEY = 'marketplace_language';
const DEFAULT_LANGUAGE: AppLanguage = 'ar';

const storage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_KEY) : null;
    }
    return SecureStore.getItemAsync(LANGUAGE_KEY);
  },
  async set(value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_KEY, value);
      return;
    }
    await SecureStore.setItemAsync(LANGUAGE_KEY, value);
  },
};

const getPath = (language: AppLanguage, key: string): string => {
  const parts = key.split('.');
  let value: any = resources[language];
  for (const part of parts) value = value?.[part];
  if (typeof value === 'string') return value;

  let fallback: any = resources.ar;
  for (const part of parts) fallback = fallback?.[part];
  return typeof fallback === 'string' ? fallback : key;
};

type LanguageState = {
  language: AppLanguage;
  hydrated: boolean;
  isRTL: boolean;
  initializeLanguage: () => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

function applyDirection(language: AppLanguage) {
  const rtl = language === 'ar';
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(rtl);

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.body?.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  }
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: DEFAULT_LANGUAGE,
  hydrated: false,
  isRTL: true,
  initializeLanguage: async () => {
    const saved = await storage.get();
    const language: AppLanguage = saved === 'en' ? 'en' : DEFAULT_LANGUAGE;
    applyDirection(language);
    set({ language, isRTL: language === 'ar', hydrated: true });
  },
  setLanguage: async (language) => {
    await storage.set(language);
    applyDirection(language);
    set({ language, isRTL: language === 'ar' });
  },
}));

export function useTranslation() {
  const language = useLanguageStore((state) => state.language);
  const isRTL = language === 'ar';
  return {
    language,
    isRTL,
    direction: isRTL ? 'rtl' as const : 'ltr' as const,
    textAlign: isRTL ? 'right' as const : 'left' as const,
    rowDirection: isRTL ? 'row-reverse' as const : 'row' as const,
    t: (key: string) => getPath(language, key),
  };
}

export function translate(key: string): string {
  return getPath(useLanguageStore.getState().language, key);
}
