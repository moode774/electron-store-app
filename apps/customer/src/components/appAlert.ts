import { Alert as RNAlert, Platform } from 'react-native';
import { t } from '@marketplace/shared-i18n';

// بديل موحّد لـ Alert يعمل على الويب والجوال معاً.
// Alert.alert في react-native-web لا يفعل شيئاً إطلاقاً (no-op)،
// لذا أزرار التأكيد في لوحة الأدمن كانت "لا تعمل" على المتصفح.
// على الويب نستخدم window.confirm / window.alert، وعلى الجوال Alert الأصلي.
//
// هذا الملف هو أيضاً "حدّ الترجمة" لكل التنبيهات في التطبيق: كل نص يمر من هنا
// يُترجم تلقائياً — بما في ذلك رسائل الأخطاء القادمة من طبقة الـ API أو الخادم —
// فلا يحتاج أي موضع استدعاء (وعددها بالمئات) إلى تعديل.

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    const localizedTitle = t(title);
    const localizedMessage = message === undefined ? undefined : t(message);
    const localizedButtons = buttons?.map((button) => ({ ...button, text: t(button.text) }));

    if (Platform.OS !== 'web') {
      RNAlert.alert(localizedTitle, localizedMessage, localizedButtons as any);
      return;
    }

    const text = localizedMessage ? `${localizedTitle}\n\n${localizedMessage}` : localizedTitle;
    // tsconfig المشروع بدون lib: dom، لذا نصل لـ window عبر globalThis
    const web = globalThis as unknown as { alert: (m: string) => void; confirm: (m: string) => boolean };

    // بدون أزرار أو زر واحد → تنبيه عادي
    if (!localizedButtons || localizedButtons.length <= 1) {
      web.alert(text);
      localizedButtons?.[0]?.onPress?.();
      return;
    }

    // زرّان أو أكثر → confirm: آخر زر ليس "إلغاء" هو زر التأكيد
    const confirmBtn = [...localizedButtons].reverse().find(b => b.style !== 'cancel') ?? localizedButtons[localizedButtons.length - 1];
    const cancelBtn = localizedButtons.find(b => b.style === 'cancel');
    if (web.confirm(text)) {
      confirmBtn.onPress?.();
    } else {
      cancelBtn?.onPress?.();
    }
  },
};
