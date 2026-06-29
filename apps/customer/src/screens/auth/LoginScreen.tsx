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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@marketplace/shared-hooks';
import { COLORS } from '@marketplace/shared-utils';
import CustomAlert from '../../components/CustomAlert';

const { height } = Dimensions.get('window');
const isSmallScreen = height < 700;

interface LoginScreenProps {
  onNavigateToRegister: () => void;
  onNavigateToOtp: (phone: string) => void;
}

export default function LoginScreen({
  onNavigateToRegister,
  onNavigateToOtp,
}: LoginScreenProps): React.JSX.Element {
  const [phone, setPhone] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '' });

  const signInWithPhone = useAuthStore((s) => s.signInWithPhone);

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

    const formatted = cleaned.startsWith('+') ? cleaned : `+967${cleaned.replace(/^0/, '')}`;
    setIsLoading(true);

    // يكمل تسجيل الدخول مباشرة؛ تتبدّل الشاشة تلقائياً عند نجاح المصادقة
    const { error } = await signInWithPhone(formatted);
    setIsLoading(false);

    if (error) {
      showAlert('خطأ', error);
    }
  };

  return (
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

            {/* رابط سجل معنا */}
            <TouchableOpacity
              style={styles.registerLink}
              onPress={onNavigateToRegister}
              activeOpacity={0.7}
            >
              <Text style={styles.registerLinkText}>
                ليس لديك حساب؟ <Text style={styles.registerLinkBold}>سجل معنا</Text>
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

              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
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
  );
}

const styles = StyleSheet.create({
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
