// ============================================================
// I18N — قاموس الترجمة (عربي / إنجليزي)
// ============================================================
export type Language = 'ar' | 'en';

type Dict = Record<string, { ar: string; en: string }>;

// المفاتيح الأكثر استخداماً؛ أضف المزيد تدريجياً.
export const TRANSLATIONS: Dict = {
  // عام
  'common.confirm':   { ar: 'تأكيد', en: 'Confirm' },
  'common.cancel':    { ar: 'إلغاء', en: 'Cancel' },
  'common.save':      { ar: 'حفظ', en: 'Save' },
  'common.delete':    { ar: 'حذف', en: 'Delete' },
  'common.retry':     { ar: 'إعادة المحاولة', en: 'Retry' },
  'common.loading':   { ar: 'جاري التحميل...', en: 'Loading...' },
  'common.empty':     { ar: 'لا توجد بيانات', en: 'No data' },
  'common.search':    { ar: 'بحث', en: 'Search' },
  'common.error':     { ar: 'حدث خطأ', en: 'Something went wrong' },
  // تبويبات
  'tab.home':         { ar: 'الرئيسية', en: 'Home' },
  'tab.categories':   { ar: 'التصنيفات', en: 'Categories' },
  'tab.cart':         { ar: 'السلة', en: 'Cart' },
  'tab.favorites':    { ar: 'المفضلة', en: 'Favorites' },
  'tab.account':      { ar: 'حسابي', en: 'Account' },
  // الحساب/الإعدادات
  'account.settings': { ar: 'الإعدادات', en: 'Settings' },
  'account.logout':   { ar: 'تسجيل الخروج', en: 'Log out' },
  'account.delete':   { ar: 'حذف الحساب نهائياً', en: 'Delete account' },
  'settings.language':{ ar: 'اللغة', en: 'Language' },
  'settings.theme':   { ar: 'المظهر', en: 'Appearance' },
  'settings.dark':    { ar: 'الوضع الليلي', en: 'Dark mode' },
  'settings.light':   { ar: 'الوضع الفاتح', en: 'Light mode' },
  'settings.arabic':  { ar: 'العربية', en: 'Arabic' },
  'settings.english': { ar: 'English', en: 'English' },
  // الطلب
  'order.confirm':    { ar: 'تأكيد الطلب', en: 'Place order' },
  'order.total':      { ar: 'الإجمالي المطلوب', en: 'Total' },
  'order.placed':     { ar: 'تم إرسال طلبك بنجاح', en: 'Your order was placed' },
  // الإدارة
  'admin.dashboard':  { ar: 'لوحة التحكم', en: 'Dashboard' },
  'admin.users':      { ar: 'المستخدمون', en: 'Users' },
  'admin.merchants':  { ar: 'المتاجر', en: 'Stores' },
  'admin.orders':     { ar: 'الطلبات', en: 'Orders' },
  'admin.approve':    { ar: 'اعتماد', en: 'Approve' },
  'admin.revoke':     { ar: 'إلغاء الاعتماد', en: 'Revoke' },
};

export const translate = (lang: Language, key: string): string => {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;
  return entry[lang] ?? entry.ar;
};
