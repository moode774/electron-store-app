import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@marketplace/shared-hooks';
import { COLORS, USER_ROLES, normalizeYemenPhone, isValidYemenMobile, type UserRole } from '@marketplace/shared-utils';

const { height } = Dimensions.get('window');
const isSmallScreen = height < 700;

interface RegisterScreenProps {
  onBack: () => void;
  onNavigateToOtp: (phone: string) => void;
}

interface RoleOption {
  role: UserRole;
  image: any;
  title: string;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: USER_ROLES.DELIVERY,
    image: require('../../../assets/images/delivery-role.png'),
    title: 'توصيل',
    description: 'مندوب توصيل طلبات',
  },
  {
    role: USER_ROLES.MERCHANT,
    image: require('../../../assets/images/merchant-role.png'),
    title: 'تاجر',
    description: 'مدير متجر أو مطعم',
  },
];


export default function RegisterScreen({
  onBack,
  onNavigateToOtp,
}: RegisterScreenProps): React.JSX.Element {
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(USER_ROLES.MERCHANT);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [step, setStep] = useState<1 | 2>(1);

  const signUp = useAuthStore((s) => s.signUp);

  const handleRegister = async (): Promise<void> => {
    if (!fullName.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسمك الكامل');
      return;
    }
    if (!isValidYemenMobile(phone)) {
      Alert.alert('تنبيه', 'الرجاء إدخال رقم جوال يمني صحيح (7 يليها 8 أرقام)');
      return;
    }
    const formatted = normalizeYemenPhone(phone);
    setIsLoading(true);

    // ينشئ الحساب ويدخل مباشرة؛ تتبدّل الشاشة تلقائياً عند نجاح المصادقة
    const { error } = await signUp({
      phone: formatted,
      fullName: fullName.trim(),
      role: selectedRole,
    });

    setIsLoading(false);

    if (error) {
      Alert.alert('خطأ', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Static Header with Back Button */}
      <View style={styles.header}>
        {/* Step Progress Indicator (Centered) */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressDot, step >= 1 ? styles.progressDotActive : {}]} />
          <View style={[styles.progressDot, step >= 2 ? styles.progressDotActive : {}]} />
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={step === 2 ? () => setStep(1) : onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.mainContainer}>
          
          <View style={styles.formContainer}>
            {step === 1 ? (
              <View style={styles.stepContainer}>
                {/* Logo Area */}
                <View style={styles.logoRow}>
                  <View style={styles.logoBox}>
                    <Image 
                      source={require('../../../assets/images/logo.png')}
                      style={{ width: 90, height: 90, resizeMode: 'contain' }}
                    />
                  </View>
                </View>

                {/* Welcome Text */}
                <View style={styles.welcomeTextContainer}>
                  <Text style={styles.welcomeTitle}>مرحباً بك!</Text>
                  <Text style={styles.welcomeSub}>اختر نوع الحساب الذي يناسبك للبدء</Text>
                </View>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionTitleDot} />
                  <Text style={styles.sectionTitleSmall}>اختر نوع الحساب</Text>
                </View>
                <View style={styles.rolesRow}>
                  {ROLE_OPTIONS.map((opt) => {
                    const isActive = selectedRole === opt.role;
                    return (
                      <TouchableOpacity
                        key={opt.role}
                        style={[
                          styles.roleCard,
                          isActive && styles.roleCardActive,
                        ]}
                        onPress={(): void => {
                          setSelectedRole(opt.role);
                        }}
                        activeOpacity={0.8}
                      >
                        {isActive && (
                          <View style={styles.checkBadge}>
                            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                          </View>
                        )}
                        <View style={styles.roleImageCircle}>
                          <Image source={opt.image} style={styles.roleImage} />
                        </View>
                        <Text style={[styles.roleTitle, isActive && styles.roleTitleActive]}>
                          {opt.title}
                        </Text>
                        <Text style={[styles.roleDesc, isActive && styles.roleDescActive]}>
                          {opt.description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Features Row */}
                <View style={styles.featuresContainer}>
                  <View style={styles.featureItem}>
                    <View style={styles.featureIconBox}>
                      <Ionicons name="headset-outline" size={22} color="#111827" />
                    </View>
                    <Text style={styles.featureText}>دعم 24/7</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <View style={styles.featureIconBox}>
                      <Ionicons name="flash-outline" size={22} color="#111827" />
                    </View>
                    <Text style={styles.featureText}>سهولة وسرعة</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <View style={styles.featureIconBox}>
                      <Ionicons name="shield-checkmark-outline" size={22} color="#111827" />
                    </View>
                    <Text style={styles.featureText}>آمن وموثوق</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={() => setStep(2)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBtnText}>التالي</Text>
                </TouchableOpacity>

                <View style={styles.loginHintRow}>
                  <Text style={styles.loginHintText}>لديك حساب بالفعل؟</Text>
                  <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
                    <Text style={styles.loginHintLink}>تسجيل الدخول</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.stepContainer}>
                <View style={styles.roleHeaderContainer}>
                  {selectedRole === USER_ROLES.DELIVERY ? (
                    <View style={styles.roleHeaderIconBox}>
                      <Ionicons name="bicycle" size={32} color="#111827" />
                    </View>
                  ) : (
                    <Image 
                      source={require('../../../assets/images/merchant_header.png')}
                      style={styles.merchantHeaderImage}
                    />
                  )}
                  <Text style={styles.roleHeaderTitle}>
                    {selectedRole === USER_ROLES.DELIVERY ? 'انضم لفريق التوصيل' : 'انضم كشريك تجاري'}
                  </Text>
                  <Text style={styles.roleHeaderSub}>
                    {selectedRole === USER_ROLES.DELIVERY 
                      ? 'سجل بياناتك كـ(مندوب) للبدء في استقبال الطلبات وزيادة دخلك اليومي' 
                      : 'سجل بيانات متجرك للبدء في عرض منتجاتك والوصول لملايين العملاء'}
                  </Text>
                </View>

                {/* Input Fields */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>الاسم الكامل</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                    <View style={styles.verticalDivider} />
                    <TextInput
                      style={styles.input}
                      placeholder="الاسم الأول والأخير"
                      placeholderTextColor="#9CA3AF"
                      value={fullName}
                      onChangeText={setFullName}
                      textAlign="right"
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>رقم الجوال</Text>
                  <View style={styles.inputWrapper}>
                    <View style={styles.countryCodeBox}>
                      <Text style={styles.flagEmoji}>🇾🇪</Text>
                      <Text style={styles.countryCodeText}>+967</Text>
                    </View>
                    <View style={styles.verticalDivider} />
                    <TextInput
                      style={styles.input}
                      placeholder="5XXXXXXXX"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                      maxLength={10}
                      textAlign="right"
                    />
                  </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.submitBtn, isLoading && styles.submitBtnDisabled, { marginTop: 16 }]}
                  onPress={handleRegister}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitBtnText}>إرسال وتسجيل</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: Platform.OS === 'ios' ? 110 : 80,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: Platform.OS === 'ios' ? 60 : 30, // Matches header padding
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1, // Behind the back button just in case
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  progressDotActive: {
    width: 24,
    backgroundColor: '#111827',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center', // Centers the elegant container on larger screens
  },
  mainContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  formContainer: {
    flex: 1,
    paddingTop: 0,
    marginTop: -10, // Pulls the content up slightly
  },
  stepContainer: {
    flex: 1,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoBox: {
    width: 68,
    height: 68,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTextContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  welcomeSub: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start', // Aligns to the right in RTL
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#111827',
    marginLeft: 6,
  },
  sectionTitleSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  rolesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  roleCard: {
    flex: 1,
    backgroundColor: '#FDFDFD',
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  roleCardActive: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
    shadowColor: '#111827',
    shadowOpacity: 0.12,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  roleImageCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  roleImage: {
    width: 78,
    height: 78,
    resizeMode: 'contain',
    position: 'absolute',
    bottom: -8, // Creates the beautiful 3D pop-out effect
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 2,
  },
  roleTitleActive: {
    color: '#111827',
  },
  roleDesc: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 0,
  },
  roleDescActive: {
    color: '#111827',
  },
  featuresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
  },
  featureIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  featureText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'center',
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'left',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inputIcon: {
    marginRight: 6,
  },
  verticalDivider: {
    width: 1.5,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  countryCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  countryCodeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    height: '100%',
  },
  roleHeaderContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 20, // Pushes the icon and text downwards slightly
    paddingHorizontal: 8,
  },
  roleHeaderIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  merchantHeaderImage: {
    width: 130,
    height: 130,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  roleHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  roleHeaderSub: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  submitBtn: {
    height: 56, // Match login button height
    backgroundColor: '#111827',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  submitBtnDisabled: {
    opacity: 0.7,
    shadowOpacity: 0,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loginHintRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  loginHintText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginRight: 4,
  },
  loginHintLink: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
});
