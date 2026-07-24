import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  useAuthStore, createMerchantProfile, uploadImageToStorage, getServiceAreas, ServiceArea,
} from '@marketplace/shared-hooks';

// ─── Design System ─────────────────────────────────────────
const UI = {
  primary:   '#111827',
  bg:        '#F3F4F6',
  white:     '#FFFFFF',
  textDark:  '#111827',
  textGrey:  '#4B5563',
  textMuted: '#9CA3AF',
  border:    '#E5E7EB',
  green:     '#059669',
  greenBg:   '#F0FDF4',
  blueBg:    '#EFF6FF',
  blueText:  '#1D4ED8',
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
  elevation: 4,
};

// ─── Constants ─────────────────────────────────────────────
const STORE_CATEGORIES = [
  'إلكترونيات وتقنية', 'أزياء وملابس', 'مطاعم وطعام', 'عطور ومستحضرات',
  'منزل ومطبخ', 'رياضة ولياقة', 'صحة وصيدلية', 'كتب ومستلزمات', 'خدمات', 'أخرى',
];
const CITIES = ['صنعاء', 'عدن', 'تعز', 'إب', 'الحديدة', 'مأرب', 'حضرموت', 'أخرى'];
const DELIVERY_TYPES = [
  { id: 'local',    title: 'داخل المحافظة فقط', desc: 'توصيل الطلبات ضمن مدينتك الحالية.' },
  { id: 'national', title: 'كافة المحافظات',     desc: 'شحن لجميع المدن والمحافظات.' },
];
const TOTAL_STEPS = 9;

const STEP_META = [
  { label: 'معلومات المتجر',   icon: 'storefront-outline'       },
  { label: 'التصنيف',          icon: 'apps-outline'              },
  { label: 'التواصل',          icon: 'call-outline'              },
  { label: 'الهوية البصرية',   icon: 'image-outline'             },
  { label: 'الموقع',           icon: 'location-outline'          },
  { label: 'نطاق التوصيل',     icon: 'car-outline'               },
  { label: 'الوثائق الرسمية',  icon: 'shield-checkmark-outline'  },
  { label: 'البيانات البنكية', icon: 'wallet-outline'            },
  { label: 'المراجعة',         icon: 'checkmark-done-outline'    },
];

// ─── Sub-components ────────────────────────────────────────
function Field({ label, icon, children, hint }: { label: string; icon: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.fieldBox}>
        <Ionicons name={icon as any} size={18} color={UI.textMuted} style={{ marginLeft: 12 }} />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
      {hint && <Text style={s.fieldHint}>{hint}</Text>}
    </View>
  );
}

function ReviewBlock({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <View style={s.reviewCard}>
      <View style={s.reviewHeader}>
        <Text style={s.reviewTitle}>{title}</Text>
        <TouchableOpacity onPress={onEdit} activeOpacity={0.7} style={s.reviewEditBtn}>
          <Ionicons name="create-outline" size={14} color={UI.primary} />
          <Text style={s.reviewEditText}>تعديل</Text>
        </TouchableOpacity>
      </View>
      {rows.map(([k, v]) => (
        <View key={k} style={s.reviewRow}>
          <Text style={s.reviewKey}>{k}</Text>
          <Text style={s.reviewVal} numberOfLines={1}>{v || '—'}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────
interface Props { onComplete: () => void; }

export default function MerchantOnboardingScreen({ onComplete }: Props) {
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768;
  const pageGutter = width < 430 ? 16 : isTablet ? 28 : 20;

  // Form State
  const [storeName,          setStoreName]          = useState('');
  const [description,        setDescription]        = useState('');
  const [storeCategory,      setStoreCategory]      = useState('');
  const [storePhone,         setStorePhone]         = useState('');
  const [whatsapp,           setWhatsapp]           = useState('');
  const [logoUri,            setLogoUri]            = useState<string | null>(null);
  const [bannerUri,          setBannerUri]          = useState<string | null>(null);
  const [city,               setCity]               = useState('');
  const [address,            setAddress]            = useState('');
  const [lat,                setLat]                = useState<number | null>(null);
  const [lng,                setLng]                = useState<number | null>(null);
  const [locating,           setLocating]           = useState(false);
  const [deliveryType,       setDeliveryType]       = useState('local');
  const [areas,              setAreas]              = useState<ServiceArea[]>([]);
  const [selectedAreas,      setSelectedAreas]      = useState<string[]>([]);
  const [ownerName,          setOwnerName]          = useState('');
  const [nationalId,         setNationalId]         = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [taxNumber,          setTaxNumber]          = useState('');
  const [bankAccountName,    setBankAccountName]    = useState('');
  const [bankName,           setBankName]           = useState('بنك الكريمي');
  const [iban,               setIban]               = useState('');
  const [agreedToTerms,      setAgreedToTerms]      = useState(false);
  const [step,               setStep]               = useState(1);
  const [saving,             setSaving]             = useState(false);

  useEffect(() => { getServiceAreas().then(setAreas).catch(() => {}); }, []);

  const pickImage = async (aspect: [number, number]): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('تنبيه', 'يجب السماح بالوصول إلى معرض الصور'); return null; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.8 });
    if (result.canceled) return null;
    return result.assets[0].uri;
  };

  const captureLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('تنبيه', 'يجب السماح بالوصول إلى الموقع'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(Number(pos.coords.latitude.toFixed(6)));
      setLng(Number(pos.coords.longitude.toFixed(6)));
    } catch { Alert.alert('خطأ', 'تعذّر تحديد الموقع، أدخل العنوان يدوياً'); }
    finally { setLocating(false); }
  };

  const nextStep = () => {
    if (step === 1 && !storeName.trim()) return Alert.alert('تنبيه', 'اسم المتجر مطلوب');
    if (step === 2 && !storeCategory)   return Alert.alert('تنبيه', 'اختر تصنيف المتجر');
    if (step === 3 && !storePhone.trim()) return Alert.alert('تنبيه', 'رقم تواصل المتجر مطلوب');
    if (step === 4 && !logoUri)         return Alert.alert('تنبيه', 'شعار المتجر مطلوب');
    if (step === 5 && !city)            return Alert.alert('تنبيه', 'اختر المحافظة');
    if (step === 5 && !address.trim())  return Alert.alert('تنبيه', 'العنوان التفصيلي مطلوب');
    if (step === 7 && !ownerName.trim())          return Alert.alert('تنبيه', 'اسم صاحب المتجر مطلوب');
    if (step === 7 && !nationalId.trim())         return Alert.alert('تنبيه', 'رقم الهوية مطلوب');
    if (step === 7 && !commercialRegister.trim()) return Alert.alert('تنبيه', 'رقم السجل التجاري مطلوب');
    if (step === 8 && !bankAccountName.trim())    return Alert.alert('تنبيه', 'اسم صاحب الحساب مطلوب');
    if (step === 8 && !iban.trim())               return Alert.alert('تنبيه', 'رقم الحساب مطلوب');
    setStep((s) => s + 1);
  };

  const submitProfile = async () => {
    if (!agreedToTerms) { Alert.alert('تنبيه', 'يجب الموافقة على الشروط والأحكام'); return; }
    if (!user?.id) return;
    setSaving(true);
    
    // helper to timeout promises
    const withTimeout = (promise: Promise<any>, ms: number, label: string) => {
      let timeoutId: any;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
    };

    try {
      const slug = storeName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^؀-ۿa-z0-9-]/g, '') + '-' + Math.random().toString(36).substr(2, 5);
      let logoUrl: string | undefined;
      let bannerUrl: string | undefined;
      
      if (logoUri) {
        logoUrl = await withTimeout(uploadImageToStorage('stores', `logos/${user.id}`, logoUri), 15000, 'Upload Logo');
      }
      if (bannerUri) {
        bannerUrl = await withTimeout(uploadImageToStorage('stores', `banners/${user.id}`, bannerUri), 15000, 'Upload Banner');
      }
      
      const encodedDesc = JSON.stringify({ desc: description.trim(), deliveryType });
      
      await withTimeout(createMerchantProfile({
        user_id: user.id, store_name: storeName.trim(), store_slug: slug,
        store_description: encodedDesc, store_category: storeCategory,
        city, address: address.trim() || undefined,
        latitude: lat ?? undefined, longitude: lng ?? undefined,
        service_area_ids: selectedAreas.length ? selectedAreas : undefined,
        owner_name: ownerName.trim() || undefined, national_id: nationalId.trim() || undefined,
        commercial_register: commercialRegister.trim() || undefined, tax_number: taxNumber.trim() || undefined,
        store_phone: storePhone.trim() || undefined, whatsapp: whatsapp.trim() || undefined,
        bank_name: bankName.trim() || undefined, bank_account: iban.trim() || undefined,
        bank_account_name: bankAccountName.trim() || undefined,
        store_logo_url: logoUrl, store_banner_url: bannerUrl,
      }), 15000, 'Create Profile');

      Alert.alert('تم التسجيل', 'تم إرسال بيانات متجرك بنجاح.', [{ text: 'حسناً', onPress: onComplete }]);
    } catch (e: any) {
      Alert.alert('خطأ مفصل', e?.message ?? JSON.stringify(e) ?? 'فشل غير معروف');
    } finally { 
      setSaving(false); 
    }
  };

  // ─── Render ───────────────────────────────────────────────
  const currentMeta = STEP_META[step - 1];

  const stepContent = (
    <ScrollView
      contentContainerStyle={[
        s.scrollContent,
        { paddingHorizontal: pageGutter },
        isTablet && s.scrollContentWide,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >

      {/* Step Header */}
      <View style={s.stepHeaderBox}>
        <View style={s.stepIconBox}>
          <Ionicons name={currentMeta.icon as any} size={28} color={UI.primary} />
        </View>
        <Text style={s.stepTitle}>{currentMeta.label}</Text>
        <Text style={s.stepCount}>الخطوة {step} من {TOTAL_STEPS}</Text>
      </View>

      {/* ── Step 1 ── معلومات المتجر */}
      {step === 1 && (
        <View>
          <Field label="الاسم التجاري للمتجر" icon="storefront-outline">
            <TextInput style={s.input} placeholder="مثال: متجر الأناقة" placeholderTextColor={UI.textMuted} value={storeName} onChangeText={setStoreName} textAlign="right" />
          </Field>
          <Field label="وصف المتجر (اختياري)" icon="document-text-outline" hint="يظهر للعملاء في صفحة متجرك">
            <TextInput style={[s.input, s.textarea]} placeholder="نبذة مميزة عن متجرك..." placeholderTextColor={UI.textMuted} value={description} onChangeText={setDescription} multiline textAlign="right" textAlignVertical="top" />
          </Field>
        </View>
      )}

      {/* ── Step 2 ── تصنيف المتجر */}
      {step === 2 && (
        <View>
          <Text style={s.subLabel}>اختر التصنيف الأنسب لمنتجاتك</Text>
          <View style={s.chipGrid}>
            {STORE_CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat} style={[s.chip, storeCategory === cat && s.chipActive]} onPress={() => setStoreCategory(cat)} activeOpacity={0.7}>
                <Text style={[s.chipText, storeCategory === cat && s.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Step 3 ── معلومات التواصل */}
      {step === 3 && (
        <View>
          <Field label="رقم تواصل المتجر" icon="call-outline" hint="سيظهر للعملاء لإتمام الطلب">
            <TextInput style={s.input} placeholder="7XXXXXXXX" placeholderTextColor={UI.textMuted} value={storePhone} onChangeText={setStorePhone} keyboardType="phone-pad" textAlign="right" />
          </Field>
          <Field label="رقم واتساب (اختياري)" icon="logo-whatsapp">
            <TextInput style={s.input} placeholder="7XXXXXXXX" placeholderTextColor={UI.textMuted} value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" textAlign="right" />
          </Field>
        </View>
      )}

      {/* ── Step 4 ── الهوية البصرية */}
      {step === 4 && (
        <View>
          <Text style={s.subLabel}>شعار المتجر</Text>
          <TouchableOpacity style={s.imagePicker} activeOpacity={0.8} onPress={async () => { const uri = await pickImage([1, 1]); if (uri) setLogoUri(uri); }}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={s.imagePreview} resizeMode="cover" />
            ) : (
              <View style={s.imagePickerInner}>
                <View style={s.imagePickerIconBox}>
                  <Ionicons name="camera-outline" size={26} color={UI.primary} />
                </View>
                <Text style={s.imagePickerTitle}>رفع شعار المتجر</Text>
                <Text style={s.imagePickerSub}>JPG او PNG — مربع الشكل مفضل</Text>
              </View>
            )}
          </TouchableOpacity>
          {logoUri && <Text style={s.changeHint}>اضغط الصورة لتغييرها</Text>}

          <View style={s.divider} />

          <Text style={s.subLabel}>لافتة المتجر (اختياري)</Text>
          <TouchableOpacity style={[s.imagePicker, { borderColor: UI.border, borderStyle: 'solid' }]} activeOpacity={0.8} onPress={async () => { const uri = await pickImage([16, 9]); if (uri) setBannerUri(uri); }}>
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} style={s.imagePreview} resizeMode="cover" />
            ) : (
              <View style={s.imagePickerInner}>
                <View style={[s.imagePickerIconBox, { backgroundColor: UI.bg }]}>
                  <Ionicons name="image-outline" size={26} color={UI.textMuted} />
                </View>
                <Text style={[s.imagePickerTitle, { color: UI.textGrey }]}>رفع لافتة المتجر</Text>
                <Text style={s.imagePickerSub}>نسبة 16:9 — تظهر اعلى صفحة متجرك</Text>
              </View>
            )}
          </TouchableOpacity>
          {bannerUri && <Text style={s.changeHint}>اضغط الصورة لتغييرها</Text>}
        </View>
      )}

      {/* ── Step 5 ── الموقع والمحافظة */}
      {step === 5 && (
        <View>
          <Text style={s.subLabel}>المدينة / المحافظة</Text>
          <View style={s.chipGrid}>
            {CITIES.map((c) => (
              <TouchableOpacity key={c} style={[s.chip, city === c && s.chipActive]} onPress={() => setCity(c)} activeOpacity={0.7}>
                <Text style={[s.chipText, city === c && s.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="العنوان التفصيلي" icon="navigate-outline">
            <TextInput style={s.input} placeholder="الحي، الشارع، اقرب معلم" placeholderTextColor={UI.textMuted} value={address} onChangeText={setAddress} textAlign="right" />
          </Field>

          <Text style={s.subLabel}>الموقع الجغرافي</Text>
          <TouchableOpacity style={[s.locationBtn, lat != null && s.locationBtnDone]} onPress={captureLocation} disabled={locating} activeOpacity={0.8}>
            {locating ? (
              <ActivityIndicator color={UI.primary} size="small" />
            ) : lat != null ? (
              <>
                <Ionicons name="checkmark-circle" size={20} color={UI.green} />
                <Text style={s.locationDoneText}>تم تحديد الموقع بنجاح ({lat}, {lng})</Text>
              </>
            ) : (
              <>
                <Ionicons name="locate" size={20} color={UI.primary} />
                <Text style={s.locationText}>استخدام موقعي الحالي</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Step 6 ── نطاق التوصيل */}
      {step === 6 && (
        <View>
          <Text style={s.subLabel}>حدد نطاق استقبالك للطلبات</Text>
          {DELIVERY_TYPES.map((type) => (
            <TouchableOpacity key={type.id} style={[s.selectionCard, deliveryType === type.id && s.selectionCardActive]} onPress={() => setDeliveryType(type.id)} activeOpacity={0.8}>
              <View style={[s.selectionRadio, deliveryType === type.id && s.selectionRadioActive]}>
                {deliveryType === type.id && <View style={s.selectionRadioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.selectionTitle, deliveryType === type.id && { color: UI.primary }]}>{type.title}</Text>
                <Text style={s.selectionDesc}>{type.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Step 7 ── المالك والوثائق */}
      {step === 7 && (
        <View>
          <View style={s.infoBox}>
            <Ionicons name="lock-closed-outline" size={18} color={UI.blueText} />
            <Text style={s.infoText}>جميع البيانات مشفرة وآمنة تماماً ولا تُشارك مع أي طرف ثالث.</Text>
          </View>
          <Field label="اسم مالك المتجر" icon="person-outline">
            <TextInput style={s.input} placeholder="الاسم الكامل" placeholderTextColor={UI.textMuted} value={ownerName} onChangeText={setOwnerName} textAlign="right" />
          </Field>
          <Field label="رقم الهوية الوطنية" icon="card-outline">
            <TextInput style={s.input} placeholder="رقم الهوية" placeholderTextColor={UI.textMuted} value={nationalId} onChangeText={setNationalId} keyboardType="numeric" textAlign="right" />
          </Field>
          <Field label="رقم السجل التجاري" icon="document-outline">
            <TextInput style={s.input} placeholder="مثال: 1010000000" placeholderTextColor={UI.textMuted} value={commercialRegister} onChangeText={setCommercialRegister} keyboardType="numeric" textAlign="right" />
          </Field>
          <Field label="الرقم الضريبي (اختياري)" icon="receipt-outline">
            <TextInput style={s.input} placeholder="الرقم الضريبي ان وجد" placeholderTextColor={UI.textMuted} value={taxNumber} onChangeText={setTaxNumber} keyboardType="numeric" textAlign="right" />
          </Field>
        </View>
      )}

      {/* ── Step 8 ── البيانات البنكية */}
      {step === 8 && (
        <View>
          <View style={s.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={UI.blueText} />
            <Text style={s.infoText}>سنقوم بتحويل أرباحك دورياً إلى هذا الحساب. تأكد من دقة البيانات.</Text>
          </View>
          <Field label="اسم البنك" icon="business-outline">
            <TextInput style={[s.input, { color: UI.textMuted }]} value={bankName} onChangeText={setBankName} editable={false} textAlign="right" />
          </Field>
          <Field label="اسم صاحب الحساب" icon="person-circle-outline">
            <TextInput style={s.input} placeholder="الاسم كما يظهر في الحساب البنكي" placeholderTextColor={UI.textMuted} value={bankAccountName} onChangeText={setBankAccountName} textAlign="right" />
          </Field>
          <Field label="رقم الحساب البنكي" icon="card-outline">
            <TextInput style={s.input} placeholder="رقم حسابك في بنك الكريمي" placeholderTextColor={UI.textMuted} value={iban} onChangeText={setIban} keyboardType="numeric" textAlign="right" />
          </Field>
        </View>
      )}

      {/* ── Step 9 ── المراجعة */}
      {step === 9 && (
        <View>
          <ReviewBlock title="معلومات المتجر" onEdit={() => setStep(1)} rows={[
            ['اسم المتجر', storeName],
            ['الوصف', description],
            ['التصنيف', storeCategory],
          ]} />
          <ReviewBlock title="التواصل" onEdit={() => setStep(3)} rows={[
            ['الهاتف', storePhone],
            ['واتساب', whatsapp],
          ]} />
          <ReviewBlock title="الموقع والتوصيل" onEdit={() => setStep(5)} rows={[
            ['المحافظة', city],
            ['العنوان', address],
            ['نطاق التوصيل', deliveryType === 'local' ? 'داخل المحافظة' : 'كافة المحافظات'],
          ]} />
          <ReviewBlock title="الوثائق الرسمية" onEdit={() => setStep(7)} rows={[
            ['اسم المالك', ownerName],
            ['الهوية', nationalId],
            ['السجل التجاري', commercialRegister],
          ]} />
          <ReviewBlock title="البيانات البنكية" onEdit={() => setStep(8)} rows={[
            ['البنك', bankName],
            ['اسم الحساب', bankAccountName],
            ['رقم الحساب', iban],
          ]} />

          <TouchableOpacity style={s.termsRow} onPress={() => setAgreedToTerms((v) => !v)} activeOpacity={0.8}>
            <View style={[s.checkbox, agreedToTerms && s.checkboxActive]}>
              {agreedToTerms && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={s.termsText}>
              أوافق على{' '}
              <Text style={s.termsLink}>الشروط والأحكام</Text>
              {' '}و{' '}
              <Text style={s.termsLink}>سياسة الخصوصية</Text>
            </Text>
          </TouchableOpacity>

          <View style={s.finalNote}>
            <Ionicons name="time-outline" size={18} color={UI.green} />
            <Text style={s.finalNoteText}>بعد الإرسال سيراجع فريقنا بياناتك خلال 24 ساعة ويصلك إشعار بالقبول.</Text>
          </View>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );

  // ─── Desktop Layout ───────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={s.desktopRoot}>
        <StatusBar barStyle="dark-content" backgroundColor={UI.bg} />

        {/* Left Panel — Sidebar */}
        <View style={[s.sidebar, { width: Math.min(300, Math.max(244, width * 0.24)) }]}>
          <TouchableOpacity 
            onPress={() => useAuthStore.getState().signOut()} 
            style={{position: 'absolute', top: 20, right: 20, flexDirection: 'row-reverse', alignItems: 'center', gap: 6}}
          >
            <Text style={{color: '#FCA5A5', fontSize: 13, fontWeight: '700'}}>تسجيل خروج</Text>
            <Ionicons name="log-out-outline" size={18} color="#FCA5A5" />
          </TouchableOpacity>

          <View style={s.sidebarLogo}>
            <Ionicons name="storefront" size={28} color={UI.white} />
          </View>
          <Text style={s.sidebarMainTitle}>تسجيل متجر</Text>
          <Text style={s.sidebarSubTitle}>أكمل الخطوات لتفعيل متجرك</Text>

          <View style={s.sidebarSteps}>
            {STEP_META.map((m, i) => {
              const idx    = i + 1;
              const isDone = idx < step;
              const isAct  = idx === step;
              return (
                <View key={idx} style={s.sidebarStepRow}>
                  {/* connector line */}
                  {i < TOTAL_STEPS - 1 && <View style={[s.sidebarConnector, isDone && s.sidebarConnectorDone]} />}
                  <View style={[s.sidebarDot, isDone && s.sidebarDotDone, isAct && s.sidebarDotActive]}>
                    {isDone
                      ? <Ionicons name="checkmark" size={14} color={UI.white} />
                      : <Text style={[s.sidebarDotNum, isAct && { color: UI.white }]}>{idx}</Text>
                    }
                  </View>
                  <Text style={[s.sidebarStepLabel, isAct && s.sidebarStepLabelActive, isDone && { color: UI.green }]}>
                    {m.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Right Panel — Content */}
        <View style={s.desktopMain}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {stepContent}

            {/* Bottom Bar */}
            <View style={s.desktopBottomBar}>
              {step > 1 && (
                <TouchableOpacity style={s.backBtn} onPress={() => setStep((s) => s - 1)} activeOpacity={0.7}>
                  <Ionicons name="arrow-forward" size={18} color={UI.textDark} />
                  <Text style={s.backBtnText}>السابق</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              {step < TOTAL_STEPS ? (
                <TouchableOpacity style={s.nextBtn} onPress={nextStep} activeOpacity={0.85}>
                  <Text style={s.nextBtnText}>التالي</Text>
                  <Ionicons name="arrow-back" size={18} color={UI.white} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.nextBtn, (saving || !agreedToTerms) && s.btnDisabled]} onPress={submitProfile} disabled={saving || !agreedToTerms} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator color={UI.white} size="small" /> : (
                    <>
                      <Text style={s.nextBtnText}>ارسال وتفعيل المتجر</Text>
                      <Ionicons name="checkmark-circle" size={18} color={UI.white} />
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    );
  }

  // ─── Mobile Layout ────────────────────────────────────────
  return (
    <View style={s.mobileRoot}>
      <StatusBar barStyle="dark-content" backgroundColor={UI.white} />

      {/* Mobile Header */}
      <View style={[s.mobileHeader, { paddingHorizontal: pageGutter }]}>
        {step > 1 ? (
          <TouchableOpacity style={s.mobileBackBtn} onPress={() => setStep((s) => s - 1)} activeOpacity={0.7}>
            <Ionicons name="arrow-forward" size={22} color={UI.textDark} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.mobileBackBtn, { backgroundColor: '#FEF2F2' }]} onPress={() => useAuthStore.getState().signOut()} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={22} color="#DC2626" />
          </TouchableOpacity>
        )}
        <View style={s.mobileHeaderCenter}>
          <Text style={s.mobileHeaderLabel}>تسجيل متجر جديد</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress Bar */}
      <View style={s.progressBarBg}>
        <View style={[s.progressBarFill, { width: `${(step / TOTAL_STEPS) * 100}%` as any }]} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {stepContent}

        {/* Mobile Bottom Bar */}
        <View style={[s.mobileBottomBar, { paddingHorizontal: pageGutter }]}>
          {step < TOTAL_STEPS ? (
            <TouchableOpacity style={s.nextBtn} onPress={nextStep} activeOpacity={0.85}>
              <Text style={s.nextBtnText}>التالي</Text>
              <Ionicons name="arrow-back" size={18} color={UI.white} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.nextBtn, (saving || !agreedToTerms) && s.btnDisabled]} onPress={submitProfile} disabled={saving || !agreedToTerms} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={UI.white} size="small" /> : (
                <>
                  <Text style={s.nextBtnText}>ارسال وتفعيل المتجر</Text>
                  <Ionicons name="checkmark-circle" size={18} color={UI.white} />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  // Desktop Root
  desktopRoot: { flex: 1, flexDirection: 'row-reverse', backgroundColor: UI.bg },
  sidebar: {
    width: 280, backgroundColor: UI.primary, paddingTop: 56, paddingBottom: 40,
    paddingHorizontal: 28, alignItems: 'flex-start',
  },
  sidebarLogo: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
  },
  sidebarMainTitle: { fontSize: 22, fontWeight: '900', color: UI.white, marginBottom: 6 },
  sidebarSubTitle:  { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 40 },
  sidebarSteps: { width: '100%' },
  sidebarStepRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 20, position: 'relative' },
  sidebarConnector: { position: 'absolute', right: 15, top: 28, width: 2, height: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  sidebarConnectorDone: { backgroundColor: UI.green },
  sidebarDot: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', marginLeft: 14,
  },
  sidebarDotActive: { backgroundColor: UI.white, borderColor: UI.white },
  sidebarDotDone:   { backgroundColor: UI.green, borderColor: UI.green },
  sidebarDotNum:    { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  sidebarStepLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', flex: 1, textAlign: 'right' },
  sidebarStepLabelActive: { color: UI.white, fontWeight: '800' },

  desktopMain: { flex: 1, minWidth: 0 },
  desktopBottomBar: {
    flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 40,
    paddingVertical: 20, borderTopWidth: 1, borderTopColor: UI.border, backgroundColor: UI.white,
  },

  // Mobile Root
  mobileRoot:       { flex: 1, backgroundColor: UI.white },
  mobileHeader:     {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 40, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: UI.border,
    width: '100%', maxWidth: 860, alignSelf: 'center',
  },
  mobileBackBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  mobileHeaderCenter: { flex: 1, alignItems: 'center' },
  mobileHeaderLabel: { fontSize: 16, fontWeight: '800', color: UI.textDark },
  progressBarBg:    { height: 3, backgroundColor: UI.bg },
  progressBarFill:  { height: 3, backgroundColor: UI.primary, borderRadius: 2 },
  mobileBottomBar:  {
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: UI.border, backgroundColor: UI.white,
    width: '100%', maxWidth: 860, alignSelf: 'center',
  },

  // Shared Content
  scrollContent: { padding: 32, paddingBottom: 20 },
  scrollContentWide: { width: '100%', maxWidth: 860, alignSelf: 'center' },
  stepHeaderBox: { marginBottom: 32 },
  stepIconBox: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: '#F0F2F5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  stepTitle: { fontSize: 24, fontWeight: '900', color: UI.textDark, marginBottom: 4 },
  stepCount: { fontSize: 13, color: UI.textMuted, fontWeight: '600' },

  // Form
  fieldGroup: { marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: UI.textGrey, marginBottom: 8, textAlign: 'right' },
  fieldBox:   { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: UI.border, paddingHorizontal: 14, minHeight: 52 },
  fieldHint:  { fontSize: 12, color: UI.textMuted, marginTop: 6, textAlign: 'right' },
  input:      { flex: 1, fontSize: 14, color: UI.textDark, paddingVertical: 12, fontWeight: '600' },
  textarea:   { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 },
  subLabel:   { fontSize: 14, fontWeight: '700', color: UI.textGrey, marginBottom: 14, textAlign: 'right' },

  chipGrid:     { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip:         { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: UI.border },
  chipActive:   { backgroundColor: UI.primary, borderColor: UI.primary },
  chipText:     { fontSize: 13, fontWeight: '600', color: UI.textGrey },
  chipTextActive: { color: UI.white },

  imagePicker: {
    height: 160, borderRadius: 16, borderWidth: 2, borderColor: '#D1D5DB',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', backgroundColor: '#F9FAFB', marginBottom: 8,
  },
  imagePickerInner:   { alignItems: 'center', gap: 8 },
  imagePickerIconBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', ...softShadow },
  imagePickerTitle:   { fontSize: 14, fontWeight: '700', color: UI.primary },
  imagePickerSub:     { fontSize: 12, color: UI.textMuted },
  imagePreview:       { width: '100%', height: '100%' },
  changeHint:         { fontSize: 12, color: UI.textMuted, textAlign: 'center', marginBottom: 16 },
  divider:            { height: 1, backgroundColor: UI.border, marginVertical: 24 },

  locationBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: UI.border,
    borderStyle: 'dashed', borderRadius: 12, paddingVertical: 18, paddingHorizontal: 16,
  },
  locationBtnDone: { backgroundColor: UI.greenBg, borderColor: '#86EFAC', borderStyle: 'solid' },
  locationText:     { fontSize: 14, fontWeight: '700', color: UI.primary },
  locationDoneText: { fontSize: 13, fontWeight: '700', color: UI.green, flex: 1, textAlign: 'center' },

  selectionCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 16,
    backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5,
    borderColor: UI.border, padding: 18, marginBottom: 14,
  },
  selectionCardActive: { backgroundColor: '#F0F2F5', borderColor: UI.primary },
  selectionRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: UI.border, alignItems: 'center', justifyContent: 'center',
  },
  selectionRadioActive: { borderColor: UI.primary },
  selectionRadioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: UI.primary },
  selectionTitle: { fontSize: 15, fontWeight: '800', color: UI.textDark, marginBottom: 4, textAlign: 'right' },
  selectionDesc:  { fontSize: 13, color: UI.textGrey, textAlign: 'right' },

  infoBox:  { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, backgroundColor: UI.blueBg, padding: 16, borderRadius: 12, marginBottom: 24 },
  infoText: { flex: 1, fontSize: 13, color: UI.blueText, textAlign: 'right', lineHeight: 20, fontWeight: '600' },

  reviewCard:     { backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5, borderColor: UI.border, padding: 16, marginBottom: 14 },
  reviewHeader:   { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  reviewTitle:    { fontSize: 15, fontWeight: '800', color: UI.textDark },
  reviewEditBtn:  { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  reviewEditText: { fontSize: 13, fontWeight: '700', color: UI.primary },
  reviewRow:      { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 5 },
  reviewKey:      { fontSize: 13, color: UI.textMuted, fontWeight: '600' },
  reviewVal:      { fontSize: 13, color: UI.textDark, fontWeight: '700', flex: 1, textAlign: 'left' },

  termsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 20, marginTop: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: UI.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  checkboxActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  termsText: { flex: 1, fontSize: 13, color: UI.textGrey, textAlign: 'right' },
  termsLink: { color: UI.textDark, fontWeight: '700' },

  finalNote:     { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, backgroundColor: UI.greenBg, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#BBF7D0' },
  finalNoteText: { flex: 1, fontSize: 13, color: '#15803D', textAlign: 'right', lineHeight: 20, fontWeight: '600' },

  nextBtn: {
    height: 52, backgroundColor: UI.primary, borderRadius: 14,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 28, ...softShadow,
  },
  btnDisabled:  { opacity: 0.5 },
  nextBtnText:  { fontSize: 15, fontWeight: '800', color: UI.white },

  backBtn: {
    height: 52, borderRadius: 14, flexDirection: 'row-reverse', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingHorizontal: 20,
    borderWidth: 1, borderColor: UI.border, backgroundColor: UI.white,
  },
  backBtnText: { fontSize: 15, fontWeight: '700', color: UI.textDark },
});
