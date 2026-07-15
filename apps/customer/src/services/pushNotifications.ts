import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { registerDeviceToken } from '@marketplace/shared-hooks';

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'unsupported' | 'permission_denied' | 'missing_project_id'; message: string };

export async function configurePushNotifications(requestPermission: boolean): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return { status: 'unsupported', message: 'إشعارات الجهاز تحتاج نسخة iOS أو Android على جهاز حقيقي.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'إشعارات الطلبات',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    return { status: 'permission_denied', message: 'لم يتم منح إذن إشعارات الجهاز.' };
  }

  const projectId = Constants.easConfig?.projectId
    ?? (Constants.expoConfig?.extra?.easProjectId as string | undefined);
  if (!projectId) {
    return {
      status: 'missing_project_id',
      message: 'يلزم ضبط EXPO_PUBLIC_EAS_PROJECT_ID في إعدادات البناء لتفعيل Push.',
    };
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  // Registration is idempotent and must run again after an account switch so
  // this physical device can never remain bound to the previous account.
  await registerDeviceToken(token, Platform.OS as 'ios' | 'android');
  return { status: 'registered', token };
}

export function installForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
