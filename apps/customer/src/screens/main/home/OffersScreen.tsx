import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { getActiveCoupons, Coupon } from '@marketplace/shared-hooks';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';

const CARD_COLORS = [COLORS.primary, '#059669', '#7C3AED', '#D97706'];

export default function OffersScreen({ navigation }: any) {
  const layout = useCustomerLayout();
  const columns = layout.wide ? 3 : layout.tablet ? 2 : 1;
  const gap = layout.compact ? 12 : 16;
  const cardWidth = columns === 1 ? layout.usableWidth : (layout.usableWidth - gap * (columns - 1)) / columns;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try { setOffers(await getActiveCoupons()); }
    catch (error: any) { setLoadError(error?.message ?? 'تعذّر تحميل العروض.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCopy = async (id: string, code: string) => {
    if (Platform.OS === 'web') {
      try { await (navigator as any).clipboard?.writeText(code); } catch {}
    } else {
      Share.share({ message: code });
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const offerTitle = (c: Coupon) =>
    c.type === 'percentage' ? `خصم ${c.value}%`
    : c.type === 'fixed' ? `خصم ${c.value} ر.ي`
    : `عرض ${c.value}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="العودة">
            <Ionicons name="arrow-forward" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>العروض والكوبونات</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.errorState} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={48} color="#B91C1C" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <FlatList
        key={`offers-${columns}`}
        data={offers}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter, gap }]}
        columnWrapperStyle={columns > 1 ? [styles.listRow, { gap }] : undefined}
        renderItem={({ item, index }) => {
          const isCopied = copiedId === item.id;
          const color = CARD_COLORS[index % CARD_COLORS.length];
          const expires = item.end_date ? `حتى ${new Date(item.end_date).toLocaleDateString('ar-SA')}` : 'بدون انتهاء';
          const store = item.merchant_profiles?.store_name ?? 'كل المتاجر';
          return (
            <View style={[styles.card, { width: cardWidth }]}>
              <View style={[styles.sideBar, { backgroundColor: color }]} />
              <View style={[styles.iconWrap, { backgroundColor: `${color}15` }]}>
                <Ionicons name="pricetag-outline" size={24} color={color} />
              </View>
              <View style={styles.info}>
                <Text style={styles.title}>{offerTitle(item)}</Text>
                <Text style={styles.meta}>{store} · {expires}</Text>
                <View style={styles.codeRow}>
                  <View style={styles.codeBox}>
                    <Text style={styles.codeText}>{item.code}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyBtn, isCopied && styles.copyBtnDone]}
                    onPress={() => handleCopy(item.id, item.code)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`نسخ الرمز ${item.code}`}
                  >
                    <Ionicons name={isCopied ? 'checkmark' : 'copy-outline'} size={14} color={isCopied ? '#FFFFFF' : COLORS.primary} />
                    <Text style={[styles.copyBtnText, isCopied && { color: '#FFFFFF' }]}>
                      {isCopied ? 'تم النسخ' : 'نسخ'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>لا توجد عروض حالياً</Text>
          </View>
        }
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText: { color: '#991B1B', textAlign: 'center' },
  retryButton: { minHeight: 44, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 48 : 32,
  },
  headerInner: { width: '100%', maxWidth: 1320, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, paddingHorizontal: 12, fontSize: 18, fontFamily: FONTS.bold, color: COLORS.textPrimary, textAlign: 'center' },
  listContent: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingTop: 16, paddingBottom: 110 },
  listRow: { flexDirection: 'row-reverse' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    minHeight: 142, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1.5, borderColor: COLORS.border, overflow: 'hidden',
  },
  sideBar: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 4 },
  iconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, marginHorizontal: 14 },
  title: { fontSize: 14.5, fontFamily: FONTS.bold, color: COLORS.textPrimary },
  meta: { fontSize: 11.5, fontFamily: FONTS.regular, color: COLORS.textMuted, marginTop: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  codeBox: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#F9FAFB',
  },
  codeText: { fontSize: 12.5, fontWeight: '800', color: '#111827', letterSpacing: 1 },
  copyBtn: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: COLORS.primarySoft,
  },
  copyBtnDone: { backgroundColor: '#059669' },
  copyBtnText: { fontSize: 11.5, fontWeight: '700', color: COLORS.primary },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
