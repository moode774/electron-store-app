import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  Platform, TextInput, useWindowDimensions, KeyboardAvoidingView, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore, createProduct, addProductImages, uploadImageToStorage, getCategories, getMerchantProfile, Category } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { Alert } from '../../components/appAlert';

const UI = {
  primary: COLORS.primary,
  bg: COLORS.background,
  bgMobile: COLORS.surface,
  textDark: COLORS.textPrimary,
  textGrey: COLORS.textSecondary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  error: COLORS.error,
  green: COLORS.success,
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 24,
  elevation: 2,
};

function FormInput({ label, icon, multiline, ...props }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputBox, focused && styles.inputBoxFocused, multiline && { height: 100, alignItems: 'flex-start', paddingTop: 12 }]}>
        <TextInput
          style={[styles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
          placeholderTextColor={UI.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          {...props}
        />
        {icon && <Ionicons name={icon} size={20} color={focused ? UI.primary : UI.textMuted} style={styles.inputIcon} />}
      </View>
    </View>
  );
}

export default function AddProductScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const isCompact = width < BREAKPOINTS.compact;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategories().then((data) => { setCategories(data); setCategoriesError(''); }).catch(() => setCategoriesError('تعذّر تحميل التصنيفات. يمكنك حفظ المنتج دون تصنيف ثم تعديله لاحقاً.'));
  }, []);

  const pickImages = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('إذن مرفوض', 'يرجى السماح للتطبيق بالوصول إلى الصور من الإعدادات.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsMultipleSelection: true,
        quality: 0.85,
        selectionLimit: 5,
      });
      if (!result.canceled && result.assets.length > 0) {
        const uris = result.assets.map((a) => a.uri);
        setSelectedImages((prev) => [...prev, ...uris].slice(0, 5));
      }
    } catch {
      Alert.alert('خطأ', 'تعذّر فتح مكتبة الصور');
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم المنتج والسعر على الأقل');
      return;
    }
    const parsedPrice = parseFloat(price.replace(',', '.'));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('تنبيه', 'الرجاء إدخال سعر صحيح أكبر من صفر');
      return;
    }
    const parsedStock = parseInt(stock, 10);
    if (stock.trim() && (!Number.isFinite(parsedStock) || parsedStock < 0)) {
      Alert.alert('تنبيه', 'الرجاء إدخال مخزون صحيح لا يقل عن صفر');
      return;
    }
    if (!user?.id) { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً'); return; }

    setSaving(true);
    try {
      const merchant = await getMerchantProfile(user.id);
      if (!merchant?.id) throw new Error('لم يتم العثور على ملف المتجر المرتبط بالحساب');

      let og_image_url: string | undefined;
      let uploadedUrls: string[] = [];

      if (selectedImages.length > 0) {
        setUploadingImages(true);
        uploadedUrls = await Promise.all(
          selectedImages.map((uri, i) =>
            uploadImageToStorage('products', `${merchant.id}/${Date.now()}_${i}`, uri)
          )
        );
        og_image_url = uploadedUrls[0];
        setUploadingImages(false);
      }

      const product = await createProduct({
        merchant_id: merchant.id,
        name: name.trim(),
        description: description.trim() || undefined,
        base_price: parsedPrice,
        category_id: categoryId || undefined,
        stock_quantity: Number.isFinite(parsedStock) && parsedStock >= 0 ? parsedStock : 0,
        is_active: true,
        og_image_url,
      });

      let galleryWarning = false;
      if (product?.id && uploadedUrls.length > 0) {
        try { await addProductImages(product.id, uploadedUrls); }
        catch { galleryWarning = true; }
      }

      Alert.alert('تم الحفظ ✅', galleryWarning ? 'تمت إضافة المنتج والصورة الرئيسية، لكن تعذّر ربط بعض صور المعرض. يمكنك إعادة إضافتها من تعديل المنتج.' : 'تمت إضافة المنتج بنجاح', [
        { text: 'حسناً', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل حفظ المنتج');
    } finally {
      setSaving(false);
      setUploadingImages(false);
    }
  };

  const isLoading = saving || uploadingImages;
  const loadingText = uploadingImages ? 'جاري رفع الصور...' : 'جاري الحفظ...';

  return (
    <View style={[styles.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />

      {!isDesktop && (
        <View style={[styles.headerMobile, isCompact && styles.headerMobileCompact]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitleMobile}>إضافة منتج</Text>
          <View style={{ width: 44 }} />
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact, isDesktop && styles.scrollContentDesktop]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {isDesktop && (
            <View style={styles.pageHeaderRow}>
              <View>
                <Text style={styles.pageTitle}>إضافة منتج جديد</Text>
                <Text style={styles.pageSubtitle}>أدخل بيانات منتجك بدقة لعرضه للعملاء</Text>
              </View>
              <TouchableOpacity style={styles.backBtnDesktop} onPress={() => navigation.goBack()}>
                <Text style={styles.backBtnText}>عودة للمنتجات</Text>
                <Ionicons name="arrow-back" size={16} color={UI.textDark} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.formCard, isDesktop && styles.formCardDesktop]}>

            {/* Image Uploader */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>صور المنتج</Text>

              {selectedImages.length > 0 ? (
                <View style={styles.imageGrid}>
                  {selectedImages.map((uri, index) => (
                    <View key={index} style={styles.imageThumbWrap}>
                      <Image source={{ uri }} style={styles.imageThumb} />
                      {index === 0 && (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>رئيسية</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        onPress={() => removeImage(index)}
                        activeOpacity={0.8}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <Ionicons name="close" size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {selectedImages.length < 5 && (
                    <TouchableOpacity style={styles.addMoreBtn} onPress={pickImages} activeOpacity={0.8}>
                      <Ionicons name="add" size={28} color={UI.textMuted} />
                      <Text style={styles.addMoreText}>إضافة</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity style={styles.imagePicker} onPress={pickImages} activeOpacity={0.8}>
                  <View style={styles.imagePickerIconBox}>
                    <Ionicons name="cloud-upload-outline" size={28} color={UI.textDark} />
                  </View>
                  <Text style={styles.imagePickerTitle}>اضغط هنا لرفع الصور</Text>
                  <Text style={styles.imagePickerSub}>PNG, JPG أو WEBP — حتى 5 صور</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            {/* Basic Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>المعلومات الأساسية</Text>
              <FormInput
                label="اسم المنتج *"
                placeholder="مثال: سماعات لاسلكية عازلة للضوضاء"
                icon="cube-outline"
                value={name}
                onChangeText={setName}
              />

              <View style={[styles.row, { flexDirection: isTablet ? 'row-reverse' : 'column' }]}>
                <View style={{ flex: 1 }}>
                  <FormInput
                    label="السعر (ر.ي) *"
                    placeholder="0.00"
                    icon="cash-outline"
                    keyboardType="numeric"
                    value={price}
                    onChangeText={setPrice}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormInput
                    label="الكمية المتاحة بالمخزون"
                    placeholder="0"
                    icon="layers-outline"
                    keyboardType="numeric"
                    value={stock}
                    onChangeText={setStock}
                  />
                </View>
              </View>

              <FormInput
                label="وصف المنتج"
                placeholder="اكتب وصفاً مفصلاً يبرز مميزات منتجك..."
                multiline
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <View style={styles.divider} />

            {/* Categories */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>التصنيف</Text>
              {categories.length > 0 ? (
                <View style={styles.categoriesRow}>
                  {categories.map((cat) => {
                    const isActive = categoryId === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.catChip, isActive && styles.catChipActive]}
                        onPress={() => setCategoryId(isActive ? '' : cat.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.catChipText, isActive && styles.catChipTextActive]}>
                          {cat.name_ar ?? cat.name}
                        </Text>
                        {isActive && <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ textAlign: 'right', color: categoriesError ? UI.error : UI.textMuted, fontSize: 13 }}>{categoriesError || 'جاري تحميل التصنيفات...'}</Text>
              )}
            </View>

            {/* Actions */}
            <View style={[styles.actionsRow, isCompact && styles.actionsRowCompact]}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, isLoading && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>{loadingText}</Text>
                  </View>
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>حفظ المنتج</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => navigation.goBack()}
                disabled={isLoading}
              >
                <Text style={styles.btnSecondaryText}>إلغاء</Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI.bgMobile },

  headerMobile: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: UI.border,
  },
  headerMobileCompact: { paddingHorizontal: 14 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontFamily: FONTS.bold, color: UI.textDark },

  scrollContent: { padding: 24, paddingBottom: 100 },
  scrollContentCompact: { paddingHorizontal: 14, paddingTop: 18 },
  scrollContentDesktop: { padding: 40, alignItems: 'center' },

  pageHeaderRow: {
    width: '100%', maxWidth: 960, flexDirection: 'row-reverse',
    justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24,
  },
  pageTitle: { fontSize: 28, fontWeight: '800', color: UI.textDark, marginBottom: 8, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: UI.textGrey, textAlign: 'right' },
  backBtnDesktop: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border, ...softShadow,
    minHeight: 44,
  },
  backBtnText: { fontSize: 13, fontWeight: '700', color: UI.textDark },

  formCard: { width: '100%', maxWidth: 960, alignSelf: 'center' },
  formCardDesktop: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 40,
    ...softShadow, borderWidth: 1, borderColor: '#F3F4F6',
  },

  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: UI.textDark, marginBottom: 16, textAlign: 'right' },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 32 },
  row: { gap: 16 },

  inputWrap: { marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: UI.textDark, marginBottom: 8, textAlign: 'right' },
  inputBox: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: UI.border, borderRadius: RADIUS.md, paddingHorizontal: 16, minHeight: 48,
  },
  inputBoxFocused: { borderColor: UI.primary, backgroundColor: '#F9FAFB' },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, height: '100%', textAlign: 'right', fontSize: 14, color: UI.textDark, outlineStyle: 'none' as any },

  imagePicker: {
    width: '100%', height: 160, borderRadius: 16, borderWidth: 2, borderColor: UI.border,
    borderStyle: 'dashed', backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  imagePickerIconBox: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', ...softShadow,
  },
  imagePickerTitle: { fontSize: 15, fontWeight: '700', color: UI.textDark },
  imagePickerSub: { fontSize: 12, color: UI.textMuted },

  imageGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  imageThumbWrap: { width: 90, height: 90, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  imageThumb: { width: '100%', height: '100%' },
  primaryBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(17,24,39,0.7)', paddingVertical: 3, alignItems: 'center',
  },
  primaryBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  removeImageBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center',
  },
  addMoreBtn: {
    width: 90, height: 90, borderRadius: 12, borderWidth: 2, borderColor: UI.border,
    borderStyle: 'dashed', backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addMoreText: { fontSize: 11, color: UI.textMuted, fontWeight: '600' },

  categoriesRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  catChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border,
  },
  catChipActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  catChipText: { fontSize: 13, fontWeight: '600', color: UI.textGrey },
  catChipTextActive: { color: '#FFFFFF' },

  actionsRow: { flexDirection: 'row-reverse', gap: 16, marginTop: 16 },
  actionsRowCompact: { flexDirection: 'column' },
  btn: { flex: 1, height: 52, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimary: { backgroundColor: UI.primary, ...softShadow, shadowOpacity: 0.1, shadowColor: UI.primary },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  btnSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: UI.border },
  btnSecondaryText: { fontSize: 15, fontWeight: '700', color: UI.textDark },
});
