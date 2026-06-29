import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, STORAGE_BUCKETS } from '@marketplace/shared-utils';
import { Input, Button } from '@marketplace/shared-ui';
import { useAuthStore, createProduct, addProductImages, uploadImageToStorage } from '@marketplace/shared-hooks';

const CATEGORIES = ['إلكترونيات', 'أزياء', 'عطور', 'منزل ومطبخ', 'رياضة', 'أخرى'];

export default function AddProductScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('تنبيه', 'يجب السماح بالوصول إلى معرض الصور'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.7,
    });
    if (result.canceled) return;
    setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
  };

  const removeImage = (uri: string) => setImages((prev) => prev.filter((u) => u !== uri));

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم المنتج والسعر على الأقل');
      return;
    }
    if (!user?.id) { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً'); return; }
    setSaving(true);
    try {
      const created = await createProduct({
        merchant_id: user.id,
        name: name.trim(),
        description: description.trim() || undefined,
        base_price: parseFloat(price),
        stock_quantity: stock ? parseInt(stock, 10) : 0,
        is_active: true,
      });
      // رفع الصور وربطها بالمنتج (إن وُجدت)
      if (created?.id && images.length > 0) {
        const urls: string[] = [];
        for (let i = 0; i < images.length; i++) {
          try {
            urls.push(await uploadImageToStorage(STORAGE_BUCKETS.PRODUCTS, `${created.id}/${i}`, images[i]));
          } catch { /* تخطّى صورة فشل رفعها */ }
        }
        if (urls.length > 0) await addProductImages(created.id, urls);
      }
      Alert.alert('تم الحفظ', 'تمت إضافة المنتج بنجاح', [
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
        {/* Image Picker */}
        {images.length === 0 ? (
          <TouchableOpacity style={styles.imagePicker} activeOpacity={0.7} onPress={pickImages}>
            <Ionicons name="camera-outline" size={32} color="#9CA3AF" />
            <Text style={styles.imagePickerText}>إضافة صور المنتج (حتى 5)</Text>
          </TouchableOpacity>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 10 }}>
            {images.map((uri) => (
              <View key={uri} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removeImage(uri)} activeOpacity={0.8}>
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < 5 && (
              <TouchableOpacity style={styles.thumbAdd} activeOpacity={0.7} onPress={pickImages}>
                <Ionicons name="add" size={28} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

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
  thumbWrap: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  thumbAdd: { width: 96, height: 96, borderRadius: 14, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
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
