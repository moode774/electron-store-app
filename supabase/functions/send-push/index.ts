// ============================================================
// send-push — Edge Function لإرسال الإشعارات الفورية عبر Expo
// ------------------------------------------------------------
// يُستدعى عبر Database Webhook على إدراج صف في جدول notifications
// (INSERT)، فيقرأ رموز أجهزة المستخدم النشطة ويرسل لها إشعاراً.
//
// النشر:
//   supabase functions deploy send-push
// التفعيل (Database Webhook):
//   Studio → Database → Webhooks → Create
//     Table: public.notifications | Events: INSERT
//     Type: HTTP Request → POST <project>/functions/v1/send-push
//     Header: Authorization: Bearer <SERVICE_ROLE_KEY>
//
// المتغيّرات (مُحقَنة تلقائياً في بيئة Supabase Edge):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface NotificationRow {
  user_id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  data: Record<string, unknown> | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: NotificationRow | null;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  try {
    const payload = (await req.json()) as WebhookPayload;
    const row = payload?.record;
    if (!row?.user_id) {
      return new Response(JSON.stringify({ skipped: 'no user_id' }), { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', row.user_id)
      .eq('is_active', true);

    if (error) throw error;
    const expoTokens = (tokens ?? [])
      .map((t: { token: string }) => t.token)
      .filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));

    if (expoTokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Expo يقبل حتى 100 رسالة في الدفعة الواحدة
    const messages = expoTokens.map((to) => ({
      to,
      sound: 'default',
      title: row.title ?? 'إشعار',
      body: row.body ?? '',
      data: { type: row.type, ...(row.data ?? {}) },
    }));

    const results: unknown[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      });
      results.push(await res.json());
    }

    return new Response(JSON.stringify({ sent: messages.length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
