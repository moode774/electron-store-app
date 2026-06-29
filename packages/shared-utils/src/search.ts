// ============================================================
// SEARCH — تطبيع نصّ عربي وترتيب نتائج حسب الصلة
// ============================================================

/**
 * تطبيع نص عربي: إزالة التشكيل، توحيد الألف/الهمزة/التاء المربوطة/الياء،
 * وإزالة المسافات الزائدة — لتحسين مطابقة البحث.
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '') // التشكيل
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ -> ا
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ـ/g, '') // التطويل ـ
    .replace(/\s+/g, ' ');
}

export interface RankableProduct {
  name: string;
  name_ar?: string | null;
  rating?: number;
  total_sold?: number;
  is_featured?: boolean;
  tags?: string[] | null;
}

/**
 * درجة صلة منتج باستعلام بحث (أعلى = أكثر صلة).
 * تأخذ في الحسبان: تطابق تام، بادئة، تضمّن، الوسوم، التقييم، المبيعات، والإبراز.
 */
export function relevanceScore(product: RankableProduct, query: string): number {
  const q = normalizeArabic(query);
  if (!q) {
    // بلا استعلام: رتّب حسب الجودة (للتوصيات)
    return (product.rating ?? 0) * 4 + Math.log10((product.total_sold ?? 0) + 1) * 3 + (product.is_featured ? 5 : 0);
  }

  const name = normalizeArabic(product.name);
  const nameAr = normalizeArabic(product.name_ar ?? '');

  // درجة التطابق النصّي وحدها (تحدّد ما إذا كان المنتج مطابقاً فعلاً)
  let textScore = 0;
  for (const field of [name, nameAr]) {
    if (!field) continue;
    if (field === q) textScore += 100;
    else if (field.startsWith(q)) textScore += 60;
    else if (field.includes(q)) textScore += 35;
    else {
      const words = q.split(' ').filter(Boolean);
      const hits = words.filter((w) => field.includes(w)).length;
      if (hits > 0) textScore += (hits / words.length) * 20;
    }
  }
  if (product.tags?.some((t) => normalizeArabic(t).includes(q))) textScore += 15;

  // بلا تطابق نصّي إطلاقاً = غير مطابق (لا تُنقذه معزّزات الجودة)
  if (textScore === 0) return 0;

  // معزّزات الجودة تُرجّح بين المتطابقات فقط
  let score = textScore;
  score += Math.min(10, (product.rating ?? 0) * 2);
  score += Math.min(8, Math.log10((product.total_sold ?? 0) + 1) * 3);
  if (product.is_featured) score += 4;
  return score;
}

/** ترتيب قائمة منتجات حسب الصلة بالاستعلام (يتجاهل غير المطابقة عند وجود استعلام). */
export function rankProducts<T extends RankableProduct>(products: T[], query: string): T[] {
  const q = normalizeArabic(query);
  const scored = products
    .map((p) => ({ p, s: relevanceScore(p, query) }))
    .filter((x) => (q ? x.s > 0 : true)); // عند البحث: فقط المتطابقة نصّياً
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.p);
}

/** هل يطابق المنتج الاستعلام (لفلترة محلية سريعة)؟ */
export function matchesQuery(product: RankableProduct, query: string): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  return relevanceScore(product, query) > 0;
}
