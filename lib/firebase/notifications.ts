
import { getMessaging, getToken } from 'firebase/messaging';

export async function requestNotificationPermission() {
  const messaging = getMessaging();
  return await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY
  });
}
