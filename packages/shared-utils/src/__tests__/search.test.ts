import { normalizeArabic, relevanceScore, rankProducts, matchesQuery } from '../search';

describe('normalizeArabic', () => {
  it('unifies alef/hamza, taa marbuta, yaa and strips diacritics', () => {
    expect(normalizeArabic('أَحْمَد')).toBe('احمد');
    expect(normalizeArabic('سماعة')).toBe('سماعه');
    expect(normalizeArabic('علي')).toBe(normalizeArabic('على'));
  });
});

describe('relevanceScore', () => {
  const featured = { name: 'حذاء رياضي', rating: 5, total_sold: 9999, is_featured: true };

  it('returns 0 for a featured/high-rated product with NO text match', () => {
    expect(relevanceScore(featured, 'سلعة غير موجودة')).toBe(0);
  });

  it('scores exact match higher than partial', () => {
    const exact = relevanceScore({ name: 'عطر' }, 'عطر');
    const partial = relevanceScore({ name: 'عطر رجالي فاخر' }, 'عطر');
    expect(exact).toBeGreaterThan(partial);
  });

  it('normalizes the query so diacritics/forms still match', () => {
    expect(relevanceScore({ name: 'سماعة' }, 'سماعه')).toBeGreaterThan(0);
  });
});

describe('rankProducts / matchesQuery', () => {
  const list = [
    { name: 'سماعة بلوتوث', rating: 3, total_sold: 10 },
    { name: 'حذاء رياضي', rating: 5, total_sold: 9999, is_featured: true },
    { name: 'سماعة سلكية', rating: 4, total_sold: 50 },
  ];

  it('excludes non-matching products even if popular', () => {
    const r = rankProducts(list, 'سماعة');
    expect(r).toHaveLength(2);
    expect(r.every((p) => p.name.includes('سماعة'))).toBe(true);
  });

  it('returns everything when the query is empty', () => {
    expect(rankProducts(list, '')).toHaveLength(3);
    expect(matchesQuery(list[1], '')).toBe(true);
  });

  it('matchesQuery is false for unrelated queries', () => {
    expect(matchesQuery(list[1], 'سماعة')).toBe(false);
  });
});
