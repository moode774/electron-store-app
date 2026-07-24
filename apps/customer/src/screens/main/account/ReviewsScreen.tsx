import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, FONTS } from '@marketplace/shared-utils';
import { Card } from '@marketplace/shared-ui';
import { useAuthStore, getMyReviews, Review } from '@marketplace/shared-hooks';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';

export default function ReviewsScreen({ navigation }: any) {
  const layout = useCustomerLayout(1040);
  const columns = layout.desktop ? 2 : 1;
  const gap = layout.compact ? 12 : 16;
  const cardWidth = columns === 1 ? layout.usableWidth : (layout.usableWidth - gap) / 2;
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<'store' | 'driver'>('store');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try { setReviews(await getMyReviews(user.id)); }
    catch (error) { setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل تقييماتك.'); }
    finally { setLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { setLoading(true); void load(); }, [load]));

  const isDriver = (t?: string) => t === 'delivery' || t === 'driver';
  const filteredReviews = reviews.filter((r) =>
    activeTab === 'driver' ? isDriver(r.target_type) : !isDriver(r.target_type));

  const renderReview = ({ item }: { item: Review }) => (
    <Card style={{ ...styles.reviewCard, width: cardWidth }} variant="outlined">
      <View style={styles.reviewHeader}>
        <View style={styles.reviewTitleRow}>
          <Text style={styles.reviewIcon}>{isDriver(item.target_type) ? '🛵' : '🏪'}</Text>
          <Text style={styles.reviewTarget}>{isDriver(item.target_type) ? 'مندوب توصيل' : 'متجر'}</Text>
        </View>
        <Text style={styles.reviewDate}>{new Date(item.created_at).toLocaleDateString('ar-SA')}</Text>
      </View>

      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Text key={star} style={[styles.star, star <= item.rating && styles.starActive]}>
            ★
          </Text>
        ))}
      </View>

      {item.comment ? (
        <Text style={styles.comment}>{item.comment}</Text>
      ) : null}
    </Card>
  );

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة">
            <Text style={styles.backIcon}>→</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>التقييمات والمراجعات</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <View style={[styles.tabsInner, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'store' && styles.tabBtnActive]}
          onPress={() => setActiveTab('store')}
        >
          <Text style={[styles.tabText, activeTab === 'store' && styles.tabTextActive]}>المتاجر</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'driver' && styles.tabBtnActive]}
          onPress={() => setActiveTab('driver')}
        >
          <Text style={[styles.tabText, activeTab === 'driver' && styles.tabTextActive]}>المندوبين</Text>
        </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.emptyWrap} accessibilityRole="alert">
          <Text style={styles.emptyEmoji}>⚠️</Text>
          <Text style={styles.emptyText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); void load(); }} accessibilityRole="button"><Text style={styles.retryText}>إعادة المحاولة</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          key={`reviews-${columns}`}
          data={filteredReviews}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          renderItem={renderReview}
          columnWrapperStyle={columns > 1 ? [styles.listRow, { gap }] : undefined}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter, gap }]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>⭐</Text>
              <Text style={styles.emptyText}>لا توجد تقييمات حالياً</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingTop: 48, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerInner: { width: '100%', maxWidth: 1040, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.background },
  headerSpacer: { width: 44 },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.bold },
  tabsContainer: { backgroundColor: COLORS.surface },
  tabsInner: { width: '100%', maxWidth: 1040, alignSelf: 'center', flexDirection: 'row', paddingVertical: SPACING.md },
  tabBtn: { flex: 1, minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: COLORS.border },
  tabBtnActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, color: COLORS.textMuted, fontFamily: FONTS.semiBold },
  tabTextActive: { color: COLORS.primary, fontWeight: '700' },
  listContent: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingTop: SPACING.md, paddingBottom: 110 },
  listRow: { flexDirection: 'row-reverse' },
  reviewCard: { padding: SPACING.md },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reviewTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewIcon: { fontSize: 18 },
  reviewTarget: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  reviewDate: { fontSize: 12, color: COLORS.textMuted },
  starsRow: { flexDirection: 'row', marginBottom: 8 },
  star: { fontSize: 18, color: COLORS.border, marginRight: 2 },
  starActive: { color: '#FFB300' },
  comment: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 22 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyText: { fontSize: 16, color: COLORS.textMuted },
  retryBtn: { minHeight: 44, marginTop: 14, backgroundColor: COLORS.primary, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 10, justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
});
