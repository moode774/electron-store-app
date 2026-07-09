import { Alert as RNAlert, Platform } from 'react-native';

// بديل موحّد لـ Alert يعمل على الويب والجوال معاً.
// Alert.alert في react-native-web لا يفعل شيئاً إطلاقاً (no-op)،
// لذا أزرار التأكيد في لوحة الأدمن كانت "لا تعمل" على المتصفح.
// على الويب نستخدم window.confirm / window.alert، وعلى الجوال Alert الأصلي.

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    if (Platform.OS !== 'web') {
      RNAlert.alert(title, message, buttons as any);
      return;
    }

    const text = message ? `${title}\n\n${message}` : title;
    // tsconfig المشروع بدون lib: dom، لذا نصل لـ window عبر globalThis
    const web = globalThis as unknown as { alert: (m: string) => void; confirm: (m: string) => boolean };

    // بدون أزرار أو زر واحد → تنبيه عادي
    if (!buttons || buttons.length <= 1) {
      web.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    // زرّان أو أكثر → confirm: آخر زر ليس "إلغاء" هو زر التأكيد
    const confirmBtn = [...buttons].reverse().find(b => b.style !== 'cancel') ?? buttons[buttons.length - 1];
    const cancelBtn = buttons.find(b => b.style === 'cancel');
    if (web.confirm(text)) {
      confirmBtn.onPress?.();
    } else {
      cancelBtn?.onPress?.();
    }
  },
};
