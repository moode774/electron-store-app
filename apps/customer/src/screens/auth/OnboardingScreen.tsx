import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: 'storefront-outline',
    title: 'تسوّق من أفضل المتاجر',
    body: 'آلاف المنتجات من متاجر موثوقة في مكان واحد، بأسعار منافسة وعروض يومية.',
  },
  {
    id: '2',
    icon: 'bicycle-outline',
    title: 'توصيل سريع لباب بيتك',
    body: 'مندوبونا يوصلون طلبك بأسرع وقت، مع تتبع مباشر لحالة الطلب لحظة بلحظة.',
  },
  {
    id: '3',
    icon: 'shield-checkmark-outline',
    title: 'ادفع عند الاستلام بأمان',
    body: 'لا حاجة لبطاقة بنكية — افحص طلبك وادفع نقداً عند الاستلام بكل ثقة.',
  },
];

interface OnboardingScreenProps {
  onFinish: () => void;
}

export default function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const isLast = index === SLIDES.length - 1;

  const goNext = () => {
    if (isLast) {
      onFinish();
    } else {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Skip */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onFinish} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skipText}>تخطّي</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon as any} size={72} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots + Button */}
      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.8}>
          <Text style={styles.nextBtnText}>{isLast ? 'ابدأ الآن' : 'التالي'}</Text>
          <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingHorizontal: 24,
    alignItems: 'flex-start',
  },
  skipText: { fontSize: 14, fontWeight: '700', color: '#9CA3AF' },
  slide: { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconCircle: {
    width: 160, height: 160, borderRadius: 80, backgroundColor: '#F0F4FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 40,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 14 },
  body: { fontSize: 14.5, color: '#6B7280', textAlign: 'center', lineHeight: 24 },
  footer: { padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32, gap: 24 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5E7EB' },
  dotActive: { width: 24, backgroundColor: COLORS.primary },
  nextBtn: {
    backgroundColor: COLORS.primary, height: 54, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
