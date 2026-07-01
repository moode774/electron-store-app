import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '@marketplace/shared-utils';
import { getActiveCoupons, Coupon } from '@marketplace/shared-hooks';

const CARD_COLORS = [COLORS.primary, '#059669', '#7C3AED', '#D97706'];

export default function OffersScreen({ navigation }: any) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveCoupons().then(setOffers).catch(() => setOffers([])).finally(() => setLoading(false));
  }, []);

  const handleCopy = async (id: string, code: string) => {
    await Clipboard.setStringAsync(code).catch(() => {});
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
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>العروض والكوبونات</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const isCopied = copiedId === item.id;
          const color = CARD_COLORS[index % CARD_COLORS.length];
          const expires = item.end_date ? `حتى ${new Date(item.end_date).toLocaleDateString('ar-SA')}` : 'بدون انتهاء';
          const store = item.merchant_profiles?.store_name ?? 'كل المتاجر';
          return (
            <View style={styles.card}>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContent: { padding: 20, gap: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6', overflow: 'hidden',
  },
  sideBar: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 4 },
  iconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginHorizontal: 14 },
  title: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 11.5, color: '#9CA3AF', marginTop: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  codeBox: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#F9FAFB',
  },
  codeText: { fontSize: 12.5, fontWeight: '800', color: '#111827', letterSpacing: 1 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F0F4FF',
  },
  copyBtnDone: { backgroundColor: '#059669' },
  copyBtnText: { fontSize: 11.5, fontWeight: '700', color: COLORS.primary },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
