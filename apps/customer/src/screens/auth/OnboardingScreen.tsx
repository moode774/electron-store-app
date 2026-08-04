import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { t, tv } from '@marketplace/shared-i18n';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: 'storefront-outline',
    title: 'عالم من الفخامة',
    body: 'تسوّق أرقى المنتجات من أفضل المتاجر بلمسة من الفخامة والتميز.',
  },
  {
    id: '2',
    icon: 'rocket-outline', // Used to have emojis? Now a sleek icon.
    title: 'متابعة واضحة للطلب',
    body: 'تابع حالة طلبك من التجهيز حتى التسليم من داخل التطبيق.',
  },
  {
    id: '3',
    icon: 'shield-checkmark-outline',
    title: 'أمان وموثوقية',
    body: 'الدفع عند الاستلام مع عرض التكلفة كاملة قبل تأكيد الطلب.',
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
      const nextIndex = index + 1;
      listRef.current?.scrollToOffset({ offset: nextIndex * width, animated: true });
      setIndex(nextIndex);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1728" />

      {/* Full-screen Luxury Background */}
      <Image
        source={require('../../../assets/images/home/premium-hero-mobile.png')}
        style={styles.bgImage}
        resizeMode="cover"
      />
      <View style={styles.overlay} />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onFinish}
          activeOpacity={0.7}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Text style={styles.skipText}>{t('تخطّي')}</Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon as any} size={50} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>{tv(item.title)}</Text>
            <Text style={styles.body}>{tv(item.body)}</Text>
          </View>
        )}
      />

      {/* Footer Area */}
      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.9}>
          <Text style={styles.nextBtnText}>{tv(isLast ? t('ابدأ تجربتك') : t('التالي'))}</Text>
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1728' },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 23, 40, 0.85)',
  },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingHorizontal: 24,
    alignItems: 'flex-start',
    zIndex: 10,
  },
  skipText: { fontSize: 15, fontWeight: '700', color: '#CBD5E1', letterSpacing: 0.5 },
  slide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginTop: -80,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 36,
    left: 0,
    right: 0,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 36,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dotActive: {
    width: 28,
    backgroundColor: '#3B82F6',
  },
  nextBtn: {
    backgroundColor: '#1D4ED8',
    width: '100%',
    height: 60,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
