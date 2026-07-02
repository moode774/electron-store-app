# Marketplace (متجر اليمن)

سوق إلكتروني متعدد الأطراف (عميل / تاجر / مندوب) مبني كـ **Expo / React Native** مع خلفية **Supabase (PostgreSQL)**.

> ملاحظة: اسم المستودع `electron-store-app` تاريخي؛ التطبيق فعلياً React Native (جوال + ويب) وليس Electron.

## التشغيل

```bash
yarn install
yarn customer      # تطبيق العميل/التاجر/المندوب (واجهة موحّدة بالأدوار)
# أو للويب:
node start-web.js
```

### متغيّرات البيئة المطلوبة (`apps/customer/.env`)
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

### قاعدة البيانات
الـ migrations في `supabase/migrations`. طبّقها عبر:
```bash
supabase db push
```

## بنية المشروع
- `apps/customer` — التطبيق (شاشات العميل/التاجر/المندوب + التنقّل).
- `packages/shared-hooks` — طبقة البيانات (`api.ts`)، المصادقة، السلة، عميل Supabase.
- `packages/shared-ui` — مكوّنات واجهة مشتركة.
- `packages/shared-utils` — الثوابت والأنواع المشتركة.
- `supabase/migrations` — المخطط وسياسات الأمان (RLS) والدوال.

## الأمان
راجع `QA_COMPREHENSIVE_AUDIT_2026-07.md` لتقرير الفحص، و`SECURITY_FIXES_2026-07.md` لما تم إصلاحه وما يتطلب إعداداً من طرفك (مزوّد SMS، تطبيق الـ migration).
