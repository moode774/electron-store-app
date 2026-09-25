import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Switch, ActivityIndicator, Image, TextInput, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, getMerchantProducts, getMerchantProfile, updateProduct } from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { Alert } from '../../components/appAlert';
import { Banner, Chips, EmptyState, IconButton, ScreenHeader, StatusPill, card, formatMoney, ui, useIsDesktop } from './merchantUi';

const APPROVAL_META = {
  pending: { label: 'بانتظار المراجعة', color: '#B45309', background: COLORS.warningSoft, icon: 'time-outline' },
  approved: { label: 'معتمد', color: '#15803D', background: '#DCFCE7', icon: 'checkmark-circle-outline' },
  rejected: { label: 'مرفوض', color: '#B91C1C', background: '#FEE2E2', icon: 'close-circle-outline' },
};

const LOW_STOCK = 5;

type Filter = 'all' | 'active' | 'hidden' | 'pending' | 'rejected' | 'out';

const stockOf = (item: any): number =>
  Array.isArray(item.product_variants) && item.product_variants.length
    ? item.product_variants.reduce((sum: number, v: { stock_quantity?: number }) => sum + (v.stock_quantity ?? 0), 0)
    : item.stock_quantity ?? 0;

export default function MerchantProductsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const isDesktop = useIsDesktop();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    if (!user?.id) { setLoading(false); setRefreshing(false); return; }
    try {
      const merchant = await getMerchantProfile(user.id);
      if (!merchant) {
        setProducts([]);
        return;
      }
      setProducts((await getMerchantProducts(merchant.id)) || []);
      setError(null);
    } catch {
      setError('تعذر تحميل المنتجات. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  const toggleActive = async (id: string, current: boolean) => {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      await updateProduct(id, { is_active: !current });
      await load(false);
    } catch {
      Alert.alert('لم يتم التحديث', 'تعذر تغيير ظهور المنتج. لم تتغير الحالة المعروضة.');
      await load(false);
    } finally {
      setUpdatingId(null);
    }
  };

  const matches: Record<Filter, (p: any) => boolean> = {
    all: () => true,
    active: (p) => p.is_active,
    hidden: (p) => !p.is_active,
    pending: (p) => (p.approval_status ?? 'pending') === 'pending',
    rejected: (p) => p.approval_status === 'rejected',
    out: (p) => stockOf(p) <= 0,
  };

  const counts = useMemo(() => {
    const result = {} as Record<Filter, number>;
    (Object.keys(matches) as Filter[]).forEach((key) => { result[key] = products.filter(matches[key]).length; });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => matches[filter](p) && (!q || String(p.name ?? '').toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, filter, query]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: counts.all },
    { key: 'active', label: 'معروض', count: counts.active },
    { key: 'hidden', label: 'مخفي', count: counts.hidden },
    { key: 'pending', label: 'قيد المراجعة', count: counts.pending },
    { key: 'rejected', label: 'مرفوض', count: counts.rejected },
    { key: 'out', label: 'نفد المخزون', count: counts.out },
  ];

  const renderItem = ({ item }: { item: any }) => {
    const approval = APPROVAL_META[item.approval_status as keyof typeof APPROVAL_META] ?? APPROVAL_META.pending;
    const stock = stockOf(item);
    const onSale = item.sale_price != null && Number(item.sale_price) < Number(item.base_price);
    const stockTone = stock <= 0
      ? { label: 'نفد المخزون', color: '#B91C1C', bg: '#FEE2E2' }
      : stock <= LOW_STOCK
        ? { label: `متبقي ${stock}`, color: '#B45309', bg: COLORS.warningSoft }
        : { label: `المخزون ${stock}`, color: COLORS.inkSecondary, bg: COLORS.canvas };
    return (
      <View style={[styles.item, isDesktop && styles.itemDesktop, !item.is_active && styles.itemHidden]}>
        <View style={styles.thumb}>
          {item.og_image_url ? (
            <Image source={{ uri: item.og_image_url }} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <Ionicons name="image-outline" size={24} color={COLORS.inkTertiary} />
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatMoney(onSale ? item.sale_price : item.base_price)} <Text style={styles.currency}>ر.ي</Text></Text>
            {onSale ? <Text style={styles.oldPrice}>{formatMoney(item.base_price)}</Text> : null}
          </View>
          <View style={styles.pills}>
            <StatusPill label={approval.label} color={approval.color} background={approval.background} icon={approval.icon} />
            <StatusPill label={stockTone.label} color={stockTone.color} background={stockTone.bg} />
          </View>
          {item.approval_status === 'rejected' && item.approval_note ? (
            <Text style={styles.rejection} numberOfLines={3}>سبب الرفض: {item.approval_note}</Text>
          ) : null}
        </View>
        <View style={styles.visibility}>
          <Switch
            value={item.is_active}
            onValueChange={() => toggleActive(item.id, item.is_active)}
            disabled={!!updatingId}
            accessibilityLabel={`${item.is_active ? 'إخفاء' : 'إظهار'} المنتج ${item.name}`}
            trackColor={{ false: COLORS.hairline, true: COLORS.primaryLight }}
            thumbColor={COLORS.surface}
            {...({ activeThumbColor: COLORS.surface } as any)}
            style={{ transform: [{ scaleX: I18nManager?.isRTL ? -0.9 : 0.9 }, { scaleY: 0.9 }] }}
          />
          <Text style={[styles.visibilityText, item.is_active && styles.visibilityTextOn]}>
            {updatingId === item.id ? '...' : item.is_active ? 'معروض' : 'مخفي'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={ui.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenHeader
        title="منتجاتي"
        subtitle={loading ? 'جاري التحميل...' : `${products.length} منتج · ${counts.active ?? 0} معروض`}
        right={<IconButton icon="add" label="إضافة منتج" primary onPress={() => navigation.navigate('AddProduct')} />}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          key={isDesktop ? 'grid' : 'list'}
          data={visible}
          numColumns={isDesktop ? 2 : 1}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={isDesktop ? styles.columns : undefined}
          contentContainerStyle={[ui.content, isDesktop && ui.contentDesktop]}
          refreshing={refreshing}
          onRefresh={() => void load(false)}
          ListHeaderComponent={
            <View style={styles.toolbar}>
              {error ? <Banner text={error} tone="error" actionLabel="إعادة المحاولة" onAction={() => void load(true)} /> : null}
              {products.length ? (
                <>
                  <View style={styles.search}>
                    <Ionicons name="search" size={18} color={COLORS.inkTertiary} />
                    <TextInput
                      style={styles.searchInput}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="ابحث باسم المنتج"
                      placeholderTextColor={COLORS.inkTertiary}
                      accessibilityLabel="البحث في المنتجات"
                    />
                    {query ? (
                      <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="مسح البحث">
                        <Ionicons name="close-circle" size={18} color={COLORS.inkTertiary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Chips items={filters.filter((f) => f.key === 'all' || f.count > 0)} value={filter} onChange={setFilter} />
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            products.length ? (
              <EmptyState icon="search-outline" title="لا توجد نتائج" text="جرّب كلمة أخرى أو اختر تصفية مختلفة." />
            ) : error ? null : (
              <EmptyState
                icon="cube-outline"
                title="ابدأ بإضافة أول منتج"
                text="أضف صوراً واضحة وسعراً ووصفاً مختصراً، وسيظهر للعملاء بعد المراجعة."
                action={{ label: 'إضافة منتج', onPress: () => navigation.navigate('AddProduct') }}
              />
            )
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toolbar: { gap: 12 },
  search: {
    ...card, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 46,
  },
  searchInput: {
    flex: 1, width: 0, minWidth: 0, minHeight: 44, fontSize: 14, fontFamily: FONTS.medium, color: COLORS.ink,
    textAlign: 'right', outlineStyle: 'none' as any,
  },
  columns: { flexDirection: 'row-reverse', gap: 14 },
  item: { ...card, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, padding: 12 },
  itemDesktop: { flex: 1 },
  itemHidden: { backgroundColor: '#FAFBFC' },
  thumb: {
    width: 76, height: 76, borderRadius: RADIUS.md, backgroundColor: COLORS.canvas, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  body: { flex: 1, alignItems: 'flex-end', gap: 6 },
  name: { fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right', lineHeight: 21 },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink },
  currency: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  oldPrice: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkTertiary, textDecorationLine: 'line-through' },
  pills: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  rejection: { fontSize: 11, fontFamily: FONTS.medium, color: '#B91C1C', textAlign: 'right', lineHeight: 17 },
  visibility: { alignItems: 'center', gap: 2, minWidth: 52 },
  visibilityText: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.inkTertiary },
  visibilityTextOn: { color: COLORS.primary, fontFamily: FONTS.semiBold },
});
