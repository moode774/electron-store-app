// ============================================================
// مخزن اللغة — المصدر الوحيد لحالة اللغة في التطبيق كله
// The single source of truth for the app language.
// ============================================================
import { create } from 'zustand';

import { readStoredLanguage, readStoredLanguageSync, writeStoredLanguage } from './storage';
import { getLanguage, setRuntimeLanguage } from './translate';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from './types';

interface LanguageState {
  /** اللغة الفعّالة حالياً. */
  language: Language;
  /** هل تمت قراءة اللغة المحفوظة من التخزين؟ */
  hydrated: boolean;
  /** يقرأ اللغة المحفوظة عند بدء التشغيل. آمن للاستدعاء أكثر من مرة. */
  initialize: () => Promise<void>;
  /** يبدّل إلى لغة محددة ويحفظها. */
  setLanguage: (language: Language) => void;
  /** يبدّل بين العربية والإنجليزية. */
  toggleLanguage: () => void;
}

// الويب يستطيع قراءة اللغة بشكل متزامن، فنتفادى وميض اللغة الخاطئة
// في أول إطار قبل انتهاء `initialize`.
const initialLanguage = readStoredLanguageSync() ?? DEFAULT_LANGUAGE;
setRuntimeLanguage(initialLanguage);

/** يضبط اتجاه/لغة صفحة الويب لأغراض الوصولية وقارئات الشاشة. */
const syncWebDocumentLanguage = (language: Language): void => {
  try {
    const scope = globalThis as unknown as {
      document?: { documentElement?: { lang: string } };
    };
    const element = scope.document?.documentElement;
    if (element) element.lang = language;
  } catch {
    // لا شيء — الضبط تحسيني فقط.
  }
};

syncWebDocumentLanguage(initialLanguage);

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: initialLanguage,
  hydrated: false,

  initialize: async () => {
    if (get().hydrated) return;
    const stored = await readStoredLanguage();
    const next = stored ?? DEFAULT_LANGUAGE;
    setRuntimeLanguage(next);
    syncWebDocumentLanguage(next);
    set({ language: next, hydrated: true });
  },

  setLanguage: (language: Language) => {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) return;
    if (get().language === language) return;
    setRuntimeLanguage(language);
    syncWebDocumentLanguage(language);
    set({ language });
    void writeStoredLanguage(language);
  },

  toggleLanguage: () => {
    get().setLanguage(get().language === 'ar' ? 'en' : 'ar');
  },
}));

/**
 * Hook للاشتراك في اللغة الحالية داخل مكوّن React.
 * أي مكوّن يستخدمه سيُعاد رسمه فور تبديل اللغة.
 */
export const useLanguage = (): Language => useLanguageStore((state) => state.language);

/** يعيد اللغة الحالية خارج React (نفس قيمة `getLanguage`). */
export const getCurrentLanguage = getLanguage;
