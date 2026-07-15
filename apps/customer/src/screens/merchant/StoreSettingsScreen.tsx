import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  Platform, Switch, ActivityIndicator, useWindowDimensions, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, getMerchantProfile, updateMerchantProfileByUser } from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';

// ─── Design System ──────────────────────────────────────────────────────────
const UI = {
  primary:   '#111827',
  bg:        '#F3F4F6',
  bgMobile:  '#F9FAFB',
  white:     '#FFFFFF',
  textDark:  '#111827',
  textGrey:  '#4B5563',
  textMuted: '#9CA3AF',
  border:    '#E5E7EB',
  green:     '#10B981',
  red:       '#EF4444',
  blue:      '#3B82F6',
};

const softShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 16,
  elevation: 3,
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

function SectionHeader({ title, icon }: { title: string; icon: any }) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={18} color={UI.primary} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function InputField({ label, value, onChangeText, multiline = false, placeholder = '', editable = true, keyboardType = 'default' as any }: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: any;
}) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
      <TextInput
        style={[
          s.inputBox,
          multiline && s.inputArea,
          !editable && s.inputReadOnly,
        ]}
        value={value ?? ''}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={UI.textMuted}
        editable={editable}
        keyboardType={keyboardType}
        textAlign="right"
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function StoreSettingsScreen({ navigation }: any) {
  const user     = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Basic
  const [storeName,    setStoreName]    = useState('');
  const [storeCategory, setStoreCategory] = useState('');
  const [description,  setDescription]  = useState('');
  const [isOpen,       setIsOpen]       = useState(true);

  // Location & Contact
  const [city,        setCity]        = useState('');
  const [address,     setAddress]     = useState('');
  const [storePhone,  setStorePhone]  = useState('');
  const [whatsapp,    setWhatsapp]    = useState('');

  // Legal
  const [ownerName,          setOwnerName]          = useState('');
  const [nationalId,         setNationalId]         = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [taxNumber,          setTaxNumber]          = useState('');

  // Banking
  const [bankName,        setBankName]        = useState('');
  const [bankAccount,     setBankAccount]     = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    getMerchantProfile(user.id).then((p) => {
      if (p) {
        setStoreName(p.store_name ?? '');
        setStoreCategory(p.store_category ?? '');
        // strip JSON wrapper if description was stored encoded
        try {
          const parsed = JSON.parse(p.store_description ?? '{}');
          setDescription(parsed.desc ?? p.store_description ?? '');
        } catch { setDescription(p.store_description ?? ''); }
        setIsOpen(p.is_open !== false);
        setCity(p.city ?? '');
        setAddress(p.address ?? '');
        setStorePhone(p.store_phone ?? '');
        setWhatsapp(p.whatsapp ?? '');
        setOwnerName(p.owner_name ?? '');
        setNationalId(p.national_id ?? '');
        setCommercialRegister(p.commercial_register ?? '');
        setTaxNumber(p.tax_number ?? '');
        setBankName(p.bank_name ?? '');
        setBankAccount(p.bank_account ?? '');
        setBankAccountName(p.bank_account_name ?? '');
      }
    }).catch((error: unknown) => setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل إعدادات المتجر.')).finally(() => setLoading(false));
  }, [user?.id, loadAttempt]);

  const handleSave = async () => {
    if (!storeName.trim()) { Alert.alert('تنبيه', 'اسم المتجر مطلوب'); return; }
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateMerchantProfileByUser(user.id, {
        is_open:             isOpen,
        store_name:          storeName.trim(),
        store_category:      storeCategory.trim() || undefined,
        store_description:   description.trim()   || undefined,
        city:                city.trim()           || undefined,
        address:             address.trim()        || undefined,
        store_phone:         storePhone.trim()     || undefined,
        whatsapp:            whatsapp.trim()        || undefined,
        owner_name:          ownerName.trim()       || undefined,
        national_id:         nationalId.trim()      || undefined,
        commercial_register: commercialRegister.trim() || undefined,
        tax_number:          taxNumber.trim()       || undefined,
        bank_name:           bankName.trim()        || undefined,
        bank_account:        bankAccount.trim()     || undefined,
        bank_account_name:   bankAccountName.trim() || undefined,
      });
      Alert.alert('تم الحفظ', 'تم تحديث كافة بيانات المتجر بنجاح.');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر الحفظ');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDesktop ? UI.bg : UI.bgMobile }}>
        <ActivityIndicator size="large" color={UI.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: isDesktop ? UI.bg : UI.bgMobile }} accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={44} color={UI.red} />
        <Text style={{ color: UI.red, textAlign: 'center', lineHeight: 21 }}>{loadError}</Text>
        <TouchableOpacity style={{ backgroundColor: UI.primary, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 10 }} onPress={() => setLoadAttempt((value) => value + 1)} accessibilityRole="button">
          <Text style={{ color: UI.white, fontWeight: '800' }}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.container, isDesktop && { backgroundColor: UI.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? UI.bg : UI.bgMobile} />

      {/* Mobile Header */}
      {!isDesktop && (
        <View style={s.headerMobile}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={UI.textDark} />
          </TouchableOpacity>
          <Text style={s.headerTitleMobile}>معلومات المتجر</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[s.scrollContent, isDesktop && s.scrollContentDesktop]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Desktop Title */}
        {isDesktop && (
          <View style={s.pageHeaderRow}>
            <Text style={s.pageTitle}>لوحة بيانات المتجر</Text>
            <Text style={s.pageSubtitle}>جميع البيانات الحقيقية لمتجرك مجمعة في مكان واحد</Text>
          </View>
        )}

        <View style={[s.grid, isDesktop && { flexDirection: 'row-reverse', alignItems: 'flex-start' }]}>

          {/* ── العمود الرئيسي ─────────────────────────────────── */}
          <View style={[s.mainCol, isDesktop && { flex: 3 }]}>

            {/* حالة المتجر */}
            <Card style={[s.statusCard, { borderColor: isOpen ? UI.green : UI.red }]}>
              <View style={s.statusCardLeft}>
                <View style={[s.statusIconBox, { backgroundColor: isOpen ? '#D1FAE5' : '#FEE2E2' }]}>
                  <Ionicons name={isOpen ? 'storefront' : 'lock-closed'} size={26} color={isOpen ? UI.green : UI.red} />
                </View>
                <View>
                  <Text style={s.statusTitle}>حالة المتجر</Text>
                  <Text style={[s.statusSub, { color: isOpen ? UI.green : UI.red }]}>
                    {isOpen ? 'مفتوح — يستقبل الطلبات' : 'مغلق مؤقتاً'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isOpen}
                onValueChange={setIsOpen}
                trackColor={{ false: '#FECACA', true: '#A7F3D0' }}
                thumbColor={isOpen ? '#059669' : '#EF4444'}
              />
            </Card>

            {/* البيانات الأساسية */}
            <Card>
              <SectionHeader title="البيانات الأساسية" icon="business-outline" />
              <View style={s.formGrid}>
                <InputField label="الاسم التجاري للمتجر" value={storeName} onChangeText={setStoreName} placeholder="اسم المتجر" />
                <InputField label="تصنيف المتجر" value={storeCategory} onChangeText={setStoreCategory} placeholder="مثال: مطاعم وطعام" />
              </View>
              <InputField label="وصف المتجر (يظهر للعملاء)" value={description} onChangeText={setDescription} multiline placeholder="نبذة تعريفية عن متجرك..." />
            </Card>

            {/* الوثائق القانونية */}
            <Card>
              <SectionHeader title="البيانات القانونية والرسمية" icon="document-text-outline" />
              <View style={s.infoBox}>
                <Ionicons name="lock-closed-outline" size={16} color="#1D4ED8" />
                <Text style={s.infoText}>لتعديل الوثائق الرسمية يرجى التواصل مع فريق الدعم المتقدم.</Text>
              </View>
              <View style={s.formGrid}>
                <InputField label="اسم صاحب المتجر" value={ownerName} onChangeText={setOwnerName} placeholder="الاسم الكامل" />
                <InputField label="رقم الهوية الوطنية" value={nationalId} onChangeText={setNationalId} placeholder="رقم الهوية" keyboardType="numeric" />
              </View>
              <View style={s.formGrid}>
                <InputField label="رقم السجل التجاري" value={commercialRegister} onChangeText={setCommercialRegister} placeholder="رقم السجل" keyboardType="numeric" />
                <InputField label="الرقم الضريبي (VAT)" value={taxNumber} onChangeText={setTaxNumber} placeholder="اختياري" keyboardType="numeric" />
              </View>
            </Card>

          </View>

          {/* ── العمود الجانبي ─────────────────────────────────── */}
          <View style={[s.sideCol, isDesktop && { flex: 2 }]}>

            {/* الموقع والتواصل */}
            <Card>
              <SectionHeader title="الموقع والتواصل" icon="location-outline" />
              <View style={s.formGrid}>
                <InputField label="المدينة / المحافظة" value={city} onChangeText={setCity} placeholder="مثال: صنعاء" />
                <InputField label="رقم هاتف المتجر" value={storePhone} onChangeText={setStorePhone} placeholder="7XXXXXXXX" keyboardType="phone-pad" />
              </View>
              <InputField label="العنوان التفصيلي" value={address} onChangeText={setAddress} placeholder="الحي، الشارع، اقرب معلم" />
              <InputField label="رقم واتساب (اختياري)" value={whatsapp} onChangeText={setWhatsapp} placeholder="7XXXXXXXX" keyboardType="phone-pad" />
            </Card>

            {/* البيانات البنكية */}
            <Card>
              <SectionHeader title="البيانات البنكية لاستلام الأرباح" icon="wallet-outline" />
              <InputField label="اسم البنك" value={bankName} onChangeText={setBankName} placeholder="مثال: بنك الكريمي" />
              <View style={s.formGrid}>
                <InputField label="اسم صاحب الحساب" value={bankAccountName} onChangeText={setBankAccountName} placeholder="الاسم في الحساب" />
                <InputField label="رقم الحساب" value={bankAccount} onChangeText={setBankAccount} placeholder="رقم الحساب" keyboardType="numeric" />
              </View>
              <View style={s.bankNote}>
                <Ionicons name="information-circle-outline" size={16} color={UI.blue} />
                <Text style={s.bankNoteText}>تحويل الأرباح يتم دورياً لهذا الحساب بعد اكتمال الطلبات.</Text>
              </View>
            </Card>

          </View>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={[s.footer, isDesktop && s.footerDesktop]}>
        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={s.saveBtnText}>حفظ كافة التغييرات</Text>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: UI.bgMobile },

  headerMobile: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: UI.border, backgroundColor: UI.white,
  },
  backBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitleMobile: { fontSize: 18, fontWeight: '800', color: UI.textDark },

  scrollContent:        { padding: 20, paddingBottom: 120 },
  scrollContentDesktop: { padding: 40, paddingBottom: 100 },

  pageHeaderRow: { marginBottom: 28 },
  pageTitle:     { fontSize: 26, fontWeight: '900', color: UI.textDark, marginBottom: 6, textAlign: 'right', letterSpacing: -0.5 },
  pageSubtitle:  { fontSize: 14, color: UI.textGrey, textAlign: 'right' },

  grid:    { gap: 20 },
  mainCol: { gap: 20 },
  sideCol: { gap: 20 },

  card: { backgroundColor: UI.white, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: UI.border, ...softShadow },

  statusCard:    { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderWidth: 2 },
  statusCardLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  statusIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusTitle:   { fontSize: 16, fontWeight: '800', color: UI.textDark, marginBottom: 4 },
  statusSub:     { fontSize: 13, fontWeight: '700' },

  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: UI.bg, paddingBottom: 14 },
  sectionTitle:  { fontSize: 17, fontWeight: '800', color: UI.textDark },

  formGrid:   { flexDirection: 'row-reverse', gap: 14, flexWrap: 'wrap' },
  inputGroup: { flex: 1, minWidth: '45%', marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: UI.textGrey, marginBottom: 7, textAlign: 'right' },
  inputBox: {
    backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: UI.border,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: UI.textDark, fontWeight: '600',
  },
  inputArea:     { minHeight: 100 },
  inputReadOnly: { backgroundColor: UI.bg, color: UI.textGrey },

  infoBox:  { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, backgroundColor: '#EFF6FF', padding: 14, borderRadius: 10, marginBottom: 18 },
  infoText: { flex: 1, fontSize: 12, color: '#1D4ED8', textAlign: 'right', lineHeight: 18, fontWeight: '600' },

  bankNote:     { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, backgroundColor: '#F0F4FF', padding: 12, borderRadius: 10, marginTop: 4 },
  bankNoteText: { flex: 1, fontSize: 12, color: '#1E3A8A', textAlign: 'right', lineHeight: 18, fontWeight: '600' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: UI.white, padding: 20,
    borderTopWidth: 1, borderTopColor: UI.border, ...softShadow,
  },
  footerDesktop: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: UI.white, paddingHorizontal: 40, paddingVertical: 20,
    borderTopWidth: 1, borderTopColor: UI.border,
  },
  saveBtn: {
    flexDirection: 'row-reverse', backgroundColor: UI.primary,
    height: 54, borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 32,
  },
  saveBtnText: { color: UI.white, fontWeight: '800', fontSize: 16 },
});
