import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, FONTS } from '@marketplace/shared-utils';
import { Card } from '@marketplace/shared-ui';
import { useAuthStore, getMyReviews, Review } from '@marketplace/shared-hooks';

export default function ReviewsScreen({ navigation }: any) {
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
    <Card style={styles.reviewCard} variant="outlined">
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
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>→</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>التقييمات والمراجعات</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
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
          data={filteredReviews}
          keyExtractor={(item) => item.id}
          renderItem={renderReview}
          contentContainerStyle={styles.listContent}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: 60, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: COLORS.background },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.bold },
  tabsContainer: { flexDirection: 'row', padding: SPACING.md, backgroundColor: COLORS.surface },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: COLORS.border },
  tabBtnActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, color: COLORS.textMuted, fontFamily: FONTS.semiBold },
  tabTextActive: { color: COLORS.primary, fontWeight: '700' },
  listContent: { padding: SPACING.md },
  reviewCard: { marginBottom: SPACING.md, padding: SPACING.md },
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
  retryBtn: { marginTop: 14, backgroundColor: COLORS.primary, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
});
