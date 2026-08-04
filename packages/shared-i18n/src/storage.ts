// ============================================================
// تخزين اللغة المختارة — يعمل على الويب والجوال معاً
// Cross-platform persistence for the selected language.
// ============================================================
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '@marketplace/shared-utils';

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from './types';

const KEY = STORAGE_KEYS.LANGUAGE;

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

const webStorage = (): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } | null => {
  // tsconfig المشروع بدون lib: dom، لذا نصل إلى localStorage عبر globalThis.
  const scope = globalThis as unknown as {
    localStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  };
  return scope.localStorage ?? null;
};

/** يقرأ اللغة المحفوظة، ويرجع `null` إن لم تُحفظ لغة بعد. */
export const readStoredLanguage = async (): Promise<Language | null> => {
  try {
    if (Platform.OS === 'web') {
      const value = webStorage()?.getItem(KEY) ?? null;
      return isLanguage(value) ? value : null;
    }
    const value = await SecureStore.getItemAsync(KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
};

/**
 * يقرأ اللغة المحفوظة بشكل متزامن (الويب فقط).
 * يُستخدم لتفادي وميض العربية قبل تحميل اللغة الإنجليزية عند بدء التشغيل.
 */
export const readStoredLanguageSync = (): Language | null => {
  try {
    if (Platform.OS !== 'web') return null;
    const value = webStorage()?.getItem(KEY) ?? null;
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
};

/** يحفظ اللغة المختارة. أي فشل في التخزين لا يوقف تبديل اللغة. */
export const writeStoredLanguage = async (language: Language): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      webStorage()?.setItem(KEY, language);
      return;
    }
    await SecureStore.setItemAsync(KEY, language);
  } catch {
    // التخزين اختياري — التبديل يبقى فعّالاً خلال الجلسة الحالية.
  }
};

export { DEFAULT_LANGUAGE };
