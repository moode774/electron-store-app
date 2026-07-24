import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  StatusBar,
  Switch,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SERVICE_AREAS, COLORS, FONTS } from '@marketplace/shared-utils';
import {
  Address,
  useAuthStore,
  createAddress,
  getAddresses,
} from '@marketplace/shared-hooks';
import { Alert } from '../../../components/appAlert';

import * as Location from 'expo-location';

const REAL_MAP_IMAGE = require('../../../../assets/images/real_map_banner.png');

const AREA_LABELS: Record<string, string> = {
  [SERVICE_AREAS.SANAA]: 'صنعاء',
  [SERVICE_AREAS.ADEN]: 'عدن',
  [SERVICE_AREAS.IBB]: 'إب',
  [SERVICE_AREAS.TAIZ]: 'تعز',
};

const ADDRESS_TYPES = [
  { id: 'المنزل', label: 'المنزل', icon: 'home-outline', selectedIcon: 'home' },
  { id: 'العمل', label: 'العمل', icon: 'briefcase-outline', selectedIcon: 'briefcase' },
  { id: 'استلام شحنة', label: 'استلام شحنة', icon: 'cube-outline', selectedIcon: 'cube' },
  { id: 'أخرى', label: 'أخرى', icon: 'ellipsis-horizontal-circle-outline', selectedIcon: 'ellipsis-horizontal-circle' },
];

export default function AddressSelectionScreen({ navigation, route }: any) {
  const user = useAuthStore((s) => s.user);

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  // Address Input Form (Matching Mockup)
  const [selectedCity, setSelectedCity] = useState<string>(SERVICE_AREAS.SANAA);
  const [addressType, setAddressType] = useState('المنزل');
  const [streetAddress, setStreetAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saveForFuture, setSaveForFuture] = useState(true);

  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setSavedAddresses([]);
      setUseNewAddress(true);
      setLoadingAddresses(false);
      return;
    }

    setLoadingAddresses(true);
    getAddresses(user.id)
      .then((addresses) => {
        if (!active) return;
        setSavedAddresses(addresses);
        const preferred = addresses.find((item) => item.is_default) ?? addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setUseNewAddress(false);
          if (preferred.city && Object.values(SERVICE_AREAS).includes(preferred.city as any)) {
            setSelectedCity(preferred.city);
          }
        } else {
          setUseNewAddress(true);
        }
      })
      .catch(() => {
        if (active) setUseNewAddress(true);
      })
      .finally(() => {
        if (active) setLoadingAddresses(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'إذن الموقع',
          'لم يتم السماح بالوصول إلى الموقع. يرجى تفعيل إذن الموقع من إعدادات المتصفح أو الجهاز.'
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      try {
        const reverseResults = await Location.reverseGeocodeAsync(coords);
        if (reverseResults && reverseResults.length > 0) {
          const place = reverseResults[0];
          const detectedCity = place.city || place.region || place.subregion || '';
          const detectedStreet = [place.street, place.district, place.subregion, place.name]
            .filter(Boolean)
            .join(' - ');

          if (detectedCity.includes('عدن') || detectedCity.includes('Aden')) {
            setSelectedCity(SERVICE_AREAS.ADEN);
          } else if (detectedCity.includes('إب') || detectedCity.includes('Ibb')) {
            setSelectedCity(SERVICE_AREAS.IBB);
          } else if (detectedCity.includes('تعز') || detectedCity.includes('Taiz')) {
            setSelectedCity(SERVICE_AREAS.TAIZ);
          } else {
            setSelectedCity(SERVICE_AREAS.SANAA);
          }

          if (detectedStreet) {
            setStreetAddress(detectedStreet);
          } else {
            setStreetAddress(`موقعك الحالي (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
          }
          if (place.streetNumber || place.name) {
            setLandmark(place.name || `مبنى ${place.streetNumber}`);
          }

          Alert.alert(
            'تم تحديد موقعك الحقيقي 📍',
            `تم جلب إحداثياتك بنجاح: (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})\nتمت تعبئة تفاصيل الشارع والمنطقة تلقائياً.`
          );
        } else {
          setStreetAddress(`موقعك الحالي (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
          Alert.alert(
            'تم تحديد إحداثياتك 📍',
            `تم جلب الموقع بنجاح: (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`
          );
        }
      } catch {
        setStreetAddress(`موقعك الحالي (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
        Alert.alert(
          'تم تحديد إحداثيات موقعك 📍',
          `الموقع: (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`
        );
      }
    } catch (err: any) {
      Alert.alert(
        'خطأ في تحديد الموقع',
        'تعذّر جلب موقعك الحالي من الجهاز. تأكد من تفعيل خدمة GPS والسماح بالصلاحيات.'
      );
    } finally {
      setLocating(false);
    }
  };

  const handleContinueToPayment = async () => {
    if (!user?.id) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول أولاً للمتابعة');
      return;
    }

    let targetAddressId = selectedAddressId;

    // If new address form filled or no saved address selected
    if (useNewAddress || !targetAddressId || streetAddress.trim().length > 0) {
      if (!streetAddress.trim()) {
        Alert.alert('تنبيه', 'يرجى كتابة الشارع والحي لعنوان التوصيل');
        return;
      }

      setSubmitting(true);
      try {
        const fullAddr = `${streetAddress.trim()}${landmark.trim() ? ' - ' + landmark.trim() : ''}`;
        const newAddr = await createAddress({
          user_id: user.id,
          label: addressType,
          full_address: fullAddr,
          city: selectedCity,
          is_default: saveForFuture && savedAddresses.length === 0,
        });
        targetAddressId = newAddr.id;
      } catch (err: any) {
        Alert.alert('خطأ', err?.message || 'تعذّر حفظ العنوان الجديد، حاول مجدداً');
        setSubmitting(false);
        return;
      } finally {
        setSubmitting(false);
      }
    }

    navigation.navigate('Checkout', {
      selectedAddressId: targetAddressId,
      altPhone: contactPhone.trim() || undefined,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={20} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerCenterCol}>
            <Text style={styles.headerTitle}>عنوان التوصيل</Text>
            <Text style={styles.headerSub}>حدد مكان استلام طلبك</Text>
          </View>
          <View style={{ width: 42 }} />
        </View>

        {/* 4-Step Stepper Header */}
        <View style={styles.stepperRow}>
          {/* Step 1: Cart */}
          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.stepCircleDone]}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, styles.stepLabelDone]}>سلة المشتريات</Text>
          </View>
          <View style={[styles.stepLine, styles.stepLineDone]} />

          {/* Step 2: Address (ACTIVE) */}
          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.stepCircleActive]}>
              <Ionicons name="location" size={15} color="#FFFFFF" />
            </View>
            <Text style={[styles.stepLabel, styles.stepLabelActive]}>العنوان</Text>
          </View>
          <View style={styles.stepLine} />

          {/* Step 3: Payment */}
          <View style={styles.stepCol}>
            <View style={styles.stepCircle}>
              <Ionicons name="card-outline" size={15} color="#94A3B8" />
            </View>
            <Text style={styles.stepLabel}>الدفع</Text>
          </View>
          <View style={styles.stepLine} />

          {/* Step 4: Confirm */}
          <View style={styles.stepCol}>
            <View style={styles.stepCircle}>
              <Ionicons name="checkmark-done-outline" size={15} color="#94A3B8" />
            </View>
            <Text style={styles.stepLabel}>تأكيد الطلب</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Realistic Interactive Map Banner Preview Card */}
        <View style={styles.mapBannerCard}>
          {/* Real City Map Tile Background */}
          <Image
            source={REAL_MAP_IMAGE}
            style={styles.realMapImageBg}
            resizeMode="cover"
          />
          <View style={styles.mapOverlayShade} />

          {/* Floating Button inside map: "استخدام موقعي الحالي" */}
          <TouchableOpacity
            style={styles.floatingLocateBtn}
            onPress={handleUseCurrentLocation}
            disabled={locating}
            activeOpacity={0.85}
          >
            {locating ? (
              <ActivityIndicator size="small" color="#1E3A8A" />
            ) : (
              <>
                <Ionicons name="locate-outline" size={16} color="#1E3A8A" />
                <Text style={styles.floatingLocateText}>استخدام موقعي الحالي</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Center Pulsing Location Pin Marker */}
          <View style={styles.mapCenterPinWrap}>
            <View style={styles.pinPulseShadow} />
            <View style={styles.pinMarkerIcon}>
              <Ionicons name="location" size={26} color="#FFFFFF" />
            </View>
          </View>
        </View>

        {/* Section 1: Address Input Form */}
        <View style={styles.card}>
          {/* 1. المدينة */}
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="location-outline" size={16} color="#1E3A8A" />
            <Text style={styles.sectionTitleText}>المدينة</Text>
          </View>
          <View style={styles.cityChipsRow}>
            {Object.values(SERVICE_AREAS).map((cityKey) => {
              const isSelected = selectedCity === cityKey;
              return (
                <TouchableOpacity
                  key={cityKey}
                  style={[styles.cityChip, isSelected && styles.cityChipSelected]}
                  onPress={() => setSelectedCity(cityKey)}
                  activeOpacity={0.8}
                >
                  {isSelected && <Ionicons name="checkmark-circle" size={16} color="#1E3A8A" style={{ marginLeft: 4 }} />}
                  <Text style={[styles.cityChipText, isSelected && styles.cityChipTextSelected]}>
                    {AREA_LABELS[cityKey] || cityKey}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 2. نوع العنوان */}
          <View style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
            <Ionicons name="pricetag-outline" size={16} color="#1E3A8A" />
            <Text style={styles.sectionTitleText}>نوع العنوان</Text>
          </View>
          <View style={styles.typeChipsRow}>
            {ADDRESS_TYPES.map((typeObj) => {
              const isSelected = addressType === typeObj.id;
              return (
                <TouchableOpacity
                  key={typeObj.id}
                  style={[styles.typeChip, isSelected && styles.typeChipSelected]}
                  onPress={() => setAddressType(typeObj.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={(isSelected ? typeObj.selectedIcon : typeObj.icon) as any}
                    size={16}
                    color={isSelected ? '#FFFFFF' : '#64748B'}
                    style={{ marginLeft: 6 }}
                  />
                  <Text style={[styles.typeChipText, isSelected && styles.typeChipTextSelected]}>
                    {typeObj.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 3. الشارع والحي * */}
          <View style={styles.inputFieldContainer}>
            <View style={styles.inputIconWrap}>
              <Ionicons name="location-outline" size={18} color="#94A3B8" />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabelText}>الشارع والحي *</Text>
              <TextInput
                style={styles.textInputStyle}
                placeholder="مثال : شارع حدة - حي الروضة"
                placeholderTextColor="#94A3B8"
                value={streetAddress}
                onChangeText={setStreetAddress}
                textAlign="right"
              />
            </View>
          </View>

          {/* 4. أقرب معلم بارز (اختياري) */}
          <View style={styles.inputFieldContainer}>
            <View style={styles.inputIconWrap}>
              <Ionicons name="business-outline" size={18} color="#94A3B8" />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabelText}>أقرب معلم بارز (اختياري)</Text>
              <TextInput
                style={styles.textInputStyle}
                placeholder="مثال : بجانب مسجد التقوى / خلف المول"
                placeholderTextColor="#94A3B8"
                value={landmark}
                onChangeText={setLandmark}
                textAlign="right"
              />
            </View>
          </View>

          {/* 5. رقم هاتف جهة التواصل عند التوصيل (اختياري) */}
          <View style={styles.inputFieldContainer}>
            <View style={styles.inputIconWrap}>
              <Ionicons name="call-outline" size={18} color="#94A3B8" />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabelText}>رقم هاتف جهة التواصل عند التوصيل (اختياري)</Text>
              <TextInput
                style={styles.textInputStyle}
                placeholder="مثال : 77XXXXXXX"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={contactPhone}
                onChangeText={setContactPhone}
                textAlign="right"
              />
            </View>
          </View>

          {/* 6. حفظ هذا العنوان لاستخدامه مستقبلاً في حسابك */}
          <View style={styles.switchRow}>
            <Switch
              value={saveForFuture}
              onValueChange={setSaveForFuture}
              trackColor={{ false: '#CBD5E1', true: '#1E3A8A' }}
              thumbColor="#FFFFFF"
            />
            <View style={styles.switchRightTextWrap}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#1E3A8A" style={{ marginLeft: 6 }} />
              <Text style={styles.switchLabelText}>حفظ هذا العنوان لاستخدامه مستقبلاً في حسابك</Text>
            </View>
          </View>
        </View>

        {/* Section 2: العناوين المحفوظة */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="bookmark-outline" size={18} color="#1E3A8A" />
            <Text style={styles.sectionTitleText}>العناوين المحفوظة</Text>
          </View>

          {loadingAddresses ? (
            <ActivityIndicator size="small" color="#1E3A8A" style={{ marginVertical: 14 }} />
          ) : savedAddresses.length > 0 ? (
            <View style={styles.savedList}>
              {savedAddresses.map((item) => {
                const isSelected = !useNewAddress && selectedAddressId === item.id;
                const isHome = item.label?.includes('منزل') || item.label?.includes('المنزل');
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.savedAddressCard, isSelected && styles.savedAddressCardSelected]}
                    onPress={() => {
                      setSelectedAddressId(item.id);
                      setUseNewAddress(false);
                      if (item.city && Object.values(SERVICE_AREAS).includes(item.city as any)) {
                        setSelectedCity(item.city);
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    {/* Left Side: 3 Dots Menu */}
                    <TouchableOpacity style={styles.dotsBtn}>
                      <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
                    </TouchableOpacity>

                    {/* Middle Column: Details */}
                    <View style={styles.savedDetailsCol}>
                      <View style={styles.savedTitleRow}>
                        <Text style={styles.savedLabelText}>{item.label || 'عنوان مخصص'}</Text>
                        {item.is_default && (
                          <View style={styles.preferredBadge}>
                            <Text style={styles.preferredBadgeText}>مفضل</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.savedFullAddressText} numberOfLines={2}>
                        {item.full_address}
                      </Text>
                    </View>

                    {/* Right Side: Radio & Icon */}
                    <View style={styles.savedRightGroup}>
                      <View style={styles.typeIconCircle}>
                        <Ionicons
                          name={isHome ? 'home-outline' : 'briefcase-outline'}
                          size={18}
                          color="#1E3A8A"
                        />
                      </View>
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.noAddressesText}>لا توجد عناوين محفوظة سابقة. أدخل تفاصيل عنوانك أعلاه.</Text>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomSubRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#64748B" />
          <Text style={styles.bottomSubText}>سيتم استخدام هذا العنوان لإتمام الطلب</Text>
        </View>

        <TouchableOpacity
          style={[styles.continueBtn, submitting && { opacity: 0.7 }]}
          onPress={handleContinueToPayment}
          disabled={submitting}
          activeOpacity={0.88}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.continueBtnInner}>
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
              <Text style={styles.continueBtnText}>المتابعة إلى الدفع</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerCenterCol: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: '#0F172A',
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  stepCol: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepCircleActive: {
    backgroundColor: '#1E3A8A', // Dark Royal Blue
    borderColor: '#1E3A8A',
  },
  stepCircleDone: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  stepLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  stepLabelActive: {
    fontFamily: FONTS.bold,
    color: '#1E3A8A',
  },
  stepLabelDone: {
    color: '#059669',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 6,
    marginBottom: 14,
  },
  stepLineDone: {
    backgroundColor: '#059669',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 130,
  },
  mapBannerCard: {
    height: 140,
    borderRadius: 20,
    backgroundColor: '#EBF3FE',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    overflow: 'hidden',
    marginBottom: 14,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  realMapImageBg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  mapOverlayShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 250, 252, 0.12)',
  },
  floatingLocateBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  floatingLocateText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: '#1E3A8A',
  },
  mapCenterPinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPulseShadow: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(30, 58, 138, 0.25)',
  },
  pinMarkerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#0F172A',
  },
  cityChipsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  cityChip: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
  },
  cityChipSelected: {
    borderColor: '#1E3A8A',
    backgroundColor: '#F0F5FF',
  },
  cityChipText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: '#64748B',
  },
  cityChipTextSelected: {
    fontFamily: FONTS.bold,
    color: '#1E3A8A',
  },
  typeChipsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
  },
  typeChipSelected: {
    backgroundColor: '#1E3A8A', // Solid Royal Blue matching mockup
    borderColor: '#1E3A8A',
  },
  typeChipText: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: '#64748B',
  },
  typeChipTextSelected: {
    fontFamily: FONTS.bold,
    color: '#FFFFFF',
  },
  inputFieldContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  inputIconWrap: {
    width: 32,
    alignItems: 'center',
  },
  inputCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  inputLabelText: {
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 4,
  },
  textInputStyle: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: '#0F172A',
    width: '100%',
    paddingVertical: 4,
  },
  switchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  switchRightTextWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  switchLabelText: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: '#475569',
  },
  savedList: {
    gap: 10,
    marginTop: 6,
  },
  savedAddressCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  savedAddressCardSelected: {
    borderColor: '#1E3A8A',
    backgroundColor: '#F0F5FF',
  },
  dotsBtn: {
    padding: 6,
  },
  savedDetailsCol: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 10,
    marginLeft: 8,
  },
  savedTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  savedLabelText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#0F172A',
  },
  preferredBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  preferredBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 9.5,
    color: '#1E3A8A',
  },
  savedFullAddressText: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 3,
    textAlign: 'right',
  },
  savedRightGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  typeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#1E3A8A',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1E3A8A',
  },
  noAddressesText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 6,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomSubRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 8,
  },
  bottomSubText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
  },
  continueBtn: {
    backgroundColor: '#1E3A8A', // Solid Royal Blue matching mockup
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
