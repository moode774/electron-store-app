# 🔑 الـ API الشخصي — دليل الربط مع Claude وأي نموذج AI

كل حساب في التطبيق (عميل / تاجر / مندوب / أدمن) يستطيع إنشاء **مفاتيح API شخصية** من شاشة
**الحساب ← مفاتيح API (ربط الذكاء الاصطناعي)**. المفتاح يمنح صلاحيات الحساب نفسه فقط —
التاجر يدير متجره، العميل يقرأ طلباته، والأدمن يشرف على كل شيء.

## المصادقة

كل طلب يحتاج ترويستين:

| الترويسة | القيمة |
|---|---|
| `Authorization` | `Bearer <SUPABASE_ANON_KEY>` (ثابتة لكل المستخدمين — انظر أدناه) |
| `x-api-key` | مفتاحك الشخصي `lv_live_...` |

```
BASE_URL = https://sghaihfjuttwqikdszgh.supabase.co/functions/v1/api-v1
ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnaGFpaGZqdXR0d3Fpa2RzemdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzY5OTQsImV4cCI6MjA5Mzc1Mjk5NH0.vaLLl4e_VzwgZKIJz1R3yrn_fkLWAJdF5xzyLOWqOq0
```

> **أمان المفاتيح**: المفتاح يُعرض مرة واحدة عند الإنشاء ولا يُخزَّن في قاعدة البيانات إلا
> مُشفَّراً (SHA-256). يمكن إلغاء أي مفتاح فوراً من الشاشة نفسها. المفتاح يتوقف تلقائياً
> إذا حُظر الحساب أو عُطّل. كل استدعاء يُسجَّل في سجل تحركات المستخدم (يراه الأدمن).

## النقاط المتاحة

| النقطة | الطريقة | من يستخدمها | الوصف |
|---|---|---|---|
| `/me` | GET | الجميع | بيانات الحساب + البروفايل حسب الدور |
| `/products?search=&limit=` | GET | الجميع | التاجر: منتجاته؛ غيره: المنتجات النشطة |
| `/products` | POST | تاجر | إنشاء منتج `{name_ar, base_price, ...}` |
| `/products/:id` | PATCH | تاجر | تعديل منتجه (سعر/مخزون/تفعيل...) |
| `/orders?status=&limit=` | GET | الجميع | كلٌ يرى طلباته (الأدمن: الكل) |
| `/orders/:id` | GET | الجميع | تفاصيل الطلب مع الأصناف (بملكية) |
| `/orders/:id` | PATCH | تاجر/مندوب/أدمن | تغيير الحالة `{status}` حسب الدور |
| `/store` | GET/PATCH | تاجر | قراءة/تعديل بيانات المتجر (فتح/إغلاق...) |
| `/wallet` | GET | الجميع | حركات المحفظة |
| `/notifications` | GET | الجميع | إشعارات الحساب |
| `/stats` | GET | الجميع | إحصائيات حسب الدور |
| `/admin/users?role=` | GET | أدمن | قائمة المستخدمين |
| `/` | GET | الجميع | فهرس النقاط + هوية المفتاح |

انتقالات الحالة المسموحة في `PATCH /orders/:id`:
- **تاجر**: `preparing`, `ready`, `cancelled`
- **مندوب**: `on_the_way`, `delivered`
- **أدمن**: أي حالة

## مثال curl

```bash
curl "https://sghaihfjuttwqikdszgh.supabase.co/functions/v1/api-v1/me" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-api-key: lv_live_xxxxxxxxxxxx"
```

```bash
# تاجر: تحديث مخزون منتج
curl -X PATCH "https://sghaihfjuttwqikdszgh.supabase.co/functions/v1/api-v1/products/<PRODUCT_ID>" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-api-key: lv_live_xxxxxxxxxxxx" \
  -H "content-type: application/json" \
  -d '{"stock_quantity": 25, "sale_price": 199}'
```

## الربط مع Claude

### الطريقة 1 — Claude Code / أي وكيل لديه طرفية
أعطِ النموذج التعليمات التالية (استبدل المفتاح بمفتاحك):

```
لديك وصول إلى API متجري. الأساس:
https://sghaihfjuttwqikdszgh.supabase.co/functions/v1/api-v1
أرسل مع كل طلب:
  -H "Authorization: Bearer <ANON_KEY>"
  -H "x-api-key: lv_live_xxxxxxxxxxxx"
ابدأ بـ GET / لاكتشاف النقاط، ثم نفّذ ما أطلبه (اقرأ الطلبات، حدّث المخزون، غيّر حالات الطلبات...).
```

### الطريقة 2 — Claude API (tool use)
عرّف أداة واحدة عامة في تطبيقك:

```json
{
  "name": "marketplace_api",
  "description": "REST API for the user's marketplace account. Paths: /me, /products, /orders, /orders/{id}, /store, /wallet, /stats. Methods GET/POST/PATCH.",
  "input_schema": {
    "type": "object",
    "properties": {
      "method": { "type": "string", "enum": ["GET", "POST", "PATCH"] },
      "path":   { "type": "string", "description": "e.g. /orders?status=pending" },
      "body":   { "type": "object" }
    },
    "required": ["method", "path"]
  }
}
```

وفي منفذ الأداة مرّر الطلب إلى `BASE_URL + path` مع الترويستين. بهذا يستطيع كلود
إدارة الحساب كاملاً بأداة واحدة.

### الطريقة 3 — أي نموذج آخر (GPT/Gemini/...)
نفس الفكرة: أداة HTTP عامة + الترويستان. الـ API يرجع JSON نظيفاً برسائل خطأ واضحة
(401 مفتاح خاطئ، 403 خارج الصلاحية، 404 غير موجود).

## ملاحظات تشغيلية

- الحد الأقصى **10 مفاتيح نشطة** لكل حساب.
- المفاتيح تُدار من التطبيق: إنشاء / إلغاء (يوقفه فوراً) / حذف.
- `limit` الافتراضي 25 والأقصى 100.
- مفاتيح للقراءة فقط: عدّل `scopes` للمفتاح في قاعدة البيانات إلى `{read}` (واجهة اختيارها من التطبيق ممكن إضافتها لاحقاً).
- الكود المصدري للـ API: `supabase/functions/api-v1/index.ts` — أضف نقاطاً جديدة هناك ثم أعد النشر.
