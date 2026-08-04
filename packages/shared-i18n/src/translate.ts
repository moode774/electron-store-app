// ============================================================
// محرّك الترجمة — دالة t() على مستوى الوحدة (تعمل داخل وخارج React)
// The translation engine. `t()` is a module-level function so it can be
// called from stores, helpers and data files — not only from components.
// ============================================================
import { en } from './dictionary/en';
import { DEFAULT_LANGUAGE, type Dictionary, type Language, type TranslationParams } from './types';

// القواميس: العربية هي المصدر، لذلك قاموسها فارغ ويُستخدم المفتاح نفسه.
const DICTIONARIES: Record<Language, Dictionary> = {
  ar: {},
  en,
};

// اللغة الحالية على مستوى الوحدة. `useLanguageStore` هو المصدر الوحيد
// الذي يغيّرها، عبر `setRuntimeLanguage`.
let currentLanguage: Language = DEFAULT_LANGUAGE;

/** لا تستدعِ هذه الدالة مباشرة — `useLanguageStore` هو من يزامن اللغة. */
export const setRuntimeLanguage = (language: Language): void => {
  currentLanguage = language;
};

/** اللغة الفعّالة حالياً. */
export const getLanguage = (): Language => currentLanguage;

/** هل الواجهة الحالية عربية؟ */
export const isArabic = (): boolean => currentLanguage === 'ar';

/** رمز المنطقة المناسب لتنسيق الأرقام والتواريخ. */
export const getLocale = (): string => (currentLanguage === 'ar' ? 'ar-SA' : 'en-US');

const interpolate = (text: string, params: TranslationParams): string => {
  if (Array.isArray(params)) {
    return text.replace(/\{(\d+)\}/g, (match, index: string) => {
      const value = params[Number(index)];
      return value === undefined || value === null ? match : String(value);
    });
  }
  const record = params as Record<string, unknown>;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = record[name];
    return value === undefined || value === null ? match : String(value);
  });
};

/**
 * يترجم نصاً. المفتاح هو النص العربي الأصلي.
 *
 * - في الوضع العربي يُعاد النص كما هو (لا تكلفة ولا خطر).
 * - في الوضع الإنجليزي تُعاد الترجمة، وإن لم توجد يُعاد النص العربي
 *   بدل مفتاح مكسور — فلا تظهر الشاشة فارغة أبداً.
 *
 * @example t('حسابي')                          // "My Account"
 * @example t('لديك {0} طلب جديد', [count])      // "You have 3 new orders"
 * @example t('مرحباً {name}', { name })         // "Welcome Sara"
 */
export function t(key: string | null | undefined, params?: TranslationParams): string {
  if (key === null || key === undefined) return '';
  const source = typeof key === 'string' ? key : String(key);
  const dictionary = DICTIONARIES[currentLanguage];
  const translated = dictionary[source] ?? source;
  return params ? interpolate(translated, params) : translated;
}

/**
 * يترجم قيمة قد لا تكون نصاً (مثل قيمة قادمة من الخادم أو من مصفوفة بيانات).
 * القيم غير النصية تُعاد كما هي بدون أي تعديل.
 */
export function tv<T>(value: T, params?: TranslationParams): T | string {
  if (typeof value !== 'string') return value;
  return t(value, params);
}

/** يتحقق إن كان للنص ترجمة إنجليزية مسجّلة (يُستخدم في أدوات الفحص). */
export const hasTranslation = (key: string, language: Language = 'en'): boolean =>
  Object.prototype.hasOwnProperty.call(DICTIONARIES[language], key);

export { DICTIONARIES };
