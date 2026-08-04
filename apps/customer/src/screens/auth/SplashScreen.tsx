import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
  Image,
  Easing,
} from 'react-native';
import { LanguageToggleButton, t } from '@marketplace/shared-i18n';

const { width, height } = Dimensions.get('window');

// تبقى شاشة البداية ظاهرة هذه المدة حتى يكون زر تغيير اللغة قابلاً للضغط فعلياً،
// وكل تبديل للغة يمدّد المهلة ليرى المستخدم النتيجة قبل الانتقال.
const SPLASH_HOLD_MS = 1300;
const LANGUAGE_HOLD_MS = 2400;

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps): React.JSX.Element {
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(15)).current;
  const [holdMs, setHoldMs] = useState(SPLASH_HOLD_MS);
  const finished = useRef(false);

  const finishOnce = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    // Ultra minimal elegant entrance (Fast)
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 40, friction: 5, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 400, delay: 100, useNativeDriver: true }),
      Animated.timing(textTranslateY, { toValue: 0, duration: 400, delay: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  // مهلة الانتقال — تُعاد جدولتها عند تبديل اللغة.
  useEffect(() => {
    const timer = setTimeout(finishOnce, holdMs);
    return () => clearTimeout(timer);
  }, [finishOnce, holdMs]);

  const handleLanguageChange = useCallback(() => setHoldMs(LANGUAGE_HOLD_MS), []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* زر تغيير اللغة — متاح قبل الدخول إلى التطبيق */}
      <View style={styles.languageBar}>
        <LanguageToggleButton variant="soft" onChange={handleLanguageChange} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Logo */}
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity }}>
          <Image
            source={require('../../../assets/images/logo.png')}
            style={styles.logoImage}
          />
        </Animated.View>

        {/* Text */}
        <Animated.Text style={[styles.tagline, { opacity: textOpacity, transform: [{ translateY: textTranslateY }] }]}>{t('تجربة تسوق أفضل')}</Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Pure clean white
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  languageBar: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    zIndex: 20,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  logoImage: {
    width: 170, // Massive exactly like the image
    height: 170,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  tagline: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    width: '100%',
    marginTop: 8,
  },
});
