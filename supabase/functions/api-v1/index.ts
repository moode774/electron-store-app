// =============================================================
// api-v1 — REST API شخصي لكل حساب (عميل / تاجر / مندوب / أدمن)
// المصادقة: مفتاح API شخصي يُنشأ من داخل التطبيق (شاشة مفاتيح API)
//
// الاستخدام:
//   x-api-key: lv_live_xxxxxxxx...              ← مفتاحك الشخصي
//
// كل نقطة تحترم دور صاحب المفتاح وصلاحياته، وكل استدعاء يُسجَّل
// في user_activity_logs فيظهر للأدمن في سجل التحركات.
// =============================================================

import { createClient } from "npm:@supabase/supabase-js@2.109.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

type Auth = {
  user_id: string;
  role: "customer" | "merchant" | "delivery" | "admin";
  full_name: string;
  key_id: string;
  scopes: string[];
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, ...extraHeaders, "content-type": "application/json; charset=utf-8" },
  });

const err = (message: string, status: number, headers: Record<string, string> = {}) =>
  json({ error: message }, status, headers);
const MAX_JSON_BODY_BYTES = 64 * 1024;
const MAX_SEARCH_LENGTH = 100;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_KEY = 120;
const rateWindows = new Map<string, { startedAt: number; count: number; lastSeenAt: number }>();

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new RequestError("request body is too large", 413);
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BODY_BYTES) {
    throw new RequestError("request body is too large", 413);
  }
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestError("invalid json body", 400);
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("invalid json body", 400);
  }
}

function isRateLimited(keyId: string): boolean {
  const now = Date.now();
  const current = rateWindows.get(keyId);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(keyId, { startedAt: now, count: 1, lastSeenAt: now });
  } else {
    current.count += 1;
    current.lastSeenAt = now;
    if (current.count > RATE_LIMIT_PER_KEY) return true;
  }
  if (rateWindows.size > 2_000) {
    for (const [id, bucket] of rateWindows) {
      if (now - bucket.lastSeenAt > RATE_WINDOW_MS * 2) rateWindows.delete(id);
    }
  }
  return false;
}

async function authenticate(req: Request): Promise<Auth | Response> {
  const headerKey = req.headers.get("x-api-key") ?? "";
  const bearer = req.headers.get("authorization") ?? "";
  const bearerKey = bearer.startsWith("Bearer lv_") ? bearer.slice(7) : "";
  const apiKey = headerKey || bearerKey;

  if (!apiKey.startsWith("lv_")) {
    return err("missing api key: send it in the x-api-key header", 401);
  }
  const { data, error } = await supabase.rpc("verify_api_key", { p_key: apiKey });
  if (error) return err("auth service error", 500);
  if (!data?.valid) {
    if (data?.error === "rate_limited") {
      const retryAfter = Math.max(1, Number(data.retry_after_seconds) || 60);
      return err("rate limit exceeded", 429, { "Retry-After": String(retryAfter) });
    }
    return err(data?.error ?? "invalid key", 401);
  }

  // لا نثق بدور مخزن داخل المفتاح وحده؛ نقرأ حالة الحساب الحالية في كل طلب.
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, role, full_name, is_active, is_blocked, blocked_until")
    .eq("id", data.user_id)
    .maybeSingle();
  if (userError) return err("auth service error", 500);
  if (!user || !user.is_active) return err("account is inactive", 403);
  const blockStillActive = user.is_blocked && (
    !user.blocked_until || new Date(user.blocked_until).getTime() > Date.now()
  );
  if (blockStillActive) return err("account is blocked", 403);
  if (!["customer", "merchant", "delivery", "admin"].includes(user.role)) {
    return err("account role is not supported", 403);
  }
  return {
    user_id: data.user_id,
    role: user.role,
    full_name: user.full_name,
    key_id: data.key_id,
    scopes: data.scopes ?? [],
  };
}

async function logCall(auth: Auth, method: string, path: string) {
  await supabase.from("user_activity_logs").insert({
    user_id: auth.user_id,
    action: "api_call",
    entity_type: "api",
    details: { method, path, key_id: auth.key_id },
  });
}

async function merchantProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("merchant_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function deliveryProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("delivery_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function merchantWriteProfile(userId: string): Promise<{
  id: string;
  is_approved: boolean;
  is_active: boolean;
} | null> {
  const { data, error } = await supabase.from("merchant_profiles")
    .select("id, is_approved, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

const requireWrite = (auth: Auth) =>
  auth.scopes.includes("write") ? null : err("this key is read-only", 403);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_MATERIAL_FIELDS = new Set([
  "name_ar", "name", "description_ar", "base_price", "sale_price", "category_id", "sku",
]);

function validateProductBody(body: unknown, partial = false): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid json body";
  const b = body as Record<string, unknown>;
  if (!partial && !(typeof b.name_ar === "string" && b.name_ar.trim().length >= 2)) {
    return "name_ar is required and must contain at least 2 characters";
  }
  if ("name_ar" in b && !(typeof b.name_ar === "string" && b.name_ar.trim().length >= 2 && b.name_ar.length <= 200)) {
    return "name_ar must contain 2 to 200 characters";
  }
  if ("name" in b && !(typeof b.name === "string" && b.name.trim().length >= 2 && b.name.length <= 200)) {
    return "name must contain 2 to 200 characters";
  }
  if (
    "description_ar" in b && b.description_ar != null &&
    !(typeof b.description_ar === "string" && b.description_ar.length <= 5000)
  ) return "description_ar must be null or contain at most 5000 characters";
  if (!partial && !(typeof b.base_price === "number" && Number.isFinite(b.base_price))) {
    return "base_price is required and must be a number";
  }
  if ("base_price" in b && !(typeof b.base_price === "number" && Number.isFinite(b.base_price) && b.base_price >= 0)) {
    return "base_price must be a non-negative number";
  }
  if ("sale_price" in b && b.sale_price != null && !(typeof b.sale_price === "number" && Number.isFinite(b.sale_price) && b.sale_price >= 0)) {
    return "sale_price must be null or a non-negative number";
  }
  if ("stock_quantity" in b && !(typeof b.stock_quantity === "number" && Number.isInteger(b.stock_quantity) && b.stock_quantity >= 0)) {
    return "stock_quantity must be a non-negative integer";
  }
  if ("category_id" in b && b.category_id != null && !(typeof b.category_id === "string" && UUID_RE.test(b.category_id))) {
    return "category_id must be a valid UUID or null";
  }
  for (const field of ["is_active"] as const) {
    if (field in b && typeof b[field] !== "boolean") return `${field} must be boolean`;
  }
  if ("sku" in b && b.sku != null && !(typeof b.sku === "string" && b.sku.length <= 100)) {
    return "sku must contain at most 100 characters";
  }
  if (
    typeof b.base_price === "number" && typeof b.sale_price === "number" &&
    b.sale_price > b.base_price
  ) return "sale_price cannot exceed base_price";
  return null;
}

function validateStoreBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid json body";
  const b = body as Record<string, unknown>;
  const lengths: Record<string, [number, number]> = {
    store_name: [2, 150], store_description: [0, 2000], store_category: [0, 100],
    city: [0, 100], address: [0, 500], store_phone: [0, 30], whatsapp: [0, 30],
  };
  for (const [field, [min, max]] of Object.entries(lengths)) {
    if (!(field in b) || b[field] == null) continue;
    if (typeof b[field] !== "string") return `${field} must be a string`;
    const size = (b[field] as string).trim().length;
    if (size < min || size > max) return `${field} must contain ${min} to ${max} characters`;
  }
  if ("is_open" in b && typeof b.is_open !== "boolean") return "is_open must be boolean";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  // Fast per-isolate burst control supplements the authoritative database
  // quota enforced by verify_api_key across every Edge isolate.
  if (isRateLimited(auth.key_id)) return err("rate limit exceeded", 429);

  const url = new URL(req.url);
  // المسار بعد اسم الدالة: /api-v1/products → /products
  const path = url.pathname.replace(/^\/api-v1/, "") || "/";
  const seg = path.split("/").filter(Boolean); // ["products", ":id", ...]
  const method = req.method;
  if (seg[1] && ["products", "orders"].includes(seg[0]) && !UUID_RE.test(seg[1])) {
    return err("resource id must be a valid UUID", 400);
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? 25);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 25;

  if (method === "GET" && !auth.scopes.includes("read") && !auth.scopes.includes("write")) {
    return err("this key cannot read resources", 403);
  }

  await logCall(auth, method, path).catch((logError) => {
    console.error("api-v1 activity log failed", logError);
  });

  try {
    // ---------- عام: GET /me ----------
    if (method === "GET" && seg[0] === "me") {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, full_name, phone, role, is_verified, created_at")
        .eq("id", auth.user_id).single();
      if (userError) throw userError;

      let profile: unknown = null;
      if (auth.role === "merchant") {
        const result = await supabase.from("merchant_profiles")
          .select("id, store_name, store_slug, city, is_approved, is_active, is_open, rating, total_reviews, wallet_balance")
          .eq("user_id", auth.user_id).maybeSingle();
        if (result.error) throw result.error;
        profile = result.data;
      } else if (auth.role === "delivery") {
        const result = await supabase.from("delivery_profiles")
          .select("id, vehicle_type, vehicle_plate, is_approved, is_online, rating, total_deliveries, wallet_balance")
          .eq("user_id", auth.user_id).maybeSingle();
        if (result.error) throw result.error;
        profile = result.data;
      } else if (auth.role === "customer") {
        const result = await supabase.from("customer_profiles")
          .select("id, loyalty_points, wallet_balance")
          .eq("user_id", auth.user_id).maybeSingle();
        if (result.error) throw result.error;
        profile = result.data;
      }
      return json({ user, profile, role: auth.role });
    }

    // ---------- منتجات: GET /products ----------
    if (method === "GET" && seg[0] === "products" && !seg[1]) {
      let q = supabase.from("products")
        .select("id, name_ar, name, base_price, sale_price, stock_quantity, is_active, is_featured, rating, total_sold, category_id, merchant_id, merchant_profiles!inner(is_approved, is_active, is_open)")
        .order("created_at", { ascending: false }).limit(limit);

      if (auth.role === "merchant") {
        const mid = await merchantProfileId(auth.user_id);
        if (!mid) return err("merchant profile not found", 404);
        q = q.eq("merchant_id", mid);
       } else if (auth.role !== "admin") {
         q = q
           .eq("is_active", true)
           .eq("is_approved", true)
           .eq("approval_status", "approved")
           .eq("merchant_profiles.is_approved", true)
          .eq("merchant_profiles.is_active", true)
          .eq("merchant_profiles.is_open", true);
      }
      const search = url.searchParams.get("search");
      if (search) {
        const normalizedSearch = search.trim();
        if (normalizedSearch.length > MAX_SEARCH_LENGTH) return err("search is too long", 400);
        if (normalizedSearch) q = q.ilike("name_ar", `%${normalizedSearch}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return json({ products: data });
    }

    // ---------- منتجات: POST /products (تاجر) ----------
    if (method === "POST" && seg[0] === "products" && auth.role === "merchant") {
      const ro = requireWrite(auth); if (ro) return ro;
      const merchant = await merchantWriteProfile(auth.user_id);
      if (!merchant) return err("merchant profile not found", 404);
      if (!merchant.is_approved || !merchant.is_active) return err("merchant account is not approved and active", 403);
      const mid = merchant.id;
      const b = await readJsonBody(req) as Record<string, any>;
      const validationError = validateProductBody(b);
      if (validationError) return err(validationError, 400);
      const { data, error } = await supabase.from("products").insert({
        merchant_id: mid,
        name_ar: b.name_ar.trim(),
        name: typeof b.name === "string" ? b.name.trim() : b.name_ar.trim(),
        description_ar: typeof b.description_ar === "string" ? b.description_ar.trim() : null,
        base_price: b.base_price,
        sale_price: b.sale_price ?? null,
        stock_quantity: b.stock_quantity ?? 0,
         category_id: b.category_id ?? null,
         sku: b.sku ?? null,
         is_active: b.is_active ?? true,
         // The service-role client bypasses RLS and auth.uid()-aware catalog
         // triggers, so the personal API must submit new products to moderation
         // explicitly rather than inheriting a stale/default approval state.
         approval_status: "pending",
         is_approved: false,
         approved_by: null,
         approved_at: null,
         approval_note: null,
       }).select("id, name_ar, base_price, sale_price, stock_quantity").single();
      if (error) throw error;
      return json({ product: data }, 201);
    }

    // ---------- منتجات: PATCH /products/:id (تاجر — منتجاته فقط) ----------
    if (method === "PATCH" && seg[0] === "products" && seg[1] && auth.role === "merchant") {
      const ro = requireWrite(auth); if (ro) return ro;
      const merchant = await merchantWriteProfile(auth.user_id);
      if (!merchant) return err("merchant profile not found", 404);
      if (!merchant.is_approved || !merchant.is_active) return err("merchant account is not approved and active", 403);
      const mid = merchant.id;
      const b = await readJsonBody(req) as Record<string, any>;
      const validationError = validateProductBody(b, true);
      if (validationError) return err(validationError, 400);
      const { data: current, error: currentError } = await supabase.from("products")
        .select("id, base_price, sale_price")
        .eq("id", seg[1]).eq("merchant_id", mid).maybeSingle();
      if (currentError) throw currentError;
      if (!current) return err("product not found or not yours", 404);
      const nextBasePrice = "base_price" in b ? b.base_price : current.base_price;
      const nextSalePrice = "sale_price" in b ? b.sale_price : current.sale_price;
      if (typeof nextSalePrice === "number" && typeof nextBasePrice === "number" && nextSalePrice > nextBasePrice) {
        return err("sale_price cannot exceed base_price", 400);
      }
      const allowed = ["name_ar", "name", "description_ar", "base_price", "sale_price", "stock_quantity", "is_active", "category_id", "sku"];
      const updates: Record<string, unknown> = {};
      for (const k of allowed) if (k in b) updates[k] = b[k];
       for (const k of ["name_ar", "name", "description_ar", "sku"]) {
         if (typeof updates[k] === "string") updates[k] = (updates[k] as string).trim();
       }
       if (!Object.keys(updates).length) return err("no valid fields to update", 400);
       // Calls from this Edge Function run as service_role, so auth.uid() is
       // unavailable to the merchant-edit trigger. Reset moderation here for
       // every material edit; stock and availability toggles stay operational.
       if (Object.keys(updates).some((field) => PRODUCT_MATERIAL_FIELDS.has(field))) {
         updates.approval_status = "pending";
         updates.is_approved = false;
         updates.approved_by = null;
         updates.approved_at = null;
         updates.approval_note = null;
       }
       const { data, error } = await supabase.from("products")
        .update(updates).eq("id", seg[1]).eq("merchant_id", mid)
        .select("id, name_ar, base_price, sale_price, stock_quantity, is_active").maybeSingle();
      if (error) throw error;
      if (!data) return err("product not found or not yours", 404);
      return json({ product: data });
    }

    // ---------- طلبات: GET /orders ----------
    if (method === "GET" && seg[0] === "orders" && !seg[1]) {
      let q = supabase.from("orders")
        .select("id, order_number, status, subtotal, delivery_fee, total_amount, payment_method, payment_status, created_at, merchant_id, customer_id, delivery_id")
        .order("created_at", { ascending: false }).limit(limit);

      if (auth.role === "customer") q = q.eq("customer_id", auth.user_id);
      else if (auth.role === "merchant") {
        const mid = await merchantProfileId(auth.user_id);
        if (!mid) return err("merchant profile not found", 404);
        q = q.eq("merchant_id", mid);
      } else if (auth.role === "delivery") {
        const did = await deliveryProfileId(auth.user_id);
        if (!did) return err("delivery profile not found", 404);
        q = q.eq("delivery_id", did);
      } // admin: الكل
      const status = url.searchParams.get("status");
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return json({ orders: data });
    }

    // ---------- طلبات: GET /orders/:id (مع الأصناف) ----------
    if (method === "GET" && seg[0] === "orders" && seg[1]) {
      const { data: order, error } = await supabase.from("orders")
        .select(`
          id, order_number, customer_id, merchant_id, delivery_id, address_id,
          group_id, status, subtotal, delivery_fee, discount_amount, tax_amount,
          total_amount, payment_method, payment_status, notes, is_scheduled,
          scheduled_at, scheduled_time_slot, estimated_delivery_time,
          delivered_at, cancelled_at, cancel_reason, created_at, updated_at,
          order_items(
            id, product_id, variant_id, product_name, variant_details,
            quantity, unit_price, total_price
          )
        `)
        .eq("id", seg[1]).maybeSingle();
      if (error) throw error;
      if (!order) return err("order not found", 404);

      // تحقق الملكية
      if (auth.role === "customer" && order.customer_id !== auth.user_id) return err("not your order", 403);
      if (auth.role === "merchant") {
        const mid = await merchantProfileId(auth.user_id);
        if (order.merchant_id !== mid) return err("not your order", 403);
      }
      if (auth.role === "delivery") {
        const did = await deliveryProfileId(auth.user_id);
        if (order.delivery_id !== did) return err("not your order", 403);
      }
      return json({ order });
    }

    // ---------- طلبات: PATCH /orders/:id { status } ----------
    if (method === "PATCH" && seg[0] === "orders" && seg[1]) {
      const ro = requireWrite(auth); if (ro) return ro;
      const b = await readJsonBody(req) as Record<string, any>;
      const status = b.status as string;
      if (!status) return err("status is required", 400);
      const knownStatuses = new Set([
        "preparing", "ready", "picked_up", "on_the_way", "delivered", "cancelled",
        "failed_delivery", "rescheduled", "disputed",
      ]);
      if (!knownStatuses.has(status)) return err("unsupported order status", 400);
      if (auth.role === "customer" && status !== "cancelled") {
        return err("customers can only request cancellation", 403);
      }

      // هذه الدالة المخزنة مخصصة للـservice role وتطبق مصفوفة الحالات نفسها
      // المستخدمة في التطبيق، مع actor صريح وسجل tracking وتسوية ذرية.
      const { data, error } = await supabase.rpc("api_transition_order_status", {
        p_actor_id: auth.user_id,
        p_order_id: seg[1],
        p_next_status: status,
        p_reason: typeof b.reason === "string" ? b.reason.trim() || null : null,
      });
      if (error) throw error;
      if (!data) return err("order not found or not yours", 404);
      return json({ order: data });
    }

    // ---------- متجر: GET /store + PATCH /store (تاجر) ----------
    if (seg[0] === "store" && auth.role === "merchant") {
      const mid = await merchantProfileId(auth.user_id);
      if (!mid) return err("merchant profile not found", 404);

      if (method === "GET") {
        const { data, error } = await supabase.from("merchant_profiles")
          .select("id, store_name, store_slug, store_description, store_category, city, address, is_approved, is_active, is_open, rating, total_reviews, wallet_balance, store_phone, whatsapp")
          .eq("id", mid).single();
        if (error) throw error;
        return json({ store: data });
      }
      if (method === "PATCH") {
        const ro = requireWrite(auth); if (ro) return ro;
        const b = await readJsonBody(req) as Record<string, any>;
        const validationError = validateStoreBody(b);
        if (validationError) return err(validationError, 400);
        const allowed = ["store_name", "store_description", "store_category", "city", "address", "is_open", "store_phone", "whatsapp"];
        const updates: Record<string, unknown> = {};
        for (const k of allowed) if (k in b) updates[k] = b[k];
        for (const k of allowed) if (typeof updates[k] === "string") updates[k] = (updates[k] as string).trim();
        if (!Object.keys(updates).length) return err("no valid fields to update", 400);
        const { data, error } = await supabase.from("merchant_profiles")
          .update(updates).eq("id", mid)
          .select("id, store_name, store_description, city, is_open").single();
        if (error) throw error;
        return json({ store: data });
      }
    }

    // ---------- محفظة: GET /wallet ----------
    if (method === "GET" && seg[0] === "wallet") {
      const { data, error } = await supabase.from("wallet_transactions")
        .select("type, amount, source, balance_after, notes, created_at")
        .eq("user_id", auth.user_id)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ transactions: data });
    }

    // ---------- إشعارات: GET /notifications ----------
    if (method === "GET" && seg[0] === "notifications") {
      const { data, error } = await supabase.from("notifications")
        .select("id, title, body, type, data, is_read, channel, created_at")
        .eq("user_id", auth.user_id)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ notifications: data });
    }

    // ---------- إحصائيات: GET /stats ----------
    if (method === "GET" && seg[0] === "stats") {
      const { data, error } = await supabase.rpc("api_get_role_stats", {
        p_actor_id: auth.user_id,
      });
      if (error) throw error;
      return json({ stats: data ?? {} });
    }

    // ---------- أدمن: GET /admin/users ----------
    if (method === "GET" && seg[0] === "admin" && seg[1] === "users") {
      if (auth.role !== "admin") return err("admin only", 403);
      let q = supabase.from("users")
        .select("id, full_name, phone, role, is_active, is_blocked, blocked_until, created_at")
        .order("created_at", { ascending: false }).limit(limit);
      const role = url.searchParams.get("role");
      if (role) q = q.eq("role", role);
      const { data, error } = await q;
      if (error) throw error;
      return json({ users: data });
    }

    // ---------- الفهرس: GET / ----------
    if (method === "GET" && seg.length === 0) {
      return json({
        name: "Marketplace Personal API v1",
        authenticated_as: { name: auth.full_name, role: auth.role },
        endpoints: [
          "GET  /me",
          "GET  /products?search=&limit=",
          "POST /products                (merchant)",
          "PATCH /products/:id           (merchant)",
          "GET  /orders?status=&limit=",
          "GET  /orders/:id",
          "PATCH /orders/:id {status}    (merchant/delivery/admin)",
          "GET  /store | PATCH /store    (merchant)",
          "GET  /wallet",
          "GET  /notifications",
          "GET  /stats",
          "GET  /admin/users?role=       (admin)",
        ],
      });
    }

    return err(`no route: ${method} ${path}`, 404);
  } catch (e) {
    console.error("api-v1 error:", e);
    if (e instanceof RequestError) return err(e.message, e.status);
    const dbError = e as { code?: string; message?: string };
    const message = dbError.message ?? "";
    if (dbError.code === "23505" || message.includes("IDEMPOTENCY_CONFLICT")) {
      return err("request conflicts with an existing operation", 409);
    }
    if (dbError.code === "23514" || message.includes("INVALID_") || message.includes("OUT_OF_STOCK")) {
      return err("request data violates a business rule", 400);
    }
    if (message.includes("غير مصرّح") || message.includes("غير مسموح") || message.includes("FORBIDDEN")) {
      return err("operation is not allowed for this account", 403);
    }
    if (message.includes("غير موجود") || message.includes("NOT_FOUND")) {
      return err("resource not found", 404);
    }
    return err("internal server error", 500);
  }
});
