import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, Switch, ActivityIndicator, Image, useWindowDimensions, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, getMerchantProducts, getMerchantProfile, updateProduct } from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';

const UI = {
  primary: '#111827',
  bg: '#F3F4F6',
  bgMobile: '#FFFFFF',
  textDark: '#111827',
  textGrey: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  green: '#10B981',
  amber: '#D97706',
  blue: '#2563EB',
  red: '#EF4444',
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
  const isDesktop = width >= 1024;

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
        <Text style={[styles.th, { flex: 3 }]}>المنتج</Text>
        <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>السعر</Text>
        <Text style={[styles.th, { flex: 1.5, textAlign: 'center' }]}>مخزون الخيارات</Text>
        <Text style={[styles.th, { flex: 1.5, textAlign: 'left' }]}>الحالة</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />
      
      {!isDesktop && (
        <View style={styles.headerMobile}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitleMobile}>إدارة المنتجات</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <View style={[styles.pageContent, isDesktop && styles.pageContentDesktop]}>
        
        {/* Page Header */}
        <View style={styles.pageHeaderRow}>
          <View>
            <Text style={styles.pageTitle}>منتجاتي</Text>
            <Text style={styles.pageSubtitle}>إدارة منتجات متجرك ومتابعة حالة مراجعتها قبل ظهورها للعملاء</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('AddProduct')}
            accessibilityRole="button"
            accessibilityLabel="إضافة منتج"
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>إضافة منتج</Text>
          </TouchableOpacity>
        </View>

        {/* Content Box */}
        <View style={[styles.contentBox, isDesktop && styles.contentBoxDesktop]}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={UI.primary} />
            </View>
          ) : error && products.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={48} color={UI.textMuted} />
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void load(true)} accessibilityRole="button" accessibilityLabel="إعادة تحميل المنتجات">
                <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
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
                  <Text style={styles.emptyText}>لا توجد منتجات بعد</Text>
                </View>
              }
              renderItem={({ item }) => {
                const approval = APPROVAL_META[item.approval_status as keyof typeof APPROVAL_META] ?? APPROVAL_META.pending;
                return (
                <View style={[styles.cardRow, !item.is_active && styles.cardInactive]}>
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
                      <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                      <View style={[styles.approvalBadge, { backgroundColor: approval.background }]}>
                        <Ionicons name={approval.icon} size={14} color={approval.color} />
                        <Text style={[styles.approvalBadgeText, { color: approval.color }]}>{approval.label}</Text>
                      </View>
                      {item.approval_status === 'rejected' && item.approval_note ? (
                        <Text style={styles.rejectionNote} numberOfLines={3}>سبب الرفض: {item.approval_note}</Text>
                      ) : null}
                      {!isDesktop && (
                        <Text style={styles.priceMobile}>{item.sale_price ?? item.base_price} ر.ي</Text>
                      )}
                    </View>
                  </View>

                  {/* Price (Flex 1) Desktop Only */}
                  {isDesktop && (
                    <Text style={[styles.td, styles.priceDesktop, { flex: 1, textAlign: 'center' }]}>
                      {item.sale_price ?? item.base_price} ر.ي
                    </Text>
                  )}

                  {/* Category / Stock (Flex 1.5) Desktop Only */}
                  {isDesktop && (
                    <Text style={[styles.td, styles.categoryDesktop, { flex: 1.5, textAlign: 'center' }]}>
                      {Array.isArray(item.product_variants)
                        ? item.product_variants.reduce((sum: number, variant: { stock_quantity?: number }) => sum + (variant.stock_quantity ?? 0), 0)
                        : '—'}
                    </Text>
                  )}

                  {/* Actions (Flex 1.5) */}
                  <View style={[styles.td, { flex: isDesktop ? 1.5 : undefined, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: isDesktop ? 'flex-end' : 'flex-end', gap: 12 }]}>
                    <View style={styles.statusWrap}>
                       <View style={[styles.statusDot, { backgroundColor: item.is_active ? UI.primary : UI.textMuted }]} />
                       <Text style={[styles.statusText, { color: item.is_active ? UI.textDark : UI.textMuted }]}>
                         {item.is_active ? 'معروض' : 'مخفي'}
                       </Text>
                    </View>
                    <Switch
                      value={item.is_active}
                      onValueChange={() => toggleActive(item.id, item.is_active)}
                      disabled={updatingId === item.id || (!!updatingId && updatingId !== item.id)}
                      accessibilityLabel={`${item.is_active ? 'إخفاء' : 'إظهار'} المنتج ${item.name}`}
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
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontWeight: '800', color: UI.textDark, flex: 1, textAlign: 'center' },
  
  pageContent: { flex: 1 },
  pageContentDesktop: { padding: 32 },
  
  pageHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingHorizontal: 20, paddingTop: 20 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  
  addBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: UI.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
    ...softShadow, shadowOpacity: 0.2, shadowColor: UI.primary
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  contentBox: { flex: 1 },
  contentBoxDesktop: { backgroundColor: '#FFFFFF', borderRadius: 16, ...softShadow, borderWidth: 1, borderColor: '#F3F4F6', padding: 24 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  listContent: { paddingBottom: 100 },
  
  tableHeaderRow: { flexDirection: 'row-reverse', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: UI.border, marginBottom: 12 },
  th: { fontSize: 12, color: UI.textMuted, fontWeight: '700', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  cardRow: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: UI.bg,
  },
  cardInactive: { opacity: 0.5 },
  td: { },
  
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
  retryBtn: { marginTop: 16, backgroundColor: UI.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  retryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
