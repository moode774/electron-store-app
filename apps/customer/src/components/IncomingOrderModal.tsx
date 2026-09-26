import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { OrderSummary } from '@marketplace/shared-hooks';

interface Props {
  visible: boolean;
  order: OrderSummary | null;
  onAccept: () => void;
  onReject: () => void;
  accepting?: boolean;
}

export default function IncomingOrderModal({ visible, order, onAccept, onReject, accepting = false }: Props) {
  const { height } = useWindowDimensions();
  const isShort = height < 600;
  const [timeLeft, setTimeLeft] = useState(30);
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    let timer: any;
    if (visible) {
      setTimeLeft(30);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }).start();

      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onReject();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      scaleAnim.setValue(0.8);
    }
    return () => clearInterval(timer);
  }, [onReject, scaleAnim, visible]);

  if (!visible || !order) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onReject}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.modalCard, isShort && styles.modalCardShort, { transform: [{ scale: scaleAnim }] }]}>
          
          <View style={[styles.bellRing, isShort && styles.bellRingShort]}>
            <Ionicons name="notifications-outline" size={40} color="#FFFFFF" />
          </View>
          
          <Text style={styles.title}>طلب توصيل جديد!</Text>
          <Text style={styles.subtitle}>يوجد طلب قريب منك، هل تود قبوله؟</Text>
          
          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <Ionicons name="storefront-outline" size={18} color="#6B7280" />
              <Text style={styles.detailText}>{order.merchant_profiles?.store_name ?? 'مطعم/متجر'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={18} color="#6B7280" />
              <Text style={styles.detailText} numberOfLines={2}>
                يظهر عنوان العميل بالتفصيل بعد قبول الطلب
              </Text>
            </View>
            <View style={[styles.detailRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
              <Text style={styles.amountLabel}>أجر التوصيل المتوقع:</Text>
              <Text style={styles.amountValue}>{order.delivery_fee ?? 0} ر.ي</Text>
            </View>
          </View>

          <Text style={styles.timerText}>يختفي الطلب خلال <Text style={{ color: '#DC2626' }}>{timeLeft}</Text> ثانية</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.rejectBtn, accepting && styles.disabledBtn]}
              onPress={onReject}
              activeOpacity={0.7}
              disabled={accepting}
              accessibilityRole="button"
              accessibilityLabel="تخطي عرض التوصيل الحالي"
              accessibilityState={{ disabled: accepting }}
            >
              <Text style={styles.rejectText}>تخطي</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, accepting && styles.disabledBtn]}
              onPress={onAccept}
              activeOpacity={0.7}
              disabled={accepting}
              accessibilityRole="button"
              accessibilityLabel="قبول طلب التوصيل"
              accessibilityState={{ disabled: accepting, busy: accepting }}
            >
              {accepting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.acceptText}>قبول الطلب</Text>
                  <Ionicons name="bicycle" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(11,23,54,0.58)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 28, width: '100%',
    padding: 26, alignItems: 'center', shadowColor: '#0B1736',
    borderWidth: 1, borderColor: COLORS.hairline,
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
    maxWidth: 480,
  },
  modalCardShort: { padding: 16, borderRadius: 20 },
  bellRing: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: -60,
    borderWidth: 5, borderColor: '#FFFFFF', marginBottom: 18,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  bellRingShort: { width: 58, height: 58, borderRadius: 29, marginTop: -44, marginBottom: 8 },
  title: { fontSize: 21, fontFamily: FONTS.bold, color: COLORS.ink, marginBottom: 7, textAlign: 'center' },
  subtitle: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'center', marginBottom: 22, lineHeight: 19 },
  detailsBox: {
    width: '100%', backgroundColor: COLORS.canvas, borderRadius: 18,
    padding: 17, borderWidth: 1, borderColor: COLORS.hairline, marginBottom: 18,
  },
  detailRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 9 },
  detailText: { flex: 1, fontSize: 13, fontFamily: FONTS.medium, color: COLORS.ink, lineHeight: 20, textAlign: 'right' },
  amountLabel: { flex: 1, fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right' },
  amountValue: { fontSize: 18, color: COLORS.primary, fontFamily: FONTS.bold },
  timerText: { fontSize: 12.5, color: COLORS.inkSecondary, fontFamily: FONTS.medium, marginBottom: 20 },
  actions: { flexDirection: 'row-reverse', gap: 10, width: '100%' },
  rejectBtn: { flex: 1, height: 52, borderRadius: 15, backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: COLORS.inkSecondary, fontSize: 14, fontFamily: FONTS.semiBold },
  acceptBtn: { flex: 2, height: 52, borderRadius: 15, backgroundColor: COLORS.primary, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptText: { color: '#FFFFFF', fontSize: 15, fontFamily: FONTS.bold },
  disabledBtn: { opacity: 0.6 },
});
