// ============================================================
// أنواع نظام اللغة الثنائي (عربي / إنجليزي)
// Types for the bilingual (Arabic / English) language system.
// ============================================================

/** اللغات المدعومة — العربية هي اللغة الرسمية والافتراضية. */
export type Language = 'ar' | 'en';

/** اللغة الرسمية الافتراضية للتطبيق. */
export const DEFAULT_LANGUAGE: Language = 'ar';

/** قائمة اللغات المدعومة بالترتيب المعروض في واجهة التبديل. */
export const SUPPORTED_LANGUAGES: readonly Language[] = ['ar', 'en'] as const;

/** اسم كل لغة بلغتها الأصلية (يُعرض دائماً بنفس الشكل مهما كانت اللغة الحالية). */
export const LANGUAGE_NATIVE_NAMES: Record<Language, string> = {
  ar: 'العربية',
  en: 'English',
};

/** اختصار قصير يُعرض داخل زر التبديل. */
export const LANGUAGE_SHORT_LABELS: Record<Language, string> = {
  ar: 'ع',
  en: 'EN',
};

/**
 * قاموس ترجمة: المفتاح هو النص العربي الأصلي، والقيمة هي الترجمة.
 * استخدام النص العربي كمفتاح يضمن أن أي نص غير مترجم يظهر بالعربية
 * بدلاً من أن يظهر كمفتاح تقني مكسور.
 */
export type Dictionary = Record<string, string>;

/** معاملات الاستبدال داخل النص: `{0}` أو `{name}`. */
export type TranslationParams = ReadonlyArray<unknown> | Record<string, unknown>;
