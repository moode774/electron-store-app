// ============================================================
// PUSH NOTIFICATIONS — تسجيل رمز الجهاز واستقبال الإشعارات الفورية
// مكتوب بحذر: لا يرمي أبداً، ويتجاهل الويب والأجهزة غير المدعومة.
// ============================================================
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { registerDeviceToken } from '@marketplace/shared-hooks';

// عرض الإشعار أثناء فتح التطبيق (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * يطلب الإذن، يجلب رمز Expo Push، ويسجّله في قاعدة البيانات لهذا المستخدم.
 * آمن تماماً: أي فشل (ويب، محاكي، رفض إذن) يُتجاهل بصمت.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;

    // قناة أندرويد افتراضية
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'الإشعارات',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted || existing.status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted || req.status === 'granted';
    }
    if (!granted) return null;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    if (!token) return null;

    await registerDeviceToken(userId, token, Platform.OS);
    return token;
  } catch (e) {
    // الإشعارات تحسين وليست شرطاً لعمل التطبيق
    console.warn('[push] registration skipped:', (e as Error)?.message);
    return null;
  }
}
