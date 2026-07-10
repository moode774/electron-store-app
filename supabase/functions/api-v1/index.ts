// =============================================================
// api-v1 — REST API شخصي لكل حساب (عميل / تاجر / مندوب / أدمن)
// المصادقة: مفتاح API شخصي يُنشأ من داخل التطبيق (شاشة مفاتيح API)
//
// الاستخدام:
//   Authorization: Bearer <SUPABASE_ANON_KEY>   ← مطلوب من منصة Supabase
//   x-api-key: lv_live_xxxxxxxx...              ← مفتاحك الشخصي
//
// كل نقطة تحترم دور صاحب المفتاح وصلاحياته، وكل استدعاء يُسجَّل
// في user_activity_logs فيظهر للأدمن في سجل التحركات.
// =============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });

const err = (message: string, status: number) => json({ error: message }, status);

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
  if (!data?.valid) return err(data?.error ?? "invalid key", 401);
  return {
    user_id: data.user_id,
    role: data.role,
    full_name: data.full_name,
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
  const { data } = await supabase
    .from("merchant_profiles").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

async function deliveryProfileId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("delivery_profiles").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

const requireWrite = (auth: Auth) =>
  auth.scopes.includes("write") ? null : err("this key is read-only", 403);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  // المسار بعد اسم الدالة: /api-v1/products → /products
  const path = url.pathname.replace(/^\/api-v1/, "") || "/";
  const seg = path.split("/").filter(Boolean); // ["products", ":id", ...]
  const method = req.method;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);

  logCall(auth, method, path); // لا ننتظرها

  try {
    // ---------- عام: GET /me ----------
    if (method === "GET" && seg[0] === "me") {
      const { data: user } = await supabase
        .from("users")
        .select("id, full_name, phone, role, is_verified, created_at")
        .eq("id", auth.user_id).single();

      let profile: unknown = null;
      if (auth.role === "merchant") {
        ({ data: profile } = await supabase.from("merchant_profiles")
          .select("id, store_name, store_slug, city, is_approved, is_active, is_open, rating, total_reviews, wallet_balance")
          .eq("user_id", auth.user_id).maybeSingle());
      } else if (auth.role === "delivery") {
        ({ data: profile } = await supabase.from("delivery_profiles")
          .select("id, vehicle_type, vehicle_plate, is_approved, is_online, rating, total_deliveries, wallet_balance")
          .eq("user_id", auth.user_id).maybeSingle());
      } else if (auth.role === "customer") {
        ({ data: profile } = await supabase.from("customer_profiles")
          .select("id, loyalty_points, wallet_balance")
          .eq("user_id", auth.user_id).maybeSingle());
      }
      return json({ user, profile, role: auth.role });
    }

    // ---------- منتجات: GET /products ----------
    if (method === "GET" && seg[0] === "products" && !seg[1]) {
      let q = supabase.from("products")
        .select("id, name_ar, name, base_price, sale_price, stock_quantity, is_active, is_featured, rating, total_sold, category_id, merchant_id")
        .order("created_at", { ascending: false }).limit(limit);

      if (auth.role === "merchant") {
        const mid = await merchantProfileId(auth.user_id);
        if (!mid) return err("merchant profile not found", 404);
        q = q.eq("merchant_id", mid);
      } else if (auth.role !== "admin") {
        q = q.eq("is_active", true);
      }
      const search = url.searchParams.get("search");
      if (search) q = q.ilike("name_ar", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return json({ products: data });
    }

    // ---------- منتجات: POST /products (تاجر) ----------
    if (method === "POST" && seg[0] === "products" && auth.role === "merchant") {
      const ro = requireWrite(auth); if (ro) return ro;
      const mid = await merchantProfileId(auth.user_id);
      if (!mid) return err("merchant profile not found", 404);
      const b = await req.json();
      if (!b.name_ar || b.base_price == null) return err("name_ar and base_price are required", 400);
      const { data, error } = await supabase.from("products").insert({
        merchant_id: mid,
        name_ar: b.name_ar,
        name: b.name ?? b.name_ar,
        description_ar: b.description_ar ?? null,
        base_price: b.base_price,
        sale_price: b.sale_price ?? null,
        stock_quantity: b.stock_quantity ?? 0,
        category_id: b.category_id ?? null,
        sku: b.sku ?? null,
        is_active: b.is_active ?? true,
      }).select("id, name_ar, base_price, sale_price, stock_quantity").single();
      if (error) throw error;
      return json({ product: data }, 201);
    }

    // ---------- منتجات: PATCH /products/:id (تاجر — منتجاته فقط) ----------
    if (method === "PATCH" && seg[0] === "products" && seg[1] && auth.role === "merchant") {
      const ro = requireWrite(auth); if (ro) return ro;
      const mid = await merchantProfileId(auth.user_id);
      if (!mid) return err("merchant profile not found", 404);
      const b = await req.json();
      const allowed = ["name_ar", "name", "description_ar", "base_price", "sale_price", "stock_quantity", "is_active", "is_featured", "category_id", "sku"];
      const updates: Record<string, unknown> = {};
      for (const k of allowed) if (k in b) updates[k] = b[k];
      if (!Object.keys(updates).length) return err("no valid fields to update", 400);
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
        .select("*, order_items(product_id, product_name, quantity, unit_price)")
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
      const b = await req.json();
      const status = b.status as string;
      if (!status) return err("status is required", 400);

      const allowedByRole: Record<string, string[]> = {
        merchant: ["preparing", "ready", "cancelled"],
        delivery: ["on_the_way", "delivered"],
        admin: ["pending", "preparing", "ready", "on_the_way", "delivered", "cancelled"],
      };
      const allowed = allowedByRole[auth.role];
      if (!allowed) return err("customers cannot change order status", 403);
      if (!allowed.includes(status)) return err(`role ${auth.role} cannot set status ${status}`, 403);

      let q = supabase.from("orders").update({ status }).eq("id", seg[1]);
      if (auth.role === "merchant") {
        const mid = await merchantProfileId(auth.user_id);
        if (!mid) return err("merchant profile not found", 404);
        q = q.eq("merchant_id", mid);
      } else if (auth.role === "delivery") {
        const did = await deliveryProfileId(auth.user_id);
        if (!did) return err("delivery profile not found", 404);
        q = q.eq("delivery_id", did);
      }
      const { data, error } = await q.select("id, order_number, status").maybeSingle();
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
        const b = await req.json();
        const allowed = ["store_name", "store_description", "store_category", "city", "address", "is_open", "store_phone", "whatsapp"];
        const updates: Record<string, unknown> = {};
        for (const k of allowed) if (k in b) updates[k] = b[k];
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
        .select("id, title, body, type, is_read, created_at")
        .eq("user_id", auth.user_id)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ notifications: data });
    }

    // ---------- إحصائيات: GET /stats ----------
    if (method === "GET" && seg[0] === "stats") {
      if (auth.role === "merchant") {
        const mid = await merchantProfileId(auth.user_id);
        if (!mid) return err("merchant profile not found", 404);
        const [{ count: totalOrders }, { data: delivered }, { count: products }] = await Promise.all([
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("merchant_id", mid),
          supabase.from("orders").select("total_amount").eq("merchant_id", mid).eq("status", "delivered"),
          supabase.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", mid),
        ]);
        const revenue = (delivered ?? []).reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
        return json({ stats: { total_orders: totalOrders ?? 0, delivered_revenue: revenue, products: products ?? 0 } });
      }
      if (auth.role === "admin") {
        const [{ count: users }, { count: merchants }, { count: orders }, { data: delivered }] = await Promise.all([
          supabase.from("users").select("id", { count: "exact", head: true }),
          supabase.from("merchant_profiles").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("total_amount").eq("status", "delivered"),
        ]);
        const revenue = (delivered ?? []).reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
        return json({ stats: { users: users ?? 0, merchants: merchants ?? 0, orders: orders ?? 0, delivered_revenue: revenue } });
      }
      if (auth.role === "customer") {
        const [{ count: orders }, { data: cp }] = await Promise.all([
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", auth.user_id),
          supabase.from("customer_profiles").select("loyalty_points, wallet_balance").eq("user_id", auth.user_id).maybeSingle(),
        ]);
        return json({ stats: { orders: orders ?? 0, loyalty_points: cp?.loyalty_points ?? 0, wallet_balance: cp?.wallet_balance ?? 0 } });
      }
      if (auth.role === "delivery") {
        const did = await deliveryProfileId(auth.user_id);
        const { data: dp } = await supabase.from("delivery_profiles")
          .select("total_deliveries, rating, wallet_balance, is_online").eq("id", did).maybeSingle();
        return json({ stats: dp ?? {} });
      }
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
    return err("internal error: " + (e as Error).message, 500);
  }
});
