// ============================================================
// shared-i18n — دعم ثنائي اللغة (العربية الرسمية + الإنجليزية)
// ============================================================
export * from './types';
export * from './translate';
export * from './useLanguageStore';
export * from './useTranslation';
export * from './components/LanguageToggle';
export { readStoredLanguage, writeStoredLanguage } from './storage';
export { en as englishDictionary } from './dictionary/en';
