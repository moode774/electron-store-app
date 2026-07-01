// نسخة الويب/الافتراضية من خريطة التطبيق.
// react-native-maps لا يدعم الويب، لذا يعرض المتصفح بديلاً بسيطاً،
// بينما يلتقط Metro النسخة الأصلية AppMap.native.tsx على iOS/أندرويد.
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

export interface AppMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  color?: string;
}

export interface AppMapProps {
  latitude: number;
  longitude: number;
  markers?: AppMapMarker[];
  onPress?: (latitude: number, longitude: number) => void;
  style?: ViewStyle;
  zoomDelta?: number;
}

export default function AppMap({ style }: AppMapProps) {
  return (
    <View style={[styles.fallback, style]}>
      <Text style={styles.fallbackEmoji}>🗺️</Text>
      <Text style={styles.fallbackText}>الخريطة متاحة في تطبيق الجوال</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fallbackEmoji: { fontSize: 40, opacity: 0.5 },
  fallbackText: { color: '#1976D2', fontWeight: '600', fontSize: 13 },
});
