import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { COLORS } from '@marketplace/shared-utils';
import {
  useAuthStore, createMerchantProfile, uploadImageToStorage, getServiceAreas, ServiceArea,
} from '@marketplace/shared-hooks';

const STORE_CATEGORIES = [
  'إلكترونيات وتقنية', 'أزياء وملابس', 'مطاعم وطعام', 'عطور ومستحضرات',
  'منزل ومطبخ', 'رياضة ولياقة', 'صحة وصيدلية', 'كتب ومستلزمات', 'خدمات', 'أخرى',
];

const CITIES = ['صنعاء', 'عدن', 'تعز', 'إب', 'الحديدة', 'مأرب', 'حضرموت', 'أخرى'];

const DELIVERY_TYPES = [
  { id: 'local', title: 'داخل المحافظة', desc: 'استقبال الطلبات من نفس محافظة المتجر فقط' },
  { id: 'national', title: 'كل المحافظات', desc: 'استقبال الطلبات من جميع المحافظات (شحن بين المدن)' },
];

const TOTAL_STEPS = 9;

interface Props {
  onComplete: () => void;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.stepRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexGrow: 1, justifyContent: 'center'}}>
        {Array.from({ length: total }).map((_, i) => (
          <React.Fragment key={i}>
            <View style={[styles.stepDot, i < current && styles.stepDotDone, i === current - 1 && styles.stepDotActive]}>
              {i < current - 1 ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={[styles.stepNum, i === current - 1 && styles.stepNumActive]}>{i + 1}</Text>
              )}
            </View>
            {i < total - 1 && <View style={[styles.stepLine, i < current - 1 && styles.stepLineDone]} />}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

export default function MerchantOnboardingScreen({ onComplete }: Props) {
  const user = useAuthStore((s) => s.user);

  // Step 1 — معلومات المتجر الأساسية
  const [storeName, setStoreName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2 — تصنيف المتجر
  const [storeCategory, setStoreCategory] = useState('');

  // Step 3 — معلومات التواصل
  const [storePhone, setStorePhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // Step 4 — الهوية البصرية
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  // Step 5 — الموقع والمحافظة
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  // Step 6 — نطاق التوصيل
  const [deliveryType, setDeliveryType] = useState('local'); // local | national
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // Step 7 — المالك والوثائق الرسمية
  const [ownerName, setOwnerName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [taxNumber, setTaxNumber] = useState('');

  // Step 8 — البيانات البنكية والمالية (بنك الكريمي)
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankName, setBankName] = useState('بنك الكريمي');
  const [iban, setIban] = useState('');

  // Step 9 — المراجعة والشروط
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    getServiceAreas().then(setAreas).catch(() => {});
  }, []);

  const pickImage = async (aspect: [number, number]): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('تنبيه', 'يجب السماح بالوصول إلى معرض الصور');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.8,
    });
    if (result.canceled) return null;
    return result.assets[0].uri;
  };

  const captureLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('تنبيه', 'يجب السماح بالوصول إلى الموقع لتحديد موقع متجرك');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(Number(pos.coords.latitude.toFixed(6)));
      setLng(Number(pos.coords.longitude.toFixed(6)));
    } catch {
      Alert.alert('خطأ', 'تعذّر تحديد الموقع، حاول مرة أخرى أو أدخل العنوان يدوياً');
    } finally {
      setLocating(false);
    }
  };

  const toggleArea = (id: string) => {
    setSelectedAreas((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  };

  const nextStep = () => {
    if (step === 1) {
      if (!storeName.trim()) return Alert.alert('تنبيه', 'اسم المتجر مطلوب');
    }
    if (step === 2) {
      if (!storeCategory) return Alert.alert('تنبيه', 'اختر تصنيف المتجر');
    }
    if (step === 3) {
      if (!storePhone.trim()) return Alert.alert('تنبيه', 'رقم تواصل المتجر مطلوب');
    }
    if (step === 4) {
      if (!logoUri) return Alert.alert('تنبيه', 'شعار المتجر مطلوب');
    }
    if (step === 5) {
      if (!city) return Alert.alert('تنبيه', 'اختر المحافظة / المدينة');
      if (!address.trim()) return Alert.alert('تنبيه', 'العنوان التفصيلي مطلوب');
    }
    if (step === 6) {
      if (!deliveryType) return Alert.alert('تنبيه', 'الرجاء اختيار نطاق التوصيل');
    }
    if (step === 7) {
      if (!ownerName.trim()) return Alert.alert('تنبيه', 'اسم صاحب المتجر مطلوب');
      if (!nationalId.trim()) return Alert.alert('تنبيه', 'رقم الهوية مطلوب');
      if (!commercialRegister.trim()) return Alert.alert('تنبيه', 'رقم السجل التجاري مطلوب');
    }
    if (step === 8) {
      if (!bankName.trim()) return Alert.alert('تنبيه', 'اسم البنك مطلوب');
      if (!bankAccountName.trim()) return Alert.alert('تنبيه', 'اسم صاحب الحساب البنكي مطلوب');
      if (!iban.trim()) return Alert.alert('تنبيه', 'رقم الحساب مطلوب');
    }
    setStep((s) => s + 1);
  };

  const submitProfile = async () => {
    if (!agreedToTerms) {
      Alert.alert('تنبيه', 'يجب الموافقة على الشروط والأحكام لإكمال التسجيل');
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      const slug = storeName.trim().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^؀-ۿa-z0-9-]/g, '')
        + '-' + Math.random().toString(36).substr(2, 5);

      let logoUrl: string | undefined;
      let bannerUrl: string | undefined;
      if (logoUri) logoUrl = await uploadImageToStorage('stores', `logos/${user.id}`, logoUri);
      if (bannerUri) bannerUrl = await uploadImageToStorage('stores', `banners/${user.id}`, bannerUri);

      // Save delivery type encoded in store_description since we don't have a direct column
      const encodedDesc = JSON.stringify({
        desc: description.trim(),
        deliveryType,
      });

      await createMerchantProfile({
        user_id: user.id,
        store_name: storeName.trim(),
        store_slug: slug,
        store_description: encodedDesc,
        store_category: storeCategory,
        city,
        address: address.trim() || undefined,
        latitude: lat ?? undefined,
        longitude: lng ?? undefined,
        service_area_ids: selectedAreas.length ? selectedAreas : undefined,
        owner_name: ownerName.trim() || undefined,
        national_id: nationalId.trim() || undefined,
        commercial_register: commercialRegister.trim() || undefined,
        tax_number: taxNumber.trim() || undefined,
        store_phone: storePhone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        bank_name: bankName.trim() || undefined,
        bank_account: iban.trim() || undefined,
        bank_account_name: bankAccountName.trim() || undefined,
        store_logo_url: logoUrl,
        store_banner_url: bannerUrl,
      });

      Alert.alert(
        'تم التسجيل ✅',
        'تم إرسال بيانات متجرك بنجاح! سيراجع فريقنا الطلب ويصلك إشعار بالقبول خلال 24 ساعة.',
        [{ text: 'ابدأ الآن', onPress: onComplete }],
      );
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل حفظ البيانات، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  const stepTitles = [
    'معلومات المتجر الأساسية',
    'تصنيف المتجر',
    'معلومات التواصل',
    'الهوية البصرية',
    'الموقع والمحافظة',
    'نطاق التوصيل',
    'المالك والوثائق الرسمية',
    'البيانات البنكية',
    'المراجعة وتأكيد'
  ];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)}>
            <Ionicons name="arrow-forward" size={22} color="#111827" />
          </TouchableOpacity>
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>تسجيل متجر جديد</Text>
          <Text style={styles.headerSub}>{stepTitles[step - 1]}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <StepIndicator current={step} total={TOTAL_STEPS} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ========== STEP 1 — معلومات المتجر الأساسية ========== */}
        {step === 1 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="storefront" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>أخبرنا عن متجرك</Text>
            <Text style={styles.sectionSub}>هذه المعلومات ستظهر للعملاء</Text>

            <Field label="اسم المتجر *" icon="storefront-outline">
              <TextInput style={styles.textInput} placeholder="مثال: متجر الأناقة" placeholderTextColor="#9CA3AF" value={storeName} onChangeText={setStoreName} />
            </Field>

            <Field label="وصف المتجر (اختياري)" icon="document-text-outline">
              <TextInput style={[styles.textInput, styles.textArea]} placeholder="اكتب وصفاً مميزاً لمتجرك..." placeholderTextColor="#9CA3AF" value={description} onChangeText={setDescription} multiline numberOfLines={4} />
            </Field>
          </View>
        )}

        {/* ========== STEP 2 — تصنيف المتجر ========== */}
        {step === 2 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="apps" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>تصنيف المتجر</Text>
            <Text style={styles.sectionSub}>اختر التصنيف الأنسب لمنتجاتك</Text>

            <View style={styles.chipGrid}>
              {STORE_CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} style={[styles.chip, storeCategory === cat && styles.chipActive]} onPress={() => setStoreCategory(cat)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, storeCategory === cat && styles.chipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ========== STEP 3 — معلومات التواصل ========== */}
        {step === 3 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="call" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>معلومات التواصل</Text>
            <Text style={styles.sectionSub}>طرق تواصل العملاء أو الإدارة معك</Text>

            <Field label="رقم تواصل المتجر *" icon="call-outline">
              <TextInput style={styles.textInput} placeholder="7xxxxxxxx" placeholderTextColor="#9CA3AF" value={storePhone} onChangeText={setStorePhone} keyboardType="phone-pad" />
            </Field>

            <Field label="رقم واتساب (اختياري)" icon="logo-whatsapp">
              <TextInput style={styles.textInput} placeholder="7xxxxxxxx" placeholderTextColor="#9CA3AF" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" />
            </Field>
          </View>
        )}

        {/* ========== STEP 4 — الهوية البصرية ========== */}
        {step === 4 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="image" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>الهوية البصرية</Text>
            <Text style={styles.sectionSub}>أضف شعاراً ولافتة جذّابة لمتجرك</Text>

            <Text style={styles.fieldLabel}>شعار المتجر *</Text>
            <TouchableOpacity style={styles.imagePicker} activeOpacity={0.8} onPress={async () => { const uri = await pickImage([1, 1]); if (uri) setLogoUri(uri); }}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.logoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.imagePickerInner}>
                  <View style={styles.imagePickerIcon}><Ionicons name="camera-outline" size={28} color={COLORS.primary} /></View>
                  <Text style={styles.imagePickerText}>اختر شعار المتجر</Text>
                  <Text style={styles.imagePickerSub}>JPG أو PNG — يُفضّل مربع الشكل</Text>
                </View>
              )}
            </TouchableOpacity>
            {logoUri && <Text style={styles.changeHint}>اضغط الصورة لتغييرها</Text>}

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>لافتة المتجر (اختياري)</Text>
            <TouchableOpacity style={[styles.imagePicker, styles.imagePickerBanner]} activeOpacity={0.8} onPress={async () => { const uri = await pickImage([16, 9]); if (uri) setBannerUri(uri); }}>
              {bannerUri ? (
                <Image source={{ uri: bannerUri }} style={styles.bannerPreview} resizeMode="cover" />
              ) : (
                <View style={styles.imagePickerInner}>
                  <View style={styles.imagePickerIcon}><Ionicons name="image-outline" size={28} color="#6B7280" /></View>
                  <Text style={[styles.imagePickerText, { color: '#6B7280' }]}>اختر لافتة المتجر</Text>
                  <Text style={styles.imagePickerSub}>نسبة 16:9 — تظهر أعلى صفحة متجرك</Text>
                </View>
              )}
            </TouchableOpacity>
            {bannerUri && <Text style={styles.changeHint}>اضغط الصورة لتغييرها</Text>}
          </View>
        )}

        {/* ========== STEP 5 — الموقع والمحافظة ========== */}
        {step === 5 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="location" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>أين يقع متجرك؟</Text>
            <Text style={styles.sectionSub}>الموقع الدقيق يساعد على حساب رسوم التوصيل</Text>

            <Text style={styles.fieldLabel}>المدينة / المحافظة *</Text>
            <View style={styles.chipGrid}>
              {CITIES.map((c) => (
                <TouchableOpacity key={c} style={[styles.chip, city === c && styles.chipActive]} onPress={() => setCity(c)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field label="العنوان التفصيلي *" icon="navigate-outline">
              <TextInput style={styles.textInput} placeholder="الحي، الشارع، أقرب معلم" placeholderTextColor="#9CA3AF" value={address} onChangeText={setAddress} />
            </Field>

            <Text style={styles.fieldLabel}>تحديد الموقع على الخريطة</Text>
            <TouchableOpacity style={[styles.locationBtn, lat != null && styles.locationBtnDone]} onPress={captureLocation} disabled={locating} activeOpacity={0.8}>
              {locating ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : lat != null ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#059669" />
                  <Text style={styles.locationDoneText}>تم تحديد الموقع ({lat}, {lng})</Text>
                  <Text style={styles.locationChange}>إعادة التحديد</Text>
                </>
              ) : (
                <>
                  <Ionicons name="locate" size={20} color={COLORS.primary} />
                  <Text style={styles.locationText}>استخدام موقعي الحالي</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ========== STEP 6 — نطاق التوصيل ========== */}
        {step === 6 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="car" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>نطاق التوصيل</Text>
            <Text style={styles.sectionSub}>حدد نطاق استقبالك للطلبات</Text>

            <View style={{ marginTop: 10 }}>
              {DELIVERY_TYPES.map((type) => (
                <TouchableOpacity key={type.id} style={[styles.roleCard, deliveryType === type.id && styles.roleCardActive, { marginBottom: 15 }]} onPress={() => setDeliveryType(type.id)} activeOpacity={0.8}>
                  {deliveryType === type.id && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                  <Text style={[styles.roleTitle, deliveryType === type.id && styles.roleTitleActive, { textAlign: 'right' }]}>{type.title}</Text>
                  <Text style={[styles.roleDesc, deliveryType === type.id && styles.roleDescActive, { textAlign: 'right' }]}>{type.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ========== STEP 7 — المالك والوثائق ========== */}
        {step === 7 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="shield-checkmark" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>البيانات الرسمية لحفظ الحقوق</Text>
            <Text style={styles.sectionSub}>جميع البيانات مشفرة وآمنة تماماً</Text>

            <Field label="اسم مالك المتجر *" icon="person-outline">
              <TextInput style={styles.textInput} placeholder="الاسم الكامل" placeholderTextColor="#9CA3AF" value={ownerName} onChangeText={setOwnerName} />
            </Field>

            <Field label="رقم الهوية / البطاقة *" icon="card-outline">
              <TextInput style={styles.textInput} placeholder="رقم الهوية الوطنية" placeholderTextColor="#9CA3AF" value={nationalId} onChangeText={setNationalId} keyboardType="numeric" />
            </Field>

            <Field label="رقم السجل التجاري *" icon="document-outline">
              <TextInput style={styles.textInput} placeholder="مثال: 1010000000" placeholderTextColor="#9CA3AF" value={commercialRegister} onChangeText={setCommercialRegister} keyboardType="numeric" />
            </Field>

            <Field label="الرقم الضريبي (اختياري)" icon="receipt-outline">
              <TextInput style={styles.textInput} placeholder="الرقم الضريبي إن وُجد" placeholderTextColor="#9CA3AF" value={taxNumber} onChangeText={setTaxNumber} keyboardType="numeric" />
            </Field>
          </View>
        )}

        {/* ========== STEP 8 — البيانات البنكية ========== */}
        {step === 8 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="wallet" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>الحساب البنكي لاستلام الأرباح</Text>
            <Text style={styles.sectionSub}>سنقوم بتحويل أرباحك دورياً إلى هذا الحساب</Text>

            <Field label="اسم البنك / الجهة *" icon="business-outline">
              <TextInput style={[styles.textInput, { backgroundColor: '#F3F4F6' }]} placeholder="مثال: بنك الكريمي" placeholderTextColor="#9CA3AF" value={bankName} onChangeText={setBankName} editable={false} />
            </Field>

            <Field label="اسم صاحب الحساب *" icon="person-circle-outline">
              <TextInput style={styles.textInput} placeholder="الاسم كما يظهر في الحساب" placeholderTextColor="#9CA3AF" value={bankAccountName} onChangeText={setBankAccountName} />
            </Field>

            <Field label="رقم الحساب *" icon="card-outline">
              <TextInput style={styles.textInput} placeholder="رقم حسابك في بنك الكريمي" placeholderTextColor="#9CA3AF" value={iban} onChangeText={setIban} keyboardType="numeric" />
            </Field>
          </View>
        )}

        {/* ========== STEP 9 — المراجعة وتأكيد ========== */}
        {step === 9 && (
          <View style={styles.section}>
            <View style={styles.iconWrap}><Ionicons name="checkmark-done-circle" size={40} color={COLORS.primary} /></View>
            <Text style={styles.sectionTitle}>مراجعة البيانات</Text>
            <Text style={styles.sectionSub}>تأكّد من صحة بياناتك قبل الإرسال النهائي</Text>

            <ReviewBlock title="معلومات المتجر" onEdit={() => setStep(1)} rows={[
              ['اسم المتجر', storeName],
              ['الوصف', description || '—'],
              ['التصنيف', storeCategory],
            ]} />
            <ReviewBlock title="الموقع والتوصيل" onEdit={() => setStep(5)} rows={[
              ['المحافظة', city],
              ['العنوان', address],
              ['نطاق التوصيل', deliveryType === 'local' ? 'في المحافظة فقط' : 'كافة المحافظات'],
            ]} />
            <ReviewBlock title="المالك والوثائق" onEdit={() => setStep(7)} rows={[
              ['اسم المالك', ownerName],
              ['الهوية', nationalId],
              ['السجل التجاري', commercialRegister],
            ]} />
            <ReviewBlock title="البيانات المالية" onEdit={() => setStep(8)} rows={[
              ['البنك', bankName],
              ['اسم الحساب', bankAccountName],
              ['رقم الحساب', iban],
            ]} />

            <TouchableOpacity style={styles.termsRow} onPress={() => setAgreedToTerms((v) => !v)} activeOpacity={0.8}>
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxActive]}>
                {agreedToTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </View>
              <Text style={styles.termsText}>
                أوافق على <Text style={styles.termsLink}>الشروط والأحكام</Text> و <Text style={styles.termsLink}>سياسة الخصوصية</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.finalNote}>
              <Ionicons name="information-circle" size={20} color="#059669" />
              <Text style={styles.finalNoteText}>بعد الإرسال سيراجع فريقنا بياناتك خلال 24 ساعة ويصلك إشعار بالقبول</Text>
            </View>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        {step < TOTAL_STEPS ? (
          <TouchableOpacity style={styles.nextBtn} onPress={nextStep} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>التالي</Text>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.nextBtn, (saving || !agreedToTerms) && styles.btnDisabled]} onPress={submitProfile} disabled={saving || !agreedToTerms} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Text style={styles.nextBtnText}>إرسال وتفعيل المتجر</Text>
                <Ionicons name="rocket-outline" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <Ionicons name={icon as any} size={18} color="#9CA3AF" style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </View>
  );
}

function ReviewBlock({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewTitle}>{title}</Text>
        <TouchableOpacity onPress={onEdit} activeOpacity={0.7}>
          <Text style={styles.reviewEdit}>تعديل</Text>
        </TouchableOpacity>
      </View>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.reviewRow}>
          <Text style={styles.reviewKey}>{k}</Text>
          <Text style={styles.reviewVal} numberOfLines={1}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 40, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  headerSub: { fontSize: 16, color: '#111827', fontWeight: '800', marginTop: 2 },

  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20, paddingHorizontal: 30 },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F3F4F6', borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepDotDone: { backgroundColor: '#059669', borderColor: '#059669' },
  stepNum: { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  stepNumActive: { color: '#fff' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginHorizontal: 3 },
  stepLineDone: { backgroundColor: '#059669' },

  scroll: { padding: 24, paddingBottom: 40 },
  section: {},
  iconWrap: { width: 72, height: 72, borderRadius: 24, backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 6 },
  sectionSub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 28 },
  subSectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 14 },

  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
  fieldBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, minHeight: 52 },
  textInput: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 12 },
  textArea: { minHeight: 90, textAlignVertical: 'top', paddingTop: 10 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

  locationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: `${COLORS.primary}08`, borderWidth: 1.5, borderColor: `${COLORS.primary}40`, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 14 },
  locationBtnDone: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC', borderStyle: 'solid' },
  locationText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  locationDoneText: { fontSize: 13, fontWeight: '700', color: '#059669', flex: 1, textAlign: 'center' },
  locationChange: { fontSize: 11.5, fontWeight: '700', color: '#9CA3AF' },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EFF6FF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 22 },
  infoText: { flex: 1, fontSize: 12.5, color: '#1D4ED8', lineHeight: 18 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 18 },

  imagePicker: { height: 150, borderRadius: 16, borderWidth: 2, borderColor: `${COLORS.primary}40`, borderStyle: 'dashed', backgroundColor: `${COLORS.primary}06`, alignItems: 'center', justifyContent: 'center', marginBottom: 6, overflow: 'hidden' },
  imagePickerBanner: { height: 120, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  imagePickerInner: { alignItems: 'center', gap: 6 },
  imagePickerIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  imagePickerText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  imagePickerSub: { fontSize: 11, color: '#9CA3AF' },
  logoPreview: { width: '100%', height: '100%' },
  bannerPreview: { width: '100%', height: '100%' },
  changeHint: { fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', marginBottom: 16 },

  reviewCard: { backgroundColor: '#F9FAFB', borderRadius: 16, borderWidth: 1.5, borderColor: '#F3F4F6', padding: 16, marginBottom: 14 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  reviewTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827' },
  reviewEdit: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 12 },
  reviewKey: { fontSize: 12.5, color: '#6B7280', fontWeight: '600' },
  reviewVal: { fontSize: 12.5, color: '#111827', fontWeight: '700', flex: 1, textAlign: 'left' },

  finalNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FDF4', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#BBF7D0', marginTop: 8 },
  finalNoteText: { flex: 1, fontSize: 13, color: '#15803D', lineHeight: 20 },

  termsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, marginTop: 16, paddingHorizontal: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', marginRight: 10 },
  checkboxActive: { backgroundColor: '#111827', borderColor: '#111827' },
  termsText: { flex: 1, fontSize: 13, color: '#6B7280', fontWeight: '500' },
  termsLink: { color: '#111827', fontWeight: '700' },

  bottomBar: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff' },
  nextBtn: { height: 54, backgroundColor: COLORS.primary, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  btnDisabled: { opacity: 0.6 },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  // بطاقات اختيار نطاق التوصيل
  roleCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: '#E5E7EB' },
  roleCardActive: { backgroundColor: `${COLORS.primary}0D`, borderColor: COLORS.primary },
  checkBadge: { position: 'absolute', top: 14, left: 14, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  roleTitle: { fontSize: 15.5, fontWeight: '800', color: '#111827', marginBottom: 6 },
  roleTitleActive: { color: COLORS.primary },
  roleDesc: { fontSize: 12.5, fontWeight: '600', color: '#6B7280', lineHeight: 19 },
  roleDescActive: { color: COLORS.primaryLight },
});
