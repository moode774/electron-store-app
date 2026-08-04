import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, Switch, ActivityIndicator, Image, useWindowDimensions, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, getMerchantProducts, getMerchantProfile, updateProduct } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { Alert } from '../../components/appAlert';
import { t, tv } from '@marketplace/shared-i18n';

const UI = {
  primary: COLORS.primary,
  bg: COLORS.background,
  bgMobile: COLORS.surface,
  textDark: COLORS.textPrimary,
  textGrey: COLORS.textSecondary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  green: COLORS.success,
  amber: COLORS.warning,
  blue: COLORS.info,
  red: COLORS.error,
};

const APPROVAL_META = {
  pending: { label: 'بانتظار المراجعة', color: UI.amber, background: '#FFFBEB', icon: 'time-outline' as const },
  approved: { label: 'معتمد', color: UI.green, background: '#ECFDF5', icon: 'checkmark-circle-outline' as const },
  rejected: { label: 'مرفوض', color: UI.red, background: '#FEF2F2', icon: 'close-circle-outline' as const },
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 16,
  elevation: 1,
};

export default function MerchantProductsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    if (!user?.id) { setLoading(false); setRefreshing(false); return; }
    try {
      const merchant = await getMerchantProfile(user.id);
      if (!merchant) {
        setProducts([]);
        return;
      }
      const data = await getMerchantProducts(merchant.id);
      setProducts(data || []);
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

  const renderDesktopHeader = () => {
    if (!isDesktop || products.length === 0) return null;
    return (
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.th, { flex: 3 }]}>{t('المنتج')}</Text>
        <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>{t('السعر')}</Text>
        <Text style={[styles.th, { flex: 1.5, textAlign: 'center' }]}>{t('مخزون الخيارات')}</Text>
        <Text style={[styles.th, { flex: 1.5, textAlign: 'left' }]}>{t('الحالة')}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />
      
      {!isDesktop && (
        <View style={[styles.headerMobile, isCompact && styles.headerMobileCompact]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitleMobile}>{t('إدارة المنتجات')}</Text>
          <View style={{ width: 44 }} />
        </View>
      )}

      <View style={[styles.pageContent, isTablet && styles.pageContentTablet, isDesktop && styles.pageContentDesktop]}>
        
        {/* Page Header */}
        <View style={[styles.pageHeaderRow, isCompact && styles.pageHeaderCompact]}>
          <View>
            <Text style={styles.pageTitle}>{t('منتجاتي')}</Text>
            <Text style={styles.pageSubtitle}>{t('إدارة منتجات متجرك ومتابعة حالة مراجعتها قبل ظهورها للعملاء')}</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('AddProduct')}
            accessibilityRole="button"
            accessibilityLabel={t('إضافة منتج')}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{t('إضافة منتج')}</Text>
          </TouchableOpacity>
        </View>

        {/* Content Box */}
          <View style={[styles.contentBox, isTablet && styles.contentBoxTablet, isDesktop && styles.contentBoxDesktop]}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={UI.primary} />
            </View>
          ) : error && products.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={48} color={UI.textMuted} />
              <Text style={styles.emptyText}>{tv(error)}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void load(true)} accessibilityRole="button" accessibilityLabel={t('إعادة تحميل المنتجات')}>
                <Text style={styles.retryBtnText}>{t('إعادة المحاولة')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={renderDesktopHeader}
              refreshing={refreshing}
              onRefresh={() => void load(false)}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="cube-outline" size={48} color={UI.textMuted} style={{ marginBottom: 16 }} />
                  <Text style={styles.emptyText}>{t('لا توجد منتجات بعد')}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const approval = APPROVAL_META[item.approval_status as keyof typeof APPROVAL_META] ?? APPROVAL_META.pending;
                return (
                <View style={[styles.cardRow, isCompact && styles.cardRowCompact, !item.is_active && styles.cardInactive]}>
                  {/* Product Info (Flex 3) */}
                  <View style={[styles.td, { flex: isDesktop ? 3 : 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 16 }]}>
                    <View style={styles.imageWrap}>
                      {item.og_image_url ? (
                        <Image source={{ uri: item.og_image_url }} style={styles.thumbImg} resizeMode="cover" />
                      ) : (
                        <Ionicons name="image-outline" size={24} color={UI.textMuted} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={2}>{tv(item.name)}</Text>
                      <View style={[styles.approvalBadge, { backgroundColor: approval.background }]}>
                        <Ionicons name={approval.icon} size={14} color={approval.color} />
                        <Text style={[styles.approvalBadgeText, { color: approval.color }]}>{tv(approval.label)}</Text>
                      </View>
                      {item.approval_status === 'rejected' && item.approval_note ? (
                        <Text style={styles.rejectionNote} numberOfLines={3}>{t('سبب الرفض: {0}', [tv(item.approval_note)])}</Text>
                      ) : null}
                      {!isDesktop && (
                        <Text style={styles.priceMobile}>{t('{0} ر.ي', [item.sale_price ?? item.base_price])}</Text>
                      )}
                    </View>
                  </View>

                  {/* Price (Flex 1) Desktop Only */}
                  {isDesktop && (
                    <Text style={[styles.td, styles.priceDesktop, { flex: 1, textAlign: 'center' }]}>{t('{0} ر.ي', [item.sale_price ?? item.base_price])}</Text>
                  )}

                  {/* Category / Stock (Flex 1.5) Desktop Only */}
                  {isDesktop && (
                    <Text style={[styles.td, styles.categoryDesktop, { flex: 1.5, textAlign: 'center' }]}>
                      {tv(Array.isArray(item.product_variants)
                        ? item.product_variants.reduce((sum: number, variant: { stock_quantity?: number }) => sum + (variant.stock_quantity ?? 0), 0)
                        : '—')}
                    </Text>
                  )}

                  {/* Actions (Flex 1.5) */}
                  <View style={[styles.td, styles.actionsCell, isCompact && styles.actionsCellCompact, { flex: isDesktop ? 1.5 : undefined }]}>
                    <View style={styles.statusWrap}>
                       <View style={[styles.statusDot, { backgroundColor: item.is_active ? UI.primary : UI.textMuted }]} />
                       <Text style={[styles.statusText, { color: item.is_active ? UI.textDark : UI.textMuted }]}>
                         {tv(item.is_active ? t('معروض') : t('مخفي'))}
                       </Text>
                    </View>
                    <Switch
                      value={item.is_active}
                      onValueChange={() => toggleActive(item.id, item.is_active)}
                      disabled={updatingId === item.id || (!!updatingId && updatingId !== item.id)}
                      accessibilityLabel={t('{0} المنتج {1}', [item.is_active ? t('إخفاء') : t('إظهار'), tv(item.name)])}
                      trackColor={{ false: UI.border, true: `${UI.primary}80` }}
                      thumbColor={item.is_active ? UI.primary : UI.textMuted}
                      style={{ transform: [{ scaleX: I18nManager?.isRTL ? -1 : 1 }, { scaleX: 0.9 }, { scaleY: 0.9 }] }}
                    />
                  </View>
                </View>
              );}}
            />
          )}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },
  
  headerMobile: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, borderBottomWidth: 1, borderBottomColor: UI.border },
  headerMobileCompact: { paddingHorizontal: 14 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontFamily: FONTS.bold, color: UI.textDark, flex: 1, textAlign: 'center' },
  
  pageContent: { flex: 1 },
  pageContentTablet: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24 },
  pageContentDesktop: { paddingTop: 32, paddingBottom: 32 },
  
  pageHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingHorizontal: 20, paddingTop: 20 },
  pageHeaderCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 14, paddingHorizontal: 14 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  
  addBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: UI.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
    ...softShadow, shadowOpacity: 0.2, shadowColor: UI.primary, minHeight: 44, justifyContent: 'center'
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  contentBox: { flex: 1 },
  contentBoxTablet: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  contentBoxDesktop: { backgroundColor: '#FFFFFF', borderRadius: 16, ...softShadow, borderWidth: 1, borderColor: '#F3F4F6', padding: 24 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  listContent: { paddingHorizontal: 14, paddingBottom: 100 },
  
  tableHeaderRow: { flexDirection: 'row-reverse', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: UI.border, marginBottom: 12 },
  th: { fontSize: 12, color: UI.textMuted, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  cardRow: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: UI.bg,
  },
  cardRowCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 14, paddingVertical: 18 },
  cardInactive: { opacity: 0.5 },
  td: { },
  actionsCell: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  actionsCellCompact: { justifyContent: 'space-between', minHeight: 44 },
  
  imageWrap: { width: 56, height: 56, borderRadius: 12, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  
  name: { fontSize: 15, fontWeight: '700', color: UI.textDark, textAlign: 'right', lineHeight: 22 },
  approvalBadge: { alignSelf: 'flex-end', flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: 999, marginTop: 6, paddingHorizontal: 8, paddingVertical: 4 },
  approvalBadgeText: { fontSize: 11, fontWeight: '800' },
  rejectionNote: { color: UI.red, fontSize: 11, lineHeight: 17, marginTop: 5, textAlign: 'right' },
  priceMobile: { fontSize: 14, fontWeight: '800', color: UI.primary, marginTop: 4, textAlign: 'right' },
  
  priceDesktop: { fontSize: 15, fontWeight: '800', color: UI.textDark },
  categoryDesktop: { fontSize: 14, color: UI.textGrey, fontWeight: '500' },
  
  statusWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { color: UI.textMuted, fontSize: 16, fontWeight: '600' },
  retryBtn: { minHeight: 44, justifyContent: 'center', marginTop: 16, backgroundColor: UI.primary, borderRadius: 12, paddingHorizontal: 22 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
