interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string; };
  userId?: string;
  createdAt: Date;
}

let subscriptions: PushSubscriptionData[] = [];

export function getSubscriptions() {
  return subscriptions;
}

export function addSubscription(data: PushSubscriptionData) {
  const existingIndex = subscriptions.findIndex(s => s.endpoint === data.endpoint);
  if (existingIndex !== -1) {
    subscriptions[existingIndex] = data;
  } else {
    subscriptions.push(data);
  }
}