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

// Layout direction is handled by the app's own styles (row-reverse, textAlign,
// rowDirection), so the platform must stay LTR. Letting the document or
// I18nManager flip to RTL mirrors those styles a second time.
function applyDirection(language: AppLanguage) {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);

  const doc = (globalThis as any).document;
  if (Platform.OS === 'web' && doc) {
    doc.documentElement.lang = language;
    doc.documentElement.dir = 'ltr';
    doc.body?.removeAttribute('dir');
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

// Picks the database field matching the active language, falling back to the other one.
export function localized(ar?: string | null, en?: string | null): string {
  const language = useLanguageStore.getState().language;
  return (language === 'en' ? en || ar : ar || en) ?? '';
}

export function appLocale(): string {
  return useLanguageStore.getState().language === 'ar' ? 'ar-SA' : 'en-US';
}
