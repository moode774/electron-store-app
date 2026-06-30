// ============================================================
// LiveTrackingMap — خريطة تتبّع حيّة (مندوب/وجهة/متجر)
// آمنة على الويب: react-native-maps لا يعمل على الويب فنُرجع null هناك.
// ============================================================
import React, { useRef, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

interface Props {
  courier?: MapPoint | null;
  destination?: MapPoint | null;
  origin?: MapPoint | null;
  height?: number;
  style?: object;
}

// تحميل شرطي لتفادي تعطّل الويب عند الاستيراد
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
  } catch {
    MapView = null;
  }
}

function regionFor(points: MapPoint[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latDelta = Math.max(0.01, (maxLat - minLat) * 1.6);
  const lngDelta = Math.max(0.01, (maxLng - minLng) * 1.6);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

/**
 * يُرجع null إذا تعذّرت الخريطة (ويب / غياب نقاط) ليعرض المُستدعي بديلاً نصّياً.
 */
export default function LiveTrackingMap({ courier, destination, origin, height = 220, style }: Props): React.JSX.Element | null {
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const points = [courier, destination, origin].filter(Boolean) as MapPoint[];

  // أعِد توسيط الخريطة كلما تغيّرت النقاط (الموقع المباشر للمندوب)
  const fit = () => {
    if (!readyRef.current || !mapRef.current || points.length === 0) return;
    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion(regionFor(points), 500);
    }
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courier?.latitude, courier?.longitude, destination?.latitude, destination?.longitude, origin?.latitude, origin?.longitude]);

  if (!MapView) return null;
  if (points.length === 0) return null;

  return (
    <View style={[styles.wrap, { height }, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={regionFor(points)}
        onMapReady={() => { readyRef.current = true; fit(); }}
        showsUserLocation={false}
        toolbarEnabled={false}
        loadingEnabled
      >
        {origin && <Marker coordinate={origin} title="المتجر" pinColor="#C9A84C" />}
        {destination && <Marker coordinate={destination} title="وجهة التوصيل" pinColor="#1B2B4B" />}
        {courier && <Marker coordinate={courier} title="المندوب" pinColor="#2563EB" />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden' },
});
