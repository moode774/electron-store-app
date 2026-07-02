import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Alert, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORAGE_BUCKETS } from '@marketplace/shared-utils';
import { Input, Button } from '@marketplace/shared-ui';
import {
  useAuthStore, createProduct, updateProduct, addProductImage,
  uploadImageToStorage, getCategories, type Category,
} from '@marketplace/shared-hooks';

export default function AddProductScreen({ navigation, route }: any) {
  const user = useAuthStore((s) => s.user);
  const editing = route?.params?.product ?? null; // وضع التعديل

  const [name, setName] = useState(editing?.name ?? '');
  const [price, setPrice] = useState(editing ? String(editing.base_price ?? '') : '');
  const [salePrice, setSalePrice] = useState(editing?.sale_price ? String(editing.sale_price) : '');
  const [stock, setStock] = useState(editing?.stock_quantity != null ? String(editing.stock_quantity) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(editing?.og_image_url ?? null);
  const [imageChanged, setImageChanged] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى الصور'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setImageUri(res.assets[0].uri);
      setImageChanged(true);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم المنتج والسعر على الأقل'); return;
    }
    if (!user?.id) { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً'); return; }
    const basePrice = parseFloat(price);
    if (isNaN(basePrice) || basePrice < 0) { Alert.alert('تنبيه', 'سعر غير صالح'); return; }
    const sale = salePrice.trim() ? parseFloat(salePrice) : null;
    if (sale != null && (isNaN(sale) || sale < 0 || sale > basePrice)) {
      Alert.alert('تنبيه', 'سعر العرض يجب أن يكون أقل من السعر الأساسي'); return;
    }
    const stockQty = stock.trim() ? Math.max(0, parseInt(stock, 10) || 0) : 0;

    setSaving(true);
    try {
      let productId = editing?.id as string | undefined;

      if (editing) {
        await updateProduct(editing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          base_price: basePrice,
          sale_price: sale,
          stock_quantity: stockQty,
          category_id: categoryId ?? undefined,
        });
      } else {
        const created = await createProduct({
          merchant_id: user.id,
          name: name.trim(),
          description: description.trim() || undefined,
          base_price: basePrice,
          sale_price: sale ?? undefined,
          stock_quantity: stockQty,
          category_id: categoryId ?? undefined,
          is_active: true,
        });
        productId = created?.id;
      }

      // رفع الصورة إن تم اختيار صورة جديدة
      if (imageChanged && imageUri && productId) {
        try {
          const url = await uploadImageToStorage(
            STORAGE_BUCKETS.PRODUCTS, `${productId}/${Date.now()}`, imageUri,
          );
          await updateProduct(productId, { og_image_url: url });
          await addProductImage(productId, url, true, 0).catch(() => {});
        } catch {
          Alert.alert('تنبيه', 'تم حفظ المنتج لكن تعذّر رفع الصورة');
        }
      }

      Alert.alert(editing ? 'تم التحديث ✅' : 'تم الحفظ ✅', 'تمت العملية بنجاح', [
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
        <Text style={styles.headerTitle}>{editing ? 'تعديل المنتج' : 'إضافة منتج جديد'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.imagePicker} activeOpacity={0.7} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.pickedImg} resizeMode="cover" />
          ) : (
            <>
              <Ionicons name="camera-outline" size={32} color="#9CA3AF" />
              <Text style={styles.imagePickerText}>إضافة صورة المنتج</Text>
            </>
          )}
        </TouchableOpacity>

        <Input label="اسم المنتج" placeholder="مثال: سماعات لاسلكية" value={name} onChangeText={setName} />
        <Input label="السعر الأساسي (ر.س)" placeholder="0" keyboardType="numeric" value={price} onChangeText={setPrice} />
        <Input label="سعر العرض (اختياري)" placeholder="اتركه فارغاً إن لا يوجد" keyboardType="numeric" value={salePrice} onChangeText={setSalePrice} />
        <Input label="الكمية المتوفرة" placeholder="0" keyboardType="numeric" value={stock} onChangeText={setStock} />
        <Input label="وصف المنتج" placeholder="اكتب وصفاً مختصراً..." value={description} onChangeText={setDescription} multiline />

        {categories.length > 0 && (
          <>
            <Text style={styles.label}>التصنيف</Text>
            <View style={styles.categoriesRow}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, categoryId === cat.id && styles.catChipActive]}
                  onPress={() => setCategoryId(cat.id === categoryId ? null : cat.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.catChipText, categoryId === cat.id && styles.catChipTextActive]}>
                    {cat.name_ar ?? cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
        {saving ? (
          <ActivityIndicator size="large" color={COLORS.primary} />
        ) : (
          <Button title={editing ? 'حفظ التعديلات' : 'حفظ المنتج'} onPress={handleSave} />
        )}
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
    height: 160, borderRadius: 16, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, overflow: 'hidden',
  },
  pickedImg: { width: '100%', height: '100%' },
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
