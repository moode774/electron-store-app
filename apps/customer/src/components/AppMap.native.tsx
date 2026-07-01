// خريطة التطبيق (iOS/أندرويد) عبر react-native-maps.
// نفس واجهة الخصائص المعرّفة في AppMap.tsx (نسخة الويب البديلة).
import React from 'react';
import type { AppMapProps } from './AppMap';

// require بدل import حتى لا يفشل فحص الأنواع قبل تثبيت الحزمة محلياً
// @ts-ignore — الأنواع تتوفر بعد yarn install
const Maps = require('react-native-maps');
const MapView = Maps.default;
const Marker = Maps.Marker;

export type { AppMapMarker, AppMapProps } from './AppMap';

export default function AppMap({ latitude, longitude, markers, onPress, style, zoomDelta = 0.012 }: AppMapProps) {
  return (
    <MapView
      style={style}
      region={{
        latitude,
        longitude,
        latitudeDelta: zoomDelta,
        longitudeDelta: zoomDelta,
      }}
      onPress={
        onPress
          ? (e: any) => onPress(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
          : undefined
      }
    >
      {(markers ?? []).map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.latitude, longitude: m.longitude }}
          title={m.title}
          pinColor={m.color}
        />
      ))}
    </MapView>
  );
}
