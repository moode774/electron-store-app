import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Switch, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { Input, Button } from '@marketplace/shared-ui';
import { useAuthStore, getMerchantProfile, updateMerchantProfileByUser } from '@marketplace/shared-hooks';

export default function StoreSettingsScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [storeName, setStoreName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    getMerchantProfile(user.id).then((p) => {
      if (p) {
        setStoreName(p.store_name ?? '');
        setDescription(p.store_description ?? '');
        setAddress(p.address ?? '');
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id]);

  const handleSave = async () => {
    if (!storeName.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم المتجر');
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateMerchantProfileByUser(user.id, {
        store_name: storeName.trim(),
        store_description: description.trim() || undefined,
        address: address.trim() || undefined,
      });
      Alert.alert('تم الحفظ ✅', 'تم تحديث بيانات المتجر بنجاح', [
        { text: 'حسناً', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>بيانات المتجر</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Store Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Ionicons name="storefront" size={36} color={COLORS.primary} />
            <TouchableOpacity style={styles.cameraBtn} activeOpacity={0.8}>
              <Ionicons name="camera" size={13} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Open/Closed Toggle */}
        <View style={styles.statusCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>حالة المتجر</Text>
            <Text style={[styles.statusSub, { color: isOpen ? '#059669' : '#EF4444' }]}>
              {isOpen ? 'مفتوح — يستقبل الطلبات' : 'مغلق مؤقتاً'}
            </Text>
          </View>
          <Switch
            value={isOpen}
            onValueChange={setIsOpen}
            trackColor={{ false: '#FECACA', true: '#A7F3D0' }}
            thumbColor={isOpen ? '#059669' : '#EF4444'}
          />
        </View>

        <Input label="اسم المتجر" placeholder="اسم متجرك" value={storeName} onChangeText={setStoreName} />
        <Input label="وصف المتجر" placeholder="وصف مختصر يظهر للعملاء" value={description} onChangeText={setDescription} multiline />
        <Input label="عنوان المتجر" placeholder="المدينة، الشارع" value={address} onChangeText={setAddress} />

        <View style={{ height: 12 }} />
        <Button title={saving ? 'جاري الحفظ...' : 'حفظ التغييرات'} onPress={handleSave} disabled={saving} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scrollContent: { padding: 24 },
  logoSection: { alignItems: 'center', marginBottom: 24 },
  logoCircle: {
    width: 92, height: 92, borderRadius: 28, backgroundColor: '#F0F4FF',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#F9FAFB',
  },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 20,
  },
  statusTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  statusSub: { fontSize: 12.5, fontWeight: '700', marginTop: 4 },
});
