import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@marketplace/shared-utils';
import { Input, Button } from '@marketplace/shared-ui';
import { useAuthStore, createProduct } from '@marketplace/shared-hooks';

const CATEGORIES = ['إلكترونيات', 'أزياء', 'عطور', 'منزل ومطبخ', 'رياضة', 'أخرى'];

export default function AddProductScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم المنتج والسعر على الأقل');
      return;
    }
    if (!user?.id) { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً'); return; }
    setSaving(true);
    try {
      await createProduct({
        merchant_id: user.id,
        name: name.trim(),
        description: description.trim() || undefined,
        base_price: parseFloat(price),
        is_active: true,
      });
      Alert.alert('تم الحفظ ✅', 'تمت إضافة المنتج بنجاح', [
        { text: 'حسناً', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل حفظ المنتج');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إضافة منتج جديد</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Image Picker Placeholder */}
        <TouchableOpacity style={styles.imagePicker} activeOpacity={0.7}>
          <Ionicons name="camera-outline" size={32} color="#9CA3AF" />
          <Text style={styles.imagePickerText}>إضافة صور المنتج</Text>
        </TouchableOpacity>

        <Input label="اسم المنتج" placeholder="مثال: سماعات لاسلكية" value={name} onChangeText={setName} />
        <Input label="السعر (ر.ي)" placeholder="0" keyboardType="numeric" value={price} onChangeText={setPrice} />
        <Input label="الكمية المتوفرة" placeholder="0" keyboardType="numeric" value={stock} onChangeText={setStock} />
        <Input label="وصف المنتج" placeholder="اكتب وصفاً مختصراً..." value={description} onChangeText={setDescription} multiline />

        <Text style={styles.label}>التصنيف</Text>
        <View style={styles.categoriesRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, category === cat && styles.catChipActive]}
              onPress={() => setCategory(cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 24 }} />
        <Button title={saving ? 'جاري الحفظ...' : 'حفظ المنتج'} onPress={handleSave} />
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
  scrollContent: { padding: 20 },
  imagePicker: {
    height: 140, borderRadius: 16, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20,
  },
  imagePickerText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  label: { fontSize: 13, color: '#111827', marginBottom: 10, fontWeight: '600' },
  categoriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },
  catChipTextActive: { color: '#FFFFFF' },
});
