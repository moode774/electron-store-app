import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  ScrollView,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@marketplace/shared-hooks';
import { COLORS, TIMEOUTS } from '@marketplace/shared-utils';
import CustomAlert from '../../components/CustomAlert';

const OTP_LENGTH = 6;
const { height } = Dimensions.get('window');
const isSmallScreen = height < 700;

interface OtpScreenProps {
  phone: string;
  onBack: () => void;
}

export default function OtpScreen({ phone, onBack }: OtpScreenProps): React.JSX.Element {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(TIMEOUTS.OTP_EXPIRY_SECONDS);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '' });

  const inputs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const signInWithPhone = useAuthStore((s) => s.signInWithPhone);

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ title, message });
    setAlertVisible(true);
  };

  useEffect((): (() => void) => {
    const timer = setInterval((): void => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return (): void => clearInterval(timer);
  }, []);

  const handleChange = (text: string, index: number): void => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    if (digit && index === OTP_LENGTH - 1) {
      const full = newOtp.join('');
      if (full.length === OTP_LENGTH) handleVerify(full);
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ): void => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string): Promise<void> => {
    const token = code ?? otp.join('');
    if (token.length < OTP_LENGTH) {
      showAlert('تنبيه', 'الرجاء إدخال رمز التحقق كاملاً');
      return;
    }
    setIsLoading(true);
    const { error } = await verifyOtp(phone, token);
    setIsLoading(false);
    if (error) {
      showAlert('رمز خاطئ', 'الرمز الذي أدخلته غير صحيح أو انتهت صلاحيته');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputs.current[0]?.focus();
    }
  };

  const handleResend = async (): Promise<void> => {
    if (!canResend) return;
    setCountdown(TIMEOUTS.OTP_EXPIRY_SECONDS);
    setCanResend(false);
    setOtp(Array(OTP_LENGTH).fill(''));
    await signInWithPhone(phone);
    inputs.current[0]?.focus();
  };

  const maskedPhone = phone.replace(/(\+\d{3})\d+(\d{4})/, '$1****$2');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Static Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
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
            <View style={styles.logoBox}>
              <Image 
                source={require('../../../assets/images/logo.png')} 
                style={{ width: 100, height: 100, resizeMode: 'contain' }} 
              />
            </View>

            <Text style={styles.titleText}>رمز التحقق</Text>
            <Text style={styles.subtitleText}>أدخل الرمز المكون من 6 أرقام المرسل إلى</Text>
            <Text style={styles.phoneText}>{maskedPhone}</Text>

            <View style={styles.otpRow}>
              {Array(OTP_LENGTH).fill(null).map((_: null, i: number) => {
                const isFocused = focusedIndex === i;
                const isFilled = !!otp[i];
                return (
                  <TextInput
                    key={i}
                    ref={(ref): void => { inputs.current[i] = ref; }}
                    style={[
                      styles.otpBox,
                      isFocused && styles.otpBoxFocused,
                      isFilled && styles.otpBoxFilled,
                    ]}
                    value={otp[i]}
                    onChangeText={(text): void => handleChange(text, i)}
                    onKeyPress={(e): void => handleKeyPress(e, i)}
                    onFocus={() => setFocusedIndex(i)}
                    onBlur={() => setFocusedIndex(-1)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    selectTextOnFocus
                  />
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.verifyBtn, isLoading && styles.verifyBtnDisabled]}
              onPress={(): Promise<void> => handleVerify()}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.verifyBtnText}>تأكيد الرمز</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={styles.verifyArrow} />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.resendWrapper}>
              {canResend ? (
                <View style={styles.resendRow}>
                  <Text style={styles.didNotReceiveText}>لم يصلك الرمز؟ </Text>
                  <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
                    <Text style={styles.resendActionText}>إعادة إرسال</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.timerRow}>
                  <Ionicons name="time-outline" size={16} color="#6B7280" />
                  <Text style={styles.timerText}>
                    إعادة الإرسال متاح بعد{' '}
                    <Text style={styles.timerNum}>
                      {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                      {String(countdown % 60).padStart(2, '0')}
                    </Text>
                  </Text>
                </View>
              )}
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
  header: {
    height: Platform.OS === 'ios' ? 100 : 80,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  mainContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 20,
    paddingBottom: isSmallScreen ? 40 : 80,
  },
  logoBox: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    alignSelf: 'center',
  },
  titleText: {
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
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: 1,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    width: '100%',
    direction: 'ltr',
  },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  otpBoxFocused: {
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  otpBoxFilled: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
  },
  verifyBtn: {
    backgroundColor: '#111827',
    borderRadius: 12,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    flexDirection: 'row',
  },
  verifyBtnDisabled: {
    opacity: 0.7,
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  verifyArrow: {
    position: 'absolute',
    right: 20,
  },
  resendWrapper: {
    alignItems: 'center',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  didNotReceiveText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  resendActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textDecorationLine: 'underline',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  timerNum: {
    fontWeight: '700',
    color: '#111827',
  },
});
