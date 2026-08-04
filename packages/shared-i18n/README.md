# @marketplace/shared-i18n

دعم ثنائي اللغة للتطبيق: **العربية هي اللغة الرسمية والافتراضية**، والإنجليزية لغة ثانية
متاحة في **كل الشاشات** ولكل الأدوار (العميل، التاجر، المندوب، الإدارة).

Bilingual support for the app: **Arabic is the official, default language**; English is a
second language available on **every screen** for every role (customer, merchant, delivery,
admin).

---

## الفكرة الأساسية — The core idea

**المفتاح هو النص العربي نفسه.**

```ts
t('حسابي')            // ar → "حسابي"      en → "My Account"
t('{0} ر.ي', [250])   // ar → "250 ر.ي"    en → "250 YER"
```

لماذا؟ لأن أي نص بلا ترجمة يظهر **بالعربية** بدل أن يظهر كمفتاح تقني مكسور مثل
`account.title`. الشاشة لا يمكن أن تصبح فارغة أبداً بسبب مفتاح ناقص.

Using the source text as the key means a missing entry falls back to the original Arabic
instead of rendering a broken technical key — the UI can never go blank.

---

## الاستخدام — Usage

```tsx
import { t, tv, useTranslation, LanguageSettingRow } from '@marketplace/shared-i18n';

// نص ثابت — a literal string
<Text>{t('تسجيل الخروج')}</Text>

// نص فيه قيمة — a string with a value
<Text>{t('لديك {0} طلب', [count])}</Text>

// قيمة ديناميكية قد تكون نصاً مخزّناً أو قادمة من الخادم
// a dynamic value that may be a stored label or server data
<Text>{tv(item.title)}</Text>

// داخل مكوّن يحتاج إعادة الرسم عند التبديل
const { t, language, toggleLanguage } = useTranslation();
```

- **`t(key, params?)`** — يترجم نصاً. يقبل `null`/`undefined` ويعيد `''`.
- **`tv(value, params?)`** — مثل `t` لكنه يمرّر أي قيمة غير نصية (أرقام، عناصر) كما هي.
- **`getLocale()`** — يعيد `ar-SA` أو `en-US` لتنسيق التواريخ والأرقام.
- **`useTranslation()`** — hook يعيد `t` مع حالة اللغة وأدوات التبديل.

---

## أين تحدث الترجمة — Where translation happens

الترجمة تتم **عند العرض فقط**، لا عند تعريف البيانات. هذا يعني أن النصوص العربية تبقى
في الكود كمفاتيح ثابتة، فلا تنكسر أي مقارنة (`===`) ولا تُرسل قيمة مترجمة إلى قاعدة البيانات.

Translation happens **at the point of display only**, never where data is defined. Arabic
literals stay in the code as stable keys, so no comparison breaks and no translated value is
ever written to the database.

حدود الترجمة (translation boundaries):

| الحد / Boundary | مثال / Example |
| --- | --- |
| نص JSX | `<Text>{t('حسابي')}</Text>` |
| خصائص النص | `placeholder={t('ابحث…')}`, `accessibilityLabel={t('…')}` |
| قيمة ديناميكية داخل `<Text>` | `<Text>{tv(status.label)}</Text>` |
| كل التنبيهات | `apps/customer/src/components/appAlert.ts` يترجم العنوان والرسالة وأزرارها |

`appAlert` هو حدّ واحد يغطي **كل** استدعاءات `Alert.alert` في التطبيق — بما فيها رسائل
الأخطاء القادمة من طبقة الـ API أو من الخادم، لأنها تمر من نفس النقطة.

---

## تبديل اللغة — Switching the language

`useLanguageStore` هو المصدر الوحيد لحالة اللغة، ويحفظ الاختيار في التخزين الآمن على
الجوال وفي `localStorage` على الويب. عند التبديل يُعاد بناء شجرة التنقل في `App.tsx`
عبر `key={language}` حتى تُترجم كل شاشة فوراً بدون إعادة تشغيل التطبيق.

`useLanguageStore` is the single source of truth and persists the choice (SecureStore on
native, `localStorage` on web). On switch, `App.tsx` rebuilds the navigation tree via
`key={language}` so every screen re-renders translated immediately — no app restart.

> **اتجاه الواجهة:** يبقى التخطيط RTL في اللغتين كما كان قبل هذا التغيير. لم يُمَس
> `I18nManager`، لأن قلب اتجاه أكثر من ٦٠ شاشة مبنية على هوامش وأبعاد ثابتة كان سيغيّر
> مواضع العناصر. الترجمة تغطي النصوص فقط، والتخطيط يبقى كما اعتاده المستخدمون.
>
> **Layout direction:** the RTL layout is unchanged in both languages. `I18nManager` was
> deliberately left alone — flipping direction across 60+ screens built on fixed margins
> would move elements around. Only text is translated; the layout stays as users know it.

### أزرار التبديل — The switchers

| المكوّن | أين يُستخدم |
| --- | --- |
| `LanguageToggleButton` | شاشة البداية (Splash)، شاشة الترحيب، شاشة تسجيل الدخول |
| `LanguageSettingRow` | قوائم الحساب: العميل، التاجر، المندوب |
| `LanguageSettingCard` | لوحة الإدارة: الإعدادات و"المزيد" |

---

## الفحص — Verification

```bash
npm run check:i18n     # كل نص عربي معروض له ترجمة إنجليزية
npm run i18n:keys      # عدد النصوص القابلة للترجمة
node scripts/i18n/check-call-sites.mjs   # صحة استدعاءات t() وعدم وجود نص خارج المترجم
```

`check:i18n` يفشل إذا:

- ظهر نص عربي جديد بلا ترجمة (**تسريب**)،
- أو اختلفت معاملات `{0}` بين المفتاح والترجمة،
- أو اختلفت المسافات الطرفية (لأنها تؤثر على الدمج مع نصوص مجاورة).

## إضافة نص جديد — Adding a new string

1. اكتب النص العربي داخل `t('…')` كالمعتاد.
2. شغّل `npm run check:i18n` — سيخبرك بالنص الناقص.
3. أضف السطر إلى `src/dictionary/en.ts` تحت مجموعة الملف المناسب.
