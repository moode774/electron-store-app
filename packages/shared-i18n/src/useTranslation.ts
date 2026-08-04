// ============================================================
// Hook الترجمة داخل مكوّنات React
// ============================================================
import { useLanguageStore } from './useLanguageStore';
import { getLocale, t } from './translate';
import { LANGUAGE_NATIVE_NAMES, LANGUAGE_SHORT_LABELS, type Language, type TranslationParams } from './types';

export interface UseTranslationResult {
  /** يترجم نصاً بالنص العربي كمفتاح. */
  t: (key: string | null | undefined, params?: TranslationParams) => string;
  /** اللغة الحالية. */
  language: Language;
  /** هل الواجهة عربية حالياً؟ */
  isArabic: boolean;
  /** اسم اللغة الحالية بلغتها (العربية / English). */
  languageName: string;
  /** اختصار اللغة الحالية (ع / EN). */
  languageShortLabel: string;
  /** اللغة التي سيتم التبديل إليها. */
  nextLanguage: Language;
  /** اسم اللغة التي سيتم التبديل إليها. */
  nextLanguageName: string;
  /** رمز المنطقة لتنسيق الأرقام والتواريخ. */
  locale: string;
  /** يبدّل إلى لغة محددة. */
  setLanguage: (language: Language) => void;
  /** يبدّل بين العربية والإنجليزية. */
  toggleLanguage: () => void;
}

/**
 * يعيد دالة الترجمة مع حالة اللغة. أي مكوّن يستدعيه يُعاد رسمه فور التبديل.
 *
 * @example
 * const { t, toggleLanguage } = useTranslation();
 * <Text>{t('حسابي')}</Text>
 */
export const useTranslation = (): UseTranslationResult => {
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const toggleLanguage = useLanguageStore((state) => state.toggleLanguage);
  const nextLanguage: Language = language === 'ar' ? 'en' : 'ar';

  return {
    t,
    language,
    isArabic: language === 'ar',
    languageName: LANGUAGE_NATIVE_NAMES[language],
    languageShortLabel: LANGUAGE_SHORT_LABELS[language],
    nextLanguage,
    nextLanguageName: LANGUAGE_NATIVE_NAMES[nextLanguage],
    locale: getLocale(),
    setLanguage,
    toggleLanguage,
  };
};
