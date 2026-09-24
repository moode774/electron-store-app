# قاعدة البيانات — Supabase

**المشروع البعيد:** `sghaihfjuttwqikdszgh` (ap-southeast-1, Postgres 17)

## القواعد الرسمية للعمل

1. **كل تغيير على السكيما يمر عبر ميغريشن** في `supabase/migrations/` بصيغة
   `YYYYMMDDHHMMSS_وصف_قصير.sql` — ممنوع تطبيق SQL يدوياً عبر الـ Dashboard
   بدون تسجيله كملف ميغريشن هنا في نفس الوقت.
2. **لا ملفات SQL خارج هذا المجلد.** أي ملف "patch" مؤقت بالجذر يُعتبر خطأً تنظيمياً.
3. البيانات التجريبية في `seed_test_data.sql` (ليست ميغريشن — تُشغَّل يدوياً عند الحاجة
   وتمسح كل المستخدمين والبيانات الحالية قبل الزرع).

## نظام المصادقة (الهاتف + OTP)

المستخدم يدخل رقم جواله ويستلم رمز تحقق عبر Supabase Phone Auth
(`packages/shared-hooks/src/useAuthStore.ts` → `signInWithOtp` ثم `verifyOtp`).

- يجب تفعيل مزوّد Phone ومزوّد SMS (Twilio / MessageBird / Vonage) في
  Supabase → Authentication → Providers قبل الإطلاق.
- trigger `handle_new_user` ينشئ سجل `public.users` عند أول تحقق، والدور
  يُقبل فقط من `customer | merchant | delivery` (لا يمكن طلب `admin`).
- الحسابات القديمة (`u<الرقم>@levi-phone.app`) رُبطت بأرقامها وأُلغيت
  كلمات مرورها المشتقة في `20260923120500_retire_phone_derived_passwords.sql`.
- حساب الأدمن يُمنح يدوياً من قاعدة البيانات فقط، ولا يوجد رقم تجاوز في التطبيق.

## حسابات الاختبار

موجودة فقط بعد تشغيل `seed_test_data.sql` على قاعدة تطوير (يمسح كل البيانات).
للدخول بلا SMS فعلية أضف الأرقام في Phone → Test phone numbers.

| الدور | الاسم | رقم الدخول |
|---|---|---|
| تاجر 1 | أحمد محمد الشامي — متجر النخبة للإلكترونيات (صنعاء) | `771111111` |
| تاجر 2 | سارة عبدالله الحضرمي — بوتيك لمسة (عدن) | `772222222` |
| عميل 1 | عبدالله سعد العمراني | `773333333` |
| عميل 2 | نورة خالد الصنعاني | `774444444` |
| مندوب 1 | خالد سعد المخلافي | `775555555` |
| مندوب 2 | فهد ناصر العدني | `776666666` |

## نموذج الصلاحيات (RLS)

- **الأدمن**: سياسة `admin_full_access` (FOR ALL عبر `is_admin()`) على كل جداول public.
  `is_admin()` تقرأ الدور من `public.users` المحمي بـ trigger
  `protect_user_sensitive_fields` (يمنع غير الأدمن من تغيير role/is_active/is_verified).
- **المستخدم**: سياسات "own" (`user_id = auth.uid()`) لكل جدول يخصه.
- **العام**: قراءة فقط للمنتجات النشطة والمتاجر المعتمدة والتصنيفات ومناطق الخدمة.
- ⛔ **ممنوع نهائياً** بناء أي سياسة على `auth.jwt() -> 'user_metadata'` —
  هذا الحقل يعدّله المستخدم النهائي بنفسه (ثغرة ترقية صلاحيات حُذفت في
  `20260704000000_security_fixes_metadata_policy_and_function_grants.sql`).

## الحظر والإشراف

- `users.is_blocked` (دائم) / `users.blocked_until` (مؤقت) / `blocked_reason`
- الفحص عند الدخول واسترجاع الجلسة في `useAuthStore` (يطرد المحظور برسالة السبب)
- كل قرارات الأدمن تُوثَّق تلقائياً في `admin_activity_logs` و`user_activity_logs`
  (trigger `log_user_block_changes`)
- سجل تحركات المستخدم (`user_activity_logs`) يتعبأ تلقائياً من triggers على:
  الطلبات، التقييمات، تذاكر الدعم، الاسترجاعات، الشكاوى، حركات المحفظة
- الملف الكامل لأي مستخدم للأدمن: RPC `admin_get_user_details(user_id)`

## ملاحظات تشغيلية

- الويب لا يدعم `Alert.alert` — استخدم `apps/customer/src/components/appAlert.ts`
- سجل الميغريشنات البعيد أشمل من الملفات المحلية (بدأ التوثيق المحلي متأخراً) —
  اعرض السجل الكامل عبر MCP `list_migrations` أو من الـ Dashboard

## حالة إصلاح دورة السوق

- لا تنشر نسخة التطبيق الحالية إلى الإنتاج قبل إنشاء وتشغيل migration إصلاح العمليات؛ واجهات العميل والتاجر والمندوب والإدارة تعتمد الآن على RPCs ذرية وآمنة غير موجودة في قاعدة الإنتاج بعد.
- أنشئ ملفات migrations دائمًا عبر Supabase CLI، ثم اختبر `supabase db reset` واختبارات pgTAP في `supabase/tests/database/` قبل الربط أو النشر.
- الدالة `api-v1` تتحقق من مفاتيح API داخل الدالة، ولذلك إعدادها المحلي `verify_jwt = false`. لا تستخدم هذا الإعداد لأي دالة تعتمد JWT المستخدم.
- الدالة `send-push` تقبل استدعاء service-role فقط، ولا يجوز استدعاؤها مباشرة من تطبيق الجوال. اربطها من webhook/عامل خلفي موثوق بعد تطبيق RPCs الخاصة برموز الأجهزة.
- يلزم ضبط `EXPO_PUBLIC_EAS_PROJECT_ID` في بيئة بناء الجوال، أو ربط مشروع EAS بحيث يتوفر `Constants.easConfig.projectId`.
