// Expo push sender invoked by a Database Webhook on notifications INSERT.
// The webhook must use `Authorization: Bearer <service-role-key>`.
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

interface NotificationRow {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  data: Record<string, unknown> | null;
  channel: string | null;
  sent_at: string | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema?: string;
  record: NotificationRow | null;
}

interface PushClaimResult {
  claimed: boolean;
  reason?: string;
  notification?: NotificationRow;
}

type ExpoTicket = {
  status?: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorization = req.headers.get('authorization') ?? '';
  if (!serviceRoleKey || !safeEqual(authorization, `Bearer ${serviceRoleKey}`)) {
    return json({ error: 'forbidden' }, 403);
  }

  let supabase: ReturnType<typeof createClient> | null = null;
  let notificationId: string | null = null;
  let claimToken: string | null = null;
  let claimAcquired = false;
  let dispatchCommitted = false;
  let accepted = 0;

  try {
    const payload = (await req.json()) as WebhookPayload;
    const webhookRow = payload?.record;
    if (
      payload.type !== 'INSERT' || payload.table !== 'notifications' ||
      !webhookRow?.id || !webhookRow.user_id
    ) {
      return json({ skipped: 'not a notification insert' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    notificationId = webhookRow.id;
    claimToken = crypto.randomUUID();
    const { data: claimData, error: claimError } = await supabase.rpc(
      'claim_push_notification',
      { p_notification_id: notificationId, p_claim_token: claimToken },
    );
    if (claimError) throw claimError;

    const claim = claimData as PushClaimResult | null;
    if (!claim?.claimed || !claim.notification) {
      return json({ skipped: claim?.reason ?? 'notification claim rejected' });
    }
    claimAcquired = true;
    const row = claim.notification;

    const commitDispatch = async (): Promise<boolean> => {
      const { data, error } = await supabase!.rpc('mark_push_notification_dispatched', {
        p_notification_id: notificationId,
        p_claim_token: claimToken,
      });
      if (error) throw error;
      dispatchCommitted = data === true;
      return dispatchCommitted;
    };

    const finalizeDispatch = async (failure: string | null): Promise<void> => {
      const { data, error } = await supabase!.rpc('finalize_push_notification', {
        p_notification_id: notificationId,
        p_claim_token: claimToken,
        p_accepted: accepted,
        p_failed_reason: failure,
      });
      if (error) throw error;
      if (data !== true) throw new Error('push finalization lost its claim');
      claimAcquired = false;
    };

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('notifications_enabled, order_notifications, promo_notifications')
      .eq('user_id', row.user_id)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (settings?.notifications_enabled === false) {
      if (!await commitDispatch()) return json({ skipped: 'dispatch already committed' });
      await finalizeDispatch('push disabled by user');
      return json({ skipped: 'push disabled by user' });
    }

    const notificationType = row.type ?? '';
    const isOrderNotification = notificationType === 'order' ||
      notificationType === 'delivery_offer' || notificationType.startsWith('order_');
    const isPromotionalNotification = notificationType === 'broadcast' ||
      notificationType.startsWith('promo_') || notificationType.startsWith('marketing_');
    if (isOrderNotification && settings?.order_notifications === false) {
      if (!await commitDispatch()) return json({ skipped: 'dispatch already committed' });
      await finalizeDispatch('order push disabled by user');
      return json({ skipped: 'order push disabled by user' });
    }
    if (isPromotionalNotification && settings?.promo_notifications === false) {
      if (!await commitDispatch()) return json({ skipped: 'dispatch already committed' });
      await finalizeDispatch('promotional push disabled by user');
      return json({ skipped: 'promotional push disabled by user' });
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('id, token')
      .eq('user_id', row.user_id)
      .eq('is_active', true);
    if (tokenError) throw tokenError;

    const validTokenRows = (tokens ?? []).filter((token): token is { id: string; token: string } =>
      typeof token.id === 'string' &&
      typeof token.token === 'string' &&
      /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token.token)
    );
    // Defensive de-duplication prevents duplicate tickets when legacy rows
    // contain the same Expo token more than once.
    const tokenRows = [...new Map(validTokenRows.map((token) => [token.token, token])).values()];
    if (!tokenRows.length) {
      if (!await commitDispatch()) return json({ skipped: 'dispatch already committed' });
      await finalizeDispatch('no active Expo tokens');
      return json({ sent: 0, reason: 'no active Expo tokens' });
    }

    const additionalData = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? row.data
      : {};
    const messages = tokenRows.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: (row.title ?? '\u0625\u0634\u0639\u0627\u0631').slice(0, 180),
      body: (row.body ?? '').slice(0, 1000),
      // Server-owned routing fields cannot be overwritten by arbitrary data.
      data: { ...additionalData, type: row.type, notification_id: row.id },
    }));

    // This database marker is committed before the external request. If the
    // worker crashes after this point the outcome is treated as ambiguous and
    // is not automatically retried, which favors at-most-once user delivery.
    if (!await commitDispatch()) return json({ skipped: 'dispatch already committed' });

    const invalidTokenIds: string[] = [];
    const failures: string[] = [];

    for (let offset = 0; offset < messages.length; offset += 100) {
      const chunk = messages.slice(offset, offset + 100);
      const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(10_000),
      });
      const responseBody = await response.text();
      if (!response.ok) {
        failures.push(`Expo HTTP ${response.status}`);
        continue;
      }

      let tickets: ExpoTicket[] = [];
      try {
        const parsed = JSON.parse(responseBody) as { data?: ExpoTicket[] };
        tickets = Array.isArray(parsed.data) ? parsed.data : [];
      } catch {
        failures.push('invalid Expo response');
        continue;
      }

      if (tickets.length < chunk.length) {
        failures.push(`Expo omitted ${chunk.length - tickets.length} ticket(s)`);
      }
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          accepted += 1;
          return;
        }

        failures.push(ticket.details?.error ?? ticket.message ?? 'push rejected');
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const tokenRow = tokenRows[offset + index];
          if (tokenRow) invalidTokenIds.push(tokenRow.id);
        }
      });
    }

    if (invalidTokenIds.length) {
      const { error: deactivateError } = await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .in('id', [...new Set(invalidTokenIds)]);
      if (deactivateError) throw deactivateError;
    }

    const failureSummary = failures.length
      ? [...new Set(failures)].slice(0, 5).join('; ').slice(0, 1000)
      : null;
    await finalizeDispatch(failureSummary);

    return json({ attempted: messages.length, accepted, rejected: messages.length - accepted });
  } catch (error) {
    console.error('send-push failed', error);

    // Preserve an auditable terminal state even if a database or Expo call
    // fails mid-flight. No direct notification updates bypass the claim token.
    if (supabase && claimAcquired && notificationId && claimToken) {
      try {
        if (!dispatchCommitted) {
          const { data, error: markError } = await supabase.rpc(
            'mark_push_notification_dispatched',
            { p_notification_id: notificationId, p_claim_token: claimToken },
          );
          if (markError) throw markError;
          dispatchCommitted = data === true;
        }
        if (dispatchCommitted) {
          const { error: finalizeError } = await supabase.rpc('finalize_push_notification', {
            p_notification_id: notificationId,
            p_claim_token: claimToken,
            p_accepted: accepted,
            p_failed_reason: 'push delivery interrupted after claim',
          });
          if (finalizeError) throw finalizeError;
        }
      } catch (finalizationError) {
        console.error('send-push finalization failed', finalizationError);
      }
    }

    return json({ error: 'push delivery failed' }, 500);
  }
});
