import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// حفظ رمز الجهاز لإرسال الإشعارات الفورية لاحقاً من الخادم.
export async function registerDeviceToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { user_id: userId, token, platform: Platform.OS, is_active: true },
      { onConflict: 'token' },
    );
  if (error && error.code !== '23505') {
    console.warn('registerDeviceToken failed:', error.message);
  }
}

// خطاف تسجيل الإشعارات الفورية.
// ملاحظة: يتطلب حزمة expo-notifications (+ expo-device). إن لم تكن مثبّتة
// يتخطّى الخطاف بهدوء بدل الانهيار. للتفعيل:
//   npx expo install expo-notifications expo-device
export function usePushNotifications(userId: string | null | undefined): void {
  const registered = useRef(false);

  useEffect(() => {
    if (!userId || registered.current || Platform.OS === 'web') return;

    let Notifications: any;
    let Device: any;
    try {
      Notifications = require('expo-notifications');
      Device = require('expo-device');
    } catch {
      return; // الحزمة غير مثبّتة بعد
    }

    const run = async (): Promise<void> => {
      try {
        if (!Device.isDevice) return;
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData?.data;
        if (token) {
          await registerDeviceToken(userId, token);
          registered.current = true;
        }
      } catch (e) {
        console.warn('push registration error:', e);
      }
    };
    run();
  }, [userId]);
}
