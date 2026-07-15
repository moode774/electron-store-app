import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@marketplace/shared-utils';
import {
  createDeliveryProfile,
  createIdempotencyKey,
  saveDeliveryOnboardingDocuments,
  updateUserProfile,
  uploadPrivateFileToStorage,
  useAuthStore,
} from '@marketplace/shared-hooks';

const VEHICLE_TYPES = [
  { key: 'motorcycle', label: 'دراجة نارية', icon: 'bicycle-outline' },
  { key: 'car', label: 'سيارة', icon: 'car-outline' },
  { key: 'bicycle', label: 'دراجة هوائية', icon: 'bicycle' },
  { key: 'pickup', label: 'بيك أب', icon: 'car-sport-outline' },
];

const CITIES = ['صنعاء', 'عدن', 'تعز', 'إب', 'الحديدة', 'مأرب', 'حضرموت', 'أخرى'];

interface Props {
  onComplete: () => void;
}

type OnboardingImage = {
  uri: string;
  contentType: 'image/jpeg' | 'image/png';
};

export default function DeliveryOnboardingScreen({ onComplete }: Props) {
  const user = useAuthStore((s) => s.user);

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [nationalId, setNationalId] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [city, setCity] = useState('');
  const [idImage, setIdImage] = useState<OnboardingImage | null>(null);
  const [licenseImage, setLicenseImage] = useState<OnboardingImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const documentKeys = useRef({
    nationalId: createIdempotencyKey(),
    license: createIdempotencyKey(),
  });

  const pickImage = async (): Promise<OnboardingImage | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('تنبيه', 'يجب السماح بالوصول إلى معرض الصور');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      contentType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
    };
  };

  const handleSubmit = async () => {
    if (fullName.trim().length < 2) { Alert.alert('تنبيه', 'الاسم الكامل مطلوب'); return; }
    if (!nationalId.trim()) { Alert.alert('تنبيه', 'رقم الهوية مطلوب'); return; }
    if (!vehicleType) { Alert.alert('تنبيه', 'اختر نوع المركبة'); return; }
    if (!vehiclePlate.trim()) { Alert.alert('تنبيه', 'رقم لوحة المركبة مطلوب'); return; }
    if (!city) { Alert.alert('تنبيه', 'اختر مدينة العمل'); return; }
    if (!agreedToTerms) { Alert.alert('تنبيه', 'يجب الموافقة على الشروط والأحكام لإكمال التسجيل'); return; }
    if (!user?.id) return;

    setSaving(true);
    try {
      await createDeliveryProfile({
        user_id: user.id,
        national_id: nationalId.trim(),
        vehicle_type: vehicleType,
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
      });

      if (fullName.trim() !== (user.full_name ?? '').trim()) {
        await updateUserProfile(user.id, { full_name: fullName.trim() });
      }

      let nationalIdImagePath: string | undefined;
      let licenseImagePath: string | undefined;
      if (idImage) {
        const extension = idImage.contentType === 'image/png' ? 'png' : 'jpg';
        nationalIdImagePath = `${user.id}/onboarding/national-id-${documentKeys.current.nationalId}.${extension}`;
        await uploadPrivateFileToStorage({
          bucket: 'delivery-onboarding-documents',
          objectPath: nationalIdImagePath,
          uri: idImage.uri,
          contentType: idImage.contentType,
          upsert: false,
        });
      }
      if (licenseImage) {
        const extension = licenseImage.contentType === 'image/png' ? 'png' : 'jpg';
        licenseImagePath = `${user.id}/onboarding/driver-license-${documentKeys.current.license}.${extension}`;
        await uploadPrivateFileToStorage({
          bucket: 'delivery-onboarding-documents',
          objectPath: licenseImagePath,
          uri: licenseImage.uri,
          contentType: licenseImage.contentType,
          upsert: false,
        });
      }
      await saveDeliveryOnboardingDocuments({
        workCity: city,
        nationalIdImagePath,
        licenseImagePath,
      });

      Alert.alert(
        'تم التسجيل ✅',
        'تم إرسال بياناتك بنجاح! سيتم مراجعة طلبك خلال 24 ساعة وستصلك رسالة بالقبول.',
        [{ text: 'ابدأ الآن', onPress: onComplete }],
      );
    } catch (e: any) {
      // Object keys are immutable. If a response is lost after an upload, the
      // next attempt uses fresh names instead of replacing evidence already seen.
      documentKeys.current = {
        nationalId: createIdempotencyKey(),
        license: createIdempotencyKey(),
      };
      Alert.alert('خطأ', e?.message ?? 'فشل حفظ البيانات، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity 
          style={{ position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 20, zIndex: 10, padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          onPress={() => useAuthStore.getState().signOut()}
        >
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={{color: '#DC2626', fontSize: 12, fontWeight: '700'}}>خروج</Text>
        </TouchableOpacity>

        <View style={styles.headerIcon}>
          <Ionicons name="bicycle" size={28} color={COLORS.primary} />
        </View>
        <Text style={styles.headerTitle}>إعداد حساب التوصيل</Text>
        <Text style={styles.headerSub}>أدخل بياناتك للبدء في استقبال الطلبات</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#1D4ED8" />
          <Text style={styles.infoBannerText}>بياناتك آمنة ومحمية — تُستخدم فقط للتحقق من هويتك</Text>
        </View>

        {/* Personal */}
        <Text style={styles.groupTitle}>المعلومات الشخصية</Text>

        <Field label="الاسم الكامل" icon="person-outline">
          <TextInput
            style={styles.input}
            placeholder="الاسم الأول والأخير"
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={setFullName}
          />
        </Field>

        <Field label="رقم الهوية الوطنية *" icon="card-outline">
          <TextInput
            style={styles.input}
            placeholder="0000000000"
            placeholderTextColor="#9CA3AF"
            value={nationalId}
            onChangeText={setNationalId}
            keyboardType="numeric"
            maxLength={12}
          />
        </Field>

        {/* Vehicle */}
        <Text style={styles.groupTitle}>معلومات المركبة</Text>

        <Text style={styles.fieldLabel}>نوع المركبة *</Text>
        <View style={styles.vehicleGrid}>
          {VEHICLE_TYPES.map((v) => (
            <TouchableOpacity
              key={v.key}
              style={[styles.vehicleCard, vehicleType === v.key && styles.vehicleCardActive]}
              onPress={() => setVehicleType(v.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={v.icon as any} size={26} color={vehicleType === v.key ? '#fff' : '#6B7280'} />
              <Text style={[styles.vehicleLabel, vehicleType === v.key && styles.vehicleLabelActive]}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="رقم اللوحة *" icon="barcode-outline">
          <TextInput
            style={styles.input}
            placeholder="مثال: ABC 1234"
            placeholderTextColor="#9CA3AF"
            value={vehiclePlate}
            onChangeText={setVehiclePlate}
            autoCapitalize="characters"
          />
        </Field>

        {/* City */}
        <Text style={styles.groupTitle}>منطقة العمل</Text>
        <Text style={styles.fieldLabel}>المدينة *</Text>
        <View style={styles.chipGrid}>
          {CITIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, city === c && styles.chipActive]}
              onPress={() => setCity(c)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Document uploads */}
        <Text style={styles.groupTitle}>صور المستندات (اختياري)</Text>
        <Text style={styles.groupSub}>تسريع عملية المراجعة بإرفاق المستندات</Text>

        <DocPicker
          label="صورة الهوية الوطنية"
          icon="card"
          picked={!!idImage}
          onPick={async () => {
            const image = await pickImage();
            if (image) setIdImage(image);
          }}
        />
        <DocPicker
          label="صورة رخصة القيادة"
          icon="document-text"
          picked={!!licenseImage}
          onPick={async () => {
            const image = await pickImage();
            if (image) setLicenseImage(image);
          }}
        />

        <View style={styles.finalNote}>
          <Ionicons name="time-outline" size={20} color="#D97706" />
          <Text style={styles.finalNoteText}>
            بعد الإرسال سيراجع فريقنا بياناتك خلال 24 ساعة ويمكنك البدء باستقبال الطلبات فور القبول
          </Text>
        </View>

        <TouchableOpacity style={styles.termsRow} onPress={() => setAgreedToTerms((v) => !v)} activeOpacity={0.8}>
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxActive]}>
            {agreedToTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
          </View>
          <Text style={styles.termsText}>
            أوافق على <Text style={styles.termsLink}>الشروط والأحكام</Text> و <Text style={styles.termsLink}>سياسة الخصوصية</Text>
          </Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.submitBtn, (saving || !agreedToTerms) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={saving || !agreedToTerms}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.submitBtnText}>إرسال البيانات</Text>
              <Ionicons name="send" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
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

function DocPicker({ label, icon, picked, onPick }: { label: string; icon: string; picked: boolean; onPick: () => void }) {
  return (
    <TouchableOpacity style={[styles.docCard, picked && styles.docCardPicked]} onPress={onPick} activeOpacity={0.8}>
      <View style={[styles.docIcon, picked && styles.docIconPicked]}>
        <Ionicons name={picked ? 'checkmark-circle' : (icon as any)} size={22} color={picked ? '#059669' : '#6B7280'} />
      </View>
      <View style={styles.docInfo}>
        <Text style={[styles.docLabel, picked && styles.docLabelPicked]}>{label}</Text>
        <Text style={styles.docSub}>{picked ? 'تم الاختيار ✅ — اضغط للتغيير' : 'اضغط للاختيار من معرض الصور'}</Text>
      </View>
      <Ionicons name="camera-outline" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: {
    alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 64 : 48,
    paddingBottom: 24, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerIcon: {
    width: 68, height: 68, borderRadius: 24,
    backgroundColor: `${COLORS.primary}12`,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 6 },
  headerSub: { fontSize: 13, color: '#6B7280', textAlign: 'center' },

  scroll: { padding: 24, paddingBottom: 20 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EFF6FF', padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 28,
  },
  infoBannerText: { flex: 1, fontSize: 12.5, color: '#1D4ED8', lineHeight: 18 },

  groupTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 4, marginTop: 8 },
  groupSub: { fontSize: 12, color: '#9CA3AF', marginBottom: 14 },

  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  fieldBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, minHeight: 52,
  },
  input: { flex: 1, fontSize: 14, color: '#111827', paddingVertical: 12 },

  vehicleGrid: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  vehicleCard: {
    flex: 1, minWidth: 70, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', gap: 6,
  },
  vehicleCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  vehicleLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  vehicleLabelActive: { color: '#fff' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    padding: 14, marginBottom: 12,
  },
  docCardPicked: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  docIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  docIconPicked: { backgroundColor: '#DCFCE7' },
  docInfo: { flex: 1 },
  docLabel: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  docLabelPicked: { color: '#059669' },
  docSub: { fontSize: 11.5, color: '#9CA3AF' },

  finalNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFFBEB', padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: '#FDE68A', marginTop: 8,
  },
  finalNoteText: { flex: 1, fontSize: 13, color: '#B45309', lineHeight: 20 },

  termsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, marginTop: 16, paddingHorizontal: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', marginRight: 10 },
  checkboxActive: { backgroundColor: '#111827', borderColor: '#111827' },
  termsText: { flex: 1, fontSize: 13, color: '#6B7280', fontWeight: '500' },
  termsLink: { color: '#111827', fontWeight: '700' },

  bottomBar: {
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff',
  },
  submitBtn: {
    height: 54, backgroundColor: COLORS.primary, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
