import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Category, getCategories, ProductSummary, searchProducts } from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { CustomerProductCard } from '../../../components/customer/CustomerProductCard';
import { CustomerResponsiveShell, useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { CustomerSearchField } from '../../../components/customer/CustomerSearchField';

const ALL_CATEGORY = { id: '', name: 'الكل' };
const SORTS = [
  { key: 'default', label: 'الأكثر صلة' },
  { key: 'priceAsc', label: 'السعر: الأقل أولاً' },
  { key: 'priceDesc', label: 'السعر: الأعلى أولاً' },
  { key: 'rating', label: 'الأعلى تقييماً' },
];

export default function SearchScreen({ navigation, route }: any): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const layout = useCustomerLayout();
  const columns = layout.width < 680 ? 1 : layout.width < 1024 ? 2 : layout.width < 1380 ? 3 : 4;
  const gap = layout.compact ? 10 : 16;
  const cardWidth = columns === 1 ? layout.usableWidth : (layout.usableWidth - gap * (columns - 1)) / columns;
  const [query, setQuery] = useState<string>(route?.params?.initialQuery ?? '');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([ALL_CATEGORY]);
  const [sort, setSort] = useState('default');
  const [showSort, setShowSort] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [searchError, setSearchError] = useState('');
  const [categoriesError, setCategoriesError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    getCategories()
      .then((items: Category[]) => setCategories([
        ALL_CATEGORY,
        ...items.map((item) => ({ id: item.id, name: item.name_ar ?? item.name })),
      ]))
      .catch(() => setCategoriesError('تعذّر تحميل التصنيفات؛ البحث العام ما زال متاحاً.'));
  }, []);

  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchProducts(query.trim() || undefined, category || undefined);
        const list = [...data];
        if (sort === 'priceAsc') list.sort((a, b) => (a.sale_price ?? a.base_price) - (b.sale_price ?? b.base_price));
        if (sort === 'priceDesc') list.sort((a, b) => (b.sale_price ?? b.base_price) - (a.sale_price ?? a.base_price));
        if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
        setResults(list);
        setSearchError('');
      } catch (error) {
        setSearchError(error instanceof Error && error.message ? error.message : 'تعذّر تنفيذ البحث.');
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, category, sort, retryVersion]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <CustomerResponsiveShell style={styles.headerShell}>
          <View style={styles.titleRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="العودة"
            >
              <Ionicons name="arrow-forward" size={21} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>اكتشف ما يناسبك</Text>
              <Text style={styles.subtitle}>ابحث بين المنتجات والمتاجر المتاحة</Text>
            </View>
            <View style={styles.titleSpacer} />
          </View>

          <CustomerSearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            showFilter
            onFilterPress={() => setShowSort((current) => !current)}
            placeholder="ابحث عن أي شيء..."
            returnKeyType="search"
            autoFocus
          />

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={categories}
            keyExtractor={(item) => item.id || 'all'}
            contentContainerStyle={styles.filters}
            renderItem={({ item }) => {
              const selected = category === item.id;
              return (
                <TouchableOpacity
                  style={[styles.filterChip, selected && styles.filterChipSelected]}
                  onPress={() => setCategory(item.id)}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel={`تصفية حسب ${item.name}`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{item.name}</Text>
                </TouchableOpacity>
              );
            }}
          />

          {showSort ? (
            <View style={styles.sortMenu}>
              <Text style={styles.sortTitle}>ترتيب النتائج</Text>
              {SORTS.map((item) => {
                const selected = sort === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.sortItem, selected && styles.sortItemSelected]}
                    onPress={() => { setSort(item.key); setShowSort(false); }}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.sortItemText, selected && styles.sortItemTextSelected]}>{item.label}</Text>
                    {selected ? <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} /> : <View style={styles.sortCircle} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {categoriesError ? (
            <View style={styles.warningBanner} accessibilityRole="alert">
              <Ionicons name="information-circle-outline" size={18} color={COLORS.warning} />
              <Text style={styles.warningText}>{categoriesError}</Text>
            </View>
          ) : null}

          {searchError ? (
            <TouchableOpacity
              style={styles.errorBanner}
              onPress={() => setRetryVersion((version) => version + 1)}
              accessibilityRole="button"
              accessibilityLabel="إعادة البحث"
            >
              <Ionicons name="cloud-offline-outline" size={18} color={COLORS.error} />
              <Text style={styles.errorText}>{searchError} اضغط لإعادة المحاولة.</Text>
            </TouchableOpacity>
          ) : null}
        </CustomerResponsiveShell>
      </View>

      {isSearching ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.stateHint}>جارٍ البحث...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="search-outline" size={36} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>لا توجد نتائج مطابقة</Text>
          <Text style={styles.emptyText}>جرّب كلمات مختلفة أو اختر تصنيفاً آخر.</Text>
        </View>
      ) : (
        <FlatList
          key={`search-columns-${columns}`}
          data={results}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.resultsContent,
            {
              width: '100%',
              maxWidth: 1320,
              paddingHorizontal: layout.gutter,
              gap,
            },
          ]}
          columnWrapperStyle={columns > 1 ? [styles.resultsRow, { gap }] : undefined}
          ListHeaderComponent={(
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>{results.length} نتيجة</Text>
              <Text style={styles.resultsLabel}>نتائج البحث</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <CustomerProductCard
              product={item}
              variant={columns === 1 ? 'list' : 'grid'}
              style={{ width: cardWidth }}
              onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    zIndex: 3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerShell: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },
  titleCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 18,
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: 1,
  },
  titleSpacer: {
    width: 44,
  },
  filters: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  filterChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.medium,
    fontSize: 12,
  },
  filterTextSelected: {
    color: COLORS.surface,
    fontFamily: FONTS.semiBold,
  },
  sortMenu: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'flex-start',
    gap: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 5,
  },
  sortTitle: {
    color: COLORS.textMuted,
    fontFamily: FONTS.semiBold,
    fontSize: 10.5,
    textAlign: 'right',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sortItem: {
    minHeight: 42,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderRadius: 13,
  },
  sortItemSelected: {
    backgroundColor: COLORS.primarySoft,
  },
  sortItemText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.medium,
    fontSize: 12.5,
  },
  sortItemTextSelected: {
    color: COLORS.primary,
    fontFamily: FONTS.semiBold,
  },
  sortCircle: {
    width: 17,
    height: 17,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.full,
  },
  warningBanner: {
    minHeight: 42,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFF7E6',
  },
  warningText: {
    flex: 1,
    color: '#875E11',
    fontFamily: FONTS.regular,
    fontSize: 11,
    textAlign: 'right',
  },
  errorBanner: {
    minHeight: 44,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#F7C8C6',
    borderRadius: 14,
    backgroundColor: COLORS.accentCoralSoft,
  },
  errorText: {
    flex: 1,
    color: COLORS.error,
    fontFamily: FONTS.medium,
    fontSize: 11,
    textAlign: 'right',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  stateHint: {
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
    fontSize: 12,
    marginTop: 12,
  },
  emptyIcon: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: COLORS.primarySoft,
    marginBottom: 15,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 16,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },
  resultsContent: {
    alignSelf: 'center',
    paddingTop: 18,
    paddingBottom: 110,
  },
  resultsRow: {
    flexDirection: 'row-reverse',
  },
  resultsHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  resultsLabel: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 17,
  },
  resultsCount: {
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
    fontSize: 11,
  },
});
