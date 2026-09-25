import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  Platform, TextInput, useWindowDimensions, KeyboardAvoidingView, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, createProductWithImages, uploadImageToStorage, getCategories, getMerchantProfile, Category } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { Alert } from '../../components/appAlert';

const MAX_IMAGES = 10;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 1200;

// Buyers most often ask about these before ordering; one tap drops the
// heading into the description so the merchant only fills the value.
const DESCRIPTION_PROMPTS = ['المقاس', 'الخامة', 'اللون', 'الوزن', 'الضمان', 'محتويات العلبة'];
const STOCK_PRESETS = [5, 10, 25, 50];

// Yemeni keyboards often type Arabic-Indic digits and the Arabic decimal mark.
const normalizeNumber = (value: string) =>
  value
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫,]/g, '.')
    .replace(/[^0-9.]/g, '');

const formatMoney = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

type Check = { label: string; tip: string; done: boolean };

function Section({ title, hint, children, aside }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
        </View>
        {aside}
      </View>
      {children}
    </View>
  );
}

function Field({
  label, suffix, counter, multiline, error, ...props
}: React.ComponentProps<typeof TextInput> & { label: string; suffix?: string; counter?: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {counter ? <Text style={styles.fieldCounter}>{counter}</Text> : null}
      </View>
      <View style={[styles.inputBox, multiline && styles.inputBoxMultiline, focused && styles.inputBoxFocused, !!error && styles.inputBoxError]}>
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          placeholderTextColor={COLORS.inkTertiary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          {...props}
        />
        {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function ReadinessRing({ score }: { score: number }) {
  const color = score >= 80 ? COLORS.statusOnline : score >= 50 ? '#F59E0B' : COLORS.inkTertiary;
  return (
    <View style={[styles.ring, { borderColor: color }]} accessibilityLabel={`جاهزية المنتج ${score}%`}>
      <Text style={[styles.ringText, { color }]}>{score}%</Text>
    </View>
  );
}

function PreviewCard({ image, name, category, price, salePrice, store }: {
  image?: string; name: string; category?: string; price: number | null; salePrice: number | null; store: string;
}) {
  const hasSale = price != null && salePrice != null && salePrice < price;
  const discount = hasSale ? Math.round(((price! - salePrice!) / price!) * 100) : 0;
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewMedia}>
        {image ? (
          <Image source={{ uri: image }} style={styles.previewImage} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={34} color={COLORS.inkTertiary} />
        )}
        {hasSale ? (
          <View style={styles.previewBadge}><Text style={styles.previewBadgeText}>-{discount}%</Text></View>
        ) : null}
      </View>
      <View style={styles.previewBody}>
        {category ? <Text style={styles.previewCategory} numberOfLines={1}>{category}</Text> : null}
        <Text style={[styles.previewName, !name && styles.previewPlaceholder]} numberOfLines={2}>
          {name || 'اسم المنتج يظهر هنا'}
        </Text>
        <View style={styles.previewPriceRow}>
          <Text style={styles.previewPrice}>
            {price == null ? '—' : formatMoney(hasSale ? salePrice! : price)} <Text style={styles.previewCurrency}>ر.ي</Text>
          </Text>
          {hasSale ? <Text style={styles.previewOldPrice}>{formatMoney(price!)}</Text> : null}
        </View>
        <View style={styles.previewStore}>
          <Ionicons name="storefront-outline" size={12} color={COLORS.inkTertiary} />
          <Text style={styles.previewStoreText} numberOfLines={1}>{store}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AddProductScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.desktop;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [hasSale, setHasSale] = useState(false);
  const [salePrice, setSalePrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [storeName, setStoreName] = useState('متجرك');
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getCategories()
      .then((data) => { setCategories(data); setCategoriesError(''); })
      .catch(() => setCategoriesError('تعذّر تحميل التصنيفات. يمكنك الحفظ دون تصنيف وتعديله لاحقاً.'));
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    getMerchantProfile(user.id).then((p) => { if (p?.store_name) setStoreName(p.store_name); }).catch(() => {});
  }, [user?.id]);

  const priceValue = price ? Number(price) : null;
  const saleValue = hasSale && salePrice ? Number(salePrice) : null;
  const stockValue = stock ? parseInt(stock, 10) : 0;
  const category = categories.find((c) => c.id === categoryId);

  const errors = {
    name: !name.trim() ? 'اكتب اسم المنتج.' : '',
    price: priceValue == null || !Number.isFinite(priceValue) || priceValue <= 0 ? 'أدخل سعراً أكبر من صفر.' : '',
    sale: hasSale && saleValue != null && priceValue != null && saleValue >= priceValue ? 'سعر الخصم يجب أن يكون أقل من السعر الأصلي.' : '',
  };

  const checks: Check[] = useMemo(() => [
    { label: 'صورة غلاف', tip: 'المنتجات بصورة واضحة تُفتح أكثر بكثير.', done: images.length > 0 },
    { label: '3 صور أو أكثر', tip: 'أضف زوايا مختلفة وصورة للتفاصيل.', done: images.length >= 3 },
    { label: 'اسم واضح', tip: 'اذكر النوع والماركة والميزة الأهم.', done: name.trim().length >= 12 },
    { label: 'التصنيف', tip: 'يساعد العميل على إيجاد المنتج بالبحث.', done: !!categoryId },
    { label: 'وصف مفيد', tip: 'المقاس والخامة واللون تقلل الإرجاع.', done: description.trim().length >= 60 },
    { label: 'مخزون متاح', tip: 'المنتج بلا مخزون لا يمكن طلبه.', done: stockValue > 0 },
  ], [images.length, name, categoryId, description, stockValue]);
  const score = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);
  const nextTip = checks.find((c) => !c.done);

  const dirty = !!(name || price || stock || description || images.length || categoryId);
  const busy = phase !== 'idle';

  const leave = () => {
    if (!dirty || busy) { navigation.goBack(); return; }
    Alert.alert('تجاهل التغييرات؟', 'لم يتم حفظ المنتج بعد.', [
      { text: 'متابعة التعديل', style: 'cancel' },
      { text: 'تجاهل', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const addImages = async (source: 'library' | 'camera') => {
    try {
      if (Platform.OS !== 'web') {
        const permission = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('إذن مرفوض', 'اسمح للتطبيق بالوصول من الإعدادات ثم أعد المحاولة.');
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'] as any,
          allowsMultipleSelection: true,
          quality: 0.85,
          selectionLimit: MAX_IMAGES - images.length,
        });
      if (!result.canceled && result.assets.length > 0) {
        setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES));
      }
    } catch {
      Alert.alert('خطأ', source === 'camera' ? 'تعذّر فتح الكاميرا.' : 'تعذّر فتح مكتبة الصور.');
    }
  };

  const makeCover = (index: number) =>
    setImages((prev) => [prev[index], ...prev.filter((_, i) => i !== index)]);
  const removeImage = (index: number) => setImages((prev) => prev.filter((_, i) => i !== index));

  const addPrompt = (prompt: string) =>
    setDescription((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${prompt}: `.slice(0, DESCRIPTION_MAX));

  const adjustStock = (delta: number) => setStock(String(Math.max(0, stockValue + delta)));

  const save = async (publish: boolean) => {
    setSubmitted(true);
    if (errors.name || errors.price || errors.sale) {
      Alert.alert('أكمل البيانات', errors.name || errors.price || errors.sale);
      return;
    }
    if (!user?.id) { Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً.'); return; }

    try {
      const merchant = await getMerchantProfile(user.id);
      if (!merchant?.id) throw new Error('لم يتم العثور على ملف المتجر المرتبط بالحساب.');

      let uploaded: string[] = [];
      if (images.length) {
        setPhase('uploading');
        uploaded = await Promise.all(
          images.map((uri, i) => uploadImageToStorage('products', `${merchant.id}/${Date.now()}_${i}`, uri)),
        );
      }

      setPhase('saving');
      // Product and images are written in one transaction; the first image
      // becomes the cover inside the RPC.
      await createProductWithImages({
        name: name.trim(),
        description: description.trim() || undefined,
        base_price: priceValue!,
        sale_price: saleValue,
        category_id: categoryId || undefined,
        stock_quantity: stockValue,
        is_active: publish,
        image_urls: uploaded,
      });

      Alert.alert(
        publish ? 'تم إرسال المنتج' : 'تم حفظ المسودة',
        publish ? 'سيظهر للعملاء بعد مراجعة فريق المنصة.' : 'يمكنك إكماله ونشره لاحقاً من قائمة منتجاتك.',
        [{ text: 'حسناً', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      Alert.alert('تعذّر الحفظ', e?.message ?? 'فشل حفظ المنتج.');
    } finally {
      setPhase('idle');
    }
  };

  const gallery = (
    <Section
      title="الصور"
      hint={`${images.length}/${MAX_IMAGES} · الصورة الأولى هي الغلاف`}
    >
      {images.length ? (
        <>
          <View style={styles.cover}>
            <Image source={{ uri: images[0] }} style={styles.coverImage} resizeMode="cover" />
            <View style={styles.coverTag}><Ionicons name="star" size={11} color={COLORS.surface} /><Text style={styles.coverTagText}>الغلاف</Text></View>
            <TouchableOpacity style={styles.coverRemove} onPress={() => removeImage(0)} accessibilityRole="button" accessibilityLabel="حذف صورة الغلاف">
              <Ionicons name="trash-outline" size={16} color={COLORS.surface} />
            </TouchableOpacity>
          </View>
          <View style={styles.thumbs}>
            {images.slice(1).map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.thumb}>
                <TouchableOpacity onPress={() => makeCover(i + 1)} accessibilityRole="button" accessibilityLabel="اجعلها صورة الغلاف">
                  <Image source={{ uri }} style={styles.thumbImage} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removeImage(i + 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="حذف الصورة">
                  <Ionicons name="close" size={11} color={COLORS.surface} />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < MAX_IMAGES ? (
              <TouchableOpacity style={[styles.thumb, styles.thumbAdd]} onPress={() => void addImages('library')} accessibilityRole="button" accessibilityLabel="إضافة صور">
                <Ionicons name="add" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
          {images.length > 1 ? <Text style={styles.microHint}>اضغط على أي صورة لجعلها الغلاف.</Text> : null}
        </>
      ) : (
        <View style={styles.dropzone}>
          <View style={styles.dropzoneIcon}><Ionicons name="images-outline" size={26} color={COLORS.primary} /></View>
          <Text style={styles.dropzoneTitle}>ابدأ بصورة تبيع المنتج</Text>
          <Text style={styles.dropzoneText}>خلفية فاتحة، إضاءة نهارية، والمنتج يملأ الإطار.</Text>
          <View style={styles.dropzoneActions}>
            <TouchableOpacity style={styles.dropzoneBtnPrimary} onPress={() => void addImages('library')} accessibilityRole="button" accessibilityLabel="اختيار من المعرض">
              <Ionicons name="image-outline" size={17} color={COLORS.surface} />
              <Text style={styles.dropzoneBtnPrimaryText}>من المعرض</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' ? (
              <TouchableOpacity style={styles.dropzoneBtn} onPress={() => void addImages('camera')} accessibilityRole="button" accessibilityLabel="التصوير بالكاميرا">
                <Ionicons name="camera-outline" size={17} color={COLORS.primary} />
                <Text style={styles.dropzoneBtnText}>الكاميرا</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}
    </Section>
  );

  const basics = (
    <Section title="الأساسيات">
      <Field
        label="اسم المنتج"
        placeholder="مثال: حذاء رياضي نايكي للجري - مقاس 42"
        value={name}
        onChangeText={(v) => setName(v.slice(0, NAME_MAX))}
        counter={`${name.length}/${NAME_MAX}`}
        error={submitted ? errors.name : ''}
      />
      <Text style={styles.fieldLabel}>التصنيف</Text>
      {categories.length ? (
        <View style={styles.chips}>
          {categories.map((cat) => {
            const active = categoryId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategoryId(active ? '' : cat.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={cat.name_ar ?? cat.name}
              >
                {active ? <Ionicons name="checkmark" size={14} color={COLORS.surface} /> : null}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.name_ar ?? cat.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.microHint, !!categoriesError && { color: COLORS.error }]}>{categoriesError || 'جاري تحميل التصنيفات...'}</Text>
      )}
    </Section>
  );

  const pricing = (
    <Section
      title="السعر والمخزون"
      aside={(
        <TouchableOpacity
          style={[styles.toggle, hasSale && styles.toggleOn]}
          onPress={() => { setHasSale((v) => !v); setSalePrice(''); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: hasSale }}
          accessibilityLabel="تفعيل سعر الخصم"
        >
          <Ionicons name="pricetag-outline" size={14} color={hasSale ? COLORS.surface : COLORS.primary} />
          <Text style={[styles.toggleText, hasSale && styles.toggleTextOn]}>خصم</Text>
        </TouchableOpacity>
      )}
    >
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Field
            label={hasSale ? 'السعر قبل الخصم' : 'السعر'}
            placeholder="0"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={(v) => setPrice(normalizeNumber(v))}
            suffix="ر.ي"
            error={submitted ? errors.price : ''}
          />
        </View>
        {hasSale ? (
          <View style={styles.rowItem}>
            <Field
              label="السعر بعد الخصم"
              placeholder="0"
              keyboardType="decimal-pad"
              value={salePrice}
              onChangeText={(v) => setSalePrice(normalizeNumber(v))}
              suffix="ر.ي"
              error={errors.sale}
            />
          </View>
        ) : null}
      </View>
      {hasSale && !errors.sale && priceValue && saleValue ? (
        <View style={styles.saleNote}>
          <Ionicons name="trending-down" size={15} color={COLORS.statusOnline} />
          <Text style={styles.saleNoteText}>
            خصم {Math.round(((priceValue - saleValue) / priceValue) * 100)}% · يوفّر العميل {formatMoney(priceValue - saleValue)} ر.ي
          </Text>
        </View>
      ) : null}

      <Text style={styles.fieldLabel}>الكمية المتوفرة</Text>
      <View style={styles.stockRow}>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustStock(1)} accessibilityRole="button" accessibilityLabel="زيادة الكمية">
            <Ionicons name="add" size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.stepInput}
            value={stock}
            placeholder="0"
            placeholderTextColor={COLORS.inkTertiary}
            keyboardType="number-pad"
            onChangeText={(v) => setStock(normalizeNumber(v).replace('.', ''))}
            accessibilityLabel="الكمية المتوفرة"
          />
          <TouchableOpacity style={styles.stepBtn} onPress={() => adjustStock(-1)} accessibilityRole="button" accessibilityLabel="إنقاص الكمية">
            <Ionicons name="remove" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.presets}>
          {STOCK_PRESETS.map((n) => (
            <TouchableOpacity key={n} style={[styles.preset, stockValue === n && styles.presetActive]} onPress={() => setStock(String(n))} accessibilityRole="button" accessibilityLabel={`${n} قطعة`}>
              <Text style={[styles.presetText, stockValue === n && styles.presetTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Section>
  );

  const details = (
    <Section title="الوصف" hint="أجب عن أسئلة العميل قبل أن يسألها">
      <View style={styles.prompts}>
        {DESCRIPTION_PROMPTS.map((p) => (
          <TouchableOpacity key={p} style={styles.prompt} onPress={() => addPrompt(p)} accessibilityRole="button" accessibilityLabel={`إضافة ${p}`}>
            <Ionicons name="add" size={13} color={COLORS.primary} />
            <Text style={styles.promptText}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Field
        label="وصف المنتج"
        placeholder="ما الذي يميز المنتج؟ لمن يناسب؟ كيف يُستخدم؟"
        multiline
        value={description}
        onChangeText={(v) => setDescription(v.slice(0, DESCRIPTION_MAX))}
        counter={`${description.length}/${DESCRIPTION_MAX}`}
      />
    </Section>
  );

  const readiness = (
    <View style={styles.readiness}>
      <View style={styles.readinessHead}>
        <ReadinessRing score={score} />
        <View style={styles.readinessCopy}>
          <Text style={styles.readinessTitle}>{score === 100 ? 'المنتج جاهز للنشر' : 'جاهزية المنتج'}</Text>
          <Text style={styles.readinessText}>{nextTip ? nextTip.tip : 'بيانات كاملة تعني ظهوراً أفضل وثقة أعلى.'}</Text>
        </View>
      </View>
      <View style={styles.checks}>
        {checks.map((c) => (
          <View key={c.label} style={styles.check}>
            <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={c.done ? COLORS.statusOnline : COLORS.inkTertiary} />
            <Text style={[styles.checkText, c.done && styles.checkTextDone]}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const preview = (
    <View>
      <Text style={styles.previewLabel}>هكذا سيراه العميل</Text>
      <PreviewCard
        image={images[0]}
        name={name.trim()}
        category={category ? (category.name_ar ?? category.name) : undefined}
        price={priceValue && Number.isFinite(priceValue) ? priceValue : null}
        salePrice={saleValue && Number.isFinite(saleValue) ? saleValue : null}
        store={storeName}
      />
    </View>
  );

  const actionBar = (
    <View style={[styles.actionBar, isDesktop ? styles.actionBarDesktop : { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TouchableOpacity
        style={[styles.publishBtn, busy && styles.btnBusy]}
        onPress={() => void save(true)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="نشر المنتج"
      >
        {busy ? <ActivityIndicator size="small" color={COLORS.surface} /> : <Ionicons name="paper-plane-outline" size={17} color={COLORS.surface} />}
        <Text style={styles.publishText}>
          {phase === 'uploading' ? `جاري رفع ${images.length} صور...` : phase === 'saving' ? 'جاري الحفظ...' : 'نشر المنتج'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.draftBtn, busy && styles.btnBusy]}
        onPress={() => void save(false)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="حفظ كمسودة"
      >
        <Text style={styles.draftText}>مسودة</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />

      <View style={[styles.header, { paddingTop: isDesktop ? 20 : insets.top + 10 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={leave} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name={Platform.OS === 'web' ? 'arrow-forward' : 'arrow-back'} size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>منتج جديد</Text>
          <Text style={styles.headerSub}>{storeName}</Text>
        </View>
        {!isDesktop ? <ReadinessRing score={score} /> : <View style={{ width: 44 }} />}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isDesktop ? (
            <View style={styles.desktopGrid}>
              <View style={styles.desktopForm}>
                {gallery}{basics}{pricing}{details}
              </View>
              <View style={styles.desktopAside}>
                {preview}
                {readiness}
                {actionBar}
              </View>
            </View>
          ) : (
            <>
              {gallery}{basics}{pricing}{details}
              {readiness}
              {preview}
            </>
          )}
        </ScrollView>
        {!isDesktop ? actionBar : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const card = {
  backgroundColor: COLORS.surface,
  borderRadius: RADIUS.lg,
  borderWidth: 1,
  borderColor: COLORS.hairline,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },

  header: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: COLORS.canvas, borderBottomWidth: 1, borderBottomColor: COLORS.hairline,
  },
  headerBtn: { ...card, width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  headerSub: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'right', marginTop: 1 },

  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  ringText: { fontSize: 11, fontFamily: FONTS.bold },

  scroll: { padding: 16, paddingBottom: 32, gap: 14 },
  scrollDesktop: { padding: 28, alignItems: 'center' },
  desktopGrid: { width: '100%', maxWidth: 1120, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 24 },
  desktopForm: { flex: 1, gap: 16 },
  desktopAside: { width: 320, gap: 16, ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as any) : {}) },

  section: { ...card, padding: 16 },
  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 },
  sectionHeadCopy: { flex: 1, alignItems: 'flex-end' },
  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  sectionHint: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'right', marginTop: 2 },
  microHint: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkTertiary, textAlign: 'right', marginTop: 8 },

  field: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  fieldLabel: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right', marginBottom: 7 },
  fieldCounter: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.inkTertiary, marginBottom: 7 },
  fieldError: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.error, textAlign: 'right', marginTop: 5 },
  inputBox: {
    flexDirection: 'row-reverse', alignItems: 'center', minHeight: 50, paddingHorizontal: 14,
    backgroundColor: COLORS.canvas, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.hairline,
  },
  inputBoxMultiline: { alignItems: 'flex-start', paddingVertical: 10 },
  inputBoxFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  inputBoxError: { borderColor: COLORS.error },
  input: {
    flex: 1, width: 0, minWidth: 0, minHeight: 48, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink, textAlign: 'right',
    writingDirection: 'rtl', outlineStyle: 'none' as any,
  },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  inputSuffix: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.inkSecondary, marginRight: 8 },

  dropzone: {
    alignItems: 'center', paddingVertical: 26, paddingHorizontal: 16, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.borderStrong, backgroundColor: COLORS.primarySoft,
  },
  dropzoneIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  dropzoneTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink },
  dropzoneText: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, marginTop: 4, textAlign: 'center' },
  dropzoneActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  dropzoneBtnPrimary: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary,
    paddingHorizontal: 18, minHeight: 44, borderRadius: RADIUS.full,
  },
  dropzoneBtnPrimaryText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.surface },
  dropzoneBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface,
    paddingHorizontal: 18, minHeight: 44, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.hairline,
  },
  dropzoneBtnText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.primary },

  cover: { width: '100%', aspectRatio: 4 / 3, maxHeight: 360, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.surfaceMuted },
  coverImage: { width: '100%', height: '100%' },
  coverTag: {
    position: 'absolute', top: 10, right: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(15,23,42,0.72)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full,
  },
  coverTagText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.surface },
  coverRemove: {
    position: 'absolute', top: 10, left: 10, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  thumbs: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumb: { width: 62, height: 62, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.surfaceMuted },
  thumbImage: { width: 62, height: 62 },
  thumbRemove: {
    position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  thumbAdd: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.borderStrong, backgroundColor: COLORS.primarySoft },

  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 5, minHeight: 38, paddingHorizontal: 14,
    borderRadius: RADIUS.full, backgroundColor: COLORS.canvas, borderWidth: 1, borderColor: COLORS.hairline,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  chipTextActive: { color: COLORS.surface, fontFamily: FONTS.semiBold },

  toggle: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 34,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.hairline, backgroundColor: COLORS.primarySoft,
  },
  toggleOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { fontSize: 12, fontFamily: FONTS.semiBold, color: COLORS.primary },
  toggleTextOn: { color: COLORS.surface },
  row: { flexDirection: 'row-reverse', gap: 10 },
  rowItem: { flex: 1 },
  saleNote: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF3',
    borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
  },
  saleNoteText: { flex: 1, fontSize: 12, fontFamily: FONTS.semiBold, color: '#166534', textAlign: 'right' },

  stockRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  stepper: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.canvas,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.hairline, height: 48,
  },
  stepBtn: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  stepInput: {
    width: 56, height: 46, textAlign: 'center', fontSize: 16, fontFamily: FONTS.bold, color: COLORS.ink,
    outlineStyle: 'none' as any,
  },
  presets: { flexDirection: 'row-reverse', gap: 6 },
  preset: { minWidth: 42, height: 36, borderRadius: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.canvas, borderWidth: 1, borderColor: COLORS.hairline },
  presetActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  presetText: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.inkSecondary },
  presetTextActive: { color: COLORS.primary },

  prompts: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  prompt: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 10, minHeight: 32,
    borderRadius: RADIUS.full, backgroundColor: COLORS.primarySoft,
  },
  promptText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.primary },

  readiness: { ...card, padding: 16 },
  readinessHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  readinessCopy: { flex: 1, alignItems: 'flex-end' },
  readinessTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  readinessText: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkSecondary, textAlign: 'right', marginTop: 2 },
  checks: { flexDirection: 'row-reverse', flexWrap: 'wrap', marginTop: 14, rowGap: 10 },
  check: { width: '50%', flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  checkText: { fontSize: 12, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  checkTextDone: { color: COLORS.ink },

  previewLabel: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.inkSecondary, textAlign: 'right', marginBottom: 8 },
  previewCard: { ...card, overflow: 'hidden', width: '100%', maxWidth: 320, alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  previewMedia: { width: 120, minHeight: 130, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '100%', position: 'absolute' },
  previewBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: COLORS.error, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  previewBadgeText: { fontSize: 11, fontFamily: FONTS.bold, color: COLORS.surface },
  previewBody: { flex: 1, padding: 12, alignItems: 'flex-end', justifyContent: 'center' },
  previewCategory: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.primary, marginBottom: 3 },
  previewName: { fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right', lineHeight: 20 },
  previewPlaceholder: { color: COLORS.inkTertiary },
  previewPriceRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6, marginTop: 8 },
  previewPrice: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.ink },
  previewCurrency: { fontSize: 11, fontFamily: FONTS.medium, color: COLORS.inkSecondary },
  previewOldPrice: { fontSize: 12, fontFamily: FONTS.regular, color: COLORS.inkTertiary, textDecorationLine: 'line-through' },
  previewStore: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 8 },
  previewStoreText: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.inkTertiary },

  actionBar: {
    flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.hairline,
  },
  actionBarDesktop: { ...card, padding: 12 },
  publishBtn: {
    flex: 1, minHeight: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.primary,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  publishText: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.surface },
  draftBtn: {
    minWidth: 96, minHeight: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  draftText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.ink },
  btnBusy: { opacity: 0.6 },
});
