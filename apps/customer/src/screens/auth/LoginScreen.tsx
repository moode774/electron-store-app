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
  StatusBar,
  Dimensions,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@marketplace/shared-hooks';
import { USER_ROLES, COLORS } from '@marketplace/shared-utils';
import { useNavigation } from '@react-navigation/native';
import CustomAlert from '../../components/CustomAlert';

const { height } = Dimensions.get('window');
const isSmallScreen = height < 700;

export default function LoginScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [phone, setPhone] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '' });

  const signInWithPhone = useAuthStore((s) => s.signInWithPhone);
  const signUp = useAuthStore((s) => s.signUp);

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ title, message });
    setAlertVisible(true);
  };

  const handleSendOtp = async (): Promise<void> => {
    const cleaned = phone.trim().replace(/\s/g, '');
    if (cleaned.length < 9) {
      showAlert('تنبيه', 'الرجاء إدخال رقم جوال صحيح');
      return;
    }

    // Admin bypass — يسجّل دخولاً حقيقياً بحساب الأدمن حتى تعمل صلاحيات RLS
    if (cleaned.replace(/\D/g, '') === '535353535') {
      setIsLoading(true);
      const { error: adminError } = await useAuthStore.getState().signInAsAdmin();
      setIsLoading(false);
      if (adminError) showAlert('خطأ', adminError);
      return;
    }

    const formatted = cleaned.startsWith('+') ? cleaned : `+967${cleaned.replace(/^0/, '')}`;
    setIsLoading(true);

    // تسجيل الدخول يميّز الدور تلقائياً: أي حساب موجود (عميل/تاجر/مندوب/أدمن)
    // يدخل مباشرة على واجهته الصحيحة عبر التوجيه في App.tsx — بلا إعادة تسجيل.
    const { error, code } = await signInWithPhone(formatted);

    if (!error) { setIsLoading(false); return; }   // نجح → App يوجّهه حسب دوره

    if (code === 'not_found') {
      // رقم غير مسجّل فقط → يُنشأ حساب عميل تلقائياً (التاجر/المندوب يسجّل من "حساب جديد")
      const { error: signUpError } = await signUp({
        phone: formatted,
        fullName: 'عميل جديد',
        role: USER_ROLES.CUSTOMER,
      });
      setIsLoading(false);
      if (signUpError) showAlert('خطأ', signUpError);
      return;
    }

    // خطأ فعلي (حساب محظور/موقوف/شبكة) → أظهره ولا تنشئ حساباً
    setIsLoading(false);
    showAlert('تعذّر الدخول', error);
  };

  return (
    <View style={[styles.root, isDesktop && styles.rootDesktop]}>
      <StatusBar barStyle="dark-content" backgroundColor={isDesktop ? '#F3F4F6' : '#FFFFFF'} />
      
      {isDesktop && (
        <View style={styles.desktopCover}>
          <Image
            source={require('../../../assets/images/logo.png')}
            style={styles.desktopCoverLogo}
          />
          <Text style={styles.desktopCoverTitle}>منصة متكاملة</Text>
          <Text style={styles.desktopCoverSub}>الوجهة الأولى لتجارتك ومشترياتك.</Text>
        </View>
      )}

      <View style={[styles.card, isDesktop && styles.cardDesktop]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.mainContainer}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Image
                source={require('../../../assets/images/logo.png')}
                style={{ width: 100, height: 100, resizeMode: 'contain' }}
              />
            </View>
            <Text style={styles.welcomeText}>مرحباً بك</Text>
            <Text style={styles.subtitleText}>سجّل دخولك للوصول إلى حسابك</Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            <View style={styles.inputRow}>
              <TouchableOpacity style={styles.countryCodeBox} activeOpacity={0.7}>
                <Text style={styles.countryCodeText}>+967</Text>
                <Ionicons name="chevron-down" size={16} color="#111827" style={{ marginLeft: 6 }} />
              </TouchableOpacity>

              <View style={styles.verticalDivider} />

              <TextInput
                style={styles.input}
                placeholder="رقم الهاتف"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={10}
                textAlign="right"
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
              />

              <Ionicons name="call-outline" size={20} color="#111827" />
            </View>

            {/* رابط سجل معنا للتاجر والمندوب */}
            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.7}
            >
              <Text style={styles.registerLinkText}>
                ترغب بالانضمام كشريك؟ <Text style={styles.registerLinkBold}>سجل كتاجر أو مندوب</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleSendOtp}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={styles.loginArrow} />
                </>
              )}
            </TouchableOpacity>

            {/* Social Logins Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>أو</Text>
              <View style={styles.line} />
            </View>

            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
                <Ionicons name="logo-apple" size={20} color="#111827" />
                <Text style={styles.socialText}>تسجيل الدخول باستخدام Apple</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7} onPress={async () => {
                const { error } = await useAuthStore.getState().signInWithGoogle();
                if (error) showAlert('خطأ', error);
              }}>
                <Image
                  source={require('../../../assets/images/google.png')}
                  style={{ width: 20, height: 20, resizeMode: 'contain' }}
                />
                <Text style={styles.socialText}>تسجيل الدخول باستخدام Google</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </ScrollView>

      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertVisible(false)}
      />
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  rootDesktop: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
  },
  card: {
    flex: 1,
  },
  cardDesktop: {
    flex: 0.4,
    minWidth: 400,
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  desktopCover: {
    flex: 0.6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopCoverLogo: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
    marginBottom: 24,
  },
  desktopCoverTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  desktopCoverSub: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
  },
  mainContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: isSmallScreen ? 24 : 40,
  },
  logoBox: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  countryCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    height: '100%',
    textAlign: 'right',
    marginRight: 12,
  },
  registerLink: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 4,
  },
  registerLinkText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  registerLinkBold: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  loginButton: {
    height: 56,
    backgroundColor: '#111827',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 32,
    flexDirection: 'row',
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loginArrow: {
    position: 'absolute',
    right: 20,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  socialRow: {
    flexDirection: 'column',
    gap: 16,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  socialText: {
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
});
