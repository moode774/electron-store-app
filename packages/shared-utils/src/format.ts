// ============================================================
// FORMAT — تنسيق موحّد للأسعار والتواريخ والحالات عبر التطبيق
// ============================================================
import { CURRENCY } from './constants';

// ---- Price -------------------------------------------------
/**
 * تنسيق السعر بعملة التطبيق الموحّدة مع فاصل آلاف عربي.
 * مثال: formatPrice(12500) => "12,500 ر.ي"
 */
export function formatPrice(
  amount: number | null | undefined,
  opts: { withSymbol?: boolean; decimals?: number } = {},
): string {
  const { withSymbol = true, decimals = CURRENCY.DECIMALS } = opts;
  const value = Number.isFinite(amount as number) ? (amount as number) : 0;
  const fixed = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  // فاصل آلاف
  const [intPart, fracPart] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const num = fracPart ? `${withSep}.${fracPart}` : withSep;
  return withSymbol ? `${num} ${CURRENCY.SYMBOL}` : num;
}

// ---- Numbers -----------------------------------------------
/** اختصار الأعداد الكبيرة: 1500 => "1.5K" */
export function formatCompactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// ---- Relative time -----------------------------------------
/**
 * وقت نسبي بالعربية: "الآن"، "منذ 5 د"، "منذ ساعتين"، "منذ 3 أيام".
 */
export function formatRelativeTime(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 0) return 'الآن';
  if (sec < 60) return 'الآن';
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? 'منذ دقيقة' : min === 2 ? 'منذ دقيقتين' : `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? 'منذ ساعة' : hr === 2 ? 'منذ ساعتين' : `منذ ${hr} ساعات`;
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? 'أمس' : day === 2 ? 'منذ يومين' : `منذ ${day} أيام`;
  const month = Math.floor(day / 30);
  if (month < 12) return month === 1 ? 'منذ شهر' : `منذ ${month} أشهر`;
  const year = Math.floor(month / 12);
  return year === 1 ? 'منذ سنة' : `منذ ${year} سنوات`;
}

/** تاريخ مختصر بالعربية: "28 يونيو 2026" */
const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
export function formatDate(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** وقت 24 ساعة: "14:05" */
export function formatTime(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// ---- Phone -------------------------------------------------
/** تطبيع رقم هاتف يمني إلى صيغة دولية +967 */
export function normalizeYemenPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00967')) digits = digits.slice(5);
  else if (digits.startsWith('967')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return `+967${digits}`;
}

/** التحقق من صحة رقم جوال يمني (7 يليها 8 أرقام) */
export function isValidYemenMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').replace(/^(00)?967/, '').replace(/^0/, '');
  return /^7\d{8}$/.test(digits);
}
