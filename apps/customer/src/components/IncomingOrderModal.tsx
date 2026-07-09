import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { OrderSummary } from '@marketplace/shared-hooks';

interface Props {
  visible: boolean;
  order: OrderSummary | null;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingOrderModal({ visible, order, onAccept, onReject }: Props) {
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
  }, [visible]);

  if (!visible || !order) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[styles.modalCard, { transform: [{ scale: scaleAnim }] }]}>
          
          <View style={styles.bellRing}>
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
                إلى: {order.addresses?.full_address ?? 'عنوان غير محدد'}
              </Text>
            </View>
            <View style={[styles.detailRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
              <Text style={styles.amountLabel}>أجر التوصيل المتوقع:</Text>
              <Text style={styles.amountValue}>{order.delivery_fee ?? 0} ر.س</Text>
            </View>
          </View>

          <Text style={styles.timerText}>يختفي الطلب خلال <Text style={{ color: '#DC2626' }}>{timeLeft}</Text> ثانية</Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.rejectBtn} onPress={onReject} activeOpacity={0.7}>
              <Text style={styles.rejectText}>رفض</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.7}>
              <Text style={styles.acceptText}>قبول الطلب</Text>
              <Ionicons name="bicycle" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, width: '100%',
    padding: 24, alignItems: 'center', shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
  },
  bellRing: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: -60,
    borderWidth: 4, borderColor: '#FFFFFF', marginBottom: 16,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  detailsBox: {
    width: '100%', backgroundColor: '#F9FAFB', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  detailText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600', lineHeight: 20 },
  amountLabel: { flex: 1, fontSize: 13, color: '#111827', fontWeight: '700' },
  amountValue: { fontSize: 16, color: '#059669', fontWeight: '800' },
  timerText: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 20 },
  actions: { flexDirection: 'row', gap: 12, width: '100%' },
  rejectBtn: { flex: 1, height: 50, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: '#4B5563', fontSize: 15, fontWeight: '700' },
  acceptBtn: { flex: 2, height: 50, borderRadius: 14, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
