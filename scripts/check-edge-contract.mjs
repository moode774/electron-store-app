import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = process.cwd();
const apiPath = path.join(root, 'supabase', 'functions', 'api-v1', 'index.ts');
const source = fs.readFileSync(apiPath, 'utf8');
const pushPath = path.join(root, 'supabase', 'functions', 'send-push', 'index.ts');
const pushSource = fs.readFileSync(pushPath, 'utf8');
const notificationScreenPaths = [
  path.join(root, 'apps', 'customer', 'src', 'screens', 'main', 'account', 'NotificationsScreen.tsx'),
  path.join(root, 'apps', 'customer', 'src', 'screens', 'shared', 'RoleNotificationsScreen.tsx'),
];
const notificationScreenSources = notificationScreenPaths.map((fileName) => ({
  fileName,
  source: fs.readFileSync(fileName, 'utf8'),
}));
const customerPackage = JSON.parse(fs.readFileSync(
  path.join(root, 'apps', 'customer', 'package.json'),
  'utf8',
));
const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const migrationSource = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n');

const requiredEdgePatterns = [
  ["public product reads require is_approved", /\.eq\("is_approved",\s*true\)/],
  ["public product reads require approved moderation status", /\.eq\("approval_status",\s*"approved"\)/],
  ["new API products start pending", /approval_status:\s*"pending"/],
  ["new API products are not approved", /is_approved:\s*false/],
  ["material API edits reset moderation", /PRODUCT_MATERIAL_FIELDS[\s\S]*updates\.approval_status\s*=\s*"pending"/],
  ["API order transitions use the guarded RPC", /rpc\("api_transition_order_status"/],
  ["API rate limits are returned as 429", /data\?\.error\s*===\s*"rate_limited"[\s\S]{0,300}429/],
  ["API rate limit responses include Retry-After", /"Retry-After"/],
  ["role statistics use one authoritative aggregate RPC", /rpc\("api_get_role_stats"/],
];

const requiredPushPatterns = [
  ["push webhooks acquire a database claim", /rpc\(\s*['"]claim_push_notification['"]/],
  ["push webhooks commit before external delivery", /rpc\(\s*['"]mark_push_notification_dispatched['"][\s\S]*fetch\(EXPO_PUSH_URL/],
  ["push outcomes use claim-bound finalization", /rpc\(\s*['"]finalize_push_notification['"]/],
  ["push tokens are de-duplicated before delivery", /new Map\(validTokenRows\.map/],
  ["push webhook authorization uses constant-time comparison", /safeEqual\(authorization,\s*`Bearer \$\{serviceRoleKey\}`\)/],
  ["push delivery respects category preferences", /select\(['"]notifications_enabled, order_notifications, promo_notifications['"]\)[\s\S]*order_notifications[\s\S]*promo_notifications/],
];

const requiredMigrationPatterns = [
  ["database verification owns a shared quota window", /rate_window_started_at[\s\S]*rate_window_count/],
  ["database key verification locks the quota row", /verify_api_key[\s\S]*FOR UPDATE/],
  ["personal API statistics are aggregated in SQL", /FUNCTION public\.api_get_role_stats\(p_actor_id uuid\)/i],
  ["push notification claims lock the notification row", /claim_push_notification[\s\S]*FOR UPDATE/],
  ["push dispatch has a durable one-way boundary", /push_dispatched_at[\s\S]*already_dispatched/],
  ["notification clients cannot select internal push columns", /REVOKE SELECT ON TABLE public\.notifications FROM anon, authenticated[\s\S]*GRANT SELECT \([\s\S]*created_at[\s\S]*\) ON public\.notifications TO authenticated/i],
  ["order events remain eligible for push", /marketplace_notify_order_event[\s\S]*INSERT INTO public\.notifications\(user_id, title, body, type, data, event_key, channel\)[\s\S]*'push'/i],
  ["notification preferences use identity-bound RPCs", /FUNCTION public\.get_my_notification_settings\(\)[\s\S]*FUNCTION public\.update_my_notification_settings\([\s\S]*REVOKE ALL PRIVILEGES ON TABLE public\.user_settings FROM PUBLIC, anon, authenticated/i],
];

const failures = requiredEdgePatterns
  .filter(([, pattern]) => !pattern.test(source))
  .map(([label]) => label);
failures.push(...requiredMigrationPatterns
  .filter(([, pattern]) => !pattern.test(migrationSource))
  .map(([label]) => label));
failures.push(...requiredPushPatterns
  .filter(([, pattern]) => !pattern.test(pushSource))
  .map(([label]) => label));

for (const [label, fileName, edgeSource] of [
  ['api-v1', apiPath, source],
  ['send-push', pushPath, pushSource],
]) {
  const result = ts.transpileModule(edgeSource, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    failures.push(`${label} TypeScript syntax: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
}

if (/from\("orders"\)[\s\S]{0,300}\.update\(/.test(source)) {
  failures.push('api-v1 must not update orders directly');
}

if (/\.select\(\s*["'`]\*/.test(source)) {
  failures.push('api-v1 must use explicit response columns instead of service-role select(*)');
}

if (/\.from\("(?:order_settlements|marketplace_ledger_entries)"\)/.test(source)) {
  failures.push('api-v1 financial aggregates must stay in the database RPC and cannot be client-truncated');
}

if (/\.from\(['"]notifications['"]\)[\s\S]{0,300}\.update\(/.test(pushSource)) {
  failures.push('send-push must not bypass its claim-bound notification RPCs');
}

for (const { fileName, source: notificationSource } of notificationScreenSources) {
  const selectMatch = notificationSource.match(/select:\s*\[([^\]]+)\]/);
  const selectedColumns = selectMatch?.[1] ?? '';
  for (const column of ['id', 'user_id', 'title', 'body', 'type', 'data', 'is_read', 'channel', 'created_at']) {
    if (!new RegExp(`["']${column}["']`).test(selectedColumns)) {
      failures.push(`${path.basename(fileName)} Realtime subscription must select safe column ${column}`);
    }
  }
  if (/push_|failed_reason|sent_at/.test(selectedColumns)) {
    failures.push(`${path.basename(fileName)} Realtime subscription exposes internal delivery state`);
  }
}

const supabaseJsVersion = customerPackage.dependencies?.['@supabase/supabase-js'] ?? '';
const supabaseJsParts = /^2\.(\d+)\.(\d+)$/.exec(supabaseJsVersion);
if (!supabaseJsParts || Number(supabaseJsParts[1]) < 109) {
  failures.push('notification column projection requires @supabase/supabase-js 2.109.0 or newer');
}

const apiConfig = config.match(/\[functions\.api-v1\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? '';
if (!/verify_jwt\s*=\s*false/.test(apiConfig)) {
  failures.push('api-v1 gateway JWT verification must remain disabled for custom lv_ key authentication');
}

const pushConfig = config.match(/\[functions\.send-push\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? '';
if (!/verify_jwt\s*=\s*true/.test(pushConfig)) {
  failures.push('send-push gateway JWT verification must remain enabled for service-role webhooks');
}

if (!/GRANT EXECUTE ON FUNCTION public\.verify_api_key\(text\)[\s\S]{0,100}TO service_role/i.test(migrationSource)) {
  failures.push('verify_api_key must be executable only through the Edge service role');
}

if (failures.length) {
  console.error('Edge contract check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const invariantCount = requiredEdgePatterns.length + requiredPushPatterns.length + requiredMigrationPatterns.length + 7;
console.log(`Edge contract check passed (${invariantCount} guarded invariants).`);
