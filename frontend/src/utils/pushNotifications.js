import { PushNotifications } from '@capacitor/push-notifications';
import { isNative } from './capacitor';

export async function initPushNotifications() {
  if (!isNative()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive === 'granted') {
    await PushNotifications.register();
  }

  PushNotifications.addListener('registration', (token) => {
    console.log('[Push] Token:', token.value);
    // TODO: inviare token al server per push dal backend
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[Push] Received:', notification);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('[Push] Action:', notification);
    // Navigare alla risorsa corrispondente
  });
}
